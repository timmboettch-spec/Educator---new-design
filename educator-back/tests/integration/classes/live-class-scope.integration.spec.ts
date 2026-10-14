import { Repository } from 'typeorm';
import { Class, SimulationReport, Student } from '../../../src/database/entities';
import { ClassRepository } from '../../../src/database/repositories/class.repository';
import { StudentRepository } from '../../../src/database/repositories/students.repository';
import { SimulationReportRepository } from '../../../src/database/repositories/simulation-report.repository';
import { CommonStatus } from '../../../src/common/enums/status.enum';
import { ClassAttentionMeasure, ClassConstants } from '../../../src/class/constants';
import { SimulationsCompletedGraphGroupLevel } from '../../../src/class/constants/simulations-completed-graph.constants';
import { activeClassScopeSql, liveClassScopeSql } from '../../../src/common/utils/class-scope.util';

const EDUCATOR_ID = 'educator-1';

/**
 * The fixture classes of one educator, by the case the shared live-class scope must decide.
 *
 * Live (in scope):     normal, INACTIVE-status non-Google, mapped Google, co-instructed, no-school
 * Not live (excluded): inactive school, archived Google, unmapped Google, soft-deleted, is_active=false
 *
 * The database is mocked: each test hands the repository the rows Postgres would return for that
 * fixture, and asserts both the scope the generated query applies and how rows are mapped.
 */
const LIVE = ['normal', 'inactiveStatus', 'googleMapped', 'coInstructed', 'noSchool'];
// The counts (activity overview, attention) and their drill-downs also require status ACTIVE.
const COUNTED = LIVE.filter((key) => key !== 'inactiveStatus');
const EXCLUDED = ['inactiveSchool', 'googleArchived', 'googleUnmapped', 'softDeleted', 'notActive'];
const ids: Record<string, string> = Object.fromEntries(
  [...LIVE, ...EXCLUDED].map((key) => [key, `class-${key}`]),
);
ids['student:normal'] = 'student-normal';

const sortedIds = (keys: string[]): string[] => keys.map((key) => ids[key]).sort();
const liteRows = (keys: string[]) =>
  keys.map((key) => ({ id: ids[key], class_name: `Class ${key}` }));

interface Call {
  method: string;
  args: unknown[];
}

const TERMINALS = ['getCount', 'getRawMany', 'getRawOne', 'getMany'] as const;
type Terminal = (typeof TERMINALS)[number];

/** A chainable QueryBuilder mock that records every call and answers terminals from `respond`. */
interface RecordingQb {
  calls: Call[];
  builder: Record<string, jest.Mock>;
}

function recordingQb(index: number, respond: (method: Terminal, index: number) => unknown) {
  const calls: Call[] = [];
  const builder: Record<string, jest.Mock> = {};
  const proxy: Record<string, jest.Mock> = new Proxy(builder, {
    get(target, prop: string) {
      if (!target[prop]) {
        target[prop] = (TERMINALS as readonly string[]).includes(prop)
          ? jest.fn((...args: unknown[]) => {
              calls.push({ method: prop, args });
              return Promise.resolve(respond(prop as Terminal, index));
            })
          : jest.fn((...args: unknown[]) => {
              calls.push({ method: prop, args });
              return proxy;
            });
      }
      return target[prop];
    },
  });
  return { calls, builder: proxy };
}

/** A TypeORM `Repository` mock: every `createQueryBuilder` call yields a fresh recording builder. */
function mockOrmRepo(respond: (method: Terminal, index: number) => unknown = () => undefined) {
  const qbs: RecordingQb[] = [];
  const repo = {
    createQueryBuilder: jest.fn(() => {
      const qb = recordingQb(qbs.length, respond);
      qbs.push(qb);
      return qb.builder;
    }),
    query: jest.fn(),
  };
  return { repo, qbs };
}

/** Every WHERE predicate the builder received (`where`/`andWhere`), as SQL strings. */
const predicates = (qb: RecordingQb): string[] =>
  qb.calls
    .filter((call) => call.method === 'where' || call.method === 'andWhere')
    .map((call) => call.args[0])
    .filter((arg): arg is string => typeof arg === 'string');

