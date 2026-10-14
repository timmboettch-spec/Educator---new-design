import { CommonStatus } from 'src/common/enums/status.enum';
import type { StudentCodeStatus, StudentSortField } from 'src/students/students.constants';

export interface StudentFilters {
  search?: string;
  classIds?: string[];
  schoolIds?: string[];
  isActive?: boolean;
}

export interface StudentSortOptions {
  field?: StudentSortField;
  dir: 'ASC' | 'DESC';
}

export interface StudentLiteRow {
  id: string;
  /** Business/roster code (`Student.student_id` column) — not a foreign key. */
  studentId: string;
  name: string | null;
}

export interface StudentRow extends StudentLiteRow {
  email: string | null;
  classId: string | null;
  schoolId: string | null;
  status: CommonStatus;
  isActive: boolean;
  submissionDate: string | null;
  simsCompleted: string | null;
  score: number | null;
  timeSpent: string | null;
  timeRemaining: string | null;
  reportsCount: number;
  codeStatus: StudentCodeStatus;
}
