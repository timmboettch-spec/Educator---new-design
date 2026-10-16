import { CommonStatus } from 'src/common/enums/status.enum';
import { BlobScenario } from 'src/common/types';
import type { SimulationReportRow } from 'src/common/interfaces';

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
  /**
   * Which avatar plays the patient, as chosen by the scenario designer, or
   * null when none is set.
   *
   * Returned so the student app streams the avatar the scenario was actually
   * saved with. Without it the frontend falls back to a hardcoded
   * scenario->avatar table, and a designer's choice silently has no effect —
   * they pick one avatar and the student sees another.
   */
  avatarId: string | null;
  StartDate: string | null;
  EndDate: string | null;
  DueDate: string | null;
  modes: ('Assessment' | 'Practice')[];
  /** Whether the student may Forfeit now: in progress, with 1..Max-1 Assessment Attempts used. */
  canForfeit: boolean;
  /** Assessment Attempts the student has used on this Simulation. */
  attemptCount: number;
  maxAttempts: number;
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
  /** e.g. "Post-Secondary Nursing"; the student app labels its edition (Secondary / Post-Secondary) from it. */
  learnerLevel?: string | null;
}

export type StudentSimulationResponse = BlobScenario & StudentSimulationSummary;

export interface StudentProfileResponse {
  simulations: StudentSimulationSummary[];
  reports: SimulationReportRow[];
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
