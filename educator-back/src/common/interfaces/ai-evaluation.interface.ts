/** JSON shapes the AI returns for report grading prompts (parsed via `AiGateway.completeJson`). */

export interface AiMatchVerdict {
  match?: boolean;
  confidence?: number;
  explanation?: string;
}

export interface AiMedicationRouteSiteVerdict {
  route?: AiMatchVerdict;
  site?: AiMatchVerdict;
}

export interface AiQuestionOccurrence {
  evidence?: string;
  messageIndex?: number;
}

/** Keyed by requirement ref. */
export interface AiQuestionMatchingEvaluation {
  evaluations?: Record<string, { occurrences?: AiQuestionOccurrence[] }>;
}

export interface AiConceptResultItem {
  concept?: string;
  conceptId?: string;
  status?: string;
  evidence?: string;
}

export interface AiConceptEvaluation {
  results?: AiConceptResultItem[];
}
