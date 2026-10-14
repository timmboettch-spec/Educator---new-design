import {
  SimulationsCompletedGraphBranchColumn,
  SimulationsCompletedGraphBranchLayout,
  SimulationsCompletedGraphClassRow,
  SimulationsCompletedGraphConditions,
  SimulationsCompletedGraphFilters,
  SimulationsCompletedGraphMonthRow,
  SimulationsCompletedGraphMonthSeriesRow,
  SimulationsCompletedGraphOtherLevel,
  SimulationsCompletedGraphRawRow,
  SimulationsCompletedGraphResult,
  SimulationsCompletedGraphSchoolRow,
  SimulationsCompletedGraphStudentRow,
} from 'src/common/interfaces';
import {
  SimulationsCompletedGraphCompareLevel,
  SimulationsCompletedGraphConstants,
  SimulationsCompletedGraphGroupLevel,
  SimulationsCompletedGraphSeriesGroupType,
} from '../constants/simulations-completed-graph.constants';
import { ownerOrCoInstructorSql } from 'src/common/utils/educator-access.util';
import { liveClassScopeSql } from 'src/common/utils/class-scope.util';

function ownerOrCoInstructorCondition(educatorIdParamIndex: number): string {
  return ownerOrCoInstructorSql('c', `$${educatorIdParamIndex}`);
}

/** WHERE-clause fragments + positional params shared by both branches of `buildSimulationsCompletedGraphSql`'s UNION ALL. */
export function buildSimulationsCompletedGraphConditions(
  educatorId: string,
  filters: SimulationsCompletedGraphFilters,
): SimulationsCompletedGraphConditions {
  const params: unknown[] = [educatorId];
  const conditions: string[] = [
    ownerOrCoInstructorCondition(1),
    's.is_active = true',
    's.deleted_at IS NULL',
    liveClassScopeSql('c'),
  ];

  if (filters.studentIds?.length) {
    params.push(filters.studentIds);
    conditions.push(`s.id = ANY($${params.length}::uuid[])`);
  }
  if (filters.classIds?.length) {
    params.push(filters.classIds);
    conditions.push(`c.id = ANY($${params.length}::uuid[])`);
  }
  if (filters.schoolIds?.length) {
    params.push(filters.schoolIds);
    conditions.push(`c.school_id = ANY($${params.length}::uuid[])`);
  }
  if (filters.forSchool) {
    params.push(filters.forSchool);
    conditions.push(`c.school_id = $${params.length}`);
  }
  if (filters.forClass) {
    params.push(filters.forClass);
    conditions.push(`s.class_id = $${params.length}`);
  }
  if (filters.since) {
    params.push(filters.since);
    conditions.push(`sr.created_at >= $${params.length}`);
  }

  return { conditions, params };
}

/**
 * One `SELECT ... FROM filtered` branch of the graph UNION. Every branch must project the same
 * columns in the same order, so the order comes from `BRANCH_NULL_TYPES` and the columns a branch
 * does not use are padded with a typed NULL; adding a column means changing that map only.
 */
export function buildSimulationsCompletedGraphBranchSql(
  layout: SimulationsCompletedGraphBranchLayout,
): string {
  const projection = Object.entries(SimulationsCompletedGraphConstants.BRANCH_NULL_TYPES).map(
    ([column, nullType]) => {
      if (!layout.columns.some((used) => used === column)) {
        return `NULL::${nullType} AS ${column}`;
      }
      const expression =
        SimulationsCompletedGraphConstants.BRANCH_MONTH_EXPRESSIONS[
          column as SimulationsCompletedGraphBranchColumn
        ];
      return expression ? `${expression} AS ${column}` : column;
    },
  );

  return `
    SELECT
      '${layout.groupType}' AS group_type,
      ${projection.join(',\n      ')},
      COUNT(*)::int AS count
    FROM filtered
    GROUP BY ${layout.groupBy}
  `;
}

/**
 * Filtered CTE feeding a month SELECT and one grouping SELECT, unioned in one round trip; a third
 * per-month SELECT is added when `compareLevel` is set.
 *
 * Rows come back ordered by group, then month, so `groupSimulationsCompletedGraphRows` can build
 * each month's entry in one pass. Within a group the largest count comes first, and the name / id
 * keys that follow make the order of equal counts deterministic.
 */
export function buildSimulationsCompletedGraphSql(
  whereClause: string,
  groupLevel: SimulationsCompletedGraphOtherLevel = SimulationsCompletedGraphGroupLevel.SCHOOL,
  compareLevel: SimulationsCompletedGraphCompareLevel | null = null,
): string {
  const compareUnion = compareLevel
    ? `UNION ALL\n\n    ${buildSimulationsCompletedGraphBranchSql(
        SimulationsCompletedGraphConstants.COMPARE_BRANCHES[compareLevel],
      )}`
    : '';

  return `
    WITH filtered AS (
      SELECT
        sr.created_at AS created_at,
        c.school_id AS school_id,
        sch.school_name AS school_name,
        c.id AS class_id,
        c.class_name AS class_name,
        s.id AS student_id,
        s.student_id AS student_code
      FROM simulation_reports sr
      INNER JOIN students s ON s.id = sr.student_id
      INNER JOIN classes c ON c.id = s.class_id
      LEFT JOIN schools sch ON sch.id = c.school_id
      WHERE ${whereClause}
    )
    ${buildSimulationsCompletedGraphBranchSql(SimulationsCompletedGraphConstants.MONTH_BRANCH)}

    UNION ALL

    ${buildSimulationsCompletedGraphBranchSql(
      SimulationsCompletedGraphConstants.OTHER_BRANCHES[groupLevel],
    )}

    ${compareUnion}
    ORDER BY group_type, year, month, count DESC, school_name, school_id, class_name, class_id, student_code, student_id
  `;
}

