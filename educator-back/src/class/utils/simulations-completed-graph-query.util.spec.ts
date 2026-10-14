import { liveClassScopeSql } from 'src/common/utils/class-scope.util';
import {
  buildSimulationsCompletedGraphBranchSql,
  buildSimulationsCompletedGraphConditions,
  buildSimulationsCompletedGraphSql,
  groupSimulationsCompletedGraphRows,
  resolveSimulationsCompletedGraphCompareLevel,
  resolveSimulationsCompletedGraphGroupLevel,
  resolveSimulationsCompletedGraphSince,
} from './simulations-completed-graph-query.util';
import {
  SimulationsCompletedGraphBranchLayout,
  SimulationsCompletedGraphRawRow,
} from 'src/common/interfaces';
import {
  SimulationsCompletedGraphCompareLevel,
  SimulationsCompletedGraphConstants,
  SimulationsCompletedGraphGroupLevel,
  SimulationsCompletedGraphSeriesGroupType,
} from '../constants';

describe('buildSimulationsCompletedGraphConditions', () => {
  it('returns only the access-scope and active floors when no filters are provided', () => {
    const { conditions, params } = buildSimulationsCompletedGraphConditions('educator-1', {});

    expect(params).toEqual(['educator-1']);
    expect(conditions).toHaveLength(4);
    expect(conditions[0]).toContain('c.educator_id = $1');
    expect(conditions[0]).toContain('class_educators');
    expect(conditions).toContain('s.is_active = true');
    expect(conditions).toContain('s.deleted_at IS NULL');
    expect(conditions).toContain(liveClassScopeSql('c'));
  });

  it('adds a studentIds condition and appends the array as the next positional param', () => {
    const { conditions, params } = buildSimulationsCompletedGraphConditions('educator-1', {
      studentIds: ['s-1', 's-2'],
    });

    expect(params).toEqual(['educator-1', ['s-1', 's-2']]);
    expect(conditions).toContain('s.id = ANY($2::uuid[])');
  });

  it('adds a classIds condition', () => {
    const { conditions, params } = buildSimulationsCompletedGraphConditions('educator-1', {
      classIds: ['c-1'],
    });

    expect(params).toEqual(['educator-1', ['c-1']]);
    expect(conditions).toContain('c.id = ANY($2::uuid[])');
  });

  it('adds a schoolIds condition', () => {
    const { conditions, params } = buildSimulationsCompletedGraphConditions('educator-1', {
      schoolIds: ['sch-1'],
    });

    expect(params).toEqual(['educator-1', ['sch-1']]);
    expect(conditions).toContain('c.school_id = ANY($2::uuid[])');
  });

  it('adds a since (timeframe) condition', () => {
    const since = new Date('2026-01-01T00:00:00Z');
    const { conditions, params } = buildSimulationsCompletedGraphConditions('educator-1', {
      since,
    });

    expect(params).toEqual(['educator-1', since]);
    expect(conditions).toContain('sr.created_at >= $2');
  });

  it('treats an empty filter array as "not provided" — no condition, no param', () => {
    const { conditions, params } = buildSimulationsCompletedGraphConditions('educator-1', {
      studentIds: [],
      classIds: [],
      schoolIds: [],
    });

    expect(params).toEqual(['educator-1']);
    expect(conditions).toHaveLength(4);
  });

  it('always applies the shared live-class scope, with no bound parameter of its own', () => {
    const { conditions, params } = buildSimulationsCompletedGraphConditions('educator-1', {
      forSchool: 'school-1',
    });

    expect(conditions).toContain(liveClassScopeSql('c'));
    expect(params).toEqual(['educator-1', 'school-1']);
    expect(conditions).toContain('c.school_id = $2');
  });

  it('composes all filters together with correctly incrementing positional placeholders', () => {
    const since = new Date('2026-01-01T00:00:00Z');
    const { conditions, params } = buildSimulationsCompletedGraphConditions('educator-1', {
      studentIds: ['s-1'],
      classIds: ['c-1'],
      schoolIds: ['sch-1'],
      since,
    });

    expect(params).toEqual(['educator-1', ['s-1'], ['c-1'], ['sch-1'], since]);
    expect(conditions).toEqual(
      expect.arrayContaining([
        's.id = ANY($2::uuid[])',
        'c.id = ANY($3::uuid[])',
        'c.school_id = ANY($4::uuid[])',
        'sr.created_at >= $5',
      ]),
    );
  });

  it('adds a forSchool condition as a singular (non-array) equality, not the plural schoolIds shape', () => {
    const { conditions, params } = buildSimulationsCompletedGraphConditions('educator-1', {
      forSchool: 'school-1',
    });

    expect(params).toEqual(['educator-1', 'school-1']);
    expect(conditions).toContain('c.school_id = $2');
  });

  it('adds a forClass condition as a singular (non-array) equality on s.class_id', () => {
    const { conditions, params } = buildSimulationsCompletedGraphConditions('educator-1', {
      forClass: 'class-1',
    });

    expect(params).toEqual(['educator-1', 'class-1']);
    expect(conditions).toContain('s.class_id = $2');
  });
});

