import type {
  PaginationDto,
  PaginationMetaDto,
  SortDir,
} from '../classes/classes.types';

// ─── Enums ────────────────────────────────────────────────────────────────────

/** Columns `/api/students` can sort by (email is not sortable). */
export enum StudentSortField {
  STUDENT_CODE = 'studentCode',
  NAME = 'name',
  TIME_SPENT = 'timeSpent',
  TIME_REMAINING = 'timeRemaining',
  SIMS_COMPLETED = 'simsCompleted',
  SCORE = 'score',
  SUBMISSION_DATE = 'submissionDate',
  STATUS = 'status',
  IS_ACTIVE = 'isActive',
  REPORTS = 'reports',
  CODE_STATUS = 'codeStatus',
}

export enum StudentCodeStatus {
  ACTIVE = 'ACTIVE',
  REVOKED = 'REVOKED',
}

// ─── GET /api/students?lite=true (dropdown options) ──────────────────────────

export interface ListStudentsLiteReqDto extends PaginationDto {
  search?: string;
  classIds?: string[];
  schoolIds?: string[];
  // Omitted = both active and inactive students.
  isActive?: boolean;
}

export interface StudentLiteResDto {
  id: string;
  // Business/roster code shown to educators, e.g. 'STU-AB12'.
  studentId: string;
  name: string | null;
}

// ─── GET /api/students (full roster rows) ────────────────────────────────────

export interface ListStudentsReqDto extends ListStudentsLiteReqDto {
  // Omitted = the BE default, newest first.
  sortBy?: StudentSortField;
  sortDir?: SortDir;
}

export interface StudentSummaryResDto {
  id: string;
  // Business/roster code shown to educators, e.g. 'STU-AB12'.
  studentId: string;
  // Google Classroom name only.
  name: string | null;
  email: string | null;
  classId: string | null;
  schoolId: string | null;
  status:
    | 'ACTIVE'
    | 'INACTIVE'
    | 'PENDING'
    | 'DRAFT'
    | 'ARCHIVED'
    | 'ATTENTION'
    | 'ARCHIEVED';
  isActive: boolean;
  submissionDate: string | null;
  simsCompleted: string | null;
  score: number | null;
  // HH:MM:SS
  timeSpent: string | null;
  // HH:MM:SS
  timeRemaining: string | null;
  reportsCount: number;
  codeStatus: StudentCodeStatus;
}

// ─── Response envelopes ───────────────────────────────────────────────────────

export interface ListStudentsLiteResponseDto {
  message: string;
  data: StudentLiteResDto[];
  meta: PaginationMetaDto;
}

export interface ListStudentsResponseDto {
  message: string;
  data: StudentSummaryResDto[];
  meta: PaginationMetaDto;
}
