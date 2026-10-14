import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DeepPartial,
  FindManyOptions,
  FindOneOptions,
  FindOptionsSelect,
  FindOptionsWhere,
  ILike,
  Repository,
} from 'typeorm';
import { SimulationV2, Unit } from 'src/database/entities';
import {
  PaginationConstants,
  SimulationConstants,
  SimulationScope,
  UnitConstants,
} from 'src/common/constants';
import {
  DropdownUnitsResult,
  PaginatedUnitsParams,
  PaginatedUnitsResult,
  FilterDropdownPage,
  FilterDropdownParams,
  UnitScopeDropdownItem,
} from 'src/common/interfaces';
import { escapeLikeWildcards } from 'src/common/utils/sql-like.util';
import { buildNormalizedTextSql, buildSimulationScopeSql } from 'src/common/utils/simulation.util';

@Injectable()
export class UnitRepository {
  constructor(
    @InjectRepository(Unit)
    private readonly repo: Repository<Unit>,
  ) {}

  async create(data: DeepPartial<Unit>): Promise<Unit> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async find(options: FindManyOptions<Unit> = {}): Promise<Unit[]> {
    return this.repo.find(options);
  }

  async findOne(options: FindOneOptions<Unit>): Promise<Unit | null> {
    return this.repo.findOne(options);
  }

  async findAndCount(options: FindManyOptions<Unit> = {}): Promise<[Unit[], number]> {
    return this.repo.findAndCount(options);
  }

  async count(options: FindManyOptions<Unit> = {}): Promise<number> {
    return this.repo.count(options);
  }

  async exists(where: FindOptionsWhere<Unit>): Promise<boolean> {
    return this.repo.exists({ where });
  }

  async findById(unitId: string): Promise<Unit | null> {
    return this.repo.findOne({ where: { unitId } });
  }

  /** Same lookup as findById, scoped to only the given columns via TypeORM's `select`. */
  async findByIdWithSelect(unitId: string, select: FindOptionsSelect<Unit>): Promise<Unit | null> {
    return this.repo.findOne({ where: { unitId }, select });
  }

  /** Lookup by the original business identifier from source JSON (e.g. "UAT-001"), not the surrogate unitId. */
  async findByBusinessId(id: string): Promise<Unit | null> {
    return this.repo.findOne({ where: { id } });
  }

  async updateById(unitId: string, data: DeepPartial<Unit>): Promise<Unit | null> {
    await this.repo.update({ unitId }, data);
    return this.findById(unitId);
  }

  async update(where: FindOptionsWhere<Unit>, data: DeepPartial<Unit>): Promise<void> {
    await this.repo.update(where, data);
  }

  async delete(unitId: string): Promise<void> {
    await this.repo.delete({ unitId });
  }

  /** Soft-delete, preferred over delete() given units are referenced by simulations.unit_id. */
  async softDelete(unitId: string): Promise<void> {
    await this.repo.softDelete({ unitId });
  }

  /**
   * Upsert by the business `id` (source JSON identifier), not the surrogate
   * unitId — used by the units.json import so re-running it is idempotent.
   */
  async upsertByBusinessId(rows: DeepPartial<Unit>[]): Promise<void> {
    if (rows.length === 0) return;
    await this.repo.upsert(rows, { conflictPaths: ['id'] });
  }

