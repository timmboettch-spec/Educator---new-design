import type { Student } from '../../../types';
import type { SortDir } from '../classes/classes.types';
import { compact } from '../classes/classesService';
import type { ClassRosterInfiniteArg } from './studentsApi';
import {
  StudentCodeStatus,
  type StudentSortField,
  type StudentSummaryResDto,
} from './students.types';

/** Rows per roster page; the next page loads as the table scrolls. */
export const CLASS_ROSTER_PAGE_SIZE = 10;

/** Shown in a cell the BE has no value for. */
const EMPTY_CELL = '-';
const EMPTY_CODE = '---';

/** Args for one class's roster; no sort keeps the BE default (newest first). */
export const buildClassRosterInfiniteArg = (
  classId: string,
  sortBy?: StudentSortField,
  sortDir?: SortDir
): ClassRosterInfiniteArg =>
  compact({
    pageSize: CLASS_ROSTER_PAGE_SIZE,
    classIds: [classId],
    sortBy,
    sortDir: sortBy ? sortDir : undefined,
  });

const HMS_PATTERN = /^(\d+):([0-5]\d):([0-5]\d)$/;

/** BE `HH:MM:SS` (hours may exceed 24) as e.g. "2h 15m", "45m 10s" or "30s". */
export const formatDuration = (hms: string | null): string => {
  const match = hms?.trim().match(HMS_PATTERN);
  if (!match) return EMPTY_CELL;
  const [, h = 0, m = 0, s = 0] = match.map(Number);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

export const formatScore = (score: number | null): string =>
  score === null ? EMPTY_CELL : `${Math.round(score)}%`;

const STUDENT_STATUSES: ReadonlyArray<NonNullable<Student['status']>> = [
  'ACTIVE',
  'INACTIVE',
  'DRAFT',
  'ATTENTION',
  'ARCHIEVED',
];

const toStudentStatus = (status: string): Student['status'] =>
  STUDENT_STATUSES.find((value) => value === status);

/** The legacy student shape the row action modals take. */
export const mapStudentSummaryToStudent = (
  summary: StudentSummaryResDto
): Student => ({
  id: summary.id,
  student_id: summary.studentId || null,
  student_name: summary.name,
  email: summary.email,
  class_id: summary.classId ?? undefined,
  status: toStudentStatus(summary.status),
  score: summary.score,
  sims_completed: summary.simsCompleted,
  submission_date: summary.submissionDate,
  time_spent: summary.timeSpent,
  time_remaining: summary.timeRemaining,
});

/** One roster row: display values plus the student the row actions open. */
export interface ClassRosterRow {
  id: string;
  studentCode: string;
  /** Empty when the BE has no name (only Google Classroom names exist). */
  name: string;
  timeSpent: string;
  timeRemaining: string;
  simsCompleted: string;
  hasCompletedSims: boolean;
  avgScore: string;
  reportsCount: number;
  isCodeRevoked: boolean;
  student: Student;
}

export const mapStudentSummaryToRosterRow = (
  summary: StudentSummaryResDto
): ClassRosterRow => ({
  id: summary.id,
  studentCode: summary.studentId || EMPTY_CODE,
  name: summary.name?.trim() ?? '',
  timeSpent: formatDuration(summary.timeSpent),
  timeRemaining: formatDuration(summary.timeRemaining),
  simsCompleted: summary.simsCompleted ?? EMPTY_CELL,
  hasCompletedSims: Number(summary.simsCompleted) > 0,
  avgScore: formatScore(summary.score),
  reportsCount: summary.reportsCount,
  isCodeRevoked: summary.codeStatus === StudentCodeStatus.REVOKED,
  student: mapStudentSummaryToStudent(summary),
});
