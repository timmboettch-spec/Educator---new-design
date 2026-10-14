import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DeepPartial,
  FindManyOptions,
  FindOneOptions,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { EducatorSimulation } from 'src/database/entities';
import {
  IMyLibraryFullListRawRow,
  IMyLibraryFullListResult,
  IMyLibraryFilters,
  IMyLibraryFullRow,
  IMyLibraryListParams,
  IMyLibraryListRawRow,
  IMyLibraryLiteListResult,
  IMyLibraryLiteRow,
} from 'src/common/interfaces';
import { LibraryModality, SimulationConstants, SimulationScope } from 'src/common/constants';
import { escapeLikeWildcards } from 'src/common/utils/sql-like.util';
import {
  buildLearnerLevelSql,
  buildNormalizedTextSql,
  buildSimulationScopeSql,
  toLearningObjectiveList,
} from 'src/common/utils/simulation.util';

@Injectable()
export class EducatorSimulationRepository {
  private static readonly TITLE_COLUMN = 'sim.title';

  constructor(
    @InjectRepository(EducatorSimulation)
    private readonly repo: Repository<EducatorSimulation>,
  ) {}

  async create(data: DeepPartial<EducatorSimulation>): Promise<EducatorSimulation> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async saveMany(data: DeepPartial<EducatorSimulation>[]): Promise<EducatorSimulation[]> {
    const entities = this.repo.create(data);
    return this.repo.save(entities);
  }

  async find(options: FindManyOptions<EducatorSimulation> = {}): Promise<EducatorSimulation[]> {
    return this.repo.find(options);
  }

  async findOne(options: FindOneOptions<EducatorSimulation>): Promise<EducatorSimulation | null> {
    return this.repo.findOne(options);
  }

  async update(id: string, data: DeepPartial<EducatorSimulation>): Promise<number> {
    const result = await this.repo.update(id, data);
    return result.affected ?? 0;
  }

  /**
   * One page of an educator's own library: their non-removed saved entries joined to live
   * simulations that educators may see (the Catalogue scope narrowed to the Educator's saved
   * entries), in title order. `total` counts the same filtered set. It is a separate query, not
   * the same snapshot, so a save or remove racing the request can make `total` differ from the page
   * by that change; the next request is consistent again. A window `COUNT(*) OVER()` would avoid
   * that but returns no total for a page past the last. The join is on the simulation's business
   * id (`simulations_v2.id`), which is not a primary key, so it is written by hand as in
   * `ClassSimulationRepository.findForClassListing`.
   *
   * `lite: true` reads only the card columns (including the avatar flag). The full variant also reads the filing columns,
   * the card media and the unit (a left join: an entry whose unit is gone still shows, with a null
   * unit). The page and `total` are the same for both.
   */
  async findVisiblePageByEducatorId(
    params: IMyLibraryListParams & { lite: true },
  ): Promise<IMyLibraryLiteListResult>;
  async findVisiblePageByEducatorId(
    params: IMyLibraryListParams & { lite?: false | undefined },
  ): Promise<IMyLibraryFullListResult>;
  async findVisiblePageByEducatorId(
    params: IMyLibraryListParams,
  ): Promise<IMyLibraryLiteListResult | IMyLibraryFullListResult>;
  async findVisiblePageByEducatorId(
    params: IMyLibraryListParams,
  ): Promise<IMyLibraryLiteListResult | IMyLibraryFullListResult> {
    const qb = this.repo
      .createQueryBuilder('es')
      .innerJoin('simulations_v2', 'sim', 'sim.id = es.scenario_id')
      .where('es.educator_id = :educatorId', { educatorId: params.educatorId })
      .andWhere('es.deleted_at IS NULL')
      .andWhere(buildSimulationScopeSql(SimulationScope.CATALOG, 'sim'));
    // The page and the count both start from this builder, so they cannot disagree.
    this.applyFilters(qb, params.filters ?? {});

    const full = !params.lite;

    // `offset`/`limit`, not `skip`/`take`: with a join, `getRawMany()` ignores `skip`/`take`.
    const rowsQb = qb
      .clone()
      .select('es.id', 'id')
      .addSelect('sim.id', 'scenario_id')
      .addSelect(EducatorSimulationRepository.TITLE_COLUMN, 'title')
      .addSelect('sim.description', 'description')
      .addSelect(SimulationConstants.LIBRARY_FILTER.COLUMNS.TARGET_AUDIENCE, 'learner_level')
      .addSelect('sim.difficulty', 'difficulty')
      .addSelect('sim.avatar_enabled', 'avatar_enabled')
      .orderBy(`LOWER(${EducatorSimulationRepository.TITLE_COLUMN})`, 'ASC')
      .addOrderBy('es.created_at', 'ASC')
      .addOrderBy('es.id', 'ASC')
      .offset(params.skip)
      .limit(params.take);

    if (full) {
      // `units.id` is unique among live units, so the join cannot multiply rows.
      rowsQb
        .leftJoin('units', 'u', 'u.id = sim.unit_id AND u.deleted_at IS NULL')
        .addSelect('sim.unit_id', 'unit_id')
        .addSelect('u.id', 'unit_ref_id')
        .addSelect('u.name', 'unit_name')
        .addSelect('u.image_url', 'unit_image_url')
        // A blank estimate or time allotment counts as missing (null). The two are separate fields:
        // the allotment is not a fallback for the estimate.
        .addSelect(`NULLIF(BTRIM(sim.estimated_duration), '')`, 'estimated_duration')
        .addSelect(`NULLIF(BTRIM(sim.student_briefing->>'timeAllotment'), '')`, 'time_allotment')
        .addSelect('sim.scenario_image', 'scenario_image')
        .addSelect(SimulationConstants.LIBRARY_FILTER.COLUMNS.PRODUCT_NAME, 'product_name')
        .addSelect('sim.department', 'department')
        .addSelect('sim.learning_objective', 'learning_objective');
    }

    const [total, raw] = await Promise.all([
      qb.getCount(),
      rowsQb.getRawMany<IMyLibraryListRawRow>(),
    ]);

    if (full) {
      return {
        rows: (raw as IMyLibraryFullListRawRow[]).map((row) => this.toFullRow(row)),
        total,
      };
    }
    return { rows: raw.map((row) => this.toLiteRow(row)), total };
  }

