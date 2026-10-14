import { BadRequestException, NotFoundException } from '@nestjs/common';
import { In } from 'typeorm';
import { ClassSimulationSortField } from 'src/common/constants';
import {
  IBulkAssignClassSimulationsInput,
  IClassSimulationListingRawRow,
} from 'src/common/interfaces';
import { CLASS_SIMULATION_MSG } from 'src/common/messages/class-simulation.message';
import { Class, ClassSimulation, Educator } from 'src/database/entities';
import { ClassSimulationRepository } from 'src/database/repositories/class-simulation.repository';

const makeQb = () => {
  const qb: Record<string, jest.Mock> = {};
  for (const method of [
    'leftJoin',
    'where',
    'andWhere',
    'select',
    'addSelect',
    'setParameter',
    'orderBy',
    'addOrderBy',
    'offset',
    'limit',
    'skip',
    'take',
  ]) {
    qb[method] = jest.fn().mockReturnValue(qb);
  }
  qb.clone = jest.fn().mockReturnValue(qb);
  qb.getCount = jest.fn().mockResolvedValue(0);
  qb.getRawMany = jest.fn().mockResolvedValue([]);
  return qb;
};

const makeRawRow = (
  o: Partial<IClassSimulationListingRawRow> = {},
): IClassSimulationListingRawRow => ({
  class_simulation_id: 'cs-1',
  sim_id: 'colostomy-care',
  sim_name: 'Colostomy Care and Education',
  is_archived: false,
  start_date: '2026-01-01',
  due_date: '2026-12-31',
  close_date: '12-31-2026',
  started_count: '4',
  completed_count: '2',
  average_score: '81',
  avatar_enabled: true,
  unit_id: 'gastrointestinal-care',
  unit_name: 'Gastrointestinal Care',
  ...o,
});

