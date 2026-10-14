import { Inject, Injectable } from '@nestjs/common';
import { In, IsNull } from 'typeorm';

import { BlobScenario, BlobUnit, ServiceResponse } from 'src/common/types';
import { ErrorTypes } from 'src/common/utils/messages';
import { isSimulationVisibleToEducators } from 'src/common/utils/simulation-visibility.util';
import { EducatorSimulationsConstants } from './educator-simulations.constants';
import {
  EDUCATOR_SIMULATION_REPOSITORY,
  SIMULATION_V2_REPOSITORY,
  UNIT_REPOSITORY,
} from 'src/database/tokens';
import {
  EducatorSimulationRepository,
  SimulationV2Repository,
  UnitRepository,
} from 'src/database/repositories';
import { EducatorSimulation, SimulationV2 } from 'src/database/entities';
import { normalizeFilterText } from 'src/common/utils/simulation.util';
import { ResponseResult } from 'src/common/class/response.class';
import type {
  ICurrentUser,
  IMyLibraryFilters,
  IMyLibraryFullRow,
  IMyLibraryLiteRow,
  IPaginationMeta,
} from 'src/common/interfaces';
import { SUCCESS_MSG } from 'src/common/messages/success.message';
import { assertEducator } from 'src/common/utils/current-user.util';
import { handleError } from 'src/common/utils/common.util';
import { buildPaginationMeta, getPagination } from 'src/common/utils/pagination.util';
import {
  ListMyLibraryReqDto,
  MyLibraryItemResDto,
  MyLibraryLiteItemResDto,
} from './dto/list-my-library.dto';

@Injectable()
export class EducatorSimulationsService {
  constructor(
    @Inject(EDUCATOR_SIMULATION_REPOSITORY)
    private readonly repo: EducatorSimulationRepository,
    @Inject(UNIT_REPOSITORY)
    private readonly unitRepository: UnitRepository,
    @Inject(SIMULATION_V2_REPOSITORY)
    private readonly simulationV2Repository: SimulationV2Repository,
  ) {}

  /** See simulation.service.ts's identical helper for why this mapping is needed. */
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

