import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { IsNull } from 'typeorm';

import { BlobScenario, BlobUnit } from 'src/common/types';
import { ErrorTypes, Messages } from 'src/common/utils/messages';
import type {
  SimulationItem,
  SimulationReview,
  RatingBreakdown,
  WhatsNew,
  SimulationDashboard,
  DashboardCard,
  CombinedSimulationData,
  EducatorAssignmentPayload,
  EducatorAssignmentResponse,
} from 'src/common/interfaces';
import { SimulationConstants } from 'src/common/constants';
import { ResponseResult } from 'src/common/class/response.class';
import { SUCCESS_MSG } from 'src/common/messages/success.message';
import { ERROR_MSG } from 'src/common/messages/error.message';
import { handleError } from 'src/common/utils/common.util';
import { throwAppError } from 'src/common/utils/app-error';
import { isSimulationVisibleToEducators } from 'src/common/utils/simulation-visibility.util';
import type { FilterDropdownPage, FilterDropdownParams, ICurrentUser } from 'src/common/interfaces';
import type { IPaginationMeta } from 'src/common/interfaces/pagination.interface';
import type { FilterDropdownReqDto } from 'src/common/dtos/simulation.dto';
import { assertEducator } from 'src/common/utils/current-user.util';
import { readFilterDropdownPage } from 'src/common/utils/simulation.util';
import { SimulationCatalog, SimulationV2 } from 'src/database/entities';
import {
  EDUCATOR_SIMULATION_REPOSITORY,
  SIMULATION_CATALOG_REPOSITORY,
  SIMULATION_V2_REPOSITORY,
  UNIT_REPOSITORY,
} from 'src/database/tokens';
import {
  EducatorSimulationRepository,
  SimulationCatalogRepository,
  SimulationV2Repository,
  UnitRepository,
} from 'src/database/repositories';
import { StudentsService } from 'src/students/students.service';

@Injectable()
export class SimulationService {
  constructor(
    @Inject(SIMULATION_CATALOG_REPOSITORY)
    private readonly simulationRepo: SimulationCatalogRepository,
    @Inject(EDUCATOR_SIMULATION_REPOSITORY)
    private readonly educatorSimRepo: EducatorSimulationRepository,
    @Inject(UNIT_REPOSITORY)
    private readonly unitRepository: UnitRepository,
    @Inject(SIMULATION_V2_REPOSITORY)
    private readonly simulationV2Repository: SimulationV2Repository,
    private readonly studentsService: StudentsService,
  ) {}

  /** Serves `GET /api/simulations` (public). */
  async getSimulations(): Promise<ResponseResult<SimulationItem[]>> {
    try {
      const [items, units, allSimulations] = await Promise.all([
        this.simulationRepo.find({ order: { id: 'ASC' } }),
        this.getUnits(),
        this.simulationV2Repository.find(),
      ]);
      const allScenarios = allSimulations.map((s) => this.toBlobScenario(s));

      const scenarios = allScenarios.filter((s) => {
        const status = String(s.status ?? '')
          .toLowerCase()
          .trim();
        return status !== 'draft' && status !== 'archived';
      });

      const message = SUCCESS_MSG.COMMON.FETCHED('Simulations');
      if (scenarios.length > 0) {
        return new ResponseResult({
          message,
          data: scenarios.map((s) => this.formatBlobItem(s, units, scenarios)),
        });
      }
      if (items.length > 0) {
        return new ResponseResult({
          message,
          data: items.map((item) => this.formatItem(item, units, scenarios)),
        });
      }
      return new ResponseResult({ message, data: [] });
    } catch (error) {
      return handleError(error);
    }
  }

  /** Serves `GET /api/simulations/:scenarioId/public` (public). */
  async getPublicBlobScenario(
    scenarioId: string,
    dto: { title?: string },
  ): Promise<ResponseResult<BlobScenario>> {
    try {
      const normalize = (value: string): string => value.toLowerCase().replace(/[-_\s]+/g, '-');
      const normId = normalize(scenarioId);

      const isValidScenario = (candidate: Record<string, unknown>): boolean => {
        const rawStatus = candidate.status;
        const status = (typeof rawStatus === 'string' ? rawStatus : '').toLowerCase().trim();
        return status !== 'draft' && status !== 'archived';
      };

      const message = SUCCESS_MSG.COMMON.FETCHED('Simulation');
      const direct = await this.simulationV2Repository.findByBusinessId(scenarioId);
      if (direct && isValidScenario(direct as unknown as Record<string, unknown>)) {
        return new ResponseResult({ message, data: this.toPublicScenario(direct) });
      }

      const allSimulations = await this.simulationV2Repository.find();
      const allScenarios = allSimulations.map((s) => this.toBlobScenario(s));
      const scenarios = allScenarios.filter((s) =>
        isValidScenario(s as unknown as Record<string, unknown>),
      );

      const scenario =
        scenarios.find((s) => s.id === scenarioId) ??
        scenarios.find((s) => normalize(s.id) === normId) ??
        (dto.title
          ? scenarios.find((s) => s.title.toLowerCase() === dto.title!.toLowerCase())
          : undefined);

      if (!scenario) {
        throw new NotFoundException(ERROR_MSG.DB.NOT_FOUND('Simulation'));
      }
      return new ResponseResult({ message, data: this.stripVoice(scenario) });
    } catch (error) {
      return handleError(error);
    }
  }