describe('buildSimulationsCompletedGraphSql', () => {
  it('embeds the given WHERE clause and unions a month-grouped and a school-grouped select by default', () => {
    const sql = buildSimulationsCompletedGraphSql('c.educator_id = $1');

    expect(sql).toContain('WITH filtered AS');
    expect(sql).toContain('WHERE c.educator_id = $1');
    expect(sql).toContain('UNION ALL');
    expect(sql).toMatch(/'month' AS group_type/);
    expect(sql).toMatch(/'school' AS group_type/);
    expect(sql).not.toMatch(/'class' AS group_type/);
  });

  it('builds a month + class UNION (exactly two branches) when the class group level is requested', () => {
    const sql = buildSimulationsCompletedGraphSql(
      'c.educator_id = $1',
      SimulationsCompletedGraphGroupLevel.CLASS,
    );

    expect(sql).toContain('WITH filtered AS');
    expect(sql).toMatch(/'month' AS group_type/);
    expect(sql).toMatch(/'class' AS group_type/);
    expect(sql).not.toMatch(/'school' AS group_type/);
    expect(sql).not.toMatch(/'student' AS group_type/);
    expect(sql.match(/UNION ALL/g)).toHaveLength(1);
  });

  it('builds a month + student UNION (exactly two branches) when the student group level is requested', () => {
    const sql = buildSimulationsCompletedGraphSql(
      'c.educator_id = $1',
      SimulationsCompletedGraphGroupLevel.STUDENT,
    );

    expect(sql).toContain('WITH filtered AS');
    expect(sql).toMatch(/'month' AS group_type/);
    expect(sql).toMatch(/'student' AS group_type/);
    expect(sql).not.toMatch(/'school' AS group_type/);
    expect(sql).not.toMatch(/'class' AS group_type/);
    expect(sql.match(/UNION ALL/g)).toHaveLength(1);
  });
});