const selectedAs = (qb: RecordingQb, alias: string): string => {
  const call = qb.calls.find(
    (c) => (c.method === 'select' || c.method === 'addSelect') && c.args[1] === alias,
  );
  if (!call) throw new Error(`nothing selected as ${alias}`);
  return call.args[0] as string;
};

const LIVE_SCOPE = liveClassScopeSql('c');
const ACTIVE_SCOPE = activeClassScopeSql('c');

const expectLiveScopeOnly = (qb: RecordingQb): void => {
  expect(qb.builder.where).toHaveBeenCalledWith(LIVE_SCOPE);
  expect(predicates(qb)).not.toContain(ACTIVE_SCOPE);
  expect(predicates(qb).some((sql) => sql !== LIVE_SCOPE && sql.includes('c.status'))).toBe(false);
};

const expectEducatorAccess = (qb: RecordingQb): void => {
  expect(qb.builder.andWhere).toHaveBeenCalledWith(
    expect.stringContaining('c.educator_id = :educatorId'),
    { educatorId: EDUCATOR_ID },
  );
};

const overviewRows = (values: Record<string, number>) =>
  Object.entries(values).map(([metric, value]) => ({ metric, value: String(value) }));

describe('Live class scope across list, groups, tiles and chart (Integration)', () => {
  const noSort = { dir: 'ASC' as const };
  const bigPage = { skip: 0, take: 100 };

  describe('the scope predicates', () => {
    it('live scope excludes every non-live fixture case; active scope adds status ACTIVE', () => {
      // is_active=false, soft-deleted, inactive school, archived or unmapped Google class.
      expect(LIVE_SCOPE).toContain('c.is_active = true');
      expect(LIVE_SCOPE).toContain('c.deleted_at IS NULL');
      expect(LIVE_SCOPE).toContain('c.school_id IS NULL OR EXISTS');
      expect(LIVE_SCOPE).toContain('sch.is_active = true');
      expect(LIVE_SCOPE).toContain(`c.status <> '${CommonStatus.ARCHIEVED}'`);
      expect(LIVE_SCOPE).toContain('FROM google_course_mappings gcm WHERE gcm.class_id = c.id');
      // A non-Google class is live whatever its status (INACTIVE included).
      expect(LIVE_SCOPE).not.toContain(`'${CommonStatus.INACTIVE}'`);
      expect(ACTIVE_SCOPE).toBe(`(${LIVE_SCOPE} AND c.status = '${CommonStatus.ACTIVE}')`);
    });
  });

  it('the class list returns exactly the live classes', async () => {
    const { repo, qbs } = mockOrmRepo((method) =>
      method === 'getCount' ? LIVE.length : liteRows(LIVE),
    );
    const classRepository = new ClassRepository(repo as unknown as Repository<Class>);

    const { rows, total } = await classRepository.findClasses(
      EDUCATOR_ID,
      { lite: true },
      noSort,
      bigPage,
    );

    // Count query + rows query, both over the live scope and the educator's access.
    expect(qbs).toHaveLength(2);
    qbs.forEach((qb) => {
      expectLiveScopeOnly(qb);
      expectEducatorAccess(qb);
    });
    expect(total).toBe(LIVE.length);
    expect(rows.map((row) => row.id).sort()).toEqual(sortedIds(LIVE));
    expect(rows[0]).toEqual({ id: ids.normal, className: 'Class normal' });
  });

  it.each(Object.values(ClassAttentionMeasure))(
    'measure=%s never returns a class outside the live scope',
    async (measure) => {
      const { repo, qbs } = mockOrmRepo((method) => (method === 'getCount' ? 0 : []));
      const classRepository = new ClassRepository(repo as unknown as Repository<Class>);

      await classRepository.findClasses(EDUCATOR_ID, { lite: true, measure }, noSort, bigPage);

      // The measure narrows the live scope; it never replaces it.
      qbs.forEach((qb) => {
        expect(qb.builder.where).toHaveBeenCalledWith(LIVE_SCOPE);
        expect(qb.builder.andWhere).toHaveBeenCalledWith(ACTIVE_SCOPE);
        expectEducatorAccess(qb);
      });
    },
  );

  it('measure=active returns only the live classes whose status is ACTIVE', async () => {
    const { repo, qbs } = mockOrmRepo((method) =>
      method === 'getCount' ? COUNTED.length : liteRows(COUNTED),
    );
    const classRepository = new ClassRepository(repo as unknown as Repository<Class>);

    const withMeasure = await classRepository.findClasses(
      EDUCATOR_ID,
      { lite: true, measure: ClassAttentionMeasure.ACTIVE },
      noSort,
      bigPage,
    );

    qbs.forEach((qb) => {
      // Live scope + access + the ACTIVE scope, and nothing measure-specific beyond it.
      expect(predicates(qb)).toEqual([
        LIVE_SCOPE,
        expect.stringContaining('c.educator_id = :educatorId'),
        ACTIVE_SCOPE,
      ]);
    });
    expect(withMeasure.total).toBe(COUNTED.length);
    expect(withMeasure.rows.map((row) => row.id).sort()).toEqual(sortedIds(COUNTED));
  });

  it('full rows count only active, non-deleted students and their reports', async () => {
    const { repo, qbs } = mockOrmRepo((method) =>
      method === 'getCount'
        ? 1
        : [
            {
              id: ids.normal,
              class_name: 'Class normal',
              start_date: '2026-01-01',
              end_date: '2026-12-31',
              status: CommonStatus.ACTIVE,
              students_count: '1',
              sims_count: '1',
              reports_count: '2',
              unread_reports_count: '1',
            },
          ],
    );
    const classRepository = new ClassRepository(repo as unknown as Repository<Class>);

    const { rows } = await classRepository.findClasses(
      EDUCATOR_ID,
      { lite: false, classIds: [ids.normal] },
      noSort,
      bigPage,
    );

    const [countQb, rowsQb] = qbs;
    for (const qb of [countQb, rowsQb]) {
      expect(qb.builder.andWhere).toHaveBeenCalledWith('c.id IN (:...classIds)', {
        classIds: [ids.normal],
      });
    }
    expect(selectedAs(rowsQb, 'students_count')).toContain(
      's.is_active = true AND s.deleted_at IS NULL',
    );
    expect(selectedAs(rowsQb, 'sims_count')).toContain('cs.deleted_at IS NULL');
    expect(selectedAs(rowsQb, 'reports_count')).toContain(
      's2.is_active = true AND s2.deleted_at IS NULL',
    );
    const unread = selectedAs(rowsQb, 'unread_reports_count');
    expect(unread).toContain('s.is_active = TRUE AND s.deleted_at IS NULL');
    expect(unread).toContain('sr.viewed_at IS NULL');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      studentsCount: 1,
      reportsCount: 2,
      unreadReportsCount: 1,
    });
  });

  it('school groups exclude inactive schools and count only live classes', async () => {
    const { repo, qbs } = mockOrmRepo((method) =>
      method === 'getRawOne'
        ? { count: '2' }
        : [
            { school_id: 'school-active', school_name: 'School Active', class_count: '4' },
            { school_id: null, school_name: null, class_count: '1' },
          ],
    );
    const classRepository = new ClassRepository(repo as unknown as Repository<Class>);

    const { rows, total } = await classRepository.findSchoolGroupsForEducator(
      EDUCATOR_ID,
      {},
      bigPage,
    );

    // Count and grouped queries share the live scope (which requires an active school).
    expect(qbs).toHaveLength(2);
    qbs.forEach((qb) => {
      expectLiveScopeOnly(qb);
      expectEducatorAccess(qb);
    });
    expect(qbs[1].builder.groupBy).toHaveBeenCalledWith('school.id');

    const activeGroup = rows.find((row) => row.schoolName === 'School Active');
    const unassigned = rows.find((row) => row.schoolId === null);
    expect(total).toBe(2);
    // normal, inactiveStatus, googleMapped and the co-instructed class (owned by another educator)
    expect(activeGroup?.classCount).toBe(4);
    expect(unassigned?.classCount).toBe(1); // noSchool
    expect(rows.reduce((sum, row) => sum + row.classCount, 0)).toBe(LIVE.length);
  });

  it('the activity overview and attention counts use the same class set as the list', async () => {
    const { repo, qbs } = mockOrmRepo((method) => (method === 'getCount' ? COUNTED.length : []));
    repo.query.mockResolvedValue(
      overviewRows({ activeClasses: COUNTED.length, studentsInActiveClasses: COUNTED.length }),
    );
    const classRepository = new ClassRepository(repo as unknown as Repository<Class>);

    const counts = await classRepository.getActivityOverviewCounts(
      EDUCATOR_ID,
      '2026-01-01',
      '2026-01-15',
      2400,
    );
    const totalClasses = await classRepository.countActiveForEducator(EDUCATOR_ID);

    const [sql, params] = repo.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain(`WHERE ${ACTIVE_SCOPE}`);
    expect(params).toEqual([EDUCATOR_ID, null, '2026-01-01', '2026-01-15', 2400]);
    // Students are counted only when active and not soft-deleted.
    expect(sql).toContain('WHERE s.is_active = TRUE AND s.deleted_at IS NULL');
    expect(qbs[0].builder.andWhere).toHaveBeenCalledWith(ACTIVE_SCOPE);
    expectEducatorAccess(qbs[0]);

    expect(counts.activeClasses).toBe(COUNTED.length);
    expect(totalClasses).toBe(COUNTED.length);
    expect(counts.studentsInActiveClasses).toBe(COUNTED.length);
  });

  it('unread counts ignore excluded classes and the soft-deleted student', async () => {
    const classOrm = mockOrmRepo();
    classOrm.repo.query.mockResolvedValue(
      overviewRows({
        classesWithUnreadReports: COUNTED.length,
        totalUnreadReports: COUNTED.length,
      }),
    );
    const reportOrm = mockOrmRepo(() =>
      COUNTED.map((key) => ({ class_id: ids[key], report_count: '1', unread_count: '1' })),
    );
    const classRepository = new ClassRepository(classOrm.repo as unknown as Repository<Class>);
    const reportRepository = new SimulationReportRepository(
      reportOrm.repo as unknown as Repository<SimulationReport>,
    );

    const counts = await classRepository.getActivityOverviewCounts(
      EDUCATOR_ID,
      '2026-01-01',
      '2026-01-15',
      2400,
    );
    const perClass = await reportRepository.getAttentionCountsByEducator(EDUCATOR_ID);

    const [sql] = classOrm.repo.query.mock.calls[0] as [string];
    expect(sql).toContain(
      'INNER JOIN students s ON sr.student_id = s.id AND s.is_active = TRUE AND s.deleted_at IS NULL',
    );
    expect(sql).toContain('WHERE s.class_id IN (SELECT id FROM accessible_classes)');
    const [attentionQb] = reportOrm.qbs;
    expect(attentionQb.builder.innerJoin).toHaveBeenCalledWith(
      'students',
      's',
      'sr.student_id = s.id AND s.is_active = TRUE',
    );
    expect(attentionQb.builder.andWhere).toHaveBeenCalledWith(ACTIVE_SCOPE);
    expect(attentionQb.builder.where).toHaveBeenCalledWith(
      expect.stringContaining('c.educator_id = :educatorId'),
      { educatorId: EDUCATOR_ID },
    );

    expect(counts.classesWithUnreadReports).toBe(COUNTED.length);
    expect(counts.totalUnreadReports).toBe(COUNTED.length);
    expect(perClass.map((row) => row.class_id).sort()).toEqual(sortedIds(COUNTED));
    for (const row of perClass) {
      expect(Number(row.unread_count)).toBe(1);
    }
  });

  it('classes without students or simulations are counted only within the live scope', async () => {
    const counts = [0, COUNTED.length - 1];
    const { repo, qbs } = mockOrmRepo((_method, index) => counts[index]);
    const classRepository = new ClassRepository(repo as unknown as Repository<Class>);

    const noStudents = await classRepository.countActiveWithNoStudentsForEducator(EDUCATOR_ID);
    const noSims = await classRepository.countActiveWithNoAssignedSimsForEducator(EDUCATOR_ID);

    const [studentsQb, simsQb] = qbs;
    for (const qb of [studentsQb, simsQb]) {
      expect(qb.builder.andWhere).toHaveBeenCalledWith(ACTIVE_SCOPE);
      expectEducatorAccess(qb);
    }
    expect(predicates(studentsQb).join('\n')).toContain(
      's.is_active = true AND s.deleted_at IS NULL',
    );
    // A soft-deleted simulation assignment does not count as assigned.
    expect(predicates(simsQb).join('\n')).toContain(
      'cs.is_active = true AND cs.deleted_at IS NULL',
    );
    expect(noStudents).toBe(0);
    expect(noSims).toBe(COUNTED.length - 1);
  });

  it('the completion chart counts only reports from live classes and active students', async () => {
    const { repo } = mockOrmRepo();
    repo.query.mockResolvedValue([
      { group_type: SimulationsCompletedGraphGroupLevel.MONTH, year: 2026, month: 1, count: 6 },
      {
        group_type: SimulationsCompletedGraphGroupLevel.SCHOOL,
        school_id: 'school-active',
        count: 5,
      },
      { group_type: SimulationsCompletedGraphGroupLevel.SCHOOL, school_id: null, count: 1 },
    ]);
    const reportRepository = new SimulationReportRepository(
      repo as unknown as Repository<SimulationReport>,
    );

    const result = await reportRepository.getSimulationsCompletedGraph(EDUCATOR_ID, {
      since: null,
    });

    const [sql, params] = repo.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain(LIVE_SCOPE);
    expect(sql).toContain('s.is_active = true');
    expect(sql).toContain('s.deleted_at IS NULL');
    expect(sql).toContain('c.educator_id = $1');
    expect(params).toEqual([EDUCATOR_ID]);

    // Live classes: 5 unread reports + 1 viewed report in `normal`.
    const total = result.byMonth.reduce((sum, row) => sum + row.count, 0);
    expect(total).toBe(LIVE.length + 1);
  });

  it('near-avatar-limit ignores a soft-deleted AI simulation in the overview and the measure', async () => {
    const { repo, qbs } = mockOrmRepo((method) =>
      method === 'getCount' ? 1 : liteRows(['normal']),
    );
    repo.query.mockResolvedValue(overviewRows({ classesWithStudentsNearAvatarLimit: 1 }));
    const classRepository = new ClassRepository(repo as unknown as Repository<Class>);

    const counts = await classRepository.getActivityOverviewCounts(
      EDUCATOR_ID,
      '2026-01-01',
      '2026-01-15',
      2400,
    );
    const { rows } = await classRepository.findClasses(
      EDUCATOR_ID,
      { lite: true, measure: ClassAttentionMeasure.NEAR_AVATAR_LIMIT },
      noSort,
      bigPage,
    );

    const simRule = 'csim.is_active = TRUE AND csim.deleted_at IS NULL';
    const [sql] = repo.query.mock.calls[0] as [string];
    expect(sql).toContain(simRule);
    expect(sql).toContain('csim.is_ai = TRUE');
    qbs.forEach((qb) => {
      const nearLimit = qb.calls.find(
        (c) => c.method === 'andWhere' && String(c.args[0]).includes('csim.is_ai = TRUE'),
      );
      expect(String(nearLimit?.args[0])).toContain(simRule);
      expect(nearLimit?.args[1]).toEqual({
        thresholdMinutes: ClassConstants.ACTIVITY_OVERVIEW.AVATAR_NEAR_LIMIT_THRESHOLD_MINUTES,
      });
    });

    expect(counts.classesWithStudentsNearAvatarLimit).toBe(1);
    expect(rows.map((row) => row.id)).toEqual([ids.normal]);
  });

  it('a live class with status INACTIVE is listed but not counted, and every measure drill-down agrees with its count', async () => {
    const { repo, qbs } = mockOrmRepo((method) => (method === 'getCount' ? 0 : []));
    repo.query.mockResolvedValue([]);
    const classRepository = new ClassRepository(repo as unknown as Repository<Class>);
    const measureQb = async (measure?: ClassAttentionMeasure): Promise<RecordingQb> => {
      const before = qbs.length;
      await classRepository.findClasses(EDUCATOR_ID, { lite: true, measure }, noSort, bigPage);
      return qbs[before];
    };
    const countQb = async (count: () => Promise<number>): Promise<RecordingQb> => {
      const before = qbs.length;
      await count();
      return qbs[before];
    };

    // The plain list keeps the live scope only, so an INACTIVE-status class is listed.
    expectLiveScopeOnly(await measureQb());

    await classRepository.getActivityOverviewCounts(EDUCATOR_ID, '2026-01-01', '2026-01-15', 2400);
    const [overviewSql] = repo.query.mock.calls[0] as [string];
    const unread = await measureQb(ClassAttentionMeasure.UNREAD_REPORTS);
    const noStudents = await measureQb(ClassAttentionMeasure.NO_STUDENTS);
    const noSims = await measureQb(ClassAttentionMeasure.NO_ASSIGNED_SIMS);
    const noStudentsCount = await countQb(() =>
      classRepository.countActiveWithNoStudentsForEducator(EDUCATOR_ID),
    );
    const noSimsCount = await countQb(() =>
      classRepository.countActiveWithNoAssignedSimsForEducator(EDUCATOR_ID),
    );

    // Every drill-down and every count is scoped to ACTIVE status, so INACTIVE is never counted.
    expect(overviewSql).toContain(ACTIVE_SCOPE);
    for (const qb of [unread, noStudents, noSims, noStudentsCount, noSimsCount]) {
      expect(predicates(qb)).toContain(ACTIVE_SCOPE);
    }
    // Each drill-down applies the same rule as its count.
    const rule = (qb: RecordingQb, fragment: string): string | undefined =>
      predicates(qb).find((sql) => sql.includes(fragment));
    expect(rule(noStudents, 'NOT EXISTS')).toBe(rule(noStudentsCount, 'NOT EXISTS'));
    expect(rule(noSims, 'NOT EXISTS')).toBe(rule(noSimsCount, 'NOT EXISTS'));
    expect(rule(unread, 'simulation_reports')).toContain(
      'INNER JOIN students s ON sr.student_id = s.id AND s.is_active = TRUE AND s.deleted_at IS NULL',
    );
    expect(rule(unread, 'simulation_reports')).toContain('sr.viewed_at IS NULL');
    expect(overviewSql).toContain('FILTER (WHERE sr.viewed_at IS NULL)');
  });

  it('a soft-deleted student is not shown in the students list, with or without the isActive filter', async () => {
    const { repo, qbs } = mockOrmRepo((method) =>
      method === 'getCount'
        ? 1
        : [{ id: ids['student:normal'], student_id: 'S-normal', name: null }],
    );
    const studentRepository = new StudentRepository(repo as unknown as Repository<Student>);

    const all = await studentRepository.findStudents(
      EDUCATOR_ID,
      { lite: true, classIds: [ids.normal] },
      noSort,
      bigPage,
    );
    const activeOnly = await studentRepository.findStudents(
      EDUCATOR_ID,
      { lite: true, classIds: [ids.normal], isActive: true },
      noSort,
      bigPage,
    );

    // Count + rows query for each call; every one excludes soft-deleted students.
    expect(qbs).toHaveLength(4);
    qbs.forEach((qb) => {
      expect(qb.builder.andWhere).toHaveBeenCalledWith('s.deleted_at IS NULL');
      expect(qb.builder.andWhere).toHaveBeenCalledWith('s.class_id IN (:...classIds)', {
        classIds: [ids.normal],
      });
    });
    expect(qbs[3].builder.andWhere).toHaveBeenCalledWith('s.is_active = :isActive', {
      isActive: true,
    });
    expect(predicates(qbs[1])).not.toContain('s.is_active = :isActive');

    expect(all.rows.map((row) => row.id)).toEqual([ids['student:normal']]);
    expect(activeOnly.rows.map((row) => row.id)).toEqual([ids['student:normal']]);
    expect(all.total).toBe(1);
  });

  it('a soft-deleted student is not loaded into the legacy class list', async () => {
    const normal = { id: ids.normal, students: [{ id: ids['student:normal'] }] };
    const { repo, qbs } = mockOrmRepo(() => [normal]);
    const classRepository = new ClassRepository(repo as unknown as Repository<Class>);

    const classes = await classRepository.findAllActiveForEducator(EDUCATOR_ID);

    const [qb] = qbs;
    // Students come through the `c.students` relation join, which TypeORM restricts to
    // non-deleted rows (the entity has a DeleteDateColumn); the query never opts into withDeleted.
    expect(qb.builder.leftJoin).toHaveBeenCalledWith('c.students', 'students');
    expect(qb.calls.some((c) => c.method === 'withDeleted')).toBe(false);
    expectLiveScopeOnly(qb);
    expectEducatorAccess(qb);
    expect(classes.find((row) => row.id === ids.normal)?.students?.map((s) => s.id)).toEqual([
      ids['student:normal'],
    ]);
  });

  it('list total, overview and chart agree on which classes exist', async () => {
    const classOrm = mockOrmRepo((method) =>
      method === 'getCount' ? LIVE.length : liteRows(LIVE),
    );
    classOrm.repo.query.mockResolvedValue(overviewRows({ activeClasses: COUNTED.length }));
    const reportOrm = mockOrmRepo();
    reportOrm.repo.query
      .mockResolvedValueOnce([
        { group_type: SimulationsCompletedGraphGroupLevel.MONTH, year: 2026, month: 1, count: 6 },
      ])
      .mockResolvedValueOnce([]);
    const classRepository = new ClassRepository(classOrm.repo as unknown as Repository<Class>);
    const reportRepository = new SimulationReportRepository(
      reportOrm.repo as unknown as Repository<SimulationReport>,
    );

    const list = await classRepository.findClasses(EDUCATOR_ID, { lite: true }, noSort, bigPage);
    const counts = await classRepository.getActivityOverviewCounts(
      EDUCATOR_ID,
      '2026-01-01',
      '2026-01-15',
      2400,
    );
    const chart = await reportRepository.getSimulationsCompletedGraph(EDUCATOR_ID, {
      since: null,
      forSchool: undefined,
    });
    const chartClasses = await reportRepository.getSimulationsCompletedGraph(EDUCATOR_ID, {
      since: null,
      classIds: [ids.inactiveSchool],
    });

    // List and chart share the live scope; the counts add status ACTIVE on top of it.
    expect(classOrm.qbs[0].builder.where).toHaveBeenCalledWith(LIVE_SCOPE);
    const [overviewSql] = classOrm.repo.query.mock.calls[0] as [string];
    expect(overviewSql).toContain(ACTIVE_SCOPE);
    const [chartSql] = reportOrm.repo.query.mock.calls[0] as [string];
    expect(chartSql).toContain(LIVE_SCOPE);
    // An explicit class filter is ANDed onto the live scope, never instead of it.
    const [classChartSql, classChartParams] = reportOrm.repo.query.mock.calls[1] as [
      string,
      unknown[],
    ];
    expect(classChartSql).toContain(LIVE_SCOPE);
    expect(classChartSql).toContain('c.id = ANY($2::uuid[])');
    expect(classChartParams).toEqual([EDUCATOR_ID, [ids.inactiveSchool]]);

    expect(list.total).toBe(LIVE.length);
    expect(counts.activeClasses).toBe(COUNTED.length);
    expect(list.total).toBeGreaterThanOrEqual(counts.activeClasses);
    expect(chart.byMonth.length).toBeGreaterThan(0);
    // An excluded class yields no chart data even when asked for explicitly.
    expect(chartClasses.byMonth).toEqual([]);
  });
});