  /** Serves `GET /api/simulations/educators`. */
  async getAllScenarios(
    currentUser: ICurrentUser,
  ): Promise<
    ResponseResult<Array<BlobScenario & { unit_image: string | null; in_library: boolean }>>
  > {
    try {
      const educatorId = String(currentUser?.userId ?? '').trim();
      if (!educatorId) {
        throwAppError(ERROR_MSG.COMMON.UNAUTHORIZED, ErrorTypes.UNAUTHORIZED);
      }

      const [, allSimulations, savedRows] = await Promise.all([
        this.getUnits(),
        this.simulationV2Repository.find(),
        this.educatorSimRepo.find({ where: { educator_id: educatorId, deleted_at: IsNull() } }),
      ]);
      const allScenarios = allSimulations.map((s) => this.toBlobScenario(s));

      const scenarios = allScenarios.filter((s) => isSimulationVisibleToEducators(s.status));

      const inLibraryIds = new Set(savedRows.map((r) => r.scenario_id));
      const data = scenarios.map((s) => ({
        ...s,
        unit_image: s.scenarioImage ?? null,
        in_library: inLibraryIds.has(s.id),
      }));
      return new ResponseResult({ message: SUCCESS_MSG.COMMON.FETCHED('Simulations'), data });
    } catch (error) {
      return handleError(error);
    }
  }

  /** Serves `GET /api/simulations/combined`. */
  async getCombinedSimulations(
    currentUser: ICurrentUser,
  ): Promise<ResponseResult<CombinedSimulationData>> {
    try {
      const educatorId = String(currentUser?.userId ?? '').trim() || null;

      const [units, allSimulations, savedRows] = await Promise.all([
        this.getUnits(),
        this.simulationV2Repository.find(),
        educatorId
          ? this.educatorSimRepo.find({
              where: {
                educator_id: educatorId,
                deleted_at: IsNull(),
              },
            })
          : Promise.resolve([]),
      ]);
      const allScenarios = allSimulations.map((s) => this.toBlobScenario(s));

      const scenarios = allScenarios.filter((s) => {
        const status = String(s.status ?? '')
          .toLowerCase()
          .trim();

        return status !== 'draft' && status !== 'archived';
      });

      const inLibraryIds = new Set(savedRows.map((r) => r.scenario_id?.toLowerCase().trim()));
      const data: CombinedSimulationData = {
        dashboard: this.buildDashboard(units, scenarios),

        catalog: scenarios.map((s) => {
          const isFavorite = inLibraryIds.has(s.id?.toLowerCase().trim());
          return {
            ...this.formatBlobItem(s, units, scenarios),
            myFavorite: isFavorite,
          };
        }),

        scenarios: scenarios.map((s) => ({
          ...s,
          unit_image: s.scenarioImage ?? null,
          in_library: inLibraryIds.has(s.id?.toLowerCase().trim()),
          targetAudience: s.learnerLevel ? [s.learnerLevel] : [],
        })),
      };
      return new ResponseResult({ message: SUCCESS_MSG.COMMON.FETCHED('Simulations'), data });
    } catch (error) {
      return handleError(error);
    }
  }

  /**
   * Serves `GET /api/simulations/by-unit/:id` — consumed by simulation detail
   * and the add-to-library modal.
   */
  async findByUnitId(
    _currentUser: ICurrentUser,
    unitId: string,
  ): Promise<ResponseResult<SimulationV2[]>> {
    try {
      const simulations = await this.simulationV2Repository.findByUnitId(unitId);
      const data = simulations.map((simulation): SimulationV2 => ({
        ...simulation,
        actionCategories:
          simulation.actionCategories ??
          SimulationConstants.ACTION_CATEGORIES.map((category) => ({
            ...category,
            scenarioId: simulation.id,
          })),
      }));
      return new ResponseResult({ message: SUCCESS_MSG.COMMON.FETCHED('Simulations'), data });
    } catch (error) {
      return handleError(error);
    }
  }

