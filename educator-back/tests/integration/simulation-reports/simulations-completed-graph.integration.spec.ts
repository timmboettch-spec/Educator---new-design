import { Repository } from 'typeorm';
import { SimulationReport } from '../../../src/database/entities';
import {
  SimulationsCompletedGraphFilters,
  SimulationsCompletedGraphRawRow,
  SimulationsCompletedGraphResult,
} from '../../../src/common/interfaces';
import { SimulationReportRepository } from '../../../src/database/repositories/simulation-report.repository';
import {
  SimulationsCompletedGraphCompareLevel,
  SimulationsCompletedGraphGroupLevel,
  SimulationsCompletedGraphSeriesGroupType,
} from '../../../src/class/constants/simulations-completed-graph.constants';

/**
 * `getSimulationsCompletedGraph` issues one raw UNION query through `Repository.query` and groups
 * the rows it gets back. The database is mocked: each test asserts the SQL / positional params the
 * repository sends (scoping, filters, grouping branches) and how it maps the mocked rows.
 */

const EDUCATOR_ID = 'educator-uuid';
const SCHOOL_1 = 'school-1-uuid';
const SCHOOL_2 = 'school-2-uuid';
const SCHOOL_1_NAME = 'School 1';
const SCHOOL_2_NAME = 'School 2';
const OWNED_CLASS = 'owned-class-uuid';
const CO_CLASS = 'co-class-uuid';
const OWNED_CLASS_NAME = 'Owned Class';
const CO_CLASS_NAME = 'CoInstructed Class';
const OWNED_STUDENT = 'owned-student-uuid';
const CO_STUDENT = 'co-student-uuid';
const OWNED_STUDENT_CODE = 'Student-1';
const CO_STUDENT_CODE = 'Student-2';

// Months of the fixture: current (Y/M), 1 and 2 months ago.
const Y = 2026;
const M = 10;

const month = (year: number, m: number, count: number): SimulationsCompletedGraphRawRow => ({
  group_type: SimulationsCompletedGraphGroupLevel.MONTH,
  year,
  month: m,
  count,
});
const school = (id: string | null, count: number): SimulationsCompletedGraphRawRow => ({
  group_type: SimulationsCompletedGraphGroupLevel.SCHOOL,
  school_id: id,
  count,
});
const cls = (id: string, name: string, count: number): SimulationsCompletedGraphRawRow => ({
  group_type: SimulationsCompletedGraphGroupLevel.CLASS,
  class_id: id,
  class_name: name,
  count,
});
const student = (id: string, code: string | null, count: number): SimulationsCompletedGraphRawRow =>
  ({
    group_type: SimulationsCompletedGraphGroupLevel.STUDENT,
    student_id: id,
    student_code: code,
    count,
  }) as SimulationsCompletedGraphRawRow;
const series = (
  type: SimulationsCompletedGraphSeriesGroupType,
  year: number,
  m: number,
  id: string | null,
  name: string | null,
  count: number,
): SimulationsCompletedGraphRawRow => {
  const [idKey, nameKey] = {
    [SimulationsCompletedGraphSeriesGroupType.MONTH_SCHOOL]: ['school_id', 'school_name'],
    [SimulationsCompletedGraphSeriesGroupType.MONTH_CLASS]: ['class_id', 'class_name'],
    [SimulationsCompletedGraphSeriesGroupType.MONTH_STUDENT]: ['student_id', 'student_code'],
  }[type];
  return {
    group_type: type,
    year,
    month: m,
    [idKey]: id,
    [nameKey]: name,
    count,
  } as unknown as SimulationsCompletedGraphRawRow;
};

/** The fixture the DB would return without filters: owned class 5/3/2/1, co-instructed 2/1. */
const FULL_MONTHS = [
  month(Y, M - 6, 1),
  month(Y, M - 3, 1),
  month(Y, M - 2, 2),
  month(Y, M - 1, 3),
  month(Y, M, 7),
];

