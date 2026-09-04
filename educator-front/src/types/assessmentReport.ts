/** Student-shaped report types (HS-online parity). */

export interface Scenario {
  id?: string;
  title?: string;
  simulationStartTime?: string;
  teamCommunication?: {
    prompt?: string;
    typeRequirement?: string;
  };
  grading?: {
    rubric?: Array<{ id: string; weight: number; subCategory: string }>;
  };
  orders?: Array<{
    title?: string;
    category?: string;
    medicationConfig?: { gradingConfig?: { enabled?: boolean } };
  }>;
  [key: string]: unknown;
}

export interface ConversationMessage {
  id?: string;
  speaker?: string;
  text?: string;
  message?: string;
  timestamp?: string;
  timestampValue?: number;
  elapsedTime?: string;
  elapsedSeconds?: number;
  duration?: number;
  [key: string]: unknown;
}

export interface AssessmentReport {
  id: string;
  userId?: string;
  key?: string;
  mode?: 'Practice' | 'Assessment';
  studentName?: string;
  studentClass?: string;
  scenarioId?: string;
  scenarioTitle?: string;
  transcriptId?: string;
  score?: number;
  scoreJson?: Record<string, unknown>;
  summary?: string;
  strengths?: string[];
  improvements?: string[];
  feedback?: string;
  summaryByCategory?: Record<string, unknown>;
  commonActionTracker?: { actionLog?: unknown[] };
  createdAt?: string;
  scenario?: Scenario;
  scenarioStartTime?: string;
  scenarioEndTime?: string;
  totalTimeSeconds?: number;
  [key: string]: unknown;
}
