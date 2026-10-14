import type {
  SimulationsCompletedGraphBranchColumn,
  SimulationsCompletedGraphBranchLayout,
} from 'src/common/interfaces/simulations-completed-graph.interface';

export enum SimulationsCompletedGraphGroupLevel {
  MONTH = 'month',
  SCHOOL = 'school',
  CLASS = 'class',
  STUDENT = 'student',
}

export enum SimulationsCompletedGraphCompareLevel {
  SCHOOL = 'school',
  CLASS = 'class',
  STUDENT = 'student',
}

export enum SimulationsCompletedGraphSeriesGroupType {
  MONTH_SCHOOL = 'month_school',
  MONTH_CLASS = 'month_class',
  MONTH_STUDENT = 'month_student',
}

/** Typed NULL padding for the columns a UNION branch does not use; fixes the shared column order. */
const BRANCH_NULL_TYPES: Record<SimulationsCompletedGraphBranchColumn, string> = {
  year: 'int',
  month: 'int',
  school_id: 'uuid',
  school_name: 'text',
  class_id: 'uuid',
  class_name: 'text',
  student_id: 'uuid',
  student_code: 'text',
};

/** Real (non-NULL) expression for a column when a branch uses it on the month-bucketed rows. */
const BRANCH_MONTH_EXPRESSIONS: Partial<Record<SimulationsCompletedGraphBranchColumn, string>> = {
  year: 'EXTRACT(YEAR FROM created_at)::int',
  month: 'EXTRACT(MONTH FROM created_at)::int',
};

const MONTH_BRANCH: SimulationsCompletedGraphBranchLayout = {
  groupType: SimulationsCompletedGraphGroupLevel.MONTH,
  columns: ['year', 'month'],
  groupBy: '2, 3',
};

const OTHER_BRANCHES: Record<
  Exclude<SimulationsCompletedGraphGroupLevel, SimulationsCompletedGraphGroupLevel.MONTH>,
  SimulationsCompletedGraphBranchLayout
> = {
  [SimulationsCompletedGraphGroupLevel.SCHOOL]: {
    groupType: SimulationsCompletedGraphGroupLevel.SCHOOL,
    columns: ['school_id', 'school_name'],
    groupBy: 'school_id, school_name',
  },
  [SimulationsCompletedGraphGroupLevel.CLASS]: {
    groupType: SimulationsCompletedGraphGroupLevel.CLASS,
    columns: ['class_id', 'class_name'],
    groupBy: 'class_id, class_name',
  },
  [SimulationsCompletedGraphGroupLevel.STUDENT]: {
    groupType: SimulationsCompletedGraphGroupLevel.STUDENT,
    columns: ['student_id', 'student_code'],
    groupBy: 'student_id, student_code',
  },
};

const COMPARE_BRANCHES: Record<
  SimulationsCompletedGraphCompareLevel,
  SimulationsCompletedGraphBranchLayout
> = {
  [SimulationsCompletedGraphCompareLevel.SCHOOL]: {
    groupType: SimulationsCompletedGraphSeriesGroupType.MONTH_SCHOOL,
    columns: ['year', 'month', 'school_id', 'school_name'],
    groupBy: '2, 3, school_id, school_name',
  },
  [SimulationsCompletedGraphCompareLevel.CLASS]: {
    groupType: SimulationsCompletedGraphSeriesGroupType.MONTH_CLASS,
    columns: ['year', 'month', 'class_id', 'class_name'],
    groupBy: '2, 3, class_id, class_name',
  },
  [SimulationsCompletedGraphCompareLevel.STUDENT]: {
    groupType: SimulationsCompletedGraphSeriesGroupType.MONTH_STUDENT,
    columns: ['year', 'month', 'student_id', 'student_code'],
    groupBy: '2, 3, student_id, student_code',
  },
};

export const SimulationsCompletedGraphConstants = {
  BRANCH_NULL_TYPES,
  BRANCH_MONTH_EXPRESSIONS,
  MONTH_BRANCH,
  OTHER_BRANCHES,
  COMPARE_BRANCHES,
  COMPARE_MAX_IDS: 15,
  DEFAULT_MONTHS: 3,
  MAX_FILTER_IDS: 100,
};
