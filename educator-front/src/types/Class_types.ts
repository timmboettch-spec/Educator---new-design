import { SimulationItem, SimulationReport } from '../types/index';

export interface Student {
  id?: string;
  student_id: string | null;
  student_name: string | null;
  email: string | null;
  class_id?: string;
  user_id?: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'DRAFT' | 'ATTENTION' | 'ARCHIEVED';
  score: number | null;
  attempt?: number | null;
  sims_completed?: string | null;
  submission_date?: string | null;
  time_spent?: string | null;
  time_remaining?: string | null;
}

export interface Class {
  id: string;
  class_name: string;
  school_id?: string;
  school_name?: string;
  year?: string;
  term?: string;
  status?: 'ACTIVE' | 'DRAFT' | 'INACTIVE' | 'ARCHIEVED' | 'ATTENTION';
  start_date?: string;
  end_date?: string;
  total_no_of_students?: number;
  lms_class_reference?: string;
  students?: Student[];
  sims?: SimulationItem[];
  reports?: SimulationReport[];
  reportCount?: number;
  unreadReportCount?: number;
  needsAttention?: boolean;
}

export type ClassWithStudents = Class;

export interface StudentRow {
  code: string;
  name: string;
  spend: string;
  simsCompleted: string;
  avgScore: string;
}

export interface SimRow {
  name: string;
  startDate: string;
  dueDate: string;
  closeDate: string;
  started: number;
  completed: number;
  avg: string;
  reports: number;
}

export interface ClassFormValues {
  school_id: string;
  class_name: string;
  status: 'ACTIVE' | 'DRAFT' | 'INACTIVE' | 'ARCHIEVED' | 'ATTENTION' | '';
  start_date: string;
  end_date: string;
  total_no_of_students: string;
}

export type FilterState = {
  className: string;
  status: string;
  /** Class names to include (multi-select); empty/undefined = all. */
  classNames?: string[];
  /** Effective statuses (UPPERCASE) to include (multi-select); empty = all. */
  statuses?: string[];
  /** School names to include (multi-select); empty/undefined = all schools. */
  schools?: string[];
  /** Only classes starting on/after this date (YYYY-MM-DD). */
  startDate?: string;
  /** Only classes ending on/before this date (YYYY-MM-DD). */
  endDate?: string;
};

export type ModalMode = 'create' | 'edit' | 'delete' | 'assign';

export type SubMenuState = {
  rowIdx: number;
  type: 'student' | 'sim';
} | null;

export const getSimStatus = (startDate: string, dueDate: string) => {
  const today = new Date();
  const start = new Date(startDate);
  const due = new Date(dueDate);

  if (start > today) return 'future';
  if (due < today) return 'past';
  return 'ongoing';
};

export const simStatusColor = (status: string) => {
  if (status === 'future') return 'text-green-600';
  if (status === 'past') return 'text-red-500';
  return 'text-primary-500';
};

export const getStatusLabel = (status?: string) => {
  if (status === 'ACTIVE') return 'Active';
  if (status === 'DRAFT') return 'Draft';
  if (status === 'INACTIVE') return 'Inactive';
  if (status === 'ARCHIEVED') return 'Archived';
  if (status === 'ATTENTION') return 'Needs Attention';
  return 'Archived';
};