  /**
   * Maps a SimulationV2 row onto the BlobScenario shape this service's
   * formatting helpers were built around — the two shapes are near-identical
   * (SimulationV2's columns were seeded from the same blob scenario JSON),
   * with the one real divergence being `learningObjective` (jsonb, can be a
   * string or string[] in the DB vs. always a single string on BlobScenario),
   * which is normalized here.
   */
  /**
   * The unauthenticated share-link shape: the scenario WITHOUT any voice. The effective-voice
   * lookup and the raw `voiceProfileId` both stay behind the authenticated scenario reads
   * (admin and student routes), so a public link neither exposes which stock voice a scenario
   * uses nor does a voice lookup per anonymous request. `toBlobScenario` spreads the whole row,
   * so the keys are removed explicitly.
   */
  private toPublicScenario(sim: SimulationV2): BlobScenario {
    return this.stripVoice(this.toBlobScenario(sim));
  }

  private stripVoice(scenario: BlobScenario): BlobScenario {
    const copy: Record<string, unknown> = { ...scenario };
    delete copy.voiceProfile;
    delete copy.voiceProfileId;
    return copy as unknown as BlobScenario;
  }

  private toBlobScenario(sim: SimulationV2): BlobScenario {
    const learningObjective = Array.isArray(sim.learningObjective)
      ? sim.learningObjective.join('\n')
      : sim.learningObjective;

    return {
      ...sim,
      id: sim.id,
      unitId: sim.unitId ?? '',
      learningObjective,
    } as unknown as BlobScenario;
  }

  /** Units are read from the `units` table, not blob storage. */
  private async getUnits(): Promise<BlobUnit[]> {
    const units = await this.unitRepository.find({
      order: { name: 'ASC' },
    });
    return units.map((u) => ({
      id: u.id,
      name: u.name,
      category: u.category ?? '',
      imageUrl: u.imageUrl ?? undefined,
      description: u.description ?? undefined,
    }));
  }

