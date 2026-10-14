
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DeepPartial,
  EntityManager,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  In,
  Repository,
} from 'typeorm';
import {
  SimulationV2,
  SimulationAction,
  SimulationGradingRubricItem,
  SimulationOrder,
  SimulationOrderLinkedAction,
  VoiceProfile,
} from 'src/database/entities';
import {
  FilterDropdownPage,
  FilterDropdownParams,
  IVoiceProfileUsageRow,
  OrderDefinition,
} from 'src/common/interfaces';
import { escapeLikeWildcards } from 'src/common/utils/sql-like.util';
import {
  buildCollapsedTextSql,
  buildNormalizedTextSql,
  buildSimulationScopeSql,
} from 'src/common/utils/simulation.util';
import { fromOrderDefinitions, toOrderDefinitions } from 'src/common/utils/order-definition.util';
import { SimulationConstants, SimulationScope, VoiceProfileStatus } from 'src/common/constants';
import { ERROR_MSG } from 'src/common/messages/error.message';
import { throwAppError } from 'src/common/utils/app-error';
import { ErrorTypes } from 'src/common/utils/messages';

/** Options for scenario writes that set a voice profile. */
export interface ScenarioWriteOptions {
  /**
   * The voice profile this write sets. When given, the write's transaction first takes a
   * `FOR SHARE` lock on that profile's ACTIVE row and throws the 400 scenario-voice-invalid if
   * there is none, so a concurrent retire (which takes `FOR UPDATE`) cannot slip between the
   * service's validation and this write.
   */
  lockVoiceProfileId?: string | null;
}

export type SimulationV2WithOrderDefinitions = Omit<SimulationV2, 'orders'> & { orders?: OrderDefinition[] };

@Injectable()
export class SimulationV2Repository {
  constructor(
    @InjectRepository(SimulationV2)
    private readonly repo: Repository<SimulationV2>,
  ) { }

  omitRemovedFields(data: DeepPartial<SimulationV2>) {
    data['ethnicity'] = undefined
    data['age'] = undefined
    data['disabled'] = undefined
    data['assessmentNarrativeExpected'] = undefined
    data['historyPrompts'] = undefined
    data['assessmentGuidance'] = undefined
    data['preBriefPdf'] = undefined
    data['realClinical'] = undefined
    data['hsRealClinical'] = undefined
    data['psRealClinical'] = undefined
    // `voiceProfile` on a scenario READ is the resolved effective voice
    // ({ id, displayName, source }), not the relation. A client
    // echoing it back must not reach TypeORM, which would read it as the
    // relation and write voice_profile_id = NULL. `voiceProfileId` is the
    // writable field.
    delete (data as { voiceProfile?: unknown }).voiceProfile

    return data

  }

  /** Shared-locks the active voice profile for the rest of the transaction, or throws 400. */
  private async lockActiveVoiceProfile(
    manager: EntityManager,
    voiceProfileId: string | null | undefined,
  ): Promise<void> {
    if (!voiceProfileId) return;
    const row = await manager.findOne(VoiceProfile, {
      where: { voiceProfileId, status: VoiceProfileStatus.ACTIVE },
      lock: { mode: 'pessimistic_read' },
    });
    if (!row) {
      throwAppError(
        ERROR_MSG.VOICE_PROFILE.SCENARIO_VOICE_INVALID(voiceProfileId),
        ErrorTypes.BAD_REQUEST,
      );
    }
  }

  async create(
    data: DeepPartial<SimulationV2>,
    options: ScenarioWriteOptions = {},
  ): Promise<SimulationV2> {
    data = this.omitRemovedFields(data)
    // Incoming orders may be OrderDefinition-shaped (round-tripped from a
    // prior joined read) — normalize back to entity fields before persisting.
    const orders = fromOrderDefinitions(
      data.orders as unknown as Array<Record<string, unknown>> | undefined,
    )?.map((order) => ({ ...order, orderId: undefined }))
    const actions = data.actions?.map((action) => ({ ...action, actionId: undefined }))
    const gradingRubricItems = data.gradingRubricItems?.map((items) => ({ ...items, rubricId: undefined }))
    const entity = this.repo.create({ ...data, orders, actions, gradingRubricItems });
    return this.repo.manager.transaction(async (manager) => {
      await this.lockActiveVoiceProfile(manager, options.lockVoiceProfileId);
      return manager.save(SimulationV2, entity);
    });
  }

  async find(options: FindManyOptions<SimulationV2> = {}): Promise<SimulationV2[]> {
    return this.repo.find(options);
  }

  async findOne(options: FindOneOptions<SimulationV2>): Promise<SimulationV2 | null> {
    return this.repo.findOne(options);
  }

  async findAndCount(options: FindManyOptions<SimulationV2> = {}): Promise<[SimulationV2[], number]> {
    return this.repo.findAndCount(options);
  }