  async addToLibrary(
    scenarioId: string,
    educatorId: string,
  ): Promise<ServiceResponse<EducatorSimulation>> {
    try {
      const scenario = await this.simulationV2Repository.findByBusinessId(scenarioId);
      if (!scenario) {
        return {
          success: false,
          message: EducatorSimulationsConstants.MESSAGES.NOT_FOUND,
          type: ErrorTypes.NOT_FOUND,
        };
      }

      // Already active in library
      const existing = await this.repo.findOne({
        where: { educator_id: educatorId, scenario_id: scenarioId, deleted_at: IsNull() },
      });
      if (existing) {
        return {
          success: false,
          message: EducatorSimulationsConstants.MESSAGES.ALREADY_IN_LIBRARY,
          type: ErrorTypes.BAD_REQUEST,
        };
      }

      // Previously soft-deleted — restore
      const deleted = await this.repo.findOne({
        where: { educator_id: educatorId, scenario_id: scenarioId },
      });
      if (deleted) {
        deleted.deleted_at = null;
        deleted.unit_id = scenario.unitId ?? '';
        const restored = await this.repo.create(deleted);
        return {
          success: true,
          message: EducatorSimulationsConstants.MESSAGES.ADDED,
          data: restored,
        };
      }

      // New row
      const saved = await this.repo.create({
        educator_id: educatorId,
        unit_id: scenario.unitId ?? '',
        scenario_id: scenarioId,
      });
      return { success: true, message: EducatorSimulationsConstants.MESSAGES.ADDED, data: saved };
    } catch (error) {
      return { success: false, message: (error as Error).message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  async addToLibraryBulk(
    scenarioIds: string[],
    educatorId: string,
  ): Promise<ServiceResponse<EducatorSimulation[]>> {
    try {
      const existingRows = await this.repo.find({
        where: {
          educator_id: educatorId,
          deleted_at: IsNull(),
        },
      });

      const existingIds = new Set(existingRows.map((r) => r.scenario_id));

      const scenarios = await this.simulationV2Repository.find({
        where: { id: In(scenarioIds) },
      });

      const rowsToInsert = scenarioIds
        .filter((id) => !existingIds.has(id))
        .map((id) => {
          const scenario = scenarios.find((s) => s.id === id);

          return {
            educator_id: educatorId,
            scenario_id: id,
            unit_id: scenario?.unitId ?? undefined,
          };
        });

      const savedRows = rowsToInsert.length ? await this.repo.saveMany(rowsToInsert) : [];

      return {
        success: true,
        message: 'Simulations added successfully',
        data: savedRows,
      };
    } catch (error) {
      return {
        success: false,
        message: (error as Error).message,
        type: ErrorTypes.BAD_REQUEST,
      };
    }
  }

  async removeFromLibrary(scenarioId: string, educatorId: string): Promise<ServiceResponse<null>> {
    try {
      const row = await this.repo.findOne({
        where: { educator_id: educatorId, scenario_id: scenarioId, deleted_at: IsNull() },
      });
      if (!row) {
        return {
          success: false,
          message: EducatorSimulationsConstants.MESSAGES.NOT_FOUND,
          type: ErrorTypes.NOT_FOUND,
        };
      }
      row.deleted_at = new Date();
      await this.repo.create(row);
      return { success: true, message: EducatorSimulationsConstants.MESSAGES.REMOVED, data: null };
    } catch (error) {
      return { success: false, message: (error as Error).message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  async removeFromLibraryBulk(
    scenarioIds: string[],
    educatorId: string,
  ): Promise<ServiceResponse<null>> {
    try {
      const rows = await this.repo.find({
        where: { educator_id: educatorId, scenario_id: In(scenarioIds), deleted_at: IsNull() },
      });
      if (!rows.length) {
        return {
          success: false,
          message: EducatorSimulationsConstants.MESSAGES.NOT_FOUND,
          type: ErrorTypes.NOT_FOUND,
        };
      }
      for (const row of rows) {
        row.deleted_at = new Date();
        await this.repo.create(row);
      }
      return { success: true, message: EducatorSimulationsConstants.MESSAGES.REMOVED, data: null };
    } catch (error) {
      return { success: false, message: (error as Error).message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  /**
   * `ls`-based localization is intentionally not supported here — SimulationV2
   * has no locale dimension yet (see simulations.service.ts), so this always
   * returns the single (English) row per scenario.
   */
  async getMyLibrary(educatorId: string): Promise<ServiceResponse<object[]>> {
    try {
      const [savedRows, units] = await Promise.all([
        this.repo.find({
          where: { educator_id: educatorId, deleted_at: IsNull() },
          order: { created_at: 'ASC' },
        }),
        this.getUnits(),
      ]);

      const scenarioRows = savedRows.length
        ? await this.simulationV2Repository.find({
            where: { id: In(savedRows.map((row) => row.scenario_id)) },
          })
        : [];
      const scenarios = scenarioRows.map((s) => this.toBlobScenario(s));

      const activeScenarios = scenarios.filter((s) => isSimulationVisibleToEducators(s.status));

      const data = savedRows
        .filter((row) => activeScenarios.some((s) => s.id === row.scenario_id))
        .map((row) => {
          const unit = units.find((u) => u.id === row.unit_id);
          const scenario = activeScenarios.find((s) => s.id === row.scenario_id) ?? null;
          return {
            id: row.id,
            educator_id: row.educator_id,
            unit_id: row.unit_id,
            scenario_id: row.scenario_id,
            unit: unit ?? null,
            scenario,
            created_at: row.created_at,
            updated_at: row.updated_at,
          };
        });

      return {
        success: true,
        message: EducatorSimulationsConstants.MESSAGES.MY_LIBRARY_FETCHED,
        data,
      };
    } catch (error) {
      return { success: false, message: (error as Error).message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  /**
   * Serves `GET /api/educator-simulations/my-library/list` — one page of the acting educator's own
   * library. `lite: true` returns the card-only items; otherwise the full items (unit, media, duration,
   * modality and product name on top). The existing `getMyLibrary` stays as is
   * for current callers.
   */
  async getMyLibraryList(
    currentUser: ICurrentUser,
    dto: ListMyLibraryReqDto & { lite: true },
  ): Promise<ResponseResult<MyLibraryLiteItemResDto[], IPaginationMeta>>;
  async getMyLibraryList(
    currentUser: ICurrentUser,
    dto: ListMyLibraryReqDto & { lite?: false | undefined },
  ): Promise<ResponseResult<MyLibraryItemResDto[], IPaginationMeta>>;
  async getMyLibraryList(
    currentUser: ICurrentUser,
    dto: ListMyLibraryReqDto,
  ): Promise<ResponseResult<MyLibraryItemResDto[] | MyLibraryLiteItemResDto[], IPaginationMeta>>;
  async getMyLibraryList(
    currentUser: ICurrentUser,
    dto: ListMyLibraryReqDto,
  ): Promise<ResponseResult<MyLibraryItemResDto[] | MyLibraryLiteItemResDto[], IPaginationMeta>> {
    try {
      assertEducator(currentUser);

      const { page, pageSize, skip, take } = getPagination({
        page: dto.page,
        pageSize: dto.pageSize,
      });
      const params = {
        educatorId: currentUser.educatorId,
        skip,
        take,
        filters: this.toLibraryFilters(dto),
      };

      if (dto.lite) {
        const { rows, total } = await this.repo.findVisiblePageByEducatorId({
          ...params,
          lite: true,
        });
        return this.toLibraryListResult(
          rows.map((row) => this.toLibraryLiteItem(row)),
          buildPaginationMeta(total, page, pageSize),
        );
      }

      const { rows, total } = await this.repo.findVisiblePageByEducatorId({
        ...params,
        lite: false,
      });
      return this.toLibraryListResult(
        rows.map((row) => this.toLibraryFullItem(row)),
        buildPaginationMeta(total, page, pageSize),
      );
    } catch (error) {
      return handleError(error);
    }
  }

  private toLibraryFilters(dto: ListMyLibraryReqDto): IMyLibraryFilters {
    return {
      search: dto.search === undefined ? undefined : normalizeFilterText(dto.search),
      learnerLevels: dto.learnerLevel,
      targetAudiences: dto.targetAudience?.map(normalizeFilterText),
      productNames: dto.productName?.map(normalizeFilterText),
      modality: dto.modality,
      difficulties: dto.difficulty?.map(normalizeFilterText),
      unitIds: dto.unitId,
    };
  }

  private toLibraryListResult<T extends MyLibraryItemResDto | MyLibraryLiteItemResDto>(
    data: T[],
    meta: IPaginationMeta,
  ): ResponseResult<T[], IPaginationMeta> {
    return new ResponseResult({ message: SUCCESS_MSG.COMMON.FETCHED('Simulations'), data, meta });
  }

  private toLibraryLiteItem(row: IMyLibraryLiteRow): MyLibraryLiteItemResDto {
    return {
      id: row.id,
      scenario: {
        id: row.scenarioId,
        title: row.title,
        description: row.description,
        learnerLevel: row.learnerLevel,
        difficulty: row.difficulty,
        avatarEnabled: row.avatarEnabled,
      },
    };
  }

  /** The lite item plus the filing and card extras; widen this mapper, not the lite one. */
  private toLibraryFullItem(row: IMyLibraryFullRow): MyLibraryItemResDto {
    return {
      id: row.id,
      unitId: row.unitId,
      unit: row.unit,
      scenario: {
        ...this.toLibraryLiteItem(row).scenario,
        estimatedDuration: row.estimatedDuration,
        timeAllotment: row.timeAllotment,
        scenarioImage: row.scenarioImage,
        productName: row.productName,
        clinicalSetting: row.clinicalSetting,
        learningObjectives: row.learningObjectives,
      },
    };
  }

  async getInLibraryIds(educatorId: string): Promise<Set<string>> {
    const rows = await this.repo.find({
      where: { educator_id: educatorId, deleted_at: IsNull() },
      select: ['scenario_id'],
    });
    return new Set(rows.map((r) => r.scenario_id));
  }
}
