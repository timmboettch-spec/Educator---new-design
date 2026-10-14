import { Injectable } from '@nestjs/common';

import { AiMessageRole } from '../../../common/constants';
import { AiNotConfiguredException } from '../../../common/exceptions/ai.exception';
import {
  type AiConceptEvaluation,
  type AiConceptResultItem,
  AiGateway,
} from '../../../common/interfaces';
import { LoggerService } from '../../../common/services';

// --- Communication evaluation constants ------------------------------------
/** Default pass/fail threshold (0-100) when not supplied by the caller. */
const DEFAULT_COMM_PASS_THRESHOLD = 50;
/** Score weight for a fully satisfied SBAR concept. */
const STATUS_SCORE_SATISFIED = 1;
/** Score weight for a partially satisfied SBAR concept. */
const STATUS_SCORE_PARTIAL = 0.5;
/** Score weight for an unsatisfied or contradicted SBAR concept. */
const STATUS_SCORE_UNSATISFIED = 0;
/** Multiplier to convert a 0–1 fraction to a 0–100 percentage score. */
const SCORE_PERCENTAGE_MULTIPLIER = 100;
/** Temperature for communication evaluation calls (0 = deterministic). */
const COMM_EVAL_TEMPERATURE = 0;

interface ConceptCheckpoint {
  id: string;
  description: string;
  type: string;
}

export interface FinalCommunicationResult {
  concept: string;
  status: string;
  evidence: string;
}

export interface FinalQuestionResult {
  concept: string;
  type: string;
  satisfied: boolean;
  evidence: string;
}