describe('groupSimulationsCompletedGraphRows', () => {
  const monthRow: SimulationsCompletedGraphRawRow = {
    group_type: SimulationsCompletedGraphGroupLevel.MONTH,
    year: 2026,
    month: 3,
    count: 5,
  };

  it('returns byMonth + bySchool, omitting byClass/byStudent, for the school group level', () => {
    const schoolRow: SimulationsCompletedGraphRawRow = {
      group_type: SimulationsCompletedGraphGroupLevel.SCHOOL,
      school_id: 'school-1',
      count: 3,
    };

    const result = groupSimulationsCompletedGraphRows(
      [monthRow, schoolRow],
      SimulationsCompletedGraphGroupLevel.SCHOOL,
    );

    expect(result).toEqual({
      byMonth: [{ year: 2026, month: 3, count: 5 }],
      bySchool: [{ schoolId: 'school-1', count: 3 }],
    });
    expect(result.byClass).toBeUndefined();
    expect(result.byStudent).toBeUndefined();
  });

  it('returns byMonth + byClass, omitting bySchool/byStudent, for the class group level', () => {
    const classRow: SimulationsCompletedGraphRawRow = {
      group_type: SimulationsCompletedGraphGroupLevel.CLASS,
      class_id: 'class-1',
      class_name: 'Period 3',
      count: 2,
    };

    const result = groupSimulationsCompletedGraphRows(
      [monthRow, classRow],
      SimulationsCompletedGraphGroupLevel.CLASS,
    );

    expect(result).toEqual({
      byMonth: [{ year: 2026, month: 3, count: 5 }],
      byClass: [{ classId: 'class-1', className: 'Period 3', count: 2 }],
    });
    expect(result.bySchool).toBeUndefined();
    expect(result.byStudent).toBeUndefined();
  });

  it('returns byMonth + byStudent, omitting bySchool/byClass, for the student group level', () => {
    const studentRow: SimulationsCompletedGraphRawRow = {
      group_type: SimulationsCompletedGraphGroupLevel.STUDENT,
      student_id: 'student-1',
      student_code: 'ABC-1234',
      count: 1,
    };

    const result = groupSimulationsCompletedGraphRows(
      [monthRow, studentRow],
      SimulationsCompletedGraphGroupLevel.STUDENT,
    );

    expect(result).toEqual({
      byMonth: [{ year: 2026, month: 3, count: 5 }],
      byStudent: [{ studentId: 'student-1', studentCode: 'ABC-1234', count: 1 }],
    });
    expect(result.bySchool).toBeUndefined();
    expect(result.byClass).toBeUndefined();
  });

  it('passes through a null studentCode as-is (student_id column is nullable)', () => {
    const studentRow: SimulationsCompletedGraphRawRow = {
      group_type: SimulationsCompletedGraphGroupLevel.STUDENT,
      student_id: 'student-1',
      student_code: null,
      count: 1,
    };

    const result = groupSimulationsCompletedGraphRows(
      [monthRow, studentRow],
      SimulationsCompletedGraphGroupLevel.STUDENT,
    );

    expect(result.byStudent).toEqual([{ studentId: 'student-1', studentCode: null, count: 1 }]);
  });
});

describe('resolveSimulationsCompletedGraphGroupLevel', () => {
  it('defaults to school, uses class for forSchool, and lets forClass win with student', () => {
    expect(resolveSimulationsCompletedGraphGroupLevel({})).toBe(
      SimulationsCompletedGraphGroupLevel.SCHOOL,
    );
    expect(resolveSimulationsCompletedGraphGroupLevel({ forSchool: 's-1' })).toBe(
      SimulationsCompletedGraphGroupLevel.CLASS,
    );
    expect(resolveSimulationsCompletedGraphGroupLevel({ forSchool: 's-1', forClass: 'c-1' })).toBe(
      SimulationsCompletedGraphGroupLevel.STUDENT,
    );
  });
});

describe('resolveSimulationsCompletedGraphSince', () => {
  it('returns null for allTime and the default 3-month UTC window otherwise', () => {
    expect(resolveSimulationsCompletedGraphSince(undefined, true)).toBeNull();
    const now = new Date();
    const expected = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
    expect(resolveSimulationsCompletedGraphSince(undefined, false)).toEqual(expected);
  });
});

describe('buildSimulationsCompletedGraphSql with a compare level', () => {
  it('adds exactly one extra month x school branch and joins the school name when comparing by school', () => {
    const sql = buildSimulationsCompletedGraphSql(
      'c.educator_id = $1',
      SimulationsCompletedGraphGroupLevel.SCHOOL,
      SimulationsCompletedGraphCompareLevel.SCHOOL,
    );

    expect(sql).toMatch(/'month_school' AS group_type/);
    expect(sql).toMatch(/'month' AS group_type/);
    expect(sql).toMatch(/'school' AS group_type/);
    expect(sql).toContain('LEFT JOIN schools');
    expect(sql.match(/UNION ALL/g)).toHaveLength(2);
  });

  it('does not add the month x school branch without a compare level', () => {
    const sql = buildSimulationsCompletedGraphSql('c.educator_id = $1');

    expect(sql).not.toMatch(/month_school/);
  });
});