  /**
   * Runs the count + find for a paginated unit listing in one place, owning
   * the page/pageSize -> skip/take derivation and the name search filter, so
   * callers only pass through raw pagination/search input.
   */
  async findAndCountPaginated(params: PaginatedUnitsParams): Promise<PaginatedUnitsResult> {
    const page = params.page ?? PaginationConstants.DEFAULT_PAGE;
    const pageSize = params.pageSize ?? PaginationConstants.DEFAULT_PAGE_SIZE;
    const skip = (page - 1) * pageSize;
    const search = params.search?.trim();

    const query = this.repo
      .createQueryBuilder('unit')
      .select(['unit.unitId', 'unit.id', 'unit.name'])
      .leftJoin(
        SimulationV2,
        'simulation',
        'simulation.unit_id = unit.id AND simulation.deleted_at IS NULL',
      )
      .addSelect('COUNT(simulation.id)', 'scenarioCount')
      .groupBy('unit.unit_id')
      .addGroupBy('unit.id')
      .addGroupBy('unit.name')
      .orderBy('unit.name', 'ASC')
      .skip(skip)
      .take(pageSize);

    if (search) {
      query.where('unit.name ILIKE :search', { search: `%${search}%` });
    }

    const { entities, raw } = await query.getRawAndEntities<{ scenarioCount: string }>();
    const items = entities.map((unit, index) => ({
      ...unit,
      scenarioCount: Number(raw[index]?.scenarioCount ?? 0),
    }));

    const where: FindOptionsWhere<Unit> = {};
    if (search) {
      where.name = ILike(`%${search}%`);
    }
    const total = await this.repo.count({ where });

    return { items, total, page, pageSize };
  }

  /**
   * Lightweight listing for dropdown/autocomplete use — only unitId/id/name,
   * defaulting to a larger page size than the standard paginated listing.
   */
  async findForDropdown(params: PaginatedUnitsParams): Promise<DropdownUnitsResult> {
    const page = params.page ?? PaginationConstants.DEFAULT_PAGE;
    const pageSize = params.pageSize ?? UnitConstants.DROPDOWN.DEFAULT_PAGE_SIZE;
    const skip = (page - 1) * pageSize;
    const search = params.search?.trim();

    const where: FindOptionsWhere<Unit> = {};
    if (search) {
      where.name = ILike(`%${search}%`);
    }

    const [items, total] = await this.repo.findAndCount({
      where,
      select: { unitId: true, id: true, name: true },
      order: { name: 'ASC' },
      skip,
      take: pageSize,
    });

    return { items, total, page, pageSize };
  }

  /**
   * The Units the My Library Unit filter can match: live Units that at least one of the Educator's
   * own saved, visible Simulations currently belongs to, by name.
   */
  findLibraryDropdownPage(
    params: FilterDropdownParams,
  ): Promise<FilterDropdownPage<UnitScopeDropdownItem>> {
    return this.findScopeDropdownPage(SimulationScope.MY_LIBRARY, params);
  }

  /** The Units of at least one visible Simulation, saved or not, by name. */
  findCatalogueDropdownPage(
    params: FilterDropdownParams,
  ): Promise<FilterDropdownPage<UnitScopeDropdownItem>> {
    return this.findScopeDropdownPage(SimulationScope.CATALOG, params);
  }

  /** One scope-aware query for both scopes; a Unit is listed once however many Simulations it has. */
  private async findScopeDropdownPage(
    scope: SimulationScope,
    params: FilterDropdownParams,
  ): Promise<FilterDropdownPage<UnitScopeDropdownItem>> {
    const qb = this.repo
      .createQueryBuilder('u')
      .where(
        `EXISTS (SELECT 1 FROM simulations_v2 sim WHERE sim.unit_id = u.id AND ${buildSimulationScopeSql(scope, 'sim')})`,
      )
      .setParameter(SimulationConstants.SCOPE.EDUCATOR_PARAM, params.educatorId);
    if (params.search) {
      qb.andWhere(`${buildNormalizedTextSql('u.name')} LIKE :searchPattern ESCAPE '\\'`, {
        searchPattern: `%${escapeLikeWildcards(params.search)}%`,
      });
    }

    const [total, items] = await Promise.all([
      qb.getCount(),
      qb
        .clone()
        .select('u.id', 'id')
        .addSelect('u.name', 'name')
        .orderBy('LOWER(u.name)', 'ASC')
        .addOrderBy('u.id', 'ASC')
        .offset(params.skip)
        .limit(params.take)
        .getRawMany<{ id: string; name: string }>(),
    ]);
    return { items, total };
  }

  findUniqueByName(name: string): Promise<Unit | null> {
    return this.repo
      .createQueryBuilder('unit')
      .where('LOWER(TRIM(unit.name)) = :name', { name: (name || '').trim().toLowerCase() })
      .getOne();
  }
}
