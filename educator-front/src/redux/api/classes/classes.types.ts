export enum CommonStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  ARCHIEVED = 'ARCHIEVED',
  DRAFT = 'DRAFT',
  ATTENTION = 'ATTENTION',
}

/**
 * The single source for the statuses a class can be filtered by, created or
 * edited with, or changed to. DRAFT/ATTENTION stay in `CommonStatus` only
 * because older classes still come back with them and the listing shows them.
 */
export const SELECTABLE_CLASS_STATUSES = [
  CommonStatus.ACTIVE,
  CommonStatus.INACTIVE,
  CommonStatus.ARCHIEVED,
] as const;

export type SelectableClassStatus = (typeof SELECTABLE_CLASS_STATUSES)[number];

export enum ClassAttentionMeasure {
  ACTIVE = 'active',
  CLOSING_SOON = 'closingSoon',
  NEAR_AVATAR_LIMIT = 'nearAvatarLimit',
  UNREAD_REPORTS = 'unreadReports',
  NO_STUDENTS = 'noStudents',
  NO_ASSIGNED_SIMS = 'noAssignedSims',
}

export enum ClassSortField {
  CLASS_NAME = 'class_name',
  STUDENTS = 'students',
  SIMS = 'sims',
  REPORTS = 'reports',
  STATUS = 'status',
}

export type SortDir = 'asc' | 'desc';

/** File format of the per-class student codes export (BE `StudentCodesExportFormat`). */
export enum StudentCodesExportFormat {
  CSV = 'csv',
  PDF = 'pdf',
}

export interface ExportStudentCodesReqDto {
  format?: StudentCodesExportFormat;
}

/** Sentinel accepted alongside real school UUIDs to mean "no school assigned". */
export const UNASSIGNED_SCHOOL = 'unassigned' as const;

export interface PaginationDto {
  page?: number;
  pageSize?: number;
}