describe('groupSimulationsCompletedGraphRows with month x school rows', () => {
  const monthRows: SimulationsCompletedGraphRawRow[] = [
    { group_type: SimulationsCompletedGraphGroupLevel.MONTH, year: 2026, month: 7, count: 1 },
    { group_type: SimulationsCompletedGraphGroupLevel.MONTH, year: 2026, month: 8, count: 3 },
  ];

  it('builds one byMonthSeries entry per month with the schools of that month and a month total', () => {
    const rows: SimulationsCompletedGraphRawRow[] = [
      ...monthRows,
      {
        group_type: SimulationsCompletedGraphSeriesGroupType.MONTH_SCHOOL,
        year: 2026,
        month: 7,
        school_id: 'school-x',
        school_name: 'School X',
        count: 1,
      },
      {
        group_type: SimulationsCompletedGraphSeriesGroupType.MONTH_SCHOOL,
        year: 2026,
        month: 8,
        school_id: 'school-b',
        school_name: 'School B',
        count: 2,
      },
      {
        group_type: SimulationsCompletedGraphSeriesGroupType.MONTH_SCHOOL,
        year: 2026,
        month: 8,
        school_id: 'school-x',
        school_name: 'School X',
        count: 1,
      },
    ];

    const result = groupSimulationsCompletedGraphRows(
      rows,
      SimulationsCompletedGraphGroupLevel.SCHOOL,
      SimulationsCompletedGraphCompareLevel.SCHOOL,
    );

    expect(result.byMonthSeries).toEqual([
      {
        year: 2026,
        month: 7,
        total: 1,
        series: [{ seriesId: 'school-x', seriesName: 'School X', count: 1 }],
      },
      {
        year: 2026,
        month: 8,
        total: 3,
        series: [
          { seriesId: 'school-b', seriesName: 'School B', count: 2 },
          { seriesId: 'school-x', seriesName: 'School X', count: 1 },
        ],
      },
    ]);
    expect(result.byMonth).toEqual([
      { year: 2026, month: 7, count: 1 },
      { year: 2026, month: 8, count: 3 },
    ]);
  });

  it('keeps a school-less class as a null id and null name rather than dropping it', () => {
    const result = groupSimulationsCompletedGraphRows(
      [
        monthRows[0],
        {
          group_type: SimulationsCompletedGraphSeriesGroupType.MONTH_SCHOOL,
          year: 2026,
          month: 7,
          school_id: null,
          school_name: null,
          count: 1,
        },
      ],
      SimulationsCompletedGraphGroupLevel.SCHOOL,
      SimulationsCompletedGraphCompareLevel.SCHOOL,
    );

    expect(result.byMonthSeries?.[0].series).toEqual([
      { seriesId: null, seriesName: null, count: 1 },
    ]);
  });

  it('returns an empty byMonthSeries when comparing but there are no rows', () => {
    const result = groupSimulationsCompletedGraphRows(
      [],
      SimulationsCompletedGraphGroupLevel.SCHOOL,
      SimulationsCompletedGraphCompareLevel.SCHOOL,
    );

    expect(result.byMonthSeries).toEqual([]);
  });

  it('omits byMonthSeries when no compare level is given', () => {
    const result = groupSimulationsCompletedGraphRows(
      monthRows,
      SimulationsCompletedGraphGroupLevel.SCHOOL,
    );

    expect(result).not.toHaveProperty('byMonthSeries');
  });
});

