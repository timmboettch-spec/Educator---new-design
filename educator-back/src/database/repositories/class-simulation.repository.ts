import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DeepPartial,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  In,
  Repository,
  UpdateResult,
} from 'typeorm';
import { Class, ClassSimulation, Educator } from 'src/database/entities';
import {
  ClassSimulationListingConstants,
  ClassSimulationSortField,
  SimulationProgressStatus,
} from 'src/common/constants';
import {
  IBulkAssignClassSimulationsInput,
  IBulkAssignClassSimulationsResult,
  IClassSimulationListingPagination,
  IClassSimulationListingRawRow,
  IClassSimulationListingResult,
  IClassSimulationListingSort,
} from 'src/common/interfaces';
import { buildAssignmentDateExpr } from 'src/common/utils/assignment-date-sql.util';
import { assignmentRangesOverlap } from 'src/common/utils/assignment-date.util';
import { CLASS_SIMULATION_MSG } from 'src/common/messages/class-simulation.message';
import { ERROR_MSG } from 'src/common/messages/error.message';
import { buildScoreColumnExpr } from 'src/common/utils/simulation-report-jsonb-expressions.util';

const START_DATE_EXPR = buildAssignmentDateExpr('cs.start_date');
const DUE_DATE_EXPR = buildAssignmentDateExpr('cs.due_date');
const CLOSE_DATE_EXPR = buildAssignmentDateExpr('cs.end_date');

/** Same rule as `ClassSimulationService.mapSimulation`: no live catalog row, or archived/draft. */
const IS_ARCHIVED_EXPR = `(sim.simulation_id IS NULL
  OR COALESCE(LOWER(TRIM(sim.status)), '') IN (:...archivedStatuses))`;

/**
 * `created_at` is `timestamp without time zone` (UTC on deployed servers), so `::date` is the
 * stored day, unaffected by the session time zone. Don't add `AT TIME ZONE`: it adds that dependency.
 */
const REPORT_DAY_EXPR = 'sr.created_at::date';

/**
 * Reports counted for one assignment `cs`: the class's active students, created inside its
 * start..close window (no window if either date doesn't parse).
 */
const REPORT_SCOPE_SQL = `FROM simulation_reports sr
  INNER JOIN students st ON st.id = sr.student_id
  WHERE st.class_id = cs.class_id
    AND st.is_active = TRUE
    AND sr.scenario_id = cs.simulation_id
    AND (${START_DATE_EXPR} IS NULL OR ${CLOSE_DATE_EXPR} IS NULL
      OR ${REPORT_DAY_EXPR} BETWEEN ${START_DATE_EXPR} AND ${CLOSE_DATE_EXPR})`;

const SCORE_EXPR = buildScoreColumnExpr('sr');
/** 0..1 fractions are scaled to a percentage, as the class page does. */
const SCORE_PERCENT_EXPR = `ROUND(CASE WHEN ${SCORE_EXPR} BETWEEN 0 AND 1 THEN ${SCORE_EXPR} * 100 ELSE ${SCORE_EXPR} END)`;

const STARTED_COUNT_SQL = `(SELECT COUNT(DISTINCT sr.student_id) ${REPORT_SCOPE_SQL})`;
/**
 * Students counted as completed for assignment `cs`: active students of the class whose Simulation
 * Progress for that Simulation is Completed or Forfeited (ADR-0010), once each however many
 * Attempts they made. The window uses `forfeited_at` for a Forfeit and `updated_at` for Completed,
 * both `timestamptz`, read as the UTC day so the session time zone doesn't matter.
 */