@Injectable()
export class CommunicationService {
  constructor(
    private readonly aiGateway: AiGateway,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Evaluates a clinical communication transcript (SBAR) against the 5 mandatory concepts
   * using OpenAI. Returns score, pass/fail, and per-concept evidence.
   */
  async evaluateCommunication(
    transcript: string,
    threshold?: number,
  ): Promise<{
    score: number;
    passed: boolean;
    flagged: boolean;
    results: FinalCommunicationResult[];
  }> {
    if (!transcript || transcript.trim() === '') {
      return { score: 0, passed: false, flagged: false, results: [] };
    }

    const REQUIRED_CONCEPTS = [
      { id: 'introduces_self', label: 'Introduces self' },
      { id: 'explains_situation', label: 'Explains situation' },
      { id: 'provides_background', label: 'Provides background' },
      { id: 'provides_assessment', label: 'Provides assessment' },
      { id: 'provides_recommendation', label: 'Provides recommendation' },
    ];

    if (!this.aiGateway.isConfigured()) {
      throw new AiNotConfiguredException();
    }

    const prompt = `
      Evaluate the following clinical communication transcript against these 5 mandatory concepts:
      1. introduces_self: Did the student state their name and role? (e.g. "I'm Jane, the nurse")
      2. explains_situation: Did the student explain the specific reason for the call?
      3. provides_background: Did the student provide relevant clinical history (e.g. medical history, medications, or events leading up)?
      4. provides_assessment: Did the student provide clinical findings or vitals (e.g. BP, HR, or physical findings)?
      5. provides_recommendation: Did the student provide a clear request for intervention or next steps?

      STRICT EVALUATION RULE:
      If a student only mentions the name of a concept (e.g. "I will now provide the background" or just saying "Situation") 
      WITHOUT actually providing the relevant clinical data or information, you MUST mark that concept as "not_satisfied". 
      "satisfied" requires actual clinical content (e.g. specific symptoms, history, vitals, or clear requests).

      Transcript: "${transcript}"

      Return a JSON object with a "results" array. Each object in the array MUST have:
      - concept: (one of the 5 IDs above: "introduces_self", "explains_situation", "provides_background", "provides_assessment", "provides_recommendation")
      - status: "satisfied", "partially_satisfied" (use ONLY if real clinical data is present but incomplete), "not_satisfied" (use for filler speech, category labels only, or missing info), or "contradicted"
      - evidence: a short quote from the transcript as proof

      STRICT JSON FORMAT ONLY. Do not include any other text.
    `;

    try {
      const parsed = await this.aiGateway.completeJson<AiConceptEvaluation>({
        caller: 'reports.communication-evaluation',
        messages: [
          {
            role: AiMessageRole.System,
            content:
              'You are a professional clinical communication assessor. Evaluate the transcript accurately and return only JSON.',
          },
          { role: AiMessageRole.User, content: prompt },
        ],
        temperature: COMM_EVAL_TEMPERATURE,
      });
      const results: AiConceptResultItem[] = parsed.results ?? [];

      const STATUS_SCORE: Record<string, number> = {
        satisfied: STATUS_SCORE_SATISFIED,
        partially_satisfied: STATUS_SCORE_PARTIAL,
        not_satisfied: STATUS_SCORE_UNSATISFIED,
        contradicted: STATUS_SCORE_UNSATISFIED,
      };

      const earned = results.reduce((sum: number, r: AiConceptResultItem) => {
        const statusStr = (r.status ?? '').toString().toLowerCase().trim();
        return sum + (STATUS_SCORE[statusStr] ?? 0);
      }, 0);

      const score = Math.round((earned / REQUIRED_CONCEPTS.length) * SCORE_PERCENTAGE_MULTIPLIER);
      const numThreshold = Number(threshold ?? DEFAULT_COMM_PASS_THRESHOLD);
      const passed = score >= numThreshold && score > 0;
      const flagged = results.some(
        (r: AiConceptResultItem) =>
          (r.status ?? '').toString().toLowerCase().trim() === 'contradicted',
      );

      this.logger.log(
        `[TeamComm] LLM Eval -> Earned: ${earned}/${REQUIRED_CONCEPTS.length}, Score: ${score}%, Threshold: ${numThreshold}%, Passed: ${passed}`,
      );
      this.logger.debug(
        `[TeamComm] Result statuses: ${results.map((r: AiConceptResultItem) => `${r.concept}=${r.status}`).join(', ')}`,
      );

      const finalResults: FinalCommunicationResult[] = REQUIRED_CONCEPTS.map((concept) => {
        const found = results.find((r: AiConceptResultItem) => r.concept === concept.id);
        return {
          concept: found?.concept ?? concept.id,
          status: found?.status ?? 'not_satisfied',
          evidence: found?.evidence ?? 'No evidence found in transcript.',
        };
      });

      this.logger.debug(`[TeamComm] finalResults count=${finalResults.length}`);

      return { score, passed, flagged, results: finalResults };
    } catch (error: unknown) {
      this.logger.error('[CommunicationService] LLM Communication Evaluation failed');
      const errorMessage =
        error instanceof Error
          ? error.message
          : error &&
              typeof error === 'object' &&
              'response' in error &&
              error.response &&
              typeof error.response === 'object' &&
              'data' in error.response
            ? JSON.stringify((error.response as Record<string, unknown>).data)
            : JSON.stringify(error);
      this.logger.error(`Error details: ${errorMessage}`);
      throw new Error('Failed to evaluate communication transcript', { cause: error });
    }
  }

  /**
   * Evaluates a student's free-text response against a list of concept checkpoints using OpenAI.
   * Returns per-concept satisfaction and an overall pass/fail score.
   */
  async evaluateQuestionResponse(
    responseText: string,
    concepts: ConceptCheckpoint[],
  ): Promise<{ score: number; passed: boolean; results: FinalQuestionResult[] }> {
    if (!responseText || responseText.trim() === '') {
      return { score: 0, passed: false, results: [] };
    }

    if (!concepts || concepts.length === 0) {
      return { score: 100, passed: true, results: [] };
    }

    if (!this.aiGateway.isConfigured()) {
      throw new AiNotConfiguredException();
    }

    const conceptDescriptions = concepts
      .map((c) => `${c.id}: ${c.description} (${c.type})`)
      .join('\n');

    const prompt = `
      Evaluate the following student response against these concept checkpoints:
      ${conceptDescriptions}

      Response: "${responseText}"

      Return a JSON object with a "results" array. Each object in the array MUST have:
      - conceptId: (the ID of the concept)
      - status: "satisfied" or "not_satisfied"
      - evidence: a short quote or explanation from the response as proof

      STRICT JSON FORMAT ONLY. Do not include any other text.
    `;

    try {
      const parsed = await this.aiGateway.completeJson<AiConceptEvaluation>({
        caller: 'reports.question-evaluation',
        messages: [
          {
            role: AiMessageRole.System,
            content:
              "You are a clinical educator evaluating a student's answer based on specific concepts. Be fair but accurate.",
          },
          { role: AiMessageRole.User, content: prompt },
        ],
        temperature: COMM_EVAL_TEMPERATURE,
      });
      const results: AiConceptResultItem[] = parsed.results ?? [];

      const finalResults: FinalQuestionResult[] = concepts.map((concept) => {
        const found = results.find((r: AiConceptResultItem) => r.conceptId === concept.id);
        const status = found ? found.status : 'not_satisfied';
        return {
          concept: concept.description,
          type: concept.type,
          satisfied: status === 'satisfied',
          evidence: found ? (found.evidence ?? '') : 'No evidence found in response.',
        };
      });

      const mandatoryConcepts = concepts.filter((c) => c.type === 'Mandatory');
      const satisfiedMandatory = finalResults.filter(
        (r) => r.type === 'Mandatory' && r.satisfied,
      ).length;

      const passed =
        mandatoryConcepts.length === 0 || satisfiedMandatory === mandatoryConcepts.length;

      const score = passed ? 100 : 0;

      return { score, passed, results: finalResults };
    } catch (error) {
      this.logger.error('[CommunicationService] LLM Question Evaluation failed', error);
      throw new Error('Failed to evaluate question response', { cause: error });
    }
  }
}