describe('resolveSimulationsCompletedGraphCompareLevel', () => {
  it('is active only when the id list matching the level is non-empty', () => {
    expect(
      resolveSimulationsCompletedGraphCompareLevel({
        compareBy: SimulationsCompletedGraphCompareLevel.SCHOOL,
        schoolIds: ['s-1'],
      }),
    ).toBe(SimulationsCompletedGraphCompareLevel.SCHOOL);
    expect(
      resolveSimulationsCompletedGraphCompareLevel({
        compareBy: SimulationsCompletedGraphCompareLevel.SCHOOL,
        schoolIds: [],
        classIds: ['c-1'],
      }),
    ).toBeNull();
    expect(
      resolveSimulationsCompletedGraphCompareLevel({
        compareBy: SimulationsCompletedGraphCompareLevel.SCHOOL,
      }),
    ).toBeNull();
    expect(resolveSimulationsCompletedGraphCompareLevel({ schoolIds: ['s-1'] })).toBeNull();
  });
});

describe('compare by class and student', () => {
  it.each([
    [SimulationsCompletedGraphCompareLevel.CLASS, 'month_class'],
    [SimulationsCompletedGraphCompareLevel.STUDENT, 'month_student'],
  ])('adds exactly one extra %s branch (%s)', (level, groupType) => {
    const sql = buildSimulationsCompletedGraphSql(
      'c.educator_id = $1',
      SimulationsCompletedGraphGroupLevel.SCHOOL,
      level,
    );

    expect(sql).toContain(`'${groupType}' AS group_type`);
    expect(sql.match(/UNION ALL/g)).toHaveLength(2);
  });

  it('builds class series (id = class id, name = class name) per month', () => {
    const result = groupSimulationsCompletedGraphRows(
      [
        { group_type: SimulationsCompletedGraphGroupLevel.MONTH, year: 2026, month: 8, count: 3 },
        {
          group_type: SimulationsCompletedGraphSeriesGroupType.MONTH_CLASS,
          year: 2026,
          month: 8,
          class_id: 'class-b',
          class_name: 'Class B',
          count: 2,
        },
        {
          group_type: SimulationsCompletedGraphSeriesGroupType.MONTH_CLASS,
          year: 2026,
          month: 8,
          class_id: 'class-a',
          class_name: 'Class A',
          count: 1,
        },
      ],
      SimulationsCompletedGraphGroupLevel.SCHOOL,
      SimulationsCompletedGraphCompareLevel.CLASS,
    );

    expect(result.byMonthSeries).toEqual([
      {
        year: 2026,
        month: 8,
        total: 3,
        series: [
          { seriesId: 'class-b', seriesName: 'Class B', count: 2 },
          { seriesId: 'class-a', seriesName: 'Class A', count: 1 },
        ],
      },
    ]);
  });

  it('builds student series (id = student id, name = student code) and keeps a code-less student with a null name', () => {
    const result = groupSimulationsCompletedGraphRows(
      [
        { group_type: SimulationsCompletedGraphGroupLevel.MONTH, year: 2026, month: 8, count: 3 },
        {
          group_type: SimulationsCompletedGraphSeriesGroupType.MONTH_STUDENT,
          year: 2026,
          month: 8,
          student_id: 'student-1',
          student_code: 'ABC-1234',
          count: 2,
        },
        {
          group_type: SimulationsCompletedGraphSeriesGroupType.MONTH_STUDENT,
          year: 2026,
          month: 8,
          student_id: 'student-2',
          student_code: null,
          count: 1,
        },
      ],
      SimulationsCompletedGraphGroupLevel.SCHOOL,
      SimulationsCompletedGraphCompareLevel.STUDENT,
    );

    expect(result.byMonthSeries?.[0].series).toEqual([
      { seriesId: 'student-1', seriesName: 'ABC-1234', count: 2 },
      { seriesId: 'student-2', seriesName: null, count: 1 },
    ]);
  });

  it('activates class and student compare only with their own non-empty id list', () => {
    expect(
      resolveSimulationsCompletedGraphCompareLevel({
        compareBy: SimulationsCompletedGraphCompareLevel.CLASS,
        classIds: ['c-1'],
      }),
    ).toBe(SimulationsCompletedGraphCompareLevel.CLASS);
    expect(
      resolveSimulationsCompletedGraphCompareLevel({
        compareBy: SimulationsCompletedGraphCompareLevel.CLASS,
        schoolIds: ['s-1'],
      }),
    ).toBeNull();
    expect(
      resolveSimulationsCompletedGraphCompareLevel({
        compareBy: SimulationsCompletedGraphCompareLevel.STUDENT,
        studentIds: ['st-1'],
      }),
    ).toBe(SimulationsCompletedGraphCompareLevel.STUDENT);
    expect(
      resolveSimulationsCompletedGraphCompareLevel({
        compareBy: SimulationsCompletedGraphCompareLevel.STUDENT,
        classIds: ['c-1'],
      }),
    ).toBeNull();
  });
});

