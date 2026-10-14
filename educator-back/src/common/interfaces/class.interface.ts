import type { ClassTransferAudit } from 'src/database/entities';
import { CommonStatus } from 'src/common/enums/status.enum';
import { ClassAttentionMeasure } from 'src/class/constants';
import {
  ClassTransferFailureReason,
  ClassTransferListSortField,
  ClassTransferTargetSortField,
} from 'src/common/constants/class.constants';

/** Filters accepted by `ClassRepository.findSchoolGroupsForEducator`. */
export interface SchoolGroupFilters {
  schoolName?: string;
  className?: string;
  classIds?: string[];
  schoolIds?: string[];
  includeUnassigned?: boolean;
  measure?: ClassAttentionMeasure;
  classStatuses?: CommonStatus[];
  classStartDateFrom?: string;
  classEndDateTo?: string;
}

/** Filters accepted by `ClassRepository.findClasses`. */
export interface ClassFilters {
  search?: string;
  classIds?: string[];
  statuses?: CommonStatus[];
  startDateFrom?: string;
  endDateTo?: string;
  endDateFrom?: string;
  schoolIds?: string[];
  includeUnassigned?: boolean;
  measure?: ClassAttentionMeasure;
}

/** One row returned by `ClassRepository.findSchoolGroupsForEducator`. */
export interface SchoolGroupRow {
  schoolId: string | null;
  schoolName: string | null;
  classCount: number;
}

/** One row returned by `ClassRepository.findClasses`. */
export interface ClassRow {
  id: string;
  className: string;
  startDate: string;
  endDate: string;
  status: CommonStatus;
  studentsCount: number;
  simsCount: number;
  reportsCount: number;
  unreadReportsCount: number;
}

/** One raw row selected by the lite branch of `ClassRepository.findClasses`. */
export interface ClassLiteRawRow {
  id: string;
  class_name: string;
  start_date: string;
  end_date: string;
  status: CommonStatus;
}

export interface ClassLiteRow {
  id: string;
  className: string;
  startDate: string;
  endDate: string;
  status: CommonStatus;
}

/** A page of rows plus the total matching count, computed independent of the page slice. */
export interface PaginatedRows<T> {
  rows: T[];
  total: number;
}

/** Filters accepted by `ClassRepository.findActiveClassByName` (duplicate-name check for create & update). */
export interface ClassDuplicateNameFilter {
  className: string;
  educatorId: string;
  term?: string;
  year?: string;
  schoolId?: string;
  excludeClassId?: string;
}

/** One student row of the per-class student-codes export (CSV or PDF). */
export interface ClassStudentCodesExportRow {
  id: string;
  /** Business/roster code (`Student.student_id` column) — not a foreign key. */
  studentId: string;
  name: string | null;
}

/** Class-level details shown above the student-codes table (CSV header block / PDF heading). */
export interface ClassStudentCodesExportMeta {
  className: string;
  schoolName: string;
  startDate: string;
  endDate: string;
}

/** Raw row read by `StudentRepository.iterateStudentCodesByClass` before mapping. */
export interface ClassStudentCodesExportRawRow {
  id: string;
  student_id: string;
  /** `created_at` as Postgres text, keeping microsecond precision for the keyset cursor. */
  created_at_cursor: string;
  name: string | null;
}

/** Keyset position (last row sent) for `StudentRepository.iterateStudentCodesByClass`. */
export interface ClassStudentCodesExportCursor {
  cursorCreatedAt: string;
  cursorId: string;
}

export interface TransferClassInput {
  classId: string;
  className: string;
  sourceEducatorId: string;
  sourceEducatorName: string;
  targetEducatorId: string;
  targetEducatorName: string;
  adminId: string;
  adminEmail: string | null;
}

export type TransferClassResult = ClassTransferAudit;

/** One bulk Class Transfer write: the legacy input plus the id grouping every row of the call. */
export interface IBatchClassTransferInput extends TransferClassInput {
  batchId: string;
}

/** The class columns a bulk Class Transfer validates, loaded once for the whole batch. */
export interface IClassTransferCandidate {
  id: string;
  className: string;
  educatorId: string | null;
  schoolId: string | null;
  googleCourseId: string | null;
  isActive: boolean | null;
  deletedAt: Date | null;
  status: CommonStatus;
}

/** A class a bulk Class Transfer did not move, recorded as a `FAILED` audit row. */
export interface IClassTransferFailureRecord {
  batchId: string;
  classId: string;
  className: string;
  sourceEducatorId: string;
  sourceEducatorName: string | null;
  targetEducatorId: string;
  targetEducatorName: string | null;
  adminId: string;
  adminEmail: string | null;
  reason: ClassTransferFailureReason;
}

/** Filters, sort and page for `ClassRepository.findTransferClassesForEducator`. */
export interface ITransferClassListQuery {
  search?: string;
  /** Educator-level: only classes that could be handed over at all (active ones). */
  transferableOnly?: boolean;
  sortBy?: ClassTransferListSortField;
  sortDir: 'ASC' | 'DESC';
  skip: number;
  take: number;
}

/** Raw row read by `ClassRepository.findTransferClassesForEducator` before mapping. */
export interface ITransferClassListRawRow {
  id: string;
  class_name: string;
  educator_id: string | null;
  school_id: string | null;
  school_name: string | null;
  google_course_id: string | null;
  is_active: boolean;
  status: CommonStatus;
  start_date: string;
  end_date: string;
  students_count: string;
}

/** One row of the Class Transfer class list, before transferability is evaluated. */
export interface ITransferClassListRow extends IClassTransferCandidate {
  status: CommonStatus;
  startDate: string;
  endDate: string;
  schoolName: string | null;
  studentsCount: number;
}

/** Filters, sort and page for `EducatorRepository.findTransferTargetsForDistrictAdmin`. */
export interface ITransferTargetListQuery {
  search?: string;
  sortBy?: ClassTransferTargetSortField;
  sortDir: 'ASC' | 'DESC';
  skip: number;
  take: number;
}

/** Raw row read by `EducatorRepository.findTransferTargetsForDistrictAdmin` before mapping. */
export interface ITransferTargetRawRow {
  id: string;
  full_name: string | null;
  email: string | null;
  schools_count: string;
}

/** One educator who can receive a Class Transfer. */
export interface ITransferTargetRow {
  id: string;
  fullName: string | null;
  email: string | null;
  schoolsCount: number;
}

/** The summary each educator gets once per bulk Class Transfer. */
export interface IClassesTransferredNotification {
  batchId: string;
  classIds: string[];
  classNames: string[];
  otherEducatorName: string;
  transferredAt: string;
}
