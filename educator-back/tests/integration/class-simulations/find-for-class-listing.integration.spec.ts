import { Repository } from 'typeorm';
import { ClassSimulation } from '../../../src/database/entities';
import { ClassSimulationRepository } from '../../../src/database/repositories/class-simulation.repository';
import {
  ClassSimulationListingConstants,
  ClassSimulationSortField,
  SimulationProgressStatus,
} from '../../../src/common/constants';
import { IClassSimulationListingRawRow } from '../../../src/common/interfaces';
import { buildAssignmentDateExpr } from '../../../src/common/utils/assignment-date-sql.util';

const CLASS_ID = 'class-a';
const MARKER = 'CSLIST-TEST-';

const csIds = {
  alpha: 'cs-alpha',
  beta: 'cs-beta',
  gamma: 'cs-gamma',
  missing: 'cs-missing',
};

/** Raw rows as Postgres returns them: counts and averages are strings (bigint/numeric). */
const RAW: Record<keyof typeof csIds, IClassSimulationListingRawRow> = {
  alpha: {
    class_simulation_id: csIds.alpha,
    sim_id: `${MARKER}alpha`,
    sim_name: 'Alpha Care',
    is_archived: false,
    start_date: '2026-01-01',
    due_date: '2026-03-01',
    close_date: '2026-06-30',
    started_count: '3',
    completed_count: '2',
    average_score: '85',
    avatar_enabled: true,
    unit_id: `${MARKER}unit-live`,
    unit_name: `${MARKER}Gastrointestinal Care`,
  },
  beta: {
    class_simulation_id: csIds.beta,
    sim_id: `${MARKER}beta`,
    sim_name: 'beta Mobility',
    is_archived: true,
    start_date: '02-01-2026',
    due_date: '04-01-2026',
    close_date: '12-31-2026',
    started_count: '2',
    completed_count: '2',
    average_score: '61',
    avatar_enabled: false,
    unit_id: null,
    unit_name: null,
  },
  gamma: {
    class_simulation_id: csIds.gamma,
    sim_id: `${MARKER}gamma`,
    sim_name: 'Gamma Draft',
    is_archived: true,
    start_date: null,
    due_date: null,
    close_date: null,
    started_count: '1',
    completed_count: '1',
    average_score: '70',
    avatar_enabled: false,
    unit_id: `${MARKER}unit-deleted`,
    unit_name: null,
  },
  missing: {
    class_simulation_id: csIds.missing,
    sim_id: `${MARKER}missing`,
    sim_name: null,
    is_archived: true,
    start_date: '2026-02-31',
    due_date: '2026-13-01',
    close_date: '2026-05-31',
    started_count: '0',
    completed_count: '0',
    average_score: null,
    avatar_enabled: null,
    unit_id: null,
    unit_name: null,
  },
};
const ALL_RAW = [RAW.alpha, RAW.beta, RAW.gamma, RAW.missing];

/** The ORDER BY expression each sort field must use (aggregates sort by their SELECT alias). */
const EXPECTED_SORT_EXPR: Record<ClassSimulationSortField, string> = {
  [ClassSimulationSortField.SIM_ID]: 'cs.simulation_id',
  [ClassSimulationSortField.SIM_NAME]: 'LOWER(sim.title)',
  [ClassSimulationSortField.IS_ARCHIVED]: expect.stringContaining(
    'sim.simulation_id IS NULL',
  ) as unknown as string,
  [ClassSimulationSortField.START_DATE]: buildAssignmentDateExpr('cs.start_date'),
  [ClassSimulationSortField.DUE_DATE]: buildAssignmentDateExpr('cs.due_date'),
  [ClassSimulationSortField.CLOSE_DATE]: buildAssignmentDateExpr('cs.end_date'),
  [ClassSimulationSortField.STARTED_COUNT]: 'started_count',
  [ClassSimulationSortField.COMPLETED_COUNT]: 'completed_count',
  [ClassSimulationSortField.AVERAGE_SCORE]: 'average_score',
  [ClassSimulationSortField.AVATAR_ENABLED]: 'sim.avatar_enabled',
  [ClassSimulationSortField.UNIT_ID]: "NULLIF(sim.unit_id, '')",
  [ClassSimulationSortField.UNIT_NAME]: 'LOWER(u.name)',
};

type Builder = Record<string, jest.Mock>;

/**
 * Mocked TypeORM query builders: `base` is the count query, `rows` the clone that selects, sorts
 * and paginates. Every call is recorded so the generated query shape can be asserted.
 */
