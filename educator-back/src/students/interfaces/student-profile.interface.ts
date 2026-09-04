import { CommonStatus } from 'src/common/enums/status.enum';
import { BlobScenario } from 'src/common/types';
import { SimulationReport } from 'src/simulation-reports/entity/simulation-report.entity';

export interface StudentSummary {
  id: string | undefined;
  student_id: string | undefined;
  status: CommonStatus | undefined;
  score: number | undefined;
  attempt: number | undefined;
  sims_completed: string | undefined;
  time_spent: string | undefined;
  time_remaining: string | undefined;
  submission_date: string | undefined;
}

export interface EducatorSummary {
  id: string;
  full_name: string | null;
}

export interface ClassSimulationSummary {
  id: string;
  simulation_id: string;
  start_date: string | undefined;
  due_date: string | undefined;
  end_date: string | undefined;
}

export interface StudentSimulationSummary {
  id: string;
  title: string;
  description: string;
  avatarEnabled: boolean;
  StartDate: string | null;
  EndDate: string | null;
  DueDate: string | null;
  modes: ('Assessment' | 'Practice')[];
  estimatedDuration: string | null;
  timeAllotment: string | null;
  learningObjectives?: string[];
  keyTopics?: string | null;
  briefing?: Record<string, unknown> | null;
  sbar?: Record<string, unknown> | null;
  requiredEquipment?: {
    additional: string | null;
    optional: string | null;
    setupNotes: string | null;
  };
  department?: string | null;
  productName?: string | null;
}

export type StudentSimulationResponse = BlobScenario & StudentSimulationSummary;

export interface StudentProfileResponse {
  simulations: StudentSimulationSummary[];
  reports: SimulationReport[];
}

export interface StudentLoginData {
  id: string | undefined;
  student_id: string | undefined;
  status: CommonStatus | undefined;
  class_id: string | undefined;
  class_name: string | undefined;
  type?: string;
  access_token?: string;
  token_type?: string;
}