  async count(options: FindManyOptions<SimulationV2> = {}): Promise<number> {
    return this.repo.count(options);
  }

  async exists(where: FindOptionsWhere<SimulationV2>): Promise<boolean> {
    return this.repo.exists({ where });
  }

  async findById(simulationId: string): Promise<SimulationV2 | null> {
    return this.repo.findOne({ where: { simulationId } });
  }

  /** Lookup by the original external business identifier, not the surrogate simulationId. */
  async findByBusinessId(id: string): Promise<SimulationV2 | null> {
    return this.repo.findOne({ where: { id } });
  }

  /** Every simulation whose business id is in `ids`; unknown ids are simply absent. */
  async findByBusinessIds(ids: string[]): Promise<SimulationV2[]> {
    if (ids.length === 0) return [];
    return this.repo.find({ where: { id: In(ids) } });
  }

  async findByUnitId(unitId: string): Promise<SimulationV2[]> {
    return this.repo.find({ where: { unitId }, relations: ['actions'] });
  }

  async countSimulationByUnitId(unitId: string): Promise<number> {
    return this.repo.count({ where: { unitId } });
  }

  /** Scenarios still pointing at an avatar — blocks its deletion. */
  async countSimulationByAvatarId(avatarId: string): Promise<number> {
    return this.repo.count({ where: { avatarId } });
  }

  /**
   * Non-deleted scenarios (drafts included) pointing at a voice profile —
   * blocks retiring it. `deletedAt IS NULL` is implicit: `count` excludes
   * soft-deleted rows.
   */
  async countByVoiceProfileId(voiceProfileId: string): Promise<number> {
    return this.repo.count({ where: { voiceProfileId } });
  }

  /** Business ids of up to `limit` scenarios using a voice profile, for the 409 message. */
  async findIdsByVoiceProfileId(voiceProfileId: string, limit: number): Promise<string[]> {
    const rows = await this.repo.find({
      where: { voiceProfileId },
      select: { simulationId: true, id: true },
      order: { id: 'ASC' },
      take: limit,
    });
    return rows.map((row) => row.id);
  }

  /** Scenario counts per voice profile, for the list's `usageCount`. One grouped query. */
  async countGroupedByVoiceProfileId(voiceProfileIds: string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (voiceProfileIds.length === 0) return counts;
    const rows = await this.repo
      .createQueryBuilder('s')
      .select('s.voice_profile_id', 'voiceProfileId')
      .addSelect('COUNT(*)', 'count')
      .where('s.voice_profile_id IN (:...ids)', { ids: voiceProfileIds })
      .andWhere('s.deleted_at IS NULL')
      .groupBy('s.voice_profile_id')
      .getRawMany<IVoiceProfileUsageRow>();
    for (const row of rows) counts.set(row.voiceProfileId, Number(row.count));
    return counts;
  }

  async updateById(
    simulationId: string,
    data: DeepPartial<SimulationV2>,
    options: ScenarioWriteOptions = {},
  ): Promise<SimulationV2WithOrderDefinitions | null> {
    const { actions, orders: incomingOrders, grading, parent_scenario_id, simulationId: _id, ...updatedData } = data;
    // Incoming orders may be OrderDefinition-shaped (round-tripped from a
    // prior joined read) — normalize back to entity fields before persisting.
    const orders = fromOrderDefinitions(
      incomingOrders as unknown as Array<Record<string, unknown>> | undefined,
    );
    const rubricItems = data.grading?.rubric ?? data.gradingRubricItems ?? []
    const rest = this.omitRemovedFields(updatedData)

    await this.repo.manager.transaction(async (manager) => {
      await this.lockActiveVoiceProfile(manager, options.lockVoiceProfileId);
      await manager.update(
        SimulationV2,
        { simulationId },                                      // <-- no `where` wrapper
        { ...rest, ...(grading && { grading: { ...grading, rubric: undefined } }) },
      );

      // simulation_order_linked_actions has no simulationId column of its own and
      // ON DELETE CASCADE FKs to both simulation_orders(order_id) and
      // simulation_actions(action_id) (see CreateSimulationV2Schema migration),
      // so deleting the orders/actions below already cascades its rows — no
      // separate delete needed (and manager.delete() can't join to filter by a
      // relation path like `simulationAction.simulationId` anyway).
      await manager.delete(SimulationOrder, { simulationId });
      await manager.delete(SimulationAction, { simulationId });
      await manager.delete(SimulationGradingRubricItem, { simulationId });

      const insertedActions = actions?.length
        ? await manager.insert(SimulationAction, actions.map((a) => ({ ...a, simulationId, actionId: undefined })))
        : null;

      const insertedOrders = orders?.length
        ? await manager.insert(SimulationOrder, orders.map((o) => ({ ...o, simulationId, orderId: undefined })))
        : null;

      if (rubricItems.length) {
        await manager.insert(
          SimulationGradingRubricItem,
          rubricItems.map((r) => ({ ...r, simulationId, rubricId: undefined })),
        );
      }

      // build id maps from insert results(identifiers preserve input array order)
      const actionSurrogateIdByBusinessId = new Map(
        (insertedActions?.identifiers ?? []).map((idObj, index) => [actions?.[index].actionId, idObj.id]),
      );
      const savedOrderRows = (insertedOrders?.identifiers ?? []).map((idObj, index) => ({
        ...orders?.[index],
        orderId: idObj.orderId as string,
      }));

      const linkRows = (orders ?? []).flatMap((order, index) => {
        const linkedActionIds = (order?.linkedActionIds ?? []) as never[];
        const savedOrder = savedOrderRows[index];
        return linkedActionIds
          .map((businessId: string) => actionSurrogateIdByBusinessId.get(businessId))
          .filter((actionId: string | undefined): actionId is string => Boolean(actionId))
          .map((actionId: string) => ({ orderId: savedOrder.orderId, actionId, id: undefined }));
      });
      if (linkRows.length) {
        await manager.insert(SimulationOrderLinkedAction, linkRows);
      }
    });

    const row = await this.repo.findOne({
      where: { simulationId },
      relations: ['actions', 'orders', 'gradingRubricItems'],
    });

    return row
      ? {
        ...row,
        ...(row.grading ? { grading: { ...row.grading, rubric: row.gradingRubricItems } } : {}),
        gradingRubricItems: undefined,
        parent_scenario_id: row.parentScenarioId,
        orders: toOrderDefinitions(row.orders),
      }
      : null;
  }