  /** Adds one `AND` group per filter that is present; values are bound, never concatenated. */
  private applyFilters(
    qb: SelectQueryBuilder<EducatorSimulation>,
    filters: IMyLibraryFilters,
  ): void {
    if (filters.search) {
      qb.andWhere(
        `${buildNormalizedTextSql(EducatorSimulationRepository.TITLE_COLUMN)} LIKE :searchPattern ESCAPE '\\'`,
        { searchPattern: `%${escapeLikeWildcards(filters.search)}%` },
      );
    }
    if (filters.learnerLevels?.length) {
      qb.andWhere(
        `(${buildLearnerLevelSql(SimulationConstants.LIBRARY_FILTER.COLUMNS.TARGET_AUDIENCE)}) = ANY(:learnerLevels)`,
        {
          learnerLevels: filters.learnerLevels,
        },
      );
    }
    if (filters.targetAudiences?.length) {
      qb.andWhere(
        `${buildNormalizedTextSql(SimulationConstants.LIBRARY_FILTER.COLUMNS.TARGET_AUDIENCE)} = ANY(:targetAudiences)`,
        {
          targetAudiences: filters.targetAudiences,
        },
      );
    }
    // The title is matched whether or not the simulation still `requiresProductSetup`: a title left
    // behind when an admin turns that off still counts (same as what the item shows).
    if (filters.productNames?.length) {
      qb.andWhere(
        `${buildNormalizedTextSql(SimulationConstants.LIBRARY_FILTER.COLUMNS.PRODUCT_NAME)} = ANY(:productNames)`,
        { productNames: filters.productNames },
      );
    }
    this.applyModality(qb, filters.modality);
    if (filters.difficulties?.length) {
      qb.andWhere(`${buildNormalizedTextSql('sim.difficulty')} = ANY(:difficulties)`, {
        difficulties: filters.difficulties,
      });
    }
    if (filters.unitIds?.length) {
      qb.andWhere('sim.unit_id = ANY(:unitIds)', { unitIds: filters.unitIds });
    }
  }

  /** Avatar is the flag being true, Workstation is it not being true (a missing flag counts). Both
   * together exclude nothing. */
  private applyModality(
    qb: SelectQueryBuilder<EducatorSimulation>,
    modality: LibraryModality[] | undefined,
  ): void {
    const wanted = new Set(modality);
    if (wanted.size === 0 || wanted.size === Object.values(LibraryModality).length) return;
    qb.andWhere(
      wanted.has(LibraryModality.AVATAR)
        ? 'sim.avatar_enabled = TRUE'
        : 'sim.avatar_enabled IS NOT TRUE',
    );
  }

  private toLiteRow(row: IMyLibraryListRawRow): IMyLibraryLiteRow {
    return {
      id: row.id,
      scenarioId: row.scenario_id,
      title: row.title,
      description: row.description,
      learnerLevel: row.learner_level,
      difficulty: row.difficulty,
      avatarEnabled: row.avatar_enabled,
    };
  }

  private toFullRow(row: IMyLibraryFullListRawRow): IMyLibraryFullRow {
    return {
      ...this.toLiteRow(row),
      unitId: row.unit_id ?? '',
      unit: row.unit_ref_id
        ? { id: row.unit_ref_id, name: row.unit_name ?? '', imageUrl: row.unit_image_url }
        : null,
      estimatedDuration: row.estimated_duration,
      timeAllotment: row.time_allotment,
      scenarioImage: row.scenario_image,
      productName: row.product_name,
      clinicalSetting: row.department,
      learningObjectives: toLearningObjectiveList(row.learning_objective),
    };
  }
}