/** Picks the "other" grouping level; forClass wins over forSchool. */
export function resolveSimulationsCompletedGraphGroupLevel(
  filters: SimulationsCompletedGraphFilters,
): SimulationsCompletedGraphOtherLevel {
  if (filters.forClass) return SimulationsCompletedGraphGroupLevel.STUDENT;
  if (filters.forSchool) return SimulationsCompletedGraphGroupLevel.CLASS;
  return SimulationsCompletedGraphGroupLevel.SCHOOL;
}

/** Compare is active only when the id list matching the requested level is non-empty. */
export function resolveSimulationsCompletedGraphCompareLevel(
  filters: SimulationsCompletedGraphFilters,
): SimulationsCompletedGraphCompareLevel | null {
  const { compareBy } = filters;
  if (!compareBy) return null;
  const idsByLevel: Record<SimulationsCompletedGraphCompareLevel, string[] | undefined> = {
    [SimulationsCompletedGraphCompareLevel.SCHOOL]: filters.schoolIds,
    [SimulationsCompletedGraphCompareLevel.CLASS]: filters.classIds,
    [SimulationsCompletedGraphCompareLevel.STUDENT]: filters.studentIds,
  };
  return idsByLevel[compareBy]?.length ? compareBy : null;
}

/** Start of the window (UTC month) for the last `months`, or null for all time. */
export function resolveSimulationsCompletedGraphSince(
  months: number | undefined,
  allTime: boolean | undefined,
): Date | null {
  if (allTime) return null;
  const windowMonths = months ?? SimulationsCompletedGraphConstants.DEFAULT_MONTHS;
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (windowMonths - 1), 1));
}

/** Appends one series to its month's entry, opening the entry when the month changes (rows arrive month-ordered). */
function pushSeries(
  byMonthSeries: SimulationsCompletedGraphMonthSeriesRow[],
  row: { year: number; month: number; count: number },
  seriesId: string | null,
  seriesName: string | null,
): void {
  let entry = byMonthSeries.at(-1);
  if (entry?.year !== row.year || entry.month !== row.month) {
    entry = { year: row.year, month: row.month, total: 0, series: [] };
    byMonthSeries.push(entry);
  }
  entry.series.push({ seriesId, seriesName, count: row.count });
  entry.total += row.count;
}

/** Splits the raw UNION rows into byMonth plus the one "other" array for `groupLevel`. */
export function groupSimulationsCompletedGraphRows(
  rows: SimulationsCompletedGraphRawRow[],
  groupLevel: SimulationsCompletedGraphOtherLevel,
  compareLevel: SimulationsCompletedGraphCompareLevel | null = null,
): SimulationsCompletedGraphResult {
  const byMonth: SimulationsCompletedGraphMonthRow[] = [];
  const byMonthSeries: SimulationsCompletedGraphMonthSeriesRow[] = [];
  const bySchool: SimulationsCompletedGraphSchoolRow[] = [];
  const byClass: SimulationsCompletedGraphClassRow[] = [];
  const byStudent: SimulationsCompletedGraphStudentRow[] = [];

  for (const row of rows) {
    switch (row.group_type) {
      case SimulationsCompletedGraphGroupLevel.MONTH:
        byMonth.push({ year: row.year, month: row.month, count: row.count });
        break;
      case SimulationsCompletedGraphSeriesGroupType.MONTH_SCHOOL:
        pushSeries(byMonthSeries, row, row.school_id, row.school_name);
        break;
      case SimulationsCompletedGraphSeriesGroupType.MONTH_CLASS:
        pushSeries(byMonthSeries, row, row.class_id, row.class_name);
        break;
      case SimulationsCompletedGraphSeriesGroupType.MONTH_STUDENT:
        pushSeries(byMonthSeries, row, row.student_id, row.student_code);
        break;
      case SimulationsCompletedGraphGroupLevel.SCHOOL:
        bySchool.push({ schoolId: row.school_id, count: row.count });
        break;
      case SimulationsCompletedGraphGroupLevel.CLASS:
        byClass.push({ classId: row.class_id, className: row.class_name, count: row.count });
        break;
      case SimulationsCompletedGraphGroupLevel.STUDENT:
        byStudent.push({
          studentId: row.student_id,
          studentCode: row.student_code,
          count: row.count,
        });
        break;
      default: {
        const unhandled: never = row;
        throw new Error(`Unhandled group_type: ${JSON.stringify(unhandled)}`);
      }
    }
  }

  const withSeries = compareLevel ? { byMonthSeries } : {};
  switch (groupLevel) {
    case SimulationsCompletedGraphGroupLevel.STUDENT:
      return { byMonth, ...withSeries, byStudent };
    case SimulationsCompletedGraphGroupLevel.CLASS:
      return { byMonth, ...withSeries, byClass };
    case SimulationsCompletedGraphGroupLevel.SCHOOL:
      return { byMonth, ...withSeries, bySchool };
  }
}