  async update(where: FindOptionsWhere<SimulationV2>, data: DeepPartial<SimulationV2>): Promise<void> {
    await this.repo.update(where, data);
  }

  async delete(simulationId: string): Promise<void> {
    await this.repo.delete({ simulationId });
  }

  /** Preferred over delete() given the CASCADE chain into actions/orders/grading_rubric_items. */
  async softDelete(simulationId: string): Promise<void> {
    await this.repo.update({ simulationId }, { deletedAt: new Date() });
  }

  /**
   * Single SQL join across simulations_v2 + all three child tables, using the
   * @OneToMany relations declared on SimulationV2 (see
   * database-entities-rules.md's "Foreign keys" rule) rather than a
   * hand-written QueryBuilder ON condition. TypeORM issues the join and
   * hydrates the result itself, so each returned SimulationV2 has its
   * `actions`/`orders`/`gradingRubricItems` populated as proper nested
   * arrays — no manual row-grouping needed, unlike the raw-row approach this
   * replaced.
   */
  async findAllWithChildrenJoined(): Promise<SimulationV2WithOrderDefinitions[]> {
    const records = await this.repo.find({
      relations: ['actions', 'orders', 'gradingRubricItems'],
      order: {
        updatedAt: 'DESC',
      },
    });

    return records.map((r) => ({
      ...r,
      ...(r.grading ? { grading: { ...r.grading, rubric: ((r.gradingRubricItems ?? [])).map((item) => ({ ...item, weight: Number(item.weight) })) } } : {}),
      gradingRubricItems: undefined,
      parent_scenario_id: r.parentScenarioId,
      orders: toOrderDefinitions(r.orders),
    }));
  }

  /**
   * Single SQL join across simulations_v2 + all three child tables, using the
   * @OneToMany relations declared on SimulationV2 (see
   * database-entities-rules.md's "Foreign keys" rule) rather than a
   * hand-written QueryBuilder ON condition. TypeORM issues the join and
   * hydrates the result itself, so each returned SimulationV2 has its
   * `actions`/`orders`/`gradingRubricItems` populated as proper nested
   * arrays — no manual row-grouping needed, unlike the raw-row approach this
   * replaced.
   */
  async findAllWithoutChildrenJoined(): Promise<SimulationV2WithOrderDefinitions[]> {
    const records = await this.repo.find({
      select: ['id', 'simulationId', 'description', 'title', 'unitId', 'avatarEnabled', 'status'],
      order: {
        updatedAt: 'DESC',
      },
    });

    return records.map((r) => ({
      ...r,
      ...(r.grading ? { grading: { ...r.grading, rubric: ((r.gradingRubricItems ?? [])).map((item) => ({ ...item, weight: Number(item.weight) })) } } : {}),
      gradingRubricItems: undefined,
      parent_scenario_id: r.parentScenarioId,
      orders: toOrderDefinitions(r.orders),
    }));
  }