describe('SimulationReportRepository.getSimulationsCompletedGraph (Integration)', () => {
  let query: jest.Mock;
  let repo: SimulationReportRepository;

  beforeEach(() => {
    query = jest.fn();
    repo = new SimulationReportRepository({ query } as unknown as Repository<SimulationReport>);
  });

  async function run(
    filters: SimulationsCompletedGraphFilters,
    rows: SimulationsCompletedGraphRawRow[],
  ): Promise<{ result: SimulationsCompletedGraphResult; sql: string; params: unknown[] }> {
    query.mockResolvedValueOnce(rows);
    const result = await repo.getSimulationsCompletedGraph(EDUCATOR_ID, filters);
    const [sql, params] = query.mock.calls.at(-1) as [string, unknown[]];
    return { result, sql, params };
  }

  const sum = (rows: { count: number }[]): number => rows.reduce((s, r) => s + r.count, 0);

  it('includes both owned and co-instructed classes in results', async () => {
    const { result, sql, params } = await run({}, [
      ...FULL_MONTHS,
      school(SCHOOL_1, 11),
      school(SCHOOL_2, 3),
    ]);

    // Scope: owner OR co-instructor (class_educators), bound to $1 = educatorId, no time limit.
    expect(query).toHaveBeenCalledTimes(1);
    expect(sql).toContain('c.educator_id = $1 OR EXISTS');
    expect(sql).toContain('FROM class_educators ce');
    expect(sql).toContain('ce.educator_id = $1');
    expect(sql).not.toContain('sr.created_at >=');
    expect(params).toEqual([EDUCATOR_ID]);

    expect(sum(result.byMonth)).toBe(14);
    const schoolIds = result.bySchool!.map((s) => s.schoolId);
    expect(schoolIds).toContain(SCHOOL_1);
    expect(schoolIds).toContain(SCHOOL_2);
  });

  it('respects the since filter to exclude old reports', async () => {
    const twoMonthsAgo = new Date(Date.UTC(Y, M - 3, 1));

    const { result, sql, params } = await run({ since: twoMonthsAgo }, [
      month(Y, M - 1, 3),
      month(Y, M, 7),
      school(SCHOOL_1, 8),
      school(SCHOOL_2, 2),
    ]);

    expect(sql).toContain('sr.created_at >= $2');
    expect(params).toEqual([EDUCATOR_ID, twoMonthsAgo]);
    expect(sum(result.byMonth)).toBe(10);
  });

  it('groups results correctly by school including null (unassigned)', async () => {
    const { result, sql } = await run({}, [
      ...FULL_MONTHS,
      school(SCHOOL_1, 11),
      school(SCHOOL_2, 3),
      school(null, 0),
    ]);

    expect(sql).toContain("'school' AS group_type");
    expect(sql).toContain('GROUP BY school_id, school_name');
    expect(sql).toContain('LEFT JOIN schools sch');
    expect(result.bySchool).toEqual([
      { schoolId: SCHOOL_1, count: 11 },
      { schoolId: SCHOOL_2, count: 3 },
      { schoolId: null, count: 0 },
    ]);
  });

  describe('compareBy=school', () => {
    const S = SimulationsCompletedGraphSeriesGroupType.MONTH_SCHOOL;

    it('returns each selected school per month, adding up to byMonth, with the school names', async () => {
      const { result, sql, params } = await run(
        {
          compareBy: SimulationsCompletedGraphCompareLevel.SCHOOL,
          schoolIds: [SCHOOL_1, SCHOOL_2],
        },
        [
          month(Y, M - 1, 3),
          month(Y, M, 7),
          series(S, Y, M - 1, SCHOOL_1, SCHOOL_1_NAME, 3),
          series(S, Y, M, SCHOOL_1, SCHOOL_1_NAME, 5),
          series(S, Y, M, SCHOOL_2, SCHOOL_2_NAME, 2),
          school(SCHOOL_1, 8),
          school(SCHOOL_2, 2),
        ],
      );

      expect(sql).toContain("'month_school' AS group_type");
      expect(sql).toContain('c.school_id = ANY($2::uuid[])');
      expect(params).toEqual([EDUCATOR_ID, [SCHOOL_1, SCHOOL_2]]);

      expect(result.byMonthSeries).toHaveLength(result.byMonth.length);
      for (const [index, m] of result.byMonth.entries()) {
        const entry = result.byMonthSeries![index];
        expect([entry.year, entry.month]).toEqual([m.year, m.month]);
        expect(entry.total).toBe(m.count);
        expect(sum(entry.series)).toBe(m.count);
      }
      const current = result.byMonthSeries!.find((m) => m.year === Y && m.month === M);
      expect(current?.series).toEqual([
        { seriesId: SCHOOL_1, seriesName: SCHOOL_1_NAME, count: 5 },
        { seriesId: SCHOOL_2, seriesName: SCHOOL_2_NAME, count: 2 },
      ]);
      expect(result.bySchool).toBeDefined();
    });

    it('limits the series to the selected schools', async () => {
      const { result, params } = await run(
        { compareBy: SimulationsCompletedGraphCompareLevel.SCHOOL, schoolIds: [SCHOOL_2] },
        [month(Y, M, 2), series(S, Y, M, SCHOOL_2, SCHOOL_2_NAME, 2), school(SCHOOL_2, 2)],
      );

      expect(params).toEqual([EDUCATOR_ID, [SCHOOL_2]]);
      const seriesIds = new Set(
        result.byMonthSeries!.flatMap((m) => m.series.map((x) => x.seriesId)),
      );
      expect([...seriesIds]).toEqual([SCHOOL_2]);
    });

    it('applies since the same way as the default call', async () => {
      const twoMonthsAgo = new Date(Date.UTC(Y, M - 3, 1));

      const { result, sql, params } = await run(
        {
          compareBy: SimulationsCompletedGraphCompareLevel.SCHOOL,
          schoolIds: [SCHOOL_1, SCHOOL_2],
          since: twoMonthsAgo,
        },
        [
          month(Y, M - 1, 3),
          month(Y, M, 7),
          series(S, Y, M - 1, SCHOOL_1, SCHOOL_1_NAME, 3),
          series(S, Y, M, SCHOOL_1, SCHOOL_1_NAME, 5),
          series(S, Y, M, SCHOOL_2, SCHOOL_2_NAME, 2),
        ],
      );

      expect(sql).toContain('sr.created_at >= $3');
      expect(params).toEqual([EDUCATOR_ID, [SCHOOL_1, SCHOOL_2], twoMonthsAgo]);
      const total = result.byMonthSeries!.reduce((s, m) => s + m.total, 0);
      expect(total).toBe(10);
      expect(total).toBe(sum(result.byMonth));
    });

    it('is ignored (default response, no byMonthSeries) when schoolIds is not sent', async () => {
      const { result, sql } = await run(
        { compareBy: SimulationsCompletedGraphCompareLevel.SCHOOL },
        [...FULL_MONTHS, school(SCHOOL_1, 11)],
      );

      expect(sql).not.toContain('month_school');
      expect(result).not.toHaveProperty('byMonthSeries');
      expect(result.bySchool).toBeDefined();
    });

    it('returns no byMonthSeries on a call without compareBy', async () => {
      const { result, sql } = await run({ schoolIds: [SCHOOL_1] }, [
        month(Y, M, 5),
        school(SCHOOL_1, 5),
      ]);

      expect(sql).not.toContain('month_school');
      expect(result).not.toHaveProperty('byMonthSeries');
    });

    it('returns an empty byMonthSeries, not an error, when the selection has no completions', async () => {
      const { result } = await run(
        {
          compareBy: SimulationsCompletedGraphCompareLevel.SCHOOL,
          schoolIds: [SCHOOL_1],
          since: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
        [],
      );

      expect(result.byMonth).toEqual([]);
      expect(result.byMonthSeries).toEqual([]);
    });

    it('never returns a school whose classes the educator neither owns nor co-instructs', async () => {
      const otherSchool = 'other-school-uuid';
      // The DB applies the ownership predicate to every row before grouping, so it returns
      // no row for the foreign school even though it was requested.
      const { result, sql, params } = await run(
        {
          compareBy: SimulationsCompletedGraphCompareLevel.SCHOOL,
          schoolIds: [SCHOOL_1, otherSchool],
        },
        [month(Y, M, 5), series(S, Y, M, SCHOOL_1, SCHOOL_1_NAME, 5), school(SCHOOL_1, 5)],
      );

      expect(sql).toMatch(/WHERE \(c\.educator_id = \$1 OR EXISTS/);
      expect(sql).toContain('c.school_id = ANY($2::uuid[])');
      expect(params).toEqual([EDUCATOR_ID, [SCHOOL_1, otherSchool]]);
      const seriesIds = new Set(
        result.byMonthSeries!.flatMap((m) => m.series.map((x) => x.seriesId)),
      );
      expect(seriesIds.has(otherSchool)).toBe(false);
      expect(seriesIds.has(SCHOOL_1)).toBe(true);
    });
  });

  describe('compareBy=class and compareBy=student', () => {
    const C = SimulationsCompletedGraphSeriesGroupType.MONTH_CLASS;
    const ST = SimulationsCompletedGraphSeriesGroupType.MONTH_STUDENT;

    function expectSeriesAddUp(result: SimulationsCompletedGraphResult): void {
      expect(result.byMonthSeries).toHaveLength(result.byMonth.length);
      for (const [index, m] of result.byMonth.entries()) {
        const entry = result.byMonthSeries![index];
        expect([entry.year, entry.month, entry.total]).toEqual([m.year, m.month, m.count]);
        expect(sum(entry.series)).toBe(m.count);
      }
    }

    it('returns each selected class per month with its class name, adding up to byMonth', async () => {
      const { result, sql, params } = await run(
        {
          compareBy: SimulationsCompletedGraphCompareLevel.CLASS,
          classIds: [OWNED_CLASS, CO_CLASS],
        },
        [
          month(Y, M - 1, 3),
          month(Y, M, 7),
          series(C, Y, M - 1, OWNED_CLASS, OWNED_CLASS_NAME, 3),
          series(C, Y, M, OWNED_CLASS, OWNED_CLASS_NAME, 5),
          series(C, Y, M, CO_CLASS, CO_CLASS_NAME, 2),
          school(SCHOOL_1, 8),
          school(SCHOOL_2, 2),
        ],
      );

      expect(sql).toContain("'month_class' AS group_type");
      expect(sql).toContain('c.id = ANY($2::uuid[])');
      expect(params).toEqual([EDUCATOR_ID, [OWNED_CLASS, CO_CLASS]]);
      expectSeriesAddUp(result);
      const current = result.byMonthSeries!.find((m) => m.year === Y && m.month === M);
      expect(current?.series).toEqual([
        { seriesId: OWNED_CLASS, seriesName: OWNED_CLASS_NAME, count: 5 },
        { seriesId: CO_CLASS, seriesName: CO_CLASS_NAME, count: 2 },
      ]);
    });

    it('returns a single class as one series per month, not an empty response', async () => {
      const { result } = await run(
        { compareBy: SimulationsCompletedGraphCompareLevel.CLASS, classIds: [OWNED_CLASS] },
        [
          month(Y, M - 2, 2),
          month(Y, M, 5),
          series(C, Y, M - 2, OWNED_CLASS, OWNED_CLASS_NAME, 2),
          series(C, Y, M, OWNED_CLASS, OWNED_CLASS_NAME, 5),
        ],
      );

      expectSeriesAddUp(result);
      expect(result.byMonthSeries!.length).toBeGreaterThan(0);
      for (const m of result.byMonthSeries!) {
        expect(m.series.map((x) => x.seriesId)).toEqual([OWNED_CLASS]);
      }
    });

    it('applies schoolIds alongside classIds as an extra filter and the since window', async () => {
      const twoMonthsAgo = new Date(Date.UTC(Y, M - 3, 1));

      const { result, sql, params } = await run(
        {
          compareBy: SimulationsCompletedGraphCompareLevel.CLASS,
          classIds: [OWNED_CLASS, CO_CLASS],
          schoolIds: [SCHOOL_1],
          since: twoMonthsAgo,
        },
        [
          month(Y, M - 1, 3),
          month(Y, M, 5),
          series(C, Y, M - 1, OWNED_CLASS, OWNED_CLASS_NAME, 3),
          series(C, Y, M, OWNED_CLASS, OWNED_CLASS_NAME, 5),
        ],
      );

      expect(sql).toContain('c.id = ANY($2::uuid[])');
      expect(sql).toContain('c.school_id = ANY($3::uuid[])');
      expect(sql).toContain('sr.created_at >= $4');
      expect(params).toEqual([EDUCATOR_ID, [OWNED_CLASS, CO_CLASS], [SCHOOL_1], twoMonthsAgo]);
      expectSeriesAddUp(result);
      const ids = new Set(result.byMonthSeries!.flatMap((m) => m.series.map((x) => x.seriesId)));
      expect([...ids]).toEqual([OWNED_CLASS]);
      expect(result.byMonthSeries!.reduce((s, m) => s + m.total, 0)).toBe(8);
    });

    it('is ignored when classIds is not sent', async () => {
      const { result, sql } = await run(
        { compareBy: SimulationsCompletedGraphCompareLevel.CLASS, schoolIds: [SCHOOL_1] },
        [month(Y, M, 5), school(SCHOOL_1, 5)],
      );

      expect(sql).not.toContain('month_class');
      expect(result).not.toHaveProperty('byMonthSeries');
    });

    it('never returns a class the educator neither owns nor co-instructs', async () => {
      const otherClass = 'other-class-uuid';
      const { result, sql, params } = await run(
        {
          compareBy: SimulationsCompletedGraphCompareLevel.CLASS,
          classIds: [OWNED_CLASS, otherClass],
        },
        [month(Y, M, 5), series(C, Y, M, OWNED_CLASS, OWNED_CLASS_NAME, 5)],
      );

      expect(sql).toMatch(/WHERE \(c\.educator_id = \$1 OR EXISTS/);
      expect(params).toEqual([EDUCATOR_ID, [OWNED_CLASS, otherClass]]);
      const ids = new Set(result.byMonthSeries!.flatMap((m) => m.series.map((x) => x.seriesId)));
      expect(ids.has(otherClass)).toBe(false);
      expect(ids.has(OWNED_CLASS)).toBe(true);
    });

    it('is ignored for compareBy=class when only studentIds is sent, and limits the count to those students', async () => {
      const rows = [...FULL_MONTHS.slice(0, 1), month(Y, M, 5), school(SCHOOL_1, 6)];
      const { result, sql, params } = await run(
        { compareBy: SimulationsCompletedGraphCompareLevel.CLASS, studentIds: [OWNED_STUDENT] },
        rows,
      );
      const withoutCompare = await run({ studentIds: [OWNED_STUDENT] }, rows);

      expect(result).not.toHaveProperty('byMonthSeries');
      expect(sql).toContain('s.id = ANY($2::uuid[])');
      expect(params).toEqual([EDUCATOR_ID, [OWNED_STUDENT]]);
      expect(sql).toBe(withoutCompare.sql);
      expect(withoutCompare.params).toEqual(params);
      expect(result.byMonth).toEqual(withoutCompare.result.byMonth);
      expect(result.byMonth.length).toBeGreaterThan(0);
    });

    it('limits class series to the selected students when classIds and studentIds are both sent', async () => {
      const monthRows = [month(Y, M - 1, 3), month(Y, M, 5)];
      const { result, sql, params } = await run(
        {
          compareBy: SimulationsCompletedGraphCompareLevel.CLASS,
          classIds: [OWNED_CLASS, CO_CLASS],
          studentIds: [OWNED_STUDENT],
        },
        [
          ...monthRows,
          series(C, Y, M - 1, OWNED_CLASS, OWNED_CLASS_NAME, 3),
          series(C, Y, M, OWNED_CLASS, OWNED_CLASS_NAME, 5),
        ],
      );

      expect(sql).toContain('s.id = ANY($2::uuid[])');
      expect(sql).toContain('c.id = ANY($3::uuid[])');
      expect(params).toEqual([EDUCATOR_ID, [OWNED_STUDENT], [OWNED_CLASS, CO_CLASS]]);
      expectSeriesAddUp(result);
      const ids = new Set(result.byMonthSeries!.flatMap((m) => m.series.map((x) => x.seriesId)));
      expect([...ids]).toEqual([OWNED_CLASS]);
      const studentOnly = await run({ studentIds: [OWNED_STUDENT] }, monthRows);
      expect(result.byMonth).toEqual(studentOnly.result.byMonth);
    });

    it('returns each selected student per month named by student code, adding up to byMonth', async () => {
      const { result, sql, params } = await run(
        {
          compareBy: SimulationsCompletedGraphCompareLevel.STUDENT,
          studentIds: [OWNED_STUDENT, CO_STUDENT],
        },
        [
          month(Y, M, 7),
          series(ST, Y, M, OWNED_STUDENT, OWNED_STUDENT_CODE, 5),
          series(ST, Y, M, CO_STUDENT, CO_STUDENT_CODE, 2),
        ],
      );

      expect(sql).toContain("'month_student' AS group_type");
      expect(sql).toContain('GROUP BY 2, 3, student_id, student_code');
      expect(params).toEqual([EDUCATOR_ID, [OWNED_STUDENT, CO_STUDENT]]);
      expectSeriesAddUp(result);
      const current = result.byMonthSeries!.find((m) => m.year === Y && m.month === M);
      expect(current?.series).toEqual([
        { seriesId: OWNED_STUDENT, seriesName: OWNED_STUDENT_CODE, count: 5 },
        { seriesId: CO_STUDENT, seriesName: CO_STUDENT_CODE, count: 2 },
      ]);
    });

    it('keeps a student without a student code as a series with a null name', async () => {
      const codeless = 'codeless-student-uuid';
      const { result } = await run(
        { compareBy: SimulationsCompletedGraphCompareLevel.STUDENT, studentIds: [codeless] },
        [month(Y, M, 1), series(ST, Y, M, codeless, null, 1)],
      );

      expect(result.byMonthSeries).toEqual([
        {
          year: Y,
          month: M,
          total: 1,
          series: [{ seriesId: codeless, seriesName: null, count: 1 }],
        },
      ]);
    });

    it('is ignored when studentIds is not sent, and limits students to the selection', async () => {
      const ignored = await run(
        { compareBy: SimulationsCompletedGraphCompareLevel.STUDENT, classIds: [OWNED_CLASS] },
        [month(Y, M, 5), school(SCHOOL_1, 5)],
      );
      expect(ignored.sql).not.toContain('month_student');
      expect(ignored.result).not.toHaveProperty('byMonthSeries');

      const limited = await run(
        {
          compareBy: SimulationsCompletedGraphCompareLevel.STUDENT,
          studentIds: [OWNED_STUDENT],
          classIds: [OWNED_CLASS],
        },
        [month(Y, M, 5), series(ST, Y, M, OWNED_STUDENT, OWNED_STUDENT_CODE, 5)],
      );
      expect(limited.params).toEqual([EDUCATOR_ID, [OWNED_STUDENT], [OWNED_CLASS]]);
      const ids = new Set(
        limited.result.byMonthSeries!.flatMap((m) => m.series.map((x) => x.seriesId)),
      );
      expect([...ids]).toEqual([OWNED_STUDENT]);
    });
  });

  it('orders schools with equal counts by school name, not by id', async () => {
    const schoolA = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const schoolB = '00000000-0000-4000-8000-000000000000';
    // The DB returns rows in the ORDER BY the repository asks for; the repository keeps it.
    const { result, sql } = await run({}, [month(Y, M, 2), school(schoolA, 1), school(schoolB, 1)]);

    expect(sql).toMatch(/ORDER BY group_type, year, month, count DESC, school_name, school_id/);
    expect(result.bySchool).toEqual([
      { schoolId: schoolA, count: 1 },
      { schoolId: schoolB, count: 1 },
    ]);
  });

  it('filters by classIds when provided', async () => {
    const { result, sql, params } = await run({ classIds: [OWNED_CLASS] }, [
      month(Y, M - 6, 1),
      month(Y, M - 2, 2),
      month(Y, M - 1, 3),
      month(Y, M, 5),
      school(SCHOOL_1, 11),
    ]);

    expect(sql).toContain('c.id = ANY($2::uuid[])');
    expect(params).toEqual([EDUCATOR_ID, [OWNED_CLASS]]);
    expect(sum(result.byMonth)).toBe(11);
    expect(result.bySchool!).toHaveLength(1);
    expect(result.bySchool![0].schoolId).toBe(SCHOOL_1);
  });

  it('filters by studentIds when provided', async () => {
    const { result, sql, params } = await run({ studentIds: [OWNED_STUDENT] }, [
      month(Y, M - 6, 1),
      month(Y, M - 2, 2),
      month(Y, M - 1, 3),
      month(Y, M, 5),
      school(SCHOOL_1, 11),
    ]);

    expect(sql).toContain('s.id = ANY($2::uuid[])');
    expect(params).toEqual([EDUCATOR_ID, [OWNED_STUDENT]]);
    expect(sum(result.byMonth)).toBe(11);
  });

  it('filters by schoolIds when provided', async () => {
    const { result, sql, params } = await run({ schoolIds: [SCHOOL_1] }, [
      month(Y, M - 1, 6),
      month(Y, M, 5),
      school(SCHOOL_1, 11),
    ]);

    expect(sql).toContain('c.school_id = ANY($2::uuid[])');
    expect(params).toEqual([EDUCATOR_ID, [SCHOOL_1]]);
    expect(sum(result.byMonth)).toBe(11);
    expect(result.bySchool!).toHaveLength(1);
    expect(result.bySchool![0].schoolId).toBe(SCHOOL_1);
  });

  it('returns empty results when educator has no matching classes', async () => {
    const { result } = await run({}, []);

    expect(result.byMonth).toHaveLength(0);
    expect(result.bySchool!).toHaveLength(0);
  });

  describe('forSchool drill-down', () => {
    it('returns byClass grouped by class for that school, with byMonth, and omits bySchool', async () => {
      const { result, sql, params } = await run({ forSchool: SCHOOL_1 }, [
        month(Y, M - 1, 6),
        month(Y, M, 5),
        cls(OWNED_CLASS, OWNED_CLASS_NAME, 11),
      ]);

      expect(sql).toContain('c.school_id = $2');
      expect(sql).toContain("'class' AS group_type");
      expect(sql).not.toContain("'school' AS group_type");
      expect(params).toEqual([EDUCATOR_ID, SCHOOL_1]);
      expect(result.bySchool).toBeUndefined();
      expect(sum(result.byMonth)).toBe(11);
      expect(result.byClass).toHaveLength(1);
      expect(result.byClass?.[0]).toEqual(
        expect.objectContaining({ classId: OWNED_CLASS, className: OWNED_CLASS_NAME, count: 11 }),
      );
    });

    it('respects co-instructor scoping for forSchool the same as the default call', async () => {
      const { result, sql } = await run({ forSchool: SCHOOL_2 }, [
        month(Y, M, 3),
        cls(CO_CLASS, CO_CLASS_NAME, 3),
      ]);

      expect(sql).toMatch(/WHERE \(c\.educator_id = \$1 OR EXISTS/);
      expect(sql).toContain('ce.educator_id = $1');
      expect(result.byClass).toHaveLength(1);
      expect(result.byClass?.[0]).toEqual(expect.objectContaining({ classId: CO_CLASS, count: 3 }));
    });

    it('returns an empty byClass array for a school outside the educator scope', async () => {
      const { result, params } = await run({ forSchool: 'other-school-uuid' }, []);

      expect(params).toEqual([EDUCATOR_ID, 'other-school-uuid']);
      expect(result.byClass).toHaveLength(0);
      expect(result.byMonth).toHaveLength(0);
    });

    it('returns an empty byClass array for a syntactically valid but nonexistent schoolId', async () => {
      const { result } = await run({ forSchool: '00000000-0000-4000-8000-000000000000' }, []);

      expect(result.byClass).toHaveLength(0);
    });

    it('applies the same since window as the default call', async () => {
      const twoMonthsAgo = new Date(Date.UTC(Y, M - 3, 1));

      const { result, sql, params } = await run({ forSchool: SCHOOL_1, since: twoMonthsAgo }, [
        month(Y, M - 1, 3),
        month(Y, M, 5),
        cls(OWNED_CLASS, OWNED_CLASS_NAME, 8),
      ]);

      expect(sql).toContain('sr.created_at >= $3');
      expect(params).toEqual([EDUCATOR_ID, SCHOOL_1, twoMonthsAgo]);
      expect(sum(result.byClass ?? [])).toBe(8);
    });
  });

  describe('forClass drill-down', () => {
    it('returns byStudent grouped by student for that class, with byMonth, and omits bySchool/byClass', async () => {
      const { result, sql, params } = await run({ forClass: OWNED_CLASS }, [
        month(Y, M - 1, 6),
        month(Y, M, 5),
        student(OWNED_STUDENT, OWNED_STUDENT_CODE, 11),
      ]);

      expect(sql).toContain('s.class_id = $2');
      expect(sql).toContain("'student' AS group_type");
      expect(params).toEqual([EDUCATOR_ID, OWNED_CLASS]);
      expect(result.bySchool).toBeUndefined();
      expect(result.byClass).toBeUndefined();
      expect(sum(result.byMonth)).toBe(11);
      expect(result.byStudent).toHaveLength(1);
      expect(result.byStudent?.[0]).toEqual(
        expect.objectContaining({
          studentId: OWNED_STUDENT,
          studentCode: OWNED_STUDENT_CODE,
          count: 11,
        }),
      );
    });

    it('respects co-instructor scoping for forClass the same as the default call', async () => {
      const { result, sql } = await run({ forClass: CO_CLASS }, [
        month(Y, M, 3),
        student(CO_STUDENT, CO_STUDENT_CODE, 3),
      ]);

      expect(sql).toMatch(/WHERE \(c\.educator_id = \$1 OR EXISTS/);
      expect(sql).toContain('ce.educator_id = $1');
      expect(result.byStudent).toHaveLength(1);
      expect(result.byStudent?.[0]).toEqual(
        expect.objectContaining({ studentId: CO_STUDENT, count: 3 }),
      );
    });

    it('returns an empty byStudent array for a class outside the educator scope', async () => {
      const { result, params } = await run({ forClass: 'other-class-uuid' }, []);

      expect(params).toEqual([EDUCATOR_ID, 'other-class-uuid']);
      expect(result.byStudent).toHaveLength(0);
      expect(result.byMonth).toHaveLength(0);
    });

    it('returns an empty byStudent array for a syntactically valid but nonexistent classId', async () => {
      const { result } = await run({ forClass: '00000000-0000-4000-8000-000000000000' }, []);

      expect(result.byStudent).toHaveLength(0);
    });

    it('applies the same since window as the default call', async () => {
      const twoMonthsAgo = new Date(Date.UTC(Y, M - 3, 1));

      const { result, sql, params } = await run({ forClass: OWNED_CLASS, since: twoMonthsAgo }, [
        month(Y, M - 1, 3),
        month(Y, M, 5),
        student(OWNED_STUDENT, OWNED_STUDENT_CODE, 8),
      ]);

      expect(sql).toContain('sr.created_at >= $3');
      expect(params).toEqual([EDUCATOR_ID, OWNED_CLASS, twoMonthsAgo]);
      expect(sum(result.byStudent ?? [])).toBe(8);
    });
  });
});
