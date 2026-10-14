import {
  SimulationsCompletedGraphCompareLevel,
  SimulationsCompletedGraphGroupLevel,
  SimulationsCompletedGraphSeriesGroupType,
} from 'src/class/constants/simulations-completed-graph.constants';

export type SimulationsCompletedGraphBranchColumn =
  | 'year'
  | 'month'
  | 'school_id'
  | 'school_name'
  | 'class_id'
  | 'class_name'
  | 'student_id'
  | 'student_code';

/** Which columns one `SELECT ... FROM filtered` UNION branch fills in; the rest are NULL-padded. */
export interface SimulationsCompletedGraphBranchLayout {
  groupType: SimulationsCompletedGraphGroupLevel | SimulationsCompletedGraphSeriesGroupType;
  columns: SimulationsCompletedGraphBranchColumn[];
  groupBy: string;
}

export interface SimulationsCompletedGraphFilters {
  studentIds?: string[];
  classIds?: string[];
  schoolIds?: string[];
  forSchool?: string;
  forClass?: string;
  compareBy?: SimulationsCompletedGraphCompareLevel;
  since?: Date | null;
}

export interface SimulationsCompletedGraphMonthRow {
  year: number;
  month: number;
  count: number;
}

export interface SimulationsCompletedGraphSchoolRow {
  schoolId: string | null;
  count: number;
}

export interface SimulationsCompletedGraphClassRow {
  classId: string;
  className: string;
  count: number;
}

export interface SimulationsCompletedGraphStudentRow {
  studentId: string;
  studentCode: string | null;
  count: number;
}

export interface SimulationsCompletedGraphSeriesRow {
  seriesId: string | null;
  seriesName: string | null;
  count: number;
}

export interface SimulationsCompletedGraphMonthSeriesRow {
  year: number;
  month: number;
  total: number;
  series: SimulationsCompletedGraphSeriesRow[];
}

export interface SimulationsCompletedGraphResult {
  byMonth: SimulationsCompletedGraphMonthRow[];
  byMonthSeries?: SimulationsCompletedGraphMonthSeriesRow[];
  bySchool?: SimulationsCompletedGraphSchoolRow[];
  byClass?: SimulationsCompletedGraphClassRow[];
  byStudent?: SimulationsCompletedGraphStudentRow[];
}

export interface SimulationsCompletedGraphMonthRawRow {
  group_type: SimulationsCompletedGraphGroupLevel.MONTH;
  year: number;
  month: number;
  count: number;
}

export interface SimulationsCompletedGraphSchoolRawRow {
  group_type: SimulationsCompletedGraphGroupLevel.SCHOOL;
  school_id: string | null;
  count: number;
}

export interface SimulationsCompletedGraphClassRawRow {
  group_type: SimulationsCompletedGraphGroupLevel.CLASS;
  class_id: string;
  class_name: string;
  count: number;
}

export interface SimulationsCompletedGraphStudentRawRow {
  group_type: SimulationsCompletedGraphGroupLevel.STUDENT;
  student_id: string;
  student_code: string | null;
  count: number;
}

export interface SimulationsCompletedGraphMonthSchoolRawRow {
  group_type: SimulationsCompletedGraphSeriesGroupType.MONTH_SCHOOL;
  year: number;
  month: number;
  school_id: string | null;
  school_name: string | null;
  count: number;
}

export interface SimulationsCompletedGraphMonthClassRawRow {
  group_type: SimulationsCompletedGraphSeriesGroupType.MONTH_CLASS;
  year: number;
  month: number;
  class_id: string;
  class_name: string;
  count: number;
}

export interface SimulationsCompletedGraphMonthStudentRawRow {
  group_type: SimulationsCompletedGraphSeriesGroupType.MONTH_STUDENT;
  year: number;
  month: number;
  student_id: string;
  student_code: string | null;
  count: number;
}

export type SimulationsCompletedGraphRawRow =
  | SimulationsCompletedGraphMonthRawRow
  | SimulationsCompletedGraphMonthSchoolRawRow
  | SimulationsCompletedGraphMonthClassRawRow
  | SimulationsCompletedGraphMonthStudentRawRow
  | SimulationsCompletedGraphSchoolRawRow
  | SimulationsCompletedGraphClassRawRow
  | SimulationsCompletedGraphStudentRawRow;

export interface SimulationsCompletedGraphConditions {
  conditions: string[];
  params: unknown[];
}

export type SimulationsCompletedGraphOtherLevel = Exclude<
  SimulationsCompletedGraphGroupLevel,
  SimulationsCompletedGraphGroupLevel.MONTH
>;