  /** Same single-join approach as findAllWithChildrenJoined, scoped to one business id. */
  async findByBusinessIdWithChildrenJoined(id: string): Promise<SimulationV2WithOrderDefinitions | null> {
    const row = await this.repo.findOne({
      where: { id },
      relations: ['actions', 'orders', 'gradingRubricItems'],
    });

    return row
      ? {
        ...row,
        ...(row.grading ? { grading: { ...row.grading, rubric: ((row.gradingRubricItems ?? [])).map((item) => ({ ...item, weight: Number(item.weight) })) } } : {}),
        gradingRubricItems: undefined,
        parent_scenario_id: row.parentScenarioId,
        orders: toOrderDefinitions(row.orders),
      }
      : null;
  }

  findUniqueByTitle(title: string): Promise<SimulationV2 | null> {
    return this.repo
      .createQueryBuilder('simulation')
      .where('LOWER(TRIM(simulation.title)) = :title', { title: (title || '').trim().toLowerCase() })
      .getOne();
  }

  /**
   * The Target Audiences the My Library filter can match: the audience text of the Educator's own
   * saved, visible Simulations, one value per normalized group, by value.
   */
  findLibraryTargetAudienceDropdownPage(
    params: FilterDropdownParams,
  ): Promise<FilterDropdownPage<string>> {
    return this.findTextDropdownPage(
      SimulationScope.MY_LIBRARY,
      SimulationConstants.LIBRARY_FILTER.COLUMNS.TARGET_AUDIENCE,
      params,
    );
  }

  /** The Target Audiences of every visible Simulation, saved or not, one value per group. */
  findCatalogueTargetAudienceDropdownPage(
    params: FilterDropdownParams,
  ): Promise<FilterDropdownPage<string>> {
    return this.findTextDropdownPage(
      SimulationScope.CATALOG,
      SimulationConstants.LIBRARY_FILTER.COLUMNS.TARGET_AUDIENCE,
      params,
    );
  }

  /**
   * The Required Product Names the My Library filter can match: the product setup titles of the
   * Educator's own saved, visible Simulations, one value per normalized group, without the
   * placeholder `none`.
   */
  findLibraryProductNameDropdownPage(
    params: FilterDropdownParams,
  ): Promise<FilterDropdownPage<string>> {
    return this.findTextDropdownPage(
      SimulationScope.MY_LIBRARY,
      SimulationConstants.LIBRARY_FILTER.COLUMNS.PRODUCT_NAME,
      params,
      [SimulationConstants.LIBRARY_FILTER.PLACEHOLDER_PRODUCT_NAME],
    );
  }

  /** The Required Product Names of every visible Simulation, saved or not, without `none`. */
  findCatalogueProductNameDropdownPage(
    params: FilterDropdownParams,
  ): Promise<FilterDropdownPage<string>> {
    return this.findTextDropdownPage(
      SimulationScope.CATALOG,
      SimulationConstants.LIBRARY_FILTER.COLUMNS.PRODUCT_NAME,
      params,
      [SimulationConstants.LIBRARY_FILTER.PLACEHOLDER_PRODUCT_NAME],
    );
  }

  /**
   * Distinct values of a text column in a scope, grouped as the filters compare them (trimmed,
   * whitespace collapsed, case-insensitive). Each group is returned as its most frequent original
   * spelling (the first in sort order when several are equally frequent, so the pick is stable),
   * trimmed and with whitespace collapsed. Blank and missing values and the `excludedKeys` (already
   * normalized) are dropped. Written with the query builder because the representative spelling
   * needs `MODE() WITHIN GROUP`, which find options cannot express.
   */
  private async findTextDropdownPage(
    scope: SimulationScope,
    column: string,
    params: FilterDropdownParams,
    excludedKeys: string[] = [],
  ): Promise<FilterDropdownPage<string>> {
    const key = buildNormalizedTextSql(column);
    const base = this.repo
      .createQueryBuilder('sim')
      .where(buildSimulationScopeSql(scope, 'sim'))
      .andWhere(`${key} <> ''`)
      .setParameter(SimulationConstants.SCOPE.EDUCATOR_PARAM, params.educatorId);
    if (excludedKeys.length > 0) {
      base.andWhere(`${key} NOT IN (:...excludedKeys)`, { excludedKeys });
    }
    if (params.search) {
      base.andWhere(`${key} LIKE :searchPattern ESCAPE '\\'`, {
        searchPattern: `%${escapeLikeWildcards(params.search)}%`,
      });
    }

    const [counted, rows] = await Promise.all([
      base.clone().select(`COUNT(DISTINCT ${key})`, 'total').getRawOne<{ total: string }>(),
      base
        .clone()
        .select(`MODE() WITHIN GROUP (ORDER BY ${buildCollapsedTextSql(column)})`, 'value')
        .groupBy(key)
        .orderBy(key, 'ASC')
        .offset(params.skip)
        .limit(params.take)
        .getRawMany<{ value: string }>(),
    ]);
    return { items: rows.map((row) => row.value), total: Number(counted?.total ?? 0) };
  }
}