const EXPECTED_COLUMNS = [
  'group_type',
  'year',
  'month',
  'school_id',
  'school_name',
  'class_id',
  'class_name',
  'student_id',
  'student_code',
  'count',
];

/** Output column names of the branch SELECT, in order. */
function projectedColumns(sql: string): string[] {
  const projection = sql.slice(
    sql.indexOf('SELECT') + 'SELECT'.length,
    sql.indexOf('FROM filtered'),
  );
  return projection
    .split(',\n')
    .map((part) => part.trim())
    .map((part) => part.split(/\s+AS\s+/i).pop() as string);
}

const { MONTH_BRANCH, OTHER_BRANCHES, COMPARE_BRANCHES } = SimulationsCompletedGraphConstants;

const BRANCH_CASES: [string, SimulationsCompletedGraphBranchLayout][] = [
  ['month', MONTH_BRANCH],
  ...Object.entries(OTHER_BRANCHES).map(
    ([level, layout]): [string, SimulationsCompletedGraphBranchLayout] => [
      `other ${level}`,
      layout,
    ],
  ),
  ...Object.entries(COMPARE_BRANCHES).map(
    ([level, layout]): [string, SimulationsCompletedGraphBranchLayout] => [
      `compare ${level}`,
      layout,
    ],
  ),
];

describe('buildSimulationsCompletedGraphBranchSql', () => {
  it.each(BRANCH_CASES)(
    '%s branch projects the shared columns in the shared order',
    (_name, layout) => {
      expect(projectedColumns(buildSimulationsCompletedGraphBranchSql(layout))).toEqual(
        EXPECTED_COLUMNS,
      );
    },
  );

  it('projects used columns as-is and pads the others with a typed NULL', () => {
    const sql = buildSimulationsCompletedGraphBranchSql(OTHER_BRANCHES.class);

    expect(sql).toContain("'class' AS group_type");
    expect(sql).toMatch(/\bclass_id,\s/);
    expect(sql).toContain('NULL::uuid AS school_id');
    expect(sql).toContain('NULL::text AS student_code');
    expect(sql).toContain('GROUP BY class_id, class_name');
  });

  it('keeps the school name on the default school branch so equal counts can sort by name', () => {
    const sql = buildSimulationsCompletedGraphBranchSql(OTHER_BRANCHES.school);

    expect(sql).not.toContain('NULL::text AS school_name');
    expect(sql).toContain('GROUP BY school_id, school_name');
  });

  it('turns year and month into EXTRACT expressions when the branch uses them', () => {
    const sql = buildSimulationsCompletedGraphBranchSql(COMPARE_BRANCHES.school);

    expect(sql).toContain('EXTRACT(YEAR FROM created_at)::int AS year');
    expect(sql).toContain('EXTRACT(MONTH FROM created_at)::int AS month');
    expect(sql).toContain('school_name,');
    expect(sql).toContain('GROUP BY 2, 3, school_id, school_name');
  });
});
