export interface BaseEntity {
  status: string;
}

export interface ClassItem extends BaseEntity {
  id: string;
}
export type SchoolItem = BaseEntity;
export type Educator = BaseEntity;

export interface Student extends BaseEntity {
  id?: string;
  created_at: string;
}

export interface Simulation {
  start_date: string;
  class_id: string;
}

export interface DashboardApiData {
  schools?: {
    total?: number;
    data?: SchoolItem[];
  };
  classes?: {
    total?: number;
    data?: ClassItem[];
  };
  students?: {
    total?: number;
    data?: Student[];
  };
  educators?: {
    total?: number;
    data?: Educator[];
  };
  classSimulations?: {
    data?: Simulation[];
  };
}

export interface DashboardOverview {
  activeSchools: number;
  totalSchools: number;
  activeClasses: number;
  totalClasses: number;
  classesWithSimsThisWeek: number;
  activeSimulationAssignments?: number;
  studentsActive: number;
  studentsActiveLast30Days: number;
  totalStudents: number;
  activeEducators: number;
  totalEducators: number;
  inactiveSchools?: number;
  pendingEducators?: number;
  inactiveEducators?: number;
  // Active schools that have at least one associated educator.
  schoolsWithEducators?: number;
  studentIds: string[];
}