  private parseJsonField<T>(value: string | T | undefined, fallback: T): T {
    if (value === undefined || value === null) return fallback;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value) as T;
      } catch {
        return fallback;
      }
    }
    return value;
  }

  private formatItem(
    item: SimulationCatalog,
    units: BlobUnit[] = [],
    scenarios: BlobScenario[] = [],
  ): SimulationItem {
    const blobUnit = units.find((u) => u.name === item.unit || u.id === item.unit);
    const unitScenarioCount = blobUnit
      ? scenarios.filter((s) => s.unitId === blobUnit.id).length
      : 0;

    const scenarioImageUrl = item.image_url ?? blobUnit?.imageUrl ?? undefined;

    return {
      id: item.id,
      scenario_id: null,
      scenarioId: null,
      title: item.title,
      unit: item.unit,
      unit_id: blobUnit?.id ?? null,
      unit_image: item.image_url ?? blobUnit?.imageUrl ?? null,
      scenario_count: unitScenarioCount,
      category: item.category,
      target_audience: item.target_audience,
      difficulty_level: item.difficulty_level,
      estimated_duration: item.estimated_duration,
      language: item.language,
      purpose: item.purpose,
      description: item.description,
      learning_objectives: Array.isArray(item.learning_objectives)
        ? item.learning_objectives
        : item.learning_objectives
          ? item.learning_objectives.split('||').map((s) => s.trim())
          : [],
      rating: Number(item.rating),
      total_ratings: item.total_ratings,
      usage: item.usage,
      scenarioImage: scenarioImageUrl,
      image_url: scenarioImageUrl,
      images: this.parseJsonField<string[]>(item.images, []),
      rating_breakdown: this.parseJsonField<RatingBreakdown[]>(item.rating_breakdown, []),
      reviews: this.parseJsonField<SimulationReview[]>(item.reviews, []),
      whats_new: this.parseJsonField<WhatsNew | undefined>(item.whats_new, undefined),
      simulation_privacy: item.simulation_privacy,
      developer: item.developer,
      institution: item.institution,
      last_update: item.last_update,
      created_at: item.created_at,
      updated_at: item.updated_at,
    };
  }

  private formatBlobItem(
    scenario: BlobScenario,
    units: BlobUnit[],
    allScenarios: BlobScenario[] = [],
  ): SimulationItem {
    const blobUnit = units.find((u) => u.id === scenario.unitId);
    const scenarioCountForUnit = allScenarios.filter((s) => s.unitId === scenario.unitId).length;
    const learningObjectives = scenario.learningObjective
      ? scenario.learningObjective
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    return {
      id: 0,
      scenario_id: scenario.id ?? null,
      scenarioId: scenario.id ?? null,
      title: scenario.title,
      unit: blobUnit?.name ?? scenario.unitId ?? '',
      unit_id: blobUnit?.id ?? null,
      unit_image: blobUnit?.imageUrl ?? null,
      scenario_count: scenarioCountForUnit,
      category: blobUnit?.category ?? '',
      target_audience: scenario.learnerLevel ?? '',
      difficulty_level: scenario.difficulty,
      estimated_duration: scenario.studentBriefing?.timeAllotment,
      language: scenario.language ?? 'English',
      purpose: scenario.studentBriefing?.purpose,
      description: scenario.description,
      learning_objectives: learningObjectives,
      rating: 0,
      total_ratings: 0,
      usage: undefined,
      scenarioImage: scenario.scenarioImage ?? undefined,
      image_url: scenario.scenarioImage ?? blobUnit?.imageUrl ?? undefined,
      images: scenario.scenarioImage
        ? [scenario.scenarioImage]
        : blobUnit?.imageUrl
          ? [blobUnit.imageUrl]
          : [],
      rating_breakdown: [],
      reviews: [],
      whats_new: undefined,
      simulation_privacy: undefined,
      developer: scenario.productSetup?.title,
      institution: scenario.department,
      last_update: undefined,
      created_at: new Date(),
      updated_at: new Date(),
    };
  }

  private buildDashboard(units: BlobUnit[], scenarios: BlobScenario[]): SimulationDashboard {
    const browseByItems = units.map((u, i) => ({
      id: i + 1,
      title: u.name,
      description: u.category ?? '',
      duration: `${scenarios.filter((s) => s.unitId === u.id).length} simulations`,
      image: u.imageUrl ?? null,
      cta: 'Download',
      unit: u.id,
    }));

    const difficulties = [
      ...new Set(
        scenarios.map((s) => s.difficulty).filter((value): value is string => Boolean(value)),
      ),
    ];
    const audiences = [
      ...new Set(
        scenarios.map((s) => s.learnerLevel).filter((value): value is string => Boolean(value)),
      ),
    ];

    const toCard = (s: BlobScenario): DashboardCard => ({
      id: s.id,
      title: s.title,
      image: s.scenarioImage ?? units.find((u) => u.id === s.unitId)?.imageUrl ?? null,
      scenarioImage: s.scenarioImage ?? null,
      cta: 'View',
      unit: s.unitId,
      difficulty: s.difficulty ?? null,
      targetAudience: s.learnerLevel ? [s.learnerLevel] : [],
    });

    const byDifficulty = (level: string): DashboardCard[] =>
      scenarios.filter((s) => s.difficulty === level).map(toCard);

    const lastScenario = scenarios[scenarios.length - 1];
    const lastScenarioUnit = lastScenario ? units.find((u) => u.id === lastScenario.unitId) : null;

    return {
      banner: {
        title: lastScenario?.title ?? lastScenarioUnit?.name ?? units[0]?.name ?? '',
        subtitle:
          lastScenario?.description ??
          (lastScenarioUnit?.category ? `Category: ${lastScenarioUnit.category}` : ''),
        image:
          lastScenario?.scenarioImage ??
          lastScenarioUnit?.imageUrl ??
          units.find((u) => !!u.imageUrl)?.imageUrl ??
          null,
      },
      filters: {
        fields: [
          { key: 'unit', label: 'Unit', options: units.map((u) => u.id) },
          { key: 'targetAudience', label: 'Target Audience', options: audiences },
          { key: 'difficulty', label: 'Difficulties', options: difficulties },
        ],
      },
      browseBy: {
        filters: [
          { id: 'unit', label: 'Unit', active: true },
          { id: 'targetAudience', label: 'Target Audiences', active: false },
        ],
        items: browseByItems,
      },
      sections: [
        {
          key: 'allSimulations',
          title: 'All Simulations',
          viewAll: true,
          type: 'carousel',
          items: scenarios.map(toCard),
        },
        {
          key: 'easyLevel',
          title: 'Easy',
          viewAll: true,
          type: 'grid',
          items: byDifficulty('Easy'),
        },
        {
          key: 'mediumLevel',
          title: 'Medium',
          viewAll: true,
          type: 'grid',
          items: byDifficulty('Medium'),
        },
        {
          key: 'hardLevel',
          title: 'Hard',
          viewAll: true,
          type: 'grid',
          items: byDifficulty('Hard'),
        },
      ].filter((s) => s.items.length > 0),
    };
  }

  /**
   * Resolves which simulations a student has been assigned, in-process via
   * `StudentsService.getSimulationsByCode()` — the source of truth behind the root students
   * "simulations by student code" endpoint.
   */
  async getAssignedSimulationIds(studentCode: string): Promise<Set<string>> {
    const payload = await this.studentsService.getSimulationsByCode(studentCode);
    if (!payload) {
      throwAppError(Messages.SCENARIO_ASSIGNMENT_UNAVAILABLE, ErrorTypes.SERVICE_UNAVAILABLE);
    }

    return this.extractAssignedIds(payload);
  }

  /** `true` when `scenarioId` is in the assignment set for `studentCode`. */
  async isScenarioAssigned(studentCode: string, scenarioId: string): Promise<boolean> {
    const assigned = await this.getAssignedSimulationIds(studentCode);
    return assigned.has(String(scenarioId));
  }

  private extractAssignedIds(payload: EducatorAssignmentResponse | null | undefined): Set<string> {
    const ids = new Set<string>();
    if (!payload || typeof payload !== 'object') {
      return ids;
    }

    const inner: EducatorAssignmentPayload = payload.data ?? payload;

    for (const sim of inner.simulations ?? []) {
      const id = sim?.id ?? sim?.simulation_id ?? sim?.simulationId;
      if (id !== undefined && id !== null && String(id).length > 0) {
        ids.add(String(id));
      }
    }

    for (const cs of inner.classSimulations ?? []) {
      const id = cs?.simulation_id ?? cs?.simulationId;
      if (id !== undefined && id !== null && String(id).length > 0) {
        ids.add(String(id));
      }
    }

    return ids;
  }

  /** Serves `GET /api/simulations/target-audiences/my-library/dropdown`. */
  findLibraryTargetAudienceDropdown(
    currentUser: ICurrentUser,
    dto: FilterDropdownReqDto,
  ): Promise<ResponseResult<string[], IPaginationMeta>> {
    return this.findTextDropdown(currentUser, dto, 'Target audiences', (params) =>
      this.simulationV2Repository.findLibraryTargetAudienceDropdownPage(params),
    );
  }

  /** Serves `GET /api/simulations/target-audiences/catalog/dropdown`. */
  findCatalogueTargetAudienceDropdown(
    currentUser: ICurrentUser,
    dto: FilterDropdownReqDto,
  ): Promise<ResponseResult<string[], IPaginationMeta>> {
    return this.findTextDropdown(currentUser, dto, 'Target audiences', (params) =>
      this.simulationV2Repository.findCatalogueTargetAudienceDropdownPage(params),
    );
  }

  /** Serves `GET /api/simulations/product-names/my-library/dropdown`. */
  findLibraryProductNameDropdown(
    currentUser: ICurrentUser,
    dto: FilterDropdownReqDto,
  ): Promise<ResponseResult<string[], IPaginationMeta>> {
    return this.findTextDropdown(currentUser, dto, 'Product names', (params) =>
      this.simulationV2Repository.findLibraryProductNameDropdownPage(params),
    );
  }

  /** Serves `GET /api/simulations/product-names/catalog/dropdown`. */
  findCatalogueProductNameDropdown(
    currentUser: ICurrentUser,
    dto: FilterDropdownReqDto,
  ): Promise<ResponseResult<string[], IPaginationMeta>> {
    return this.findTextDropdown(currentUser, dto, 'Product names', (params) =>
      this.simulationV2Repository.findCatalogueProductNameDropdownPage(params),
    );
  }

  /** One page of a text filter's values: paging and search come from the request, the scope from `read`. */
  private async findTextDropdown(
    currentUser: ICurrentUser,
    dto: FilterDropdownReqDto,
    label: string,
    read: (params: FilterDropdownParams) => Promise<FilterDropdownPage<string>>,
  ): Promise<ResponseResult<string[], IPaginationMeta>> {
    try {
      assertEducator(currentUser);

      const { items, meta } = await readFilterDropdownPage(currentUser.educatorId, dto, read);

      return new ResponseResult({
        message: SUCCESS_MSG.COMMON.FETCHED(label),
        data: items,
        meta,
      });
    } catch (error) {
      return handleError(error);
    }
  }
}