describe('ClassSimulationRepository.findForClassListing', () => {
  const repo = { createQueryBuilder: jest.fn() };
  const classSimulationRepository = new ClassSimulationRepository(repo as never);
  const defaultSort = { field: ClassSimulationSortField.SIM_NAME, direction: 'ASC' as const };
  let qb: ReturnType<typeof makeQb>;

  const selectAliases = (): string[] =>
    [...qb.select.mock.calls, ...qb.addSelect.mock.calls].map((call) => call[1] as string);
  const selectExpr = (alias: string): string => {
    const call = [...qb.select.mock.calls, ...qb.addSelect.mock.calls].find((c) => c[1] === alias);
    return call?.[0] as string;
  };

  beforeEach(() => {
    qb = makeQb();
    repo.createQueryBuilder.mockReset().mockReturnValue(qb);
  });

  it('scopes to active assignments of the given class and joins the live catalog row', async () => {
    await classSimulationRepository.findForClassListing('class-1', defaultSort, {
      skip: 0,
      take: 10,
    });

    expect(repo.createQueryBuilder).toHaveBeenCalledWith('cs');
    expect(qb.leftJoin).toHaveBeenCalledWith(
      'simulations_v2',
      'sim',
      'sim.id = cs.simulation_id AND sim.deleted_at IS NULL',
    );
    expect(qb.where).toHaveBeenCalledWith('cs.class_id = :classId', { classId: 'class-1' });
    expect(qb.andWhere).toHaveBeenCalledWith('cs.is_active = TRUE');
  });

  it('selects every response field', async () => {
    await classSimulationRepository.findForClassListing('class-1', defaultSort, {
      skip: 0,
      take: 10,
    });
    expect(selectAliases().sort()).toEqual(
      [
        'average_score',
        'avatar_enabled',
        'unit_id',
        'unit_name',
        'class_simulation_id',
        'close_date',
        'completed_count',
        'due_date',
        'is_archived',
        'sim_id',
        'sim_name',
        'start_date',
        'started_count',
      ].sort(),
    );
  });

  it('joins the live unit by business id for unitName', async () => {
    await classSimulationRepository.findForClassListing('class-1', defaultSort, {
      skip: 0,
      take: 10,
    });
    expect(qb.leftJoin).toHaveBeenCalledWith(
      'units',
      'u',
      'u.id = sim.unit_id AND u.deleted_at IS NULL',
    );
    expect(selectExpr('avatar_enabled')).toBe('sim.avatar_enabled');
    expect(selectExpr('unit_id')).toBe("NULLIF(sim.unit_id, '')");
    expect(selectExpr('unit_name')).toBe('u.name');
  });

  it('marks missing, archived and draft catalog rows as archived', async () => {
    await classSimulationRepository.findForClassListing('class-1', defaultSort, {
      skip: 0,
      take: 10,
    });
    expect(selectExpr('is_archived')).toContain('sim.simulation_id IS NULL');
    expect(selectExpr('is_archived')).toContain('IN (:...archivedStatuses)');
    expect(qb.setParameter).toHaveBeenCalledWith('archivedStatuses', ['archived', 'draft']);
  });

  it('counts started and averages only DB reports of active students in the class, inside the assignment window', async () => {
    await classSimulationRepository.findForClassListing('class-1', defaultSort, {
      skip: 0,
      take: 10,
    });
    for (const alias of ['started_count', 'average_score']) {
      const sql = selectExpr(alias);
      expect(sql).toContain('FROM simulation_reports sr');
      expect(sql).toContain('st.class_id = cs.class_id');
      expect(sql).toContain('st.is_active = TRUE');
      expect(sql).toContain('sr.scenario_id = cs.simulation_id');
      expect(sql).toContain('sr.created_at::date BETWEEN');
      // created_at is a naive timestamp: AT TIME ZONE would make the day session-dependent.
      expect(sql).not.toContain('AT TIME ZONE');
    }
    expect(selectExpr('started_count')).toContain('COUNT(DISTINCT sr.student_id)');
  });

  it('counts completed students from Simulation Progress only, once per student', async () => {
    await classSimulationRepository.findForClassListing('class-1', defaultSort, {
      skip: 0,
      take: 10,
    });
    const sql = selectExpr('completed_count');
    expect(sql).toContain('FROM student_simulation_progress p');
    expect(sql).toContain('COUNT(DISTINCT p.student_id)');
    expect(sql).toContain("p.status IN ('completed', 'forfeited')");
    expect(sql).toContain('p.deleted_at IS NULL');
    expect(sql).toContain('st.is_active = TRUE');
    expect(sql).toContain('p.simulation_id = sim.simulation_id');
    expect(sql).not.toContain('report_data');
    expect(sql).not.toContain('UNION');
  });

  it('averages each student best score', async () => {
    await classSimulationRepository.findForClassListing('class-1', defaultSort, {
      skip: 0,
      take: 10,
    });
    const sql = selectExpr('average_score');
    expect(sql).toContain('ROUND(AVG(per_student.best_score))');
    expect(sql).toContain('GROUP BY sr.student_id');
    expect(sql).toContain('sr.score::numeric');
  });

  it.each<[ClassSimulationSortField, string | RegExp]>([
    [ClassSimulationSortField.SIM_ID, 'cs.simulation_id'],
    [ClassSimulationSortField.SIM_NAME, 'LOWER(sim.title)'],
    [ClassSimulationSortField.IS_ARCHIVED, /sim\.simulation_id IS NULL/],
    [ClassSimulationSortField.START_DATE, /make_date\(substring\(cs\.start_date from 1 for 4\)/],
    [ClassSimulationSortField.DUE_DATE, /make_date\(substring\(cs\.due_date from 1 for 4\)/],
    [ClassSimulationSortField.CLOSE_DATE, /make_date\(substring\(cs\.end_date from 1 for 4\)/],
    [ClassSimulationSortField.STARTED_COUNT, 'started_count'],
    [ClassSimulationSortField.COMPLETED_COUNT, 'completed_count'],
    [ClassSimulationSortField.AVERAGE_SCORE, 'average_score'],
    [ClassSimulationSortField.AVATAR_ENABLED, 'sim.avatar_enabled'],
    [ClassSimulationSortField.UNIT_ID, "NULLIF(sim.unit_id, '')"],
    [ClassSimulationSortField.UNIT_NAME, 'LOWER(u.name)'],
  ])('orders sortBy=%s by the right expression, NULLS LAST', async (field, expected) => {
    await classSimulationRepository.findForClassListing(
      'class-1',
      { field, direction: 'DESC' },
      { skip: 0, take: 10 },
    );
    const [expr, direction, nulls] = qb.orderBy.mock.calls[0] as [string, string, string];
    if (typeof expected === 'string') expect(expr).toBe(expected);
    else expect(expr).toMatch(expected);
    expect(direction).toBe('DESC');
    expect(nulls).toBe('NULLS LAST');
  });

  it('adds a stable cs.id tiebreaker', async () => {
    await classSimulationRepository.findForClassListing('class-1', defaultSort, {
      skip: 0,
      take: 10,
    });
    expect(qb.addOrderBy).toHaveBeenCalledWith('cs.id', 'ASC');
  });

  it('paginates with offset/limit (skip/take is ignored by getRawMany with a join)', async () => {
    await classSimulationRepository.findForClassListing('class-1', defaultSort, {
      skip: 20,
      take: 10,
    });
    expect(qb.offset).toHaveBeenCalledWith(20);
    expect(qb.limit).toHaveBeenCalledWith(10);
    expect(qb.skip).not.toHaveBeenCalled();
    expect(qb.take).not.toHaveBeenCalled();
  });

  it('maps raw rows to numbers, keeps a null average and returns the total', async () => {
    qb.getCount.mockResolvedValue(2);
    qb.getRawMany.mockResolvedValue([
      makeRawRow(),
      makeRawRow({
        class_simulation_id: 'cs-2',
        sim_name: null,
        is_archived: true,
        started_count: '0',
        completed_count: '0',
        average_score: null,
        avatar_enabled: null,
        unit_id: null,
        unit_name: null,
      }),
    ]);

    const result = await classSimulationRepository.findForClassListing('class-1', defaultSort, {
      skip: 0,
      take: 10,
    });

    expect(result.total).toBe(2);
    expect(result.rows).toEqual([
      {
        classSimulationId: 'cs-1',
        simId: 'colostomy-care',
        simName: 'Colostomy Care and Education',
        isArchived: false,
        startDate: '2026-01-01',
        dueDate: '2026-12-31',
        closeDate: '12-31-2026',
        startedCount: 4,
        completedCount: 2,
        averageScore: 81,
        avatarEnabled: true,
        unitId: 'gastrointestinal-care',
        unitName: 'Gastrointestinal Care',
      },
      {
        classSimulationId: 'cs-2',
        simId: 'colostomy-care',
        simName: null,
        isArchived: true,
        startDate: '2026-01-01',
        dueDate: '2026-12-31',
        closeDate: '12-31-2026',
        startedCount: 0,
        completedCount: 0,
        averageScore: null,
        avatarEnabled: null,
        unitId: null,
        unitName: null,
      },
    ]);
  });
});

describe('ClassSimulationRepository.findActiveByClassIdsAndSimulationIds', () => {
  const repo = { find: jest.fn().mockResolvedValue([]) };
  const classSimulationRepository = new ClassSimulationRepository(repo as never);

  afterEach(() => jest.clearAllMocks());

  it('queries active rows for any of the class and simulation ids', async () => {
    await classSimulationRepository.findActiveByClassIdsAndSimulationIds(['c-1', 'c-2'], ['s-1']);
    expect(repo.find).toHaveBeenCalledWith({
      where: { class_id: In(['c-1', 'c-2']), simulation_id: In(['s-1']), is_active: true },
    });
  });

  it('skips the query when either list is empty', async () => {
    await expect(
      classSimulationRepository.findActiveByClassIdsAndSimulationIds([], ['s-1']),
    ).resolves.toEqual([]);
    await expect(
      classSimulationRepository.findActiveByClassIdsAndSimulationIds(['c-1'], []),
    ).resolves.toEqual([]);
    expect(repo.find).not.toHaveBeenCalled();
  });
});

describe('ClassSimulationRepository.createManyAndChargeSeats', () => {
  const manager = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((_entity: unknown, data: object) => ({ ...data })),
    save: jest.fn((_entity: unknown, rows: object[]) =>
      Promise.resolve(rows.map((row, i) => ({ id: `cs-${i}`, ...row }))),
    ),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const repo = {
    manager: {
      transaction: jest.fn((work: (m: typeof manager) => Promise<unknown>) => work(manager)),
    },
  };
  const classSimulationRepository = new ClassSimulationRepository(repo as never);

  const input = (seatsToCharge: number): IBulkAssignClassSimulationsInput => ({
    educatorId: 'edu-1',
    seatsToCharge,
    rows: [
      {
        classId: 'c-1',
        simulationId: 's-1',
        startDate: '2030-09-01',
        dueDate: '2030-10-16',
        endDate: '2030-12-15',
        isAi: true,
      },
      {
        classId: 'c-2',
        simulationId: 's-1',
        startDate: '2030-09-01',
        dueDate: '2030-10-16',
        endDate: '2030-12-15',
        isAi: false,
      },
    ],
  });

  beforeEach(() => {
    manager.find.mockResolvedValue([]);
    manager.findOne.mockResolvedValue({ id: 'edu-1', tokens: 30, allocated_tokens: 5 });
  });

  afterEach(() => jest.clearAllMocks());

  it('locks the target classes (sorted) and re-checks overlaps before touching the educator', async () => {
    await classSimulationRepository.createManyAndChargeSeats({
      ...input(0),
      rows: [...input(0).rows].reverse(),
    });

    expect(manager.find).toHaveBeenNthCalledWith(1, Class, {
      where: { id: In(['c-1', 'c-2']) },
      order: { id: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });
    expect(manager.find).toHaveBeenNthCalledWith(2, ClassSimulation, {
      where: { class_id: In(['c-1', 'c-2']), simulation_id: In(['s-1']), is_active: true },
    });
    const classLockOrder = manager.find.mock.invocationCallOrder[0];
    expect(classLockOrder).toBeLessThan(manager.findOne.mock.invocationCallOrder[0]);
  });

  it('matches an uppercase request class id against the stored lowercase row (review F1)', async () => {
    const stored = {
      id: 'cs-existing',
      class_id: 'c-1',
      simulation_id: 's-1',
      start_date: '2030-09-01',
      end_date: '2030-12-15',
    };
    manager.find.mockResolvedValueOnce([]).mockResolvedValueOnce([stored]);

    const result = await classSimulationRepository.createManyAndChargeSeats({
      ...input(12),
      rows: input(12).rows.map((row) => ({ ...row, classId: row.classId.toUpperCase() })),
    });

    expect(manager.find).toHaveBeenNthCalledWith(1, Class, {
      where: { id: In(['c-1', 'c-2']) },
      order: { id: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });
    expect(result.conflicts).toEqual([stored]);
    expect(manager.save).not.toHaveBeenCalled();
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('returns the conflicting rows and writes/charges nothing when an overlap appeared meanwhile', async () => {
    const duplicate = {
      id: 'cs-existing',
      class_id: 'c-1',
      simulation_id: 's-1',
      start_date: '2030-09-01',
      end_date: '2030-12-15',
    };
    manager.find.mockResolvedValueOnce([]).mockResolvedValueOnce([duplicate]);

    const result = await classSimulationRepository.createManyAndChargeSeats(input(12));

    expect(result).toEqual({ saved: [], conflicts: [duplicate], previousTokens: 0, newTokens: 0 });
    expect(manager.findOne).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('ignores existing rows that do not overlap the requested window', async () => {
    manager.find.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: 'cs-old',
        class_id: 'c-1',
        simulation_id: 's-1',
        start_date: '2030-01-01',
        end_date: '2030-08-31',
      },
    ]);

    const result = await classSimulationRepository.createManyAndChargeSeats(input(12));

    expect(result.conflicts).toEqual([]);
    expect(manager.save).toHaveBeenCalled();
  });

  it('locks the active educator, inserts every row and moves the seats, in one transaction', async () => {
    const result = await classSimulationRepository.createManyAndChargeSeats(input(12));

    expect(repo.manager.transaction).toHaveBeenCalledTimes(1);
    expect(manager.findOne).toHaveBeenCalledWith(Educator, {
      where: { id: 'edu-1', is_active: true },
      lock: { mode: 'pessimistic_write' },
    });
    expect(manager.save).toHaveBeenCalledWith(ClassSimulation, [
      {
        class_id: 'c-1',
        simulation_id: 's-1',
        start_date: '2030-09-01',
        due_date: '2030-10-16',
        end_date: '2030-12-15',
        is_ai: true,
        is_active: true,
      },
      {
        class_id: 'c-2',
        simulation_id: 's-1',
        start_date: '2030-09-01',
        due_date: '2030-10-16',
        end_date: '2030-12-15',
        is_ai: false,
        is_active: true,
      },
    ]);
    expect(manager.update).toHaveBeenCalledWith(
      Educator,
      { id: 'edu-1' },
      { tokens: 18, allocated_tokens: 17 },
    );
    expect(result.previousTokens).toBe(30);
    expect(result.newTokens).toBe(18);
    expect(result.saved.map((row) => row.id)).toEqual(['cs-0', 'cs-1']);
  });

  it('leaves the educator untouched when nothing is charged', async () => {
    const result = await classSimulationRepository.createManyAndChargeSeats(input(0));
    expect(manager.update).not.toHaveBeenCalled();
    expect(result.newTokens).toBe(30);
  });

  it('refuses before inserting when the locked balance is short', async () => {
    await expect(classSimulationRepository.createManyAndChargeSeats(input(31))).rejects.toThrow(
      new BadRequestException(CLASS_SIMULATION_MSG.BULK_ASSIGN.INSUFFICIENT_SEATS(31, 30)),
    );
    expect(manager.save).not.toHaveBeenCalled();
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('treats a null token balance as zero', async () => {
    manager.findOne.mockResolvedValue({ id: 'edu-1', tokens: null, allocated_tokens: null });
    await expect(
      classSimulationRepository.createManyAndChargeSeats(input(1)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('404s when the educator is missing or inactive', async () => {
    manager.findOne.mockResolvedValue(null);
    await expect(
      classSimulationRepository.createManyAndChargeSeats(input(0)),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(manager.save).not.toHaveBeenCalled();
  });
});

describe('ClassSimulationRepository.updateDatesIfActive', () => {
  const qb = {
    update: jest.fn(),
    set: jest.fn(),
    where: jest.fn(),
    execute: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const repo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
  const classSimulationRepository = new ClassSimulationRepository(repo as never);
  const dates = { start_date: '2026-01-01', due_date: '2026-01-15', end_date: '2026-01-31' };

  beforeEach(() => {
    qb.update.mockReturnValue(qb);
    qb.set.mockReturnValue(qb);
    qb.where.mockReturnValue(qb);
  });

  it('sets only the three date columns, never is_active or deleted_at', async () => {
    await classSimulationRepository.updateDatesIfActive('cs-1', dates);

    expect(qb.set).toHaveBeenCalledWith(dates);
  });

  it('only touches the row while it is still active', async () => {
    await classSimulationRepository.updateDatesIfActive('cs-1', dates);

    expect(qb.where).toHaveBeenCalledWith('id = :id AND is_active = true', { id: 'cs-1' });
  });

  it('returns the UpdateResult so the caller can detect a removed row', async () => {
    qb.execute.mockResolvedValueOnce({ affected: 0 });

    await expect(classSimulationRepository.updateDatesIfActive('cs-1', dates)).resolves.toEqual({
      affected: 0,
    });
  });
});
