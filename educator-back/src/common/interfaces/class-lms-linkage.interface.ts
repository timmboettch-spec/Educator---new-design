import { LmsType } from 'src/common/enums/lms.enum';

export type ClassLinkageProvider = LmsType | 'lms';

export interface ClassLinkageCourse {
  id: string;
  name: string | null;
  url: string | null;
}

export interface ClassLinkageAssignment {
  simulationId: string;
  label: string | null;
  url: string | null;
}

export interface ClassLmsLinkage {
  provider: ClassLinkageProvider | null;
  course: ClassLinkageCourse | null;
  assignments: ClassLinkageAssignment[];
}

export interface ClassLmsLinkageSummary {
  provider: ClassLinkageProvider;
  courseId: string;
  courseName: string | null;
}