export interface PaginationMetaDto {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

// ─── GET /api/classes/user/activity-overview ────────────────────────────────

export interface ActivityOverviewReqDto {
  school_id?: string;
}

export interface ActivityOverviewResDto {
  activeClasses: number;
  classesWithUnreadReports: number;
  totalUnreadReports: number;
  classesClosingSoon: number;
  studentsInActiveClasses: number;
  classesWithStudentsNearAvatarLimit: number;
}

// ─── GET /api/classes/user/attention-summary ────────────────────────────────

export interface AttentionSummaryReqDto {
  school_id?: string;
}

/** Counts over the educator's active classes; a class can appear in more than one bucket. */
export interface AttentionSummaryResDto {
  totalClasses: number;
  unreadReports: number;
  noStudents: number;
  noAssignedSims: number;
  // Distinct active classes needing attention for at least one reason (not the bucket sum).
  classesNeedingAttention: number;
}

// ─── GET /api/classes/schools ────────────────────────────────────────────────

export interface ListSchoolGroupsReqDto extends PaginationDto {
  schoolName?: string;
  className?: string;
  schoolId?: string[];
  classId?: string[];
  /** Prefixed names here; `GET /api/classes` uses `status` / `startDateFrom` / `endDateTo`. */
  classStatus?: SelectableClassStatus[];
  /** YYYY-MM-DD */
  classStartDateFrom?: string;
  /** YYYY-MM-DD */
  classEndDateTo?: string;
  measure?: ClassAttentionMeasure;
}

export interface SchoolGroupResDto {
  schoolId: string | null;
  schoolName: string;
  classCount: number;
}

// ─── GET /api/classes ─────────────────────────────────────────────────────────

/** `lite=true` returns `ClassLiteResDto` rows (id + name) instead of `ClassSummaryResDto`. */
export interface LiteQueryDto {
  lite?: boolean;
}

export interface ListClassesReqDto extends PaginationDto, LiteQueryDto {
  search?: string;
  schoolIds?: string[];
  classId?: string[];
  status?: CommonStatus[];
  startDateFrom?: string;
  endDateTo?: string;
  sortBy?: ClassSortField;
  sortDir?: SortDir;
  measure?: ClassAttentionMeasure;
}

export interface ClassSummaryResDto {
  classId: string;
  className: string;
  startDate: string;
  endDate: string;
  studentsCount: number;
  simsCount: number;
  reportsCount: number;
  status: CommonStatus;
}

// ─── GET /api/classes?lite=true (dropdown options) ───────────────────────────

export type ListClassesLiteReqDto = Pick<
  ListClassesReqDto,
  'page' | 'pageSize' | 'search' | 'schoolIds' | 'status' | 'sortBy' | 'sortDir'
>;

export type ClassLiteResDto = Pick<ClassSummaryResDto, 'classId' | 'className'>;

// ─── GET /api/classes/user/simulations-completed-graph ───────────────────────

/** Months the graph endpoint accepts for its `months` param. */
export type SimulationsCompletedGraphMonths =
  3 | 6 | 9 | 12 | 15 | 18 | 21 | 24 | 27 | 30 | 33 | 36;

/** The level Compare draws one series per selected item for. */
export type SimulationsCompletedGraphCompareBy = 'school' | 'class' | 'student';

export interface SimulationsCompletedGraphReqDto {
  studentIds?: string[];
  classIds?: string[];
  schoolIds?: string[];
  // Drill-down: that school's completions by class (`byClass`). Not sent with the
  // other filters or forClass.
  forSchool?: string;
  // Drill-down: that class's completions by student (`byStudent`). Not sent with the
  // other filters or forSchool.
  forClass?: string;
  months?: SimulationsCompletedGraphMonths;
  // When true, `months` is ignored and the full history is returned.
  allTime?: boolean;
  // Compare: one series per id in the list matching this level (max 15 on the BE).
  // Ignored when that list is empty; rejected with forSchool / forClass.
  compareBy?: SimulationsCompletedGraphCompareBy;
}

export interface SimulationsCompletedGraphMonthResDto {
  year: number;
  month: number; // 1–12
  count: number;
}

export interface SimulationsCompletedGraphSchoolResDto {
  schoolId: string | null; // null = the "unassigned" bucket
  count: number;
}

export interface SimulationsCompletedGraphClassResDto {
  classId: string;
  className: string;
  count: number;
}

export interface SimulationsCompletedGraphStudentResDto {
  studentId: string;
  studentCode: string | null;
  count: number;
}

export interface SimulationsCompletedGraphSeriesResDto {
  /** School, class or student id; null only for a class with no school. */
  seriesId: string | null;
  /** School name, class name or student code; null for a student with no code. */
  seriesName: string | null;
  count: number;
}

/** One month of a Compare response; `total` equals that month's `byMonth` count. */
export interface SimulationsCompletedGraphMonthSeriesResDto {
  year: number;
  month: number; // 1–12
  total: number;
  series: SimulationsCompletedGraphSeriesResDto[];
}

/**
 * Exactly one of bySchool (default) / byClass (forSchool) / byStudent (forClass) is set.
 * `byMonthSeries` is set only when Compare is active; months with no completions are left out.
 */
export interface SimulationsCompletedGraphResDto {
  byMonth: SimulationsCompletedGraphMonthResDto[];
  byMonthSeries?: SimulationsCompletedGraphMonthSeriesResDto[];
  bySchool?: SimulationsCompletedGraphSchoolResDto[];
  byClass?: SimulationsCompletedGraphClassResDto[];
  byStudent?: SimulationsCompletedGraphStudentResDto[];
}

// ─── POST /api/classes ────────────────────────────────────────────────────────

/** Student row accepted inline on class create (BE `CreateStudentDto`, snake_case). */
export interface CreateStudentDto {
  student_id?: string;
  class_id?: string;
  educator_id?: string;
  school_id?: string;
  status?: CommonStatus;
  score?: number;
  attempt?: number;
  sims_completed?: string;
  submission_date?: string;
  time_spent?: string;
  time_remaining?: string;
  student_name?: string;
  email?: string;
}

export interface CreateClassReqDto {
  className: string;
  /** YYYY-MM-DD */
  startDate: string;
  /** YYYY-MM-DD */
  endDate: string;
  schoolId?: string;
  term?: string;
  year?: string;
  status?: CommonStatus;
  totalNoOfStudents?: number;
  students?: CreateStudentDto[];
  /** LMS course ID (contextId) — used when creating from an LMS roster. */
  lmsCourseId?: string;
  /** NRPS URL for the LMS course — stored in the class mapping. */
  nrpsUrl?: string;
}

/** Class returned by create/update (BE `CreateClassResDto` / `UpdateClassResDto`). */
export interface ClassResDto {
  classId: string;
  className: string;
  educatorId?: string;
  schoolId?: string;
  term?: string;
  year?: string;
  status?: CommonStatus;
  totalNoOfStudents?: number;
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
}

// ─── PUT /api/classes/{id} ────────────────────────────────────────────────────

/** Every field is optional — only the fields sent are updated. */
export type UpdateClassReqDto = Partial<
  Pick<
    CreateClassReqDto,
    | 'className'
    | 'startDate'
    | 'endDate'
    | 'schoolId'
    | 'term'
    | 'year'
    | 'status'
  >
>;

export interface UpdateClassArgs {
  id: string;
  body: UpdateClassReqDto;
}

// ─── Response envelopes ───────────────────────────────────────────────────────

export interface CreateClassResponseDto {
  message: string;
  data: ClassResDto;
}

export interface UpdateClassResponseDto {
  message: string;
  data: ClassResDto;
}

export interface DeleteClassResponseDto {
  message: string;
  data: Record<string, never>;
}

export interface ActivityOverviewResponseDto {
  message: string;
  data: ActivityOverviewResDto;
}

export interface AttentionSummaryResponseDto {
  message: string;
  data: AttentionSummaryResDto;
}

export interface ListSchoolGroupsResponseDto {
  message: string;
  data: SchoolGroupResDto[];
  meta: PaginationMetaDto;
}

export interface ListClassesResponseDto {
  message: string;
  data: ClassSummaryResDto[];
  meta: PaginationMetaDto;
}

export interface ListClassesLiteResponseDto {
  message: string;
  data: ClassLiteResDto[];
  meta: PaginationMetaDto;
}

export interface SimulationsCompletedGraphResponseDto {
  message: string;
  data: SimulationsCompletedGraphResDto;
}
