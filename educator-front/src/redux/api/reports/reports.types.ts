import type {
  PaginationDto,
  PaginationMetaDto,
} from '../classes/classes.types';

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum ReportReviewStatus {
  UNREAD = 'unread',
  READ = 'read',
}

export enum ReportSortField {
  STUDENT_CODE = 'studentCode',
  STUDENT_NAME = 'studentName',
  MODE = 'mode',
  SIMULATION_NAME = 'simulationName',
  SCORE = 'score',
  TIME_SPENT = 'timeSpent',
  COMPLETED_AT = 'completedAt',
}

// What `ids` in a bulk review refer to.
export enum SimulationReportSelectorType {
  REPORT = 'report',
  STUDENT = 'student',
  SIMULATION = 'simulation',
  CLASS = 'class',
}

// Uppercase on this endpoint, unlike the classes `SortDir`.
export type ReportSortDirection = 'ASC' | 'DESC';

// ─── GET /api/simulation-reports/list ─────────────────────────────────────────

export interface ListReportsReqDto extends PaginationDto {
  studentIds?: string[];
  classIds?: string[];
  schoolIds?: string[];
  simulationIds?: string[];
  reviewStatus?: ReportReviewStatus;
  sortBy?: ReportSortField;
  sortDirection?: ReportSortDirection;
}

export interface ReportListItemResDto {
  reportId: string;
  studentCode: string;
  mode: string;
  simulationName: string;
  score: number;
  performanceQuality: string;
  // "HH:MM:SS"
  timeSpent: string;
  completedAt: string;
  transcriptId: string | null;
  // Null until an educator opens the report.
  viewedAt: string | null;
  viewedBy: string | null;
}

// ─── PATCH /api/simulation-reports/bulk-review ────────────────────────────────

export interface BulkReviewReportsReqDto {
  type: SimulationReportSelectorType;
  // Report, student, simulation (scenario) or class ids, per `type`.
  ids: string[];
  // true = mark reviewed, false = mark unreviewed.
  reviewed: boolean;
}

export interface BulkReviewReportsResDto {
  updatedIds: string[];
  // Requested ids that didn't resolve to a report the educator owns or co-instructs.
  notAccessibleIds: string[];
}

// ─── Response envelopes ───────────────────────────────────────────────────────

export interface ListReportsResponseDto {
  message: string;
  data: ReportListItemResDto[];
  meta: PaginationMetaDto;
}

export interface BulkReviewReportsResponseDto {
  message: string;
  data: BulkReviewReportsResDto;
}
