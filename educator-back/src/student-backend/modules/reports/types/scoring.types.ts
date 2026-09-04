// ─────────────────────────────────────────────────────────────────────────────
// Shared scoring types used across all modular report sub-services
// ─────────────────────────────────────────────────────────────────────────────

export type ChecklistItemStatus = 'Mandatory' | 'Optional' | 'Exclude';

export interface ChecklistItem {
  id: string;
  text: string;
  status?: ChecklistItemStatus;
  /** @deprecated Use status instead */
  mandatory?: boolean;
}

export interface ActionLogEntry {
  label: string;
  timestamp: string;
  type: string;
}

// ── PPE / Privacy ────────────────────────────────────────────────────────────

export interface PPEScoreResult {
  totalConfiguredItems: number;
  totalStandalonePPE: number;
  completedPPE: number;
  ppeScore: number;
  matchedItems: Array<{
    checklistText: string;
    matchedAction: string;
    status?: string;
    count?: number;
  }>;
  unmatchedItems: string[];
}

// ── Actions & Interventions ──────────────────────────────────────────────────

export interface DeterministicActionMarksResult {
  totalPoints: number;
  maxPossiblePoints: number;
  details: ActionDetail[];
  positiveActions: number;
  negativeActions: number;
  totalRequiredActions: number;
}

export interface ActionDetail {
  title: string;
  type: string;
  attemptsCount?: number;
  isOptional?: boolean;
  conceptEvaluations?: unknown[];
  response?: unknown;
  isCorrect: boolean;
  pointsAwarded: number;
  note?: string;
  firstAttemptCorrect?: boolean;
  anyAttemptCorrect?: boolean;
  /** For vital actions: number of distinct vital fields the student recorded */
  vitalsCompleted?: number;
  /** For vital actions: total number of distinct vital fields configured */
  vitalsTotal?: number;
}

export interface ActionFeedback {
  strengths: Array<{ point: string; example: string }>;
  weaknesses: Array<{ point: string; example: string }>;
}

export interface ScoreByCategoryResult {
  scoreByCategory: Record<string, unknown>;
  mandatoryActionDetails: ActionDetail[];
  optionalActionDetails: ActionDetail[];
  distractorActionDetails: ActionDetail[];
  actionSummary: {
    totalMandatory: number;
    completedMandatory: number;
    totalOptional: number;
    completedOptional: number;
    mandatoryPercentage: number | null;
  };
}

// ── Clinical Documentation ───────────────────────────────────────────────────

export interface DocumentationScoreResult {
  totalMandatory: number;
  passedMandatory: number;
  docScore: number;
  results: Array<{
    text: string;
    status: ChecklistItemStatus;
    passed: boolean;
    reason: string;
  }>;
}

// ── Vitals ───────────────────────────────────────────────────────────────────

export interface VitalsAnalysisResult {
  requiredVitals: unknown[];
  vitalsTaken: string[];
  vitalsMissing: string[];
  timingAnalysis: unknown[];
}

// ── Actions Analysis (from summary) ─────────────────────────────────────────

export interface ActionsAnalysisResult {
  expectedActions: string[];
  actionsTaken: string[];
  actionsMissing: string[];
  correctActions: string[];
}

// ── Medications Analysis ─────────────────────────────────────────────────────

export interface MedicationsAnalysisResult {
  requiredMedications: unknown[];
  medicationsGiven: string[];
  medicationsMissed: string[];
}