function buildQueryBuilders(raw: IClassSimulationListingRawRow[], total: number) {
  const rows: Builder = {};
  for (const method of [
    'select',
    'addSelect',
    'setParameter',
    'orderBy',
    'addOrderBy',
    'offset',
    'limit',
  ]) {
    rows[method] = jest.fn(() => rows);
  }
  rows.getRawMany = jest.fn(() => Promise.resolve(raw));

  const base: Builder = {};
  for (const method of ['leftJoin', 'where', 'andWhere']) {
    base[method] = jest.fn(() => base);
  }
  base.clone = jest.fn(() => rows);
  base.getCount = jest.fn(() => Promise.resolve(total));

  const ormRepo = { createQueryBuilder: jest.fn(() => base) };
  return { base, rows, ormRepo };
}

describe('ClassSimulationRepository.findForClassListing (Integration)', () => {
  let qbs: ReturnType<typeof buildQueryBuilders>;
  let repo: ClassSimulationRepository;

  const setup = (raw = ALL_RAW, total = raw.length): void => {
    qbs = buildQueryBuilders(raw, total);
    repo = new ClassSimulationRepository(qbs.ormRepo as unknown as Repository<ClassSimulation>);
  };

  beforeEach(() => setup());

  const fetchAll = async (
    field = ClassSimulationSortField.SIM_NAME,
    direction: 'ASC' | 'DESC' = 'ASC',
  ) => (await repo.findForClassListing(CLASS_ID, { field, direction }, { skip: 0, take: 50 })).rows;

  /** The SQL expression selected under `alias`. */
  const selected = (alias: string): string => {
    const all = [...qbs.rows.select.mock.calls, ...qbs.rows.addSelect.mock.calls] as Array<
      [string, string]
    >;
    const call = all.find(([, a]) => a === alias);
    if (!call) throw new Error(`nothing selected as ${alias}`);
    return call[0];
  };

  it('returns only the active assignments of the class', async () => {
    const { rows, total } = await repo.findForClassListing(
      CLASS_ID,
      { field: ClassSimulationSortField.SIM_NAME, direction: 'ASC' },
      { skip: 0, take: 50 },
    );

    expect(qbs.ormRepo.createQueryBuilder).toHaveBeenCalledWith('cs');
    expect(qbs.base.where).toHaveBeenCalledWith('cs.class_id = :classId', { classId: CLASS_ID });
    expect(qbs.base.andWhere).toHaveBeenCalledWith('cs.is_active = TRUE');
    expect(total).toBe(4);
    expect(rows.map((r) => r.classSimulationId).sort()).toEqual(Object.values(csIds).sort());
  });

  it('computes started/completed/average per assignment from DB reports', async () => {
    const byId = new Map((await fetchAll()).map((r) => [r.classSimulationId, r]));
    expect(byId.get(csIds.alpha)).toEqual(
      expect.objectContaining({ startedCount: 3, completedCount: 2, averageScore: 85 }),
    );
    expect(byId.get(csIds.beta)).toEqual(
      expect.objectContaining({ startedCount: 2, completedCount: 2, averageScore: 61 }),
    );
    expect(byId.get(csIds.gamma)).toEqual(
      expect.objectContaining({ startedCount: 1, completedCount: 1, averageScore: 70 }),
    );
    expect(byId.get(csIds.missing)).toEqual(
      expect.objectContaining({ startedCount: 0, completedCount: 0, averageScore: null }),
    );

    // Started: distinct active students of the class with a Report for this Simulation.
    const started = selected('started_count');
    expect(started).toContain('COUNT(DISTINCT sr.student_id)');
    expect(started).toContain('st.class_id = cs.class_id');
    expect(started).toContain('st.is_active = TRUE');
    expect(started).toContain('sr.scenario_id = cs.simulation_id');
    // Completed: from Simulation Progress (Completed or Forfeited), never from the Reports.
    const completed = selected('completed_count');
    expect(completed).toContain('FROM student_simulation_progress p');
    expect(completed).toContain(
      `p.status IN ('${SimulationProgressStatus.COMPLETED}', '${SimulationProgressStatus.FORFEITED}')`,
    );
    expect(completed).toContain('p.deleted_at IS NULL');
    expect(completed).not.toContain('simulation_reports');
    // Average: mean of each student's best score.
    const average = selected('average_score');
    expect(average).toContain('ROUND(AVG(per_student.best_score))');
    expect(average).toContain('GROUP BY sr.student_id');
  });

  it('returns avatarEnabled, unitId and the live unit name, matching the legacy endpoint', async () => {
    const byId = new Map((await fetchAll()).map((r) => [r.classSimulationId, r]));
    expect(byId.get(csIds.alpha)).toEqual(
      expect.objectContaining({
        avatarEnabled: true,
        unitId: `${MARKER}unit-live`,
        unitName: `${MARKER}Gastrointestinal Care`,
      }),
    );
    expect(byId.get(csIds.beta)).toEqual(
      expect.objectContaining({ avatarEnabled: false, unitId: null, unitName: null }),
    );
    expect(byId.get(csIds.gamma)).toEqual(
      expect.objectContaining({
        avatarEnabled: false,
        unitId: `${MARKER}unit-deleted`,
        unitName: null,
      }),
    );
    expect(byId.get(csIds.missing)).toEqual(
      expect.objectContaining({ avatarEnabled: null, unitId: null, unitName: null }),
    );

    // Live catalog row and live unit only; an empty legacy unit id reads as NULL.
    expect(qbs.base.leftJoin).toHaveBeenCalledWith(
      'simulations_v2',
      'sim',
      'sim.id = cs.simulation_id AND sim.deleted_at IS NULL',
    );
    expect(qbs.base.leftJoin).toHaveBeenCalledWith(
      'units',
      'u',
      'u.id = sim.unit_id AND u.deleted_at IS NULL',
    );
    expect(selected('unit_id')).toBe("NULLIF(sim.unit_id, '')");
    expect(selected('unit_name')).toBe('u.name');
    expect(selected('avatar_enabled')).toBe('sim.avatar_enabled');
  });

  it('flags missing, archived and draft catalog simulations as archived and includes them', async () => {
    const byId = new Map((await fetchAll()).map((r) => [r.classSimulationId, r]));
    expect(byId.get(csIds.alpha)).toEqual(
      expect.objectContaining({ isArchived: false, simName: 'Alpha Care' }),
    );
    expect(byId.get(csIds.beta)?.isArchived).toBe(true);
    expect(byId.get(csIds.gamma)?.isArchived).toBe(true);
    expect(byId.get(csIds.missing)).toEqual(
      expect.objectContaining({ isArchived: true, simName: null, simId: `${MARKER}missing` }),
    );

    const isArchived = selected('is_archived');
    expect(isArchived).toContain('sim.simulation_id IS NULL');
    expect(isArchived).toContain('IN (:...archivedStatuses)');
    expect(qbs.rows.setParameter).toHaveBeenCalledWith(
      'archivedStatuses',
      ClassSimulationListingConstants.ARCHIVED_SIMULATION_STATUSES,
    );
    // Archived assignments are not filtered out: the only filters are class and is_active.
    expect(qbs.base.where).toHaveBeenCalledTimes(1);
    expect(qbs.base.andWhere).toHaveBeenCalledTimes(1);
  });

  it('returns the stored date strings unchanged', async () => {
    const beta = (await fetchAll()).find((r) => r.classSimulationId === csIds.beta);
    expect(beta).toEqual(
      expect.objectContaining({
        startDate: '02-01-2026',
        dueDate: '04-01-2026',
        closeDate: '12-31-2026',
      }),
    );
    expect(selected('start_date')).toBe('cs.start_date');
    expect(selected('due_date')).toBe('cs.due_date');
    expect(selected('close_date')).toBe('cs.end_date');
  });

  it('sorts by simName case-insensitively by default, NULL names last', async () => {
    const rows = await fetchAll();

    expect(qbs.rows.orderBy).toHaveBeenCalledWith('LOWER(sim.title)', 'ASC', 'NULLS LAST');
    expect(qbs.rows.addOrderBy).toHaveBeenCalledWith('cs.id', 'ASC');
    // Rows are returned in the order the database produced them.
    expect(rows.map((r) => r.classSimulationId)).toEqual([
      csIds.alpha,
      csIds.beta,
      csIds.gamma,
      csIds.missing,
    ]);
  });

  it('decides the report window by the stored created_at day, not the session time zone', async () => {
    await fetchAll();

    const started = selected('started_count');
    const average = selected('average_score');
    for (const sql of [started, average]) {
      expect(sql).toContain('sr.created_at::date BETWEEN');
      // An `AT TIME ZONE` cast on the naive created_at would shift the day by the session zone.
      expect(sql).not.toContain('AT TIME ZONE');
    }
    // Progress timestamps are timestamptz, so they are read as the UTC day explicitly.
    expect(selected('completed_count')).toContain(
      "(COALESCE(p.forfeited_at, p.updated_at) AT TIME ZONE 'UTC')::date",
    );
  });

  it('does not fail on impossible calendar dates: they read as NULL and sort last', async () => {
    const rows = await fetchAll(ClassSimulationSortField.DUE_DATE, 'ASC');
    const missingRow = rows.find((r) => r.classSimulationId === csIds.missing);
    expect(missingRow).toEqual(
      expect.objectContaining({ startDate: '2026-02-31', dueDate: '2026-13-01' }),
    );

    const [[expr, direction, nulls]] = qbs.rows.orderBy.mock.calls as Array<
      [string, string, string]
    >;
    expect(direction).toBe('ASC');
    expect(nulls).toBe('NULLS LAST');
    // Impossible dates (year 0, day past month end) become NULL instead of raising.
    expect(expr).toContain('WHEN substring(cs.due_date from 1 for 4)::int = 0 THEN NULL');
    expect(expr).toContain("+ INTERVAL '1 month - 1 day')) THEN NULL");
    expect(expr).toContain('ELSE NULL');
  });

  it('sorts mixed-format dates in date order, not string order', async () => {
    await fetchAll(ClassSimulationSortField.START_DATE, 'ASC');

    const [[expr]] = qbs.rows.orderBy.mock.calls as Array<[string]>;
    // Both ISO (YYYY-MM-DD) and legacy (MM-DD-YYYY) strings are parsed into a date.
    expect(expr).toContain("cs.start_date ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])'");
    expect(expr).toContain("cs.start_date ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])-[0-9]{4}$'");
    expect(expr).toContain('make_date(');
    expect(expr).not.toBe('cs.start_date');
  });

  describe.each(Object.values(ClassSimulationSortField))('sortBy=%s', (field) => {
    it.each(['ASC', 'DESC'] as const)(
      'orders %s with NULLs last and a stable tiebreak',
      async (direction) => {
        await fetchAll(field, direction);

        expect(qbs.rows.orderBy).toHaveBeenCalledTimes(1);
        expect(qbs.rows.orderBy).toHaveBeenCalledWith(
          EXPECTED_SORT_EXPR[field],
          direction,
          'NULLS LAST',
        );
        expect(qbs.rows.addOrderBy).toHaveBeenCalledWith('cs.id', 'ASC');
      },
    );
  });

  it('paginates with a stable total', async () => {
    const sort = { field: ClassSimulationSortField.SIM_NAME, direction: 'ASC' as const };

    setup([RAW.alpha, RAW.beta, RAW.gamma], 4);
    const page1 = await repo.findForClassListing(CLASS_ID, sort, { skip: 0, take: 3 });
    expect(qbs.rows.offset).toHaveBeenCalledWith(0);
    expect(qbs.rows.limit).toHaveBeenCalledWith(3);

    setup([RAW.missing], 4);
    const page2 = await repo.findForClassListing(CLASS_ID, sort, { skip: 3, take: 3 });
    expect(qbs.rows.offset).toHaveBeenCalledWith(3);
    // The total comes from the unpaginated count query, not the page.
    expect(qbs.base.getCount).toHaveBeenCalledTimes(1);

    setup([], 4);
    const page3 = await repo.findForClassListing(CLASS_ID, sort, { skip: 6, take: 3 });
    expect(qbs.rows.offset).toHaveBeenCalledWith(6);

    expect(page1.total).toBe(4);
    expect(page2.total).toBe(4);
    expect(page1.rows.map((r) => r.classSimulationId)).toEqual([
      csIds.alpha,
      csIds.beta,
      csIds.gamma,
    ]);
    expect(page2.rows.map((r) => r.classSimulationId)).toEqual([csIds.missing]);
    expect(page3.rows).toEqual([]);
  });

  it('returns an empty list for a class with no assignments', async () => {
    setup([], 0);
    const classId = '00000000-0000-4000-8000-000000000000';

    const result = await repo.findForClassListing(
      classId,
      { field: ClassSimulationSortField.SIM_NAME, direction: 'ASC' },
      { skip: 0, take: 10 },
    );

    expect(result).toEqual({ rows: [], total: 0 });
    expect(qbs.base.where).toHaveBeenCalledWith('cs.class_id = :classId', { classId });
  });
});
