import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { SimulationCatalog } from './entity/simulation-catalog.entity';
import { EducatorSimulation } from 'src/educator-simulations/entity/educator-simulation.entity';
import { AzureBlobService } from 'src/common/utils/azure-blob.service';
import { BlobScenario, BlobUnit, ServiceResponse } from 'src/common/types';
import { ErrorTypes } from 'src/common/utils/messages';
import {
  SimulationCatalogItem,
  SimulationReview,
  RatingBreakdown,
  WhatsNew,
  SimulationDashboard,
  DashboardCard,
  CombinedCatalogData,
} from './dto/simulation-catalog.types';
import { SimulationCatalogConstants } from './simulation-catalog.constants';
import { TutorPatientService } from 'src/common/utils/tutor-patient.service';
import { EducatorsService } from 'src/educators/educators.service';
import { StudentsService } from 'src/students/students.service';

@Injectable()
export class SimulationCatalogService {
  constructor(
    @InjectRepository(SimulationCatalog)
    private readonly catalogRepo: Repository<SimulationCatalog>,
    @InjectRepository(EducatorSimulation)
    private readonly educatorSimRepo: Repository<EducatorSimulation>,
    private readonly azureBlobService: AzureBlobService,
    private readonly tutorPatientService: TutorPatientService,
    private readonly educatorsService: EducatorsService,
    private readonly studentsService: StudentsService,
  ) {}

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
  ): SimulationCatalogItem {
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

  private async uploadFile(file: Express.Multer.File, prefix: string): Promise<string> {
    return this.azureBlobService.uploadFile(
      file.buffer,
      `${prefix}/${Date.now()}-${file.originalname}`,
      file.mimetype,
    );
  }

  private formatBlobItem(
    scenario: BlobScenario,
    units: BlobUnit[],
    allScenarios: BlobScenario[] = [],
  ): SimulationCatalogItem {
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

  async getStatusSummary(ls?: string): Promise<
    ServiceResponse<{
      total: number;
      active: number;
      published: number;
      draft: number;
      other: number;
      breakdown: Record<string, number>;
    }>
  > {
    const allScenarios = (await this.tutorPatientService.getAllScenariosDirect(
      ls,
    )) as BlobScenario[];
    const breakdown: Record<string, number> = {};
    for (const s of allScenarios) {
      const status =
        String(s.status ?? '')
          .toLowerCase()
          .trim() || '(no status)';
      breakdown[status] = (breakdown[status] ?? 0) + 1;
    }

    const active = breakdown['active'] ?? 0;
    const published = breakdown['published'] ?? 0;
    const draft = breakdown['draft'] ?? 0;
    const noStatus = breakdown['(no status)'] ?? 0;
    const other = allScenarios.length - active - published - draft - noStatus;

    return {
      success: true,
      message: 'Status summary fetched successfully',
      data: {
        total: allScenarios.length,
        active,
        published,
        draft,
        other,
        breakdown,
      },
    };
  }

  async getCatalog(ls?: string): Promise<ServiceResponse<SimulationCatalogItem[]>> {
    await this.tutorPatientService.clearCache();
    const [items, units, allScenarios] = await Promise.all([
      this.catalogRepo.find({ order: { id: 'ASC' } }),
      this.tutorPatientService.getUnits() as Promise<BlobUnit[]>,
      this.tutorPatientService.getAllScenariosDirect(ls) as Promise<BlobScenario[]>,
    ]);

    const scenarios = allScenarios.filter((s) => {
      const status = String(s.status ?? '')
        .toLowerCase()
        .trim();
      return status !== 'draft' && status !== 'archived';
    });

    const sourceLabel = this.tutorPatientService.getSimulationSourceLabel(ls);
    const successMessage = `Simulation catalog fetched from ${sourceLabel} successfully`;
    if (scenarios.length > 0) {
      return {
        success: true,
        message: successMessage,
        data: scenarios.map((s) => this.formatBlobItem(s, units, scenarios)),
      };
    }

    if (items.length > 0) {
      return {
        success: true,
        message: successMessage,
        data: items.map((item) => this.formatItem(item, units, scenarios)),
      };
    }

    return {
      success: true,
      message: successMessage,
      data: [],
    };
  }

  async getCatalogFromBlob(ls?: string): Promise<ServiceResponse<object>> {
    await this.tutorPatientService.clearCache();
    const [units, allScenarios] = await Promise.all([
      this.tutorPatientService.getUnits() as Promise<BlobUnit[]>,
      this.tutorPatientService.getAllScenariosDirect(ls) as Promise<BlobScenario[]>,
    ]);

    const scenarios = allScenarios.filter((s) => {
      const status = String(s.status ?? '')
        .toLowerCase()
        .trim();
      return status !== 'draft' && status !== 'archived';
    });

    const browseByItems = units.map((u, i) => ({
      id: i + 1,
      title: u.name,
      description: u.category ?? '',
      duration: `${scenarios.filter((s) => s.unitId === u.id).length} simulations`,
      image: u.imageUrl ?? null,
      cta: 'Download',
      unit: u.id,
    }));

    const difficulties = [...new Set(scenarios.map((s) => s.difficulty).filter(Boolean))];
    const audiences = [...new Set(scenarios.map((s) => s.learnerLevel).filter(Boolean))];

    const toCard = (
      s: BlobScenario,
    ): {
      id: string;
      title: string;
      image: string | null;
      scenarioImage: string | null;
      cta: string;
      unit: string;
      difficulty: string | null;
      targetAudience: string[];
    } => ({
      id: s.id,
      title: s.title,
      image: s.scenarioImage ?? units.find((u) => u.id === s.unitId)?.imageUrl ?? null,
      scenarioImage: s.scenarioImage ?? null,
      cta: 'View',
      unit: s.unitId,
      difficulty: s.difficulty ?? null,
      targetAudience: s.learnerLevel ? [s.learnerLevel] : [],
    });

    const byDifficulty = (
      level: string,
    ): {
      id: string;
      title: string;
      image: string | null;
      cta: string;
      unit: string;
      difficulty: string | null;
      targetAudience: string[];
    }[] => scenarios.filter((s) => s.difficulty === level).map(toCard);

    const lastScenario = scenarios[scenarios.length - 1];
    const lastScenarioUnit = lastScenario ? units.find((u) => u.id === lastScenario.unitId) : null;
    const bannerImage =
      lastScenario?.scenarioImage ??
      lastScenarioUnit?.imageUrl ??
      units.find((u) => !!u.imageUrl)?.imageUrl ??
      null;
    const bannerTitle = lastScenario?.title ?? lastScenarioUnit?.name ?? units[0]?.name ?? '';
    const bannerSubtitle =
      lastScenario?.description ??
      (lastScenarioUnit?.category ? `Category: ${lastScenarioUnit.category}` : '');

    const dashboard = {
      banner: {
        title: bannerTitle,
        subtitle: bannerSubtitle,
        image: bannerImage,
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

    return {
      success: true,
      message: SimulationCatalogConstants.MESSAGES.DASHBOARD_FETCHED,
      data: dashboard,
    };
  }

  async getAdminReport(id: string): Promise<ServiceResponse<BlobScenario[]>> {
    try {
      const educators = await this.educatorsService.findAll(id);
      if (!educators.success || !educators.data?.length) {
        return { success: false, message: educators.message, type: ErrorTypes.NOT_FOUND };
      }
      const studentIdArrays = await Promise.all(
        educators.data.map((educator) => this.studentsService.findAllByEducator(educator.id)),
      );
      const studentIds = studentIdArrays.flatMap((res) => res.data ?? []);
      const result = await this.tutorPatientService.getReportsByStudentIds(studentIds);
      const reports = result.matched as unknown as BlobScenario[];
      return {
        success: true,
        message: SimulationCatalogConstants.MESSAGES.CATALOG_FETCHED,
        data: reports,
      };
    } catch (error) {
      return { success: false, message: (error as Error).message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  async getByScenarioId(id: string, ls?: string): Promise<ServiceResponse<SimulationCatalogItem>> {
    await this.tutorPatientService.clearCache('units.json');
    const [units, scenarios] = await Promise.all([
      this.tutorPatientService.getUnits() as Promise<BlobUnit[]>,
      this.tutorPatientService.getFreshScenarios(ls) as Promise<BlobScenario[]>,
    ]);
    const scenario = scenarios.find((s) => s.id === id);
    if (!scenario) {
      return {
        success: false,
        message: SimulationCatalogConstants.MESSAGES.SIMULATION_NOT_FOUND,
        type: ErrorTypes.NOT_FOUND,
      };
    }
    return {
      success: true,
      message: SimulationCatalogConstants.MESSAGES.DASHBOARD_DETAIL_FETCHED,
      data: this.formatBlobItem(scenario, units, scenarios),
    };
  }

  async getPublicBlobScenario(
    id: string,
    title?: string,
    ls?: string,
  ): Promise<ServiceResponse<BlobScenario>> {
    const normalize = (s: string): string => s.toLowerCase().replace(/[-_\s]+/g, '-');
    const normId = normalize(id);

    const isValidScenario = (s: Record<string, unknown>): boolean => {
      const rawStatus = s.status;
      const status = (typeof rawStatus === 'string' ? rawStatus : '').toLowerCase().trim();
      return status !== 'draft' && status !== 'archived';
    };
    const direct = await this.tutorPatientService.getScenarioById(id, ls);
    if (direct && isValidScenario(direct)) {
      return {
        success: true,
        message: SimulationCatalogConstants.MESSAGES.DASHBOARD_DETAIL_FETCHED,
        data: direct as unknown as BlobScenario,
      };
    }

    const allScenarios = (await this.tutorPatientService.getScenarios(ls)) as BlobScenario[];
    const scenarios = allScenarios.filter((s) =>
      isValidScenario(s as unknown as Record<string, unknown>),
    );

    const scenario =
      scenarios.find((s) => s.id === id) ??
      scenarios.find((s) => normalize(s.id) === normId) ??
      (title ? scenarios.find((s) => s.title.toLowerCase() === title.toLowerCase()) : undefined);

    if (!scenario) {
      return {
        success: false,
        message: SimulationCatalogConstants.MESSAGES.SIMULATION_NOT_FOUND,
        type: ErrorTypes.NOT_FOUND,
      };
    }
    return {
      success: true,
      message: SimulationCatalogConstants.MESSAGES.DASHBOARD_DETAIL_FETCHED,
      data: scenario,
    };
  }

  async getSimulationsByUnitId(
    unit_id: string,
    ls?: string,
  ): Promise<ServiceResponse<BlobScenario[]>> {
    try {
      const allScenarios = (await this.tutorPatientService.getFreshScenarios(ls)) as BlobScenario[];

      // Filter out 'draft' and 'archived' scenarios — show everything else
      const scenarios = allScenarios.filter((s) => {
        const status = String(s.status ?? '')
          .toLowerCase()
          .trim();
        return status !== 'draft' && status !== 'archived';
      });
      return {
        success: true,
        message: SimulationCatalogConstants.MESSAGES.CATALOG_FETCHED,
        data: scenarios.filter((s) => s.unitId === unit_id),
      };
    } catch (error) {
      return { success: false, message: (error as Error).message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  async getAllScenarios(
    educatorId: string | null,
    ls?: string,
  ): Promise<
    ServiceResponse<Array<BlobScenario & { unit_image: string | null; in_library: boolean }>>
  > {
    try {
      const [, allScenarios, savedRows] = await Promise.all([
        this.tutorPatientService.getUnits() as Promise<BlobUnit[]>,
        this.tutorPatientService.getAllScenariosDirect(ls) as Promise<BlobScenario[]>,
        educatorId
          ? this.educatorSimRepo.find({ where: { educator_id: educatorId, deleted_at: IsNull() } })
          : Promise.resolve([]),
      ]);

      const scenarios = allScenarios.filter((s) => {
        const status = String(s.status ?? '')
          .toLowerCase()
          .trim();
        return status !== 'draft' && status !== 'archived';
      });

      const inLibraryIds = new Set(savedRows.map((r) => r.scenario_id));
      const data = scenarios.map((s) => ({
        ...s,
        unit_image: s.scenarioImage ?? null,
        in_library: inLibraryIds.has(s.id),
      }));
      return { success: true, message: SimulationCatalogConstants.MESSAGES.CATALOG_FETCHED, data };
    } catch (error) {
      return { success: false, message: (error as Error).message, type: ErrorTypes.BAD_REQUEST };
    }
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

  async remove(id: number): Promise<ServiceResponse<null>> {
    const item = await this.catalogRepo.findOne({ where: { id } });
    if (!item) {
      return {
        success: false,
        message: SimulationCatalogConstants.MESSAGES.SIMULATION_NOT_FOUND,
        type: ErrorTypes.NOT_FOUND,
      };
    }
    await this.catalogRepo.delete(id);
    return {
      success: true,
      message: SimulationCatalogConstants.MESSAGES.SIMULATION_DELETED,
      data: null,
    };
  }

  async getCombinedCatalog(
    educatorId: string | null,
    ls?: string,
  ): Promise<ServiceResponse<CombinedCatalogData>> {
    const [units, allScenarios, savedRows] = await Promise.all([
      this.tutorPatientService.getUnits() as Promise<BlobUnit[]>,
      this.tutorPatientService.getAllScenariosDirect(ls) as Promise<BlobScenario[]>,
      educatorId
        ? this.educatorSimRepo.find({
            where: {
              educator_id: educatorId,
              deleted_at: IsNull(),
            },
          })
        : Promise.resolve([]),
    ]);

    const scenarios = allScenarios.filter((s) => {
      const status = String(s.status ?? '')
        .toLowerCase()
        .trim();

      return status !== 'draft' && status !== 'archived';
    });

    const inLibraryIds = new Set(savedRows.map((r) => r.scenario_id?.toLowerCase().trim()));
    return {
      success: true,
      data: {
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
      },
    };
  }
}