const COMPLETED_COUNT_SQL = `(SELECT COUNT(DISTINCT p.student_id)
  FROM student_simulation_progress p
  INNER JOIN students st ON st.id = p.student_id
  WHERE st.class_id = cs.class_id
    AND st.is_active = TRUE
    AND p.simulation_id = sim.simulation_id
    AND p.status IN ('${SimulationProgressStatus.COMPLETED}', '${SimulationProgressStatus.FORFEITED}')
    AND p.deleted_at IS NULL
    AND (${START_DATE_EXPR} IS NULL OR ${CLOSE_DATE_EXPR} IS NULL
      OR (COALESCE(p.forfeited_at, p.updated_at) AT TIME ZONE 'UTC')::date
        BETWEEN ${START_DATE_EXPR} AND ${CLOSE_DATE_EXPR})
)`;
/** Mean of each student's best score; `NULL` when no counted report carries a score. */
const AVERAGE_SCORE_SQL = `(SELECT ROUND(AVG(per_student.best_score)) FROM (
  SELECT MAX(${SCORE_PERCENT_EXPR}) AS best_score ${REPORT_SCOPE_SQL} GROUP BY sr.student_id
) per_student)`;

/** Aggregates sort by their SELECT alias; everything else by its underlying expression. */
/** The simulation's unit business id; `NULL` (not the legacy `''`) when it has none. */
const UNIT_ID_EXPR = "NULLIF(sim.unit_id, '')";

const SORT_EXPR_BY_FIELD: Record<ClassSimulationSortField, string> = {
  [ClassSimulationSortField.SIM_ID]: 'cs.simulation_id',
  [ClassSimulationSortField.SIM_NAME]: 'LOWER(sim.title)',
  [ClassSimulationSortField.IS_ARCHIVED]: IS_ARCHIVED_EXPR,
  [ClassSimulationSortField.START_DATE]: START_DATE_EXPR,
  [ClassSimulationSortField.DUE_DATE]: DUE_DATE_EXPR,
  [ClassSimulationSortField.CLOSE_DATE]: CLOSE_DATE_EXPR,
  [ClassSimulationSortField.STARTED_COUNT]: 'started_count',
  [ClassSimulationSortField.COMPLETED_COUNT]: 'completed_count',
  [ClassSimulationSortField.AVERAGE_SCORE]: 'average_score',
  [ClassSimulationSortField.AVATAR_ENABLED]: 'sim.avatar_enabled',
  [ClassSimulationSortField.UNIT_ID]: UNIT_ID_EXPR,
  [ClassSimulationSortField.UNIT_NAME]: 'LOWER(u.name)',
};

@Injectable()
export class ClassSimulationRepository {
  constructor(
    @InjectRepository(ClassSimulation)
    private readonly repo: Repository<ClassSimulation>,
  ) {}

  async create(data: DeepPartial<ClassSimulation>): Promise<ClassSimulation> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async find(options: FindManyOptions<ClassSimulation> = {}): Promise<ClassSimulation[]> {
    return this.repo.find(options);
  }

  async findOne(options: FindOneOptions<ClassSimulation>): Promise<ClassSimulation | null> {
    return this.repo.findOne(options);
  }

  async count(options: FindManyOptions<ClassSimulation> = {}): Promise<number> {
    return this.repo.count(options);
  }

  async exists(
    where: FindOptionsWhere<ClassSimulation> | FindOptionsWhere<ClassSimulation>[],
  ): Promise<boolean> {
    return this.repo.exists({ where });
  }

  /**
   * Atomically deactivates a class simulation only if it is currently active
   * (WHERE id = :id AND is_active = true), so a retried request can't double-refund.
   * Returns the number of rows affected (0 or 1).
   */
  async deactivateIfActive(id: string): Promise<UpdateResult> {
    return this.repo
      .createQueryBuilder()
      .update()
      .set({ is_active: false, deleted_at: new Date() })
      .where('id = :id AND is_active = true', { id })
      .execute();
  }

  /** Active assignments for any of `classIds` × `simulationIds` — the bulk-assign overlap check's input. */
  async findActiveByClassIdsAndSimulationIds(
    classIds: string[],
    simulationIds: string[],
  ): Promise<ClassSimulation[]> {
    if (classIds.length === 0 || simulationIds.length === 0) return [];
    return this.repo.find({
      where: { class_id: In(classIds), simulation_id: In(simulationIds), is_active: true },
    });
  }

  /**
   * Inserts every bulk-assigned row and deducts the AI seats in one transaction.
   *
   * 1. Locks the target `classes` rows (sorted, so two bulk requests can't deadlock). Any other
   *    bulk assign to one of these classes — a double-click, a retry, a co-instructor — waits here.
   * 2. Re-runs the overlap check under that lock: the caller's pre-check ran outside the
   *    transaction, so a request that committed meanwhile is only visible now. On a conflict
   *    nothing is written or charged, and the conflicting rows are returned for the caller to report.
   * 3. Locks the educator row and refuses a short balance (rolls back).
   * 4. Inserts the rows and moves the seats (`tokens -= n`, `allocated_tokens += n`, as
   *    `EducatorsService.updateToken`).
   */
  async createManyAndChargeSeats(
    input: IBulkAssignClassSimulationsInput,
  ): Promise<IBulkAssignClassSimulationsResult> {
    return this.repo.manager.transaction(async (manager) => {
      // uuids compare case-insensitively in Postgres but come back lowercase, so compare in JS
      // on lowercase too — an uppercase request id must still hit the lock and the conflict check.
      const classIds = [...new Set(input.rows.map((row) => row.classId.toLowerCase()))].sort();
      const simulationIds = [...new Set(input.rows.map((row) => row.simulationId))];
      await manager.find(Class, {
        where: { id: In(classIds) },
        order: { id: 'ASC' },
        lock: { mode: 'pessimistic_write' },
      });

      const existing = await manager.find(ClassSimulation, {
        where: { class_id: In(classIds), simulation_id: In(simulationIds), is_active: true },
      });
      const conflicts = existing.filter((assignment) =>
        input.rows.some(
          (row) =>
            row.classId.toLowerCase() === assignment.class_id.toLowerCase() &&
            row.simulationId === assignment.simulation_id &&
            assignmentRangesOverlap(row, {
              startDate: assignment.start_date,
              endDate: assignment.end_date,
            }),
        ),
      );
      if (conflicts.length > 0) {
        return { saved: [], conflicts, previousTokens: 0, newTokens: 0 };
      }

      const educator = await manager.findOne(Educator, {
        where: { id: input.educatorId, is_active: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (!educator) throw new NotFoundException(ERROR_MSG.DB.NOT_FOUND('Educator'));

      const previousTokens = Number(educator.tokens) || 0;
      if (previousTokens < input.seatsToCharge) {
        throw new BadRequestException(
          CLASS_SIMULATION_MSG.BULK_ASSIGN.INSUFFICIENT_SEATS(input.seatsToCharge, previousTokens),
        );
      }

      const saved = await manager.save(
        ClassSimulation,
        input.rows.map((row) =>
          manager.create(ClassSimulation, {
            class_id: row.classId,
            simulation_id: row.simulationId,
            start_date: row.startDate,
            due_date: row.dueDate,
            end_date: row.endDate,
            is_ai: row.isAi,
            is_active: true,
          }),
        ),
      );

      let newTokens = previousTokens;
      if (input.seatsToCharge > 0) {
        newTokens = previousTokens - input.seatsToCharge;
        await manager.update(
          Educator,
          { id: input.educatorId },
          {
            tokens: newTokens,
            allocated_tokens: (Number(educator.allocated_tokens) || 0) + input.seatsToCharge,
          },
        );
      }

      return { saved, conflicts: [], previousTokens, newTokens };
    });
  }

  /**
   * Writes only the three assignment dates, and only while the row is still active
   * (WHERE id = :id AND is_active = true), so an edit racing `deactivateIfActive` can't
   * re-activate a removed assignment the way a full-entity `save()` would.
   * Returns the number of rows affected (0 or 1).
   */
  async updateDatesIfActive(
    id: string,
    dates: Pick<ClassSimulation, 'start_date' | 'due_date' | 'end_date'>,
  ): Promise<UpdateResult> {
    return this.repo
      .createQueryBuilder()
      .update()
      .set(dates)
      .where('id = :id AND is_active = true', { id })
      .execute();
  }

  /**
   * Preview list of class simulations visible to an admin, joined through
   * class -> educator -> admin, for the admin dashboard overview.
   */
  async findPreviewForAdmin(adminId: string, limit: number): Promise<ClassSimulation[]> {
    return this.repo
      .createQueryBuilder('cs')
      .innerJoin('cs.class', 'c')
      .innerJoin('c.educator', 'e')
      .innerJoin('e.admin', 'da')
      .innerJoin('da.userRole', 'ur')
      .where('ur.user_id = :adminId', { adminId })
      .take(limit)
      .getMany();
  }

  /**
   * Paginated, sortable list of the simulations assigned (active `class_simulations`) to a
   * class, with per-assignment started/completed/average aggregates over DB reports.
   * Access to the class is the caller's responsibility (checked in the service).
   */
  async findForClassListing(
    classId: string,
    sort: IClassSimulationListingSort,
    pagination: IClassSimulationListingPagination,
  ): Promise<IClassSimulationListingResult> {
    const qb = this.repo
      .createQueryBuilder('cs')
      .leftJoin('simulations_v2', 'sim', 'sim.id = cs.simulation_id AND sim.deleted_at IS NULL')
      // Unit by business id, as `ClassSimulationService.mapSimulation` resolves `unit_name`.
      .leftJoin('units', 'u', 'u.id = sim.unit_id AND u.deleted_at IS NULL')
      .where('cs.class_id = :classId', { classId })
      .andWhere('cs.is_active = TRUE');

    // `offset`/`limit`, not `skip`/`take`: with a join, `getRawMany()` ignores `skip`/`take`.
    const rowsQb = qb
      .clone()
      .select('cs.id', 'class_simulation_id')
      .addSelect('cs.simulation_id', 'sim_id')
      .addSelect('sim.title', 'sim_name')
      .addSelect(IS_ARCHIVED_EXPR, 'is_archived')
      .addSelect('cs.start_date', 'start_date')
      .addSelect('cs.due_date', 'due_date')
      .addSelect('cs.end_date', 'close_date')
      .addSelect(STARTED_COUNT_SQL, 'started_count')
      .addSelect(COMPLETED_COUNT_SQL, 'completed_count')
      .addSelect(AVERAGE_SCORE_SQL, 'average_score')
      .addSelect('sim.avatar_enabled', 'avatar_enabled')
      .addSelect(UNIT_ID_EXPR, 'unit_id')
      .addSelect('u.name', 'unit_name')
      .setParameter(
        'archivedStatuses',
        ClassSimulationListingConstants.ARCHIVED_SIMULATION_STATUSES,
      )
      .orderBy(SORT_EXPR_BY_FIELD[sort.field], sort.direction, 'NULLS LAST')
      .addOrderBy('cs.id', 'ASC')
      .offset(pagination.skip)
      .limit(pagination.take);

    const [total, raw] = await Promise.all([
      qb.getCount(),
      rowsQb.getRawMany<IClassSimulationListingRawRow>(),
    ]);

    const rows = raw.map((row) => ({
      classSimulationId: row.class_simulation_id,
      simId: row.sim_id,
      simName: row.sim_name,
      isArchived: row.is_archived,
      startDate: row.start_date,
      dueDate: row.due_date,
      closeDate: row.close_date,
      startedCount: Number(row.started_count),
      completedCount: Number(row.completed_count),
      averageScore: row.average_score === null ? null : Number(row.average_score),
      avatarEnabled: row.avatar_enabled,
      unitId: row.unit_id,
      unitName: row.unit_name,
    }));

    return { rows, total };
  }
}
