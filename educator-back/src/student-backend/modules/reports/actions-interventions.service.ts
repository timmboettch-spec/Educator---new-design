import { Injectable } from '@nestjs/common';

import { AiGateway } from '../../../common/interfaces';
import { LoggerService } from '../../../common/services';

// --- Action evaluation constants -------------------------------------------
/** Cosine/word-overlap similarity threshold above which a response is auto-passed. */
const QUESTION_SIMILARITY_PASS_THRESHOLD = 0.8;
/** Keyword overlap ratio threshold used in the OpenAI-unavailable fallback. */
const KEYWORD_FALLBACK_PASS_THRESHOLD = 0.5;
/** Minimum word length (chars) kept when building the fallback keyword set. */
const KEYWORD_MIN_WORD_LENGTH = 3;
/** Minimum word length (chars) required for partial-stem matching in fallback. */
const KEYWORD_STEM_MATCH_MIN_LENGTH = 4;
/** Temperature for the action-grading LLM call (low = deterministic). */
const ACTION_GRADING_TEMPERATURE = 0.1;
/** Maximum tokens the grading LLM is allowed to return (only "true"/"false"). */
const ACTION_GRADING_MAX_TOKENS = 5;

import {
  type DeterministicActionMarksResult,
  type ActionDetail,
  type ActionFeedback,
  type ScoreByCategoryResult,
  type ActionsAnalysisResult,
} from './types/scoring.types';

// ── Local input shapes for loosely-typed JSON data ────────────────────────────
interface NamedItemLike {
  name?: string;
  title?: string;
  label?: string;
  id?: string;
}

interface StudentSummaryActionItem {
  name?: string;
  title?: string;
  vitals?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface StudentSummaryLike {
  actions?: StudentSummaryActionItem[];
  medications?: StudentSummaryActionItem[];
}

interface ExpectedActionsLike {
  [category: string]: NamedItemLike[] | undefined;
}

export interface ScenarioActionDef {
  title?: string;
  type?: string;
  isDistractor?: boolean;
  isOptional?: boolean;
  isExcluded?: boolean;
  typeRequirement?: string;
  correct?: string | string[];
  items?: string[];
  concepts?: Array<{ id: string; description: string; type: string }>;
  idealResponse?: string;
  prompt?: string;
  vitals?: Record<string, string[]>;
  vitalRequirements?: Record<string, 'Mandatory' | 'Optional'>;
  vitalRequirementEntries?: Record<string, Array<'Mandatory' | 'Optional'>>;
}

export interface ActionAttempt {
  title?: string;
  status?: string;
  grading?: boolean | number | string;
  score?: number;
  response?: unknown;
  Response?: unknown;
  selectedItem?: unknown;
  SelectedItem?: unknown;
  currentItems?: unknown;
  vitals?: Record<string, unknown>;
  conceptEvaluations?: unknown[];
}

export interface SummaryByCategoryLike {
  actions?: ActionAttempt[];
  medications?: unknown[];
}

const getMandatoryVitalCount = (
  action: Pick<ScenarioActionDef, 'vitalRequirements' | 'vitalRequirementEntries'>,
  field: string,
  expectedCount: number,
): number => {
  const entries = action.vitalRequirementEntries?.[field];
  if (Array.isArray(entries) && entries.length > 0) {
    return entries.slice(0, expectedCount).filter((entry) => entry?.toLowerCase() !== 'optional')
      .length;
  }

  return action.vitalRequirements?.[field]?.toLowerCase() === 'optional' ? 0 : expectedCount;
};

interface RubricItemLike {
  name?: string;
  subCategory?: string;
  weight?: number;
}

interface ScenarioForScoring {
  grading?: { rubric?: RubricItemLike[] };
}

@Injectable()
export class ActionsInterventionsService {
  constructor(
    private readonly aiGateway: AiGateway,
    private readonly logger: LoggerService,
  ) { }

  /**
   * Deterministic actions analysis based on student summary vs expected actions.
   * Compares student actions/medications against rubric-configured and unit actions.
   */
  computeActionsAnalysisFromSummary(
    studentSummary: StudentSummaryLike | null | undefined,
    expectedActions: ExpectedActionsLike | undefined,
    expectedActionsList: NamedItemLike[] | undefined,
    unitActions: NamedItemLike[] | undefined,
  ): ActionsAnalysisResult & { incorrectActions: string[] } {
    const normalizeName = (item: NamedItemLike | string | undefined): string => {
      if (!item) {
        return '';
      }
      if (typeof item === 'string') {
        return item;
      }
      return item.name ?? item.title ?? item.label ?? item.id ?? '';
    };

    const studentActionsRaw: StudentSummaryActionItem[] = [
      ...(Array.isArray(studentSummary?.actions) ? studentSummary.actions : []),
      // Medications are evaluated separately in the Medications rubric and
      // must not be merged into the Actions & Interventions stream.
    ];

    const studentActionNames: string[] = studentActionsRaw.map((a) =>
      String(a?.title ?? a?.name ?? '').toLowerCase(),
    );

    const expectedNamesSet = new Set<string>();

    if (Array.isArray(expectedActionsList)) {
      expectedActionsList.forEach((item: NamedItemLike) => {
        const n = normalizeName(item).toLowerCase();
        if (n) {
          expectedNamesSet.add(n);
        }
      });
    }

    if (expectedActions && typeof expectedActions === 'object') {
      Object.values(expectedActions).forEach((val) => {
        if (Array.isArray(val)) {
          val.forEach((item: NamedItemLike) => {
            const n = normalizeName(item).toLowerCase();
            if (n) {
              expectedNamesSet.add(n);
            }
          });
        }
      });
    }

    const correctNamesSet = new Set<string>();
    if (Array.isArray(unitActions)) {
      unitActions.forEach((item: NamedItemLike) => {
        const n = normalizeName(item).toLowerCase();
        if (n) {
          correctNamesSet.add(n);
        }
      });
    }

    const actionsTaken: string[] = [];
    const actionsMissing: string[] = [];
    const correctActions: string[] = [];
    const incorrectActions: string[] = [];

    expectedNamesSet.forEach((exp) => {
      const matched = studentActionNames.some((sa) => sa && (sa.includes(exp) || exp.includes(sa)));
      if (matched) {
        actionsTaken.push(exp);
      } else {
        actionsMissing.push(exp);
      }
    });

    studentActionNames.forEach((sa) => {
      if (!sa) {
        return;
      }
      const isCorrect = Array.from(correctNamesSet).some(
        (c) => c && (sa.includes(c) || c.includes(sa)),
      );
      if (isCorrect) {
        correctActions.push(sa);
      } else {
        incorrectActions.push(sa);
      }
    });

    return {
      expectedActions: Array.from(expectedNamesSet),
      actionsTaken,
      actionsMissing,
      correctActions,
      incorrectActions,
    };
  }

  /**
   * Calculates deterministic marks for every scenario action.
   * - Result Pick: +1 if correct, 0 if incorrect
   * - Drag & Drop (ordering): +1 if order matches exactly
   * - Question & Response: Similarity check / AI fallback
   * - Vital: Expected vs taken vital count match
   * - Distractor: tracked but excluded from score denominator
   * - "Best Attempt Wins": If any attempt is correct, the action is marked as completed (applies to both Assessment and Practice modes)
   */
  async computeDeterministicActionMarks(
    actionsTimeline: ActionAttempt[],
    scenarioActions: ScenarioActionDef[],
    _mode: 'Practice' | 'Assessment' = 'Assessment',
    summaryByCategory?: SummaryByCategoryLike,
  ): Promise<DeterministicActionMarksResult> {
    let positiveActions = 0;
    let negativeActions = 0;
    let totalRequiredActions = 0;
    const details: ActionDetail[] = [];

    // DEBUG: Log incoming scenario actions to verify typeRequirement field
    this.logger.debug('=== SCENARIO ACTIONS DEBUG ===');
    scenarioActions.forEach((action, idx) => {
      this.logger.debug(
        `Action ${idx}: title="${action.title}", isOptional=${action.isOptional}, typeRequirement="${action.typeRequirement}"`,
      );
    });
    this.logger.debug('=== END SCENARIO ACTIONS DEBUG ===');

    const attemptsByAction: Record<string, ActionAttempt[]> = {};
    (actionsTimeline || []).forEach((entry) => {
      if (!entry.title) {
        return;
      }
      const normalizedTitle = entry.title.trim().toLowerCase();
      if (!attemptsByAction[normalizedTitle]) {
        attemptsByAction[normalizedTitle] = [];
      }
      attemptsByAction[normalizedTitle].push(entry);
    });

    for (const actionDef of scenarioActions || []) {
      const normalizedTitle = (actionDef.title ?? '').trim().toLowerCase();
      let attempts = attemptsByAction[normalizedTitle] ?? [];

      if (actionDef.type === 'vital') {
        const summaryActions = summaryByCategory?.actions ?? [];
        const vitalAttempts = summaryActions.filter((entry: ActionAttempt) => {
          const entryTitle = (entry.title ?? '').trim().toLowerCase();
          return entryTitle === normalizedTitle && entry.vitals;
        });
        if (vitalAttempts.length > 0) {
          attempts = vitalAttempts;
        }
        this.logger.debug(
          `Vital action "${actionDef.title}" - Found ${attempts.length} attempt(s) with vitals data from summaryByCategory.actions`,
        );
      }

      const isDistractor =
        actionDef.isDistractor === true ||
        actionDef.typeRequirement?.toLowerCase() === 'distractor' ||
        // Fallback: if isExcluded but no explicit typeRequirement, treat as distractor (for backwards compatibility)
        (actionDef.isExcluded === true && !actionDef.typeRequirement);

      if (isDistractor) {
        if (attempts.length > 0) {
          negativeActions += 1;

          // Evaluate whether the distractor action was performed correctly,
          // same as mandatory/optional actions. For vital-type distractors,
          // any attempt found counts as correctly performed.
          let distractorIsCorrect = false;
          if (actionDef.type === 'vital') {
            distractorIsCorrect = true; // attempt exists = vitals were taken
          } else {
            for (const attempt of attempts) {
              const correct = await this.evaluateActionAttempt(attempt, actionDef);
              if (correct) {
                distractorIsCorrect = true;
                break;
              }
            }
          }

          details.push({
            title: actionDef.title ?? '',
            type: 'distractor',
            isCorrect: distractorIsCorrect,
            attemptsCount: attempts.length,
            pointsAwarded: 0,
            note: 'Distractor selected',
          });
        }
        continue;
      }

      const isOptional =
        actionDef.isOptional === true || actionDef.typeRequirement?.toLowerCase() === 'optional';

      // DEBUG: Log optional detection
      this.logger.debug(
        `Action "${actionDef.title}": isOptional field=${actionDef.isOptional}, typeRequirement="${actionDef.typeRequirement}", computed isOptional=${isOptional}`,
      );

      if (!isOptional) {
        totalRequiredActions += 1;
      }

      let isActionCorrect: boolean;
      let awardedPoints: number;
      const detailEntry: ActionDetail = {
        title: actionDef.title ?? '',
        type: actionDef.type ?? 'single',
        attemptsCount: attempts.length,
        isOptional,
        conceptEvaluations: attempts[0]?.conceptEvaluations,
        response: attempts[0]?.response ?? attempts[0]?.selectedItem,
        isCorrect: false,
        pointsAwarded: 0,
      };

      if (attempts.length === 0) {
        isActionCorrect = false;
        awardedPoints = 0;
        this.logger.debug(
          `Action "${actionDef.title}" (type: ${actionDef.type}) - No attempts found`,
        );
      } else {
        this.logger.debug(
          `Action "${actionDef.title}" (type: ${actionDef.type}) - Found ${attempts.length} attempt(s)`,
        );
        if (actionDef.type === 'vital' && attempts.length > 0) {
          this.logger.debug(`Vital attempt object: ${JSON.stringify(attempts[0], null, 2)}`);
        }

        // Optional vital actions: the existence of any attempt is sufficient proof.
        // evaluateActionAttempt requires a vitals object on the attempt, but the
        // actionsTimeline fallback only carries a response string — causing a false
        // negative. For optional actions, attempting the action is the only criterion.
        if (isOptional && actionDef.type === 'vital') {
          isActionCorrect = true;
          detailEntry.firstAttemptCorrect = true;
          detailEntry.anyAttemptCorrect = true;
          awardedPoints = 0; // optional actions never contribute to mandatory score

          // Track how many vital fields were configured vs how many the student recorded.
          // The frontend uses this to decide whether to show the action in "Optional Actions Completed".
          const configuredVitalFields = Object.keys(actionDef.vitals ?? {}).length;
          const takenVitals: Record<string, unknown> = attempts[0]?.vitals ?? {};
          const fieldMap: Record<string, string[]> = {
            heartRate: ['heartRate', 'hr', 'pulse'],
            bloodPressure: ['bloodPressure', 'bp'],
            respiratoryRate: ['respiratoryRate', 'rr', 'respiration'],
            temperature: ['temperature', 'temp'],
            spO2: ['spO2', 'spo2', 'o2'],
            weight: ['weight'],
            height: ['height'],
          };
          const recordedFieldsCount = Object.keys(actionDef.vitals ?? {}).filter((field) => {
            const candidates = fieldMap[field] ?? [field];
            return candidates.some((key) => {
              const val = takenVitals[key];
              if (Array.isArray(val)) {
                return val.length > 0;
              }
              if (typeof val === 'string') {
                return val.trim() !== '';
              }
              return val !== undefined && val !== null;
            });
          }).length;
          detailEntry.vitalsCompleted = recordedFieldsCount;
          detailEntry.vitalsTotal = configuredVitalFields;

          this.logger.debug(
            `Action "${actionDef.title}" - Optional vital: attempt found, marking as CORRECT (vitalsCompleted=${recordedFieldsCount}/${configuredVitalFields})`,
          );
        } else {
          // Track first attempt separately for reporting purposes
          const firstAttempt = attempts[0];
          const firstCorrect = await this.evaluateActionAttempt(firstAttempt, actionDef);
          detailEntry.firstAttemptCorrect = firstCorrect;

          // Apply "best attempt wins" logic for both Assessment and Practice modes
          // If the learner gets it correct even once, the action is marked as completed
          isActionCorrect = false;
          for (const attempt of attempts) {
            const correct = await this.evaluateActionAttempt(attempt, actionDef);
            if (correct) {
              isActionCorrect = true;
              break;
            }
          }
          detailEntry.anyAttemptCorrect = isActionCorrect;

          awardedPoints = !isOptional && isActionCorrect ? 1 : 0;
        }
      }

      if (isActionCorrect && !isOptional) {
        positiveActions += 1;
        this.logger.debug(
          `Action "${actionDef.title}" - Counted as positive (mandatory and correct)`,
        );
      } else if (isActionCorrect && isOptional) {
        this.logger.debug(
          `Action "${actionDef.title}" - Correct but optional (not counted in score)`,
        );
      } else if (!isActionCorrect && !isOptional) {
        this.logger.debug(`Action "${actionDef.title}" - Incorrect/missed mandatory action`);
      }

      details.push({
        ...detailEntry,
        isCorrect: isActionCorrect,
        pointsAwarded: awardedPoints,
      });
    }

    // Medications are scored independently in the Medications rubric on the
    // frontend (synthesized from medicationGradingResults) and intentionally
    // excluded from the Actions & Interventions rubric to avoid double counting.

    return {
      totalPoints: positiveActions,
      maxPossiblePoints: totalRequiredActions,
      details,
      positiveActions,
      negativeActions,
      totalRequiredActions,
    };
  }

  async evaluateActionAttempt(
    attempt: ActionAttempt,
    actionDef: ScenarioActionDef,
  ): Promise<boolean> {
    // For vital-type actions the `grading` field stored on the attempt is not a
    // reliable correctness signal — it is always persisted as `false` regardless
    // of whether the student recorded the required vitals.  Skip the grading/status
    // shortcut for vitals and fall through to the dedicated vital evaluation logic.
    const isVitalType = actionDef.type === 'vital' || actionDef.type === 'vital-signs';

    if (!isVitalType) {
      if (
        attempt.status === 'passed' ||
        attempt.grading === true ||
        attempt.grading === 1 ||
        attempt.grading === '1'
      ) {
        return true;
      }
      if (
        attempt.status === 'failed' ||
        attempt.grading === false ||
        attempt.grading === 0 ||
        attempt.grading === '0'
      ) {
        return false;
      }
    }

    if (typeof attempt.score === 'number') {
      return attempt.score >= 80;
    }

    const type =
      actionDef.type ??
      (Array.isArray(actionDef.items) && actionDef.items.length > 1 ? 'ordering' : 'single');

    if (type === 'ordering') {
      const expectedArray: string[] =
        Array.isArray(actionDef.correct) && actionDef.correct.length > 0
          ? actionDef.correct
          : (actionDef.items ?? []);
      const expectedOrder = expectedArray.map((s: string) => (s ?? '').trim().toLowerCase());

      let studentOrder: unknown = attempt.currentItems ?? attempt.selectedItem ?? attempt.response;

      if (typeof studentOrder === 'string' && studentOrder.startsWith('[')) {
        try {
          studentOrder = JSON.parse(studentOrder) as unknown;
        } catch {
          // ignore JSON parse errors and fall through to string-handling below
        }
      }

      if (Array.isArray(studentOrder)) {
        const studentNormalized = studentOrder.map((s: unknown) =>
          typeof s === 'string'
            ? s.trim().toLowerCase()
            : typeof s === 'number'
              ? String(s).trim().toLowerCase()
              : '',
        );
        return JSON.stringify(studentNormalized) === JSON.stringify(expectedOrder);
      } else if (typeof studentOrder === 'string' && studentOrder !== 'Completed') {
        const studentArray = studentOrder.split(',').map((s) => s.trim().toLowerCase());
        return JSON.stringify(studentArray) === JSON.stringify(expectedOrder);
      }
      return false;
    } else if (type === 'question') {
      const correctStr =
        typeof actionDef.correct === 'string'
          ? actionDef.correct
          : Array.isArray(actionDef.correct)
            ? actionDef.correct.join(' ')
            : '';
      const ideal = (actionDef.idealResponse ?? correctStr ?? actionDef.prompt ?? '')
        .toLowerCase()
        .trim();

      const rawVal =
        attempt.response ?? attempt.Response ?? attempt.selectedItem ?? attempt.SelectedItem ?? '';
      const studentRaw =
        typeof rawVal === 'string' ? rawVal : typeof rawVal === 'number' ? String(rawVal) : '';
      const student = studentRaw.toLowerCase().trim();

      if (!ideal || !student || student === 'completed') {
        return false;
      }

      if (student === ideal || student.includes(ideal)) {
        return true;
      }

      const similarity = this.calculateSimilarity(student, ideal);
      if (similarity >= QUESTION_SIMILARITY_PASS_THRESHOLD) {
        return true;
      }

      try {
        if (!this.aiGateway.isConfigured()) {
          return this.keywordFallback(ideal, student);
        }

        const prompt = `You are a strict nursing grading assistant. Evaluate if the student's response correctly answers the expected ("ideal") response. They do not need to use the exact words, but the core medical/clinical meaning must be correct and present. 
        
Ideal Response: "${ideal}"
Student Response: "${student}"

Respond ONLY with "true" if the student's response is correct, or "false" if it is incorrect. Do not provide any other text.`;

        const aiResult = await this.aiGateway.complete({
          caller: 'reports.action-grading',
          messages: prompt,
          temperature: ACTION_GRADING_TEMPERATURE,
          maxTokens: ACTION_GRADING_MAX_TOKENS,
        });
        return aiResult.toLowerCase() === 'true';
      } catch (error) {
        this.logger.error('Error evaluating action response with AI', error);
        return this.keywordFallback(ideal, student);
      }
    } else if (type === 'vital') {
      const expectedVitals: Record<string, string[]> = actionDef.vitals ?? {};
      const takenVitals: Record<string, unknown> = attempt.vitals ?? {};

      // For optional vital signs actions, if ANY vitals were recorded, consider it correct
      const isOptional =
        actionDef.isOptional === true || actionDef.typeRequirement?.toLowerCase() === 'optional';
      const takenVitalsCount = Object.keys(takenVitals).length;

      this.logger.debug(
        `[VITAL CHECK] Action: "${actionDef.title}" | isOptional: ${isOptional} | takenVitalsCount: ${takenVitalsCount} | takenVitals keys: ${JSON.stringify(Object.keys(takenVitals))}`,
      );

      const hasResponse = (v: unknown): boolean =>
        typeof v === 'string' ? v.trim() !== '' : typeof v === 'number' ? true : false;

      if (
        isOptional &&
        (takenVitalsCount > 0 ||
          hasResponse(attempt.response) ||
          hasResponse(attempt.Response) ||
          hasResponse(attempt.selectedItem) ||
          hasResponse(attempt.SelectedItem))
      ) {
        this.logger.debug(
          `[VITAL CHECK] ✓ Optional vital action "${actionDef.title}": Vitals recorded or response present, marking as CORRECT`,
        );
        return true;
      } else if (isOptional) {
        this.logger.debug(
          `[VITAL CHECK] ✗ Optional vital action "${actionDef.title}": No vitals recorded and no response, marking as INCORRECT`,
        );
      }

      const fieldMap: Record<string, string[]> = {
        heartRate: ['heartRate', 'hr', 'pulse'],
        bloodPressure: ['bloodPressure', 'bp'],
        respiratoryRate: ['respiratoryRate', 'rr', 'respiration'],
        temperature: ['temperature', 'temp'],
        spO2: ['spO2', 'spo2', 'o2'],
        weight: ['weight'],
        height: ['height'],
      };

      const getTakenCount = (vitals: Record<string, unknown>, field: string): number => {
        const candidates = fieldMap[field] ?? [field];
        for (const key of candidates) {
          const value = vitals[key];
          if (Array.isArray(value)) {
            return value.length;
          }
          if (value && typeof value === 'object') {
            return Object.keys(value).length;
          }
          if (typeof value === 'string' && value.trim() !== '') {
            return 1;
          }
          if (typeof value === 'number') {
            return 1;
          }
        }
        return 0;
      };

      this.logger.debug(
        `Evaluating vital action "${actionDef.title}": ${JSON.stringify({ expectedVitals, takenVitals })}`,
      );

      let allMatch = true;
      for (const field in expectedVitals) {
        const expectedCount = (expectedVitals[field] ?? []).filter(
          (v: string) => v?.trim?.() !== '',
        ).length;
        const requiredCount = getMandatoryVitalCount(actionDef, field, expectedCount);

        // Mirror generateVitalActionFeedback: only check mismatch when
        // the scenario actually expects this vital (expectedCount > 0)
        if (expectedCount === 0 || requiredCount === 0) {
          continue;
        }

        const takenCount = getTakenCount(takenVitals, field);
        this.logger.debug(
          `  ${field}: required ${requiredCount}, expected ${expectedCount}, taken ${takenCount}`,
        );

        if (takenCount < requiredCount) {
          allMatch = false;
          break;
        }
      }
      this.logger.debug(`  Result: ${allMatch ? 'CORRECT' : 'INCORRECT'}`);
      return allMatch;
    } else {
      const correctStr =
        typeof actionDef.correct === 'string'
          ? actionDef.correct
          : Array.isArray(actionDef.correct)
            ? actionDef.correct.join(' ')
            : '';
      const expected = String(correctStr).trim().toLowerCase();
      const rawStudent = attempt.selectedItem ?? attempt.response ?? '';
      const student = (
        typeof rawStudent === 'string'
          ? rawStudent
          : typeof rawStudent === 'number'
            ? String(rawStudent)
            : ''
      )
        .trim()
        .toLowerCase();

      if (student === expected) {
        return true;
      }

      if (expected && student && expected !== 'completed' && student !== 'completed') {
        if (student.includes(expected) || expected.includes(student)) {
          return true;
        }
      }

      return false;
    }
  }

  /**
   * Keyword overlap fallback when OpenAI is unavailable for question evaluation.
   */
  private keywordFallback(ideal: string, student: string): boolean {
    const stopWords = new Set([
      'the',
      'and',
      'for',
      'with',
      'that',
      'this',
      'from',
      'are',
      'was',
      'were',
      'has',
      'have',
      'had',
      'not',
    ]);
    const idealWords = ideal
      .split(/\W+/)
      .filter((w: string) => w.length >= KEYWORD_MIN_WORD_LENGTH && !stopWords.has(w));
    const studentWords = student
      .split(/\W+/)
      .filter((w: string) => w.length >= KEYWORD_MIN_WORD_LENGTH);

    if (idealWords.length > 0) {
      const matches = idealWords.filter((word: string) =>
        studentWords.some(
          (sw) =>
            sw === word ||
            (sw.length >= KEYWORD_STEM_MATCH_MIN_LENGTH &&
              word.length >= KEYWORD_STEM_MATCH_MIN_LENGTH &&
              (sw.includes(word) ||
                word.includes(sw) ||
                word.startsWith(sw.substring(0, KEYWORD_STEM_MATCH_MIN_LENGTH)))),
        ),
      );
      return matches.length / idealWords.length >= KEYWORD_FALLBACK_PASS_THRESHOLD;
    }
    return false;
  }

  /**
   * Calculates score breakdown by rubric category with weights applied.
   */
  calculateScoreByCategory(
    actionMarks: DeterministicActionMarksResult,
    scenario: ScenarioForScoring,
  ): ScoreByCategoryResult {
    const rubricItems: RubricItemLike[] = Array.isArray(scenario?.grading?.rubric)
      ? scenario.grading.rubric
      : [];

    const mandatoryDetails: ActionDetail[] = [];
    const optionalDetails: ActionDetail[] = [];
    const distractorDetails: ActionDetail[] = [];

    for (const detail of actionMarks.details || []) {
      const actionInfo: ActionDetail = {
        title: detail.title || 'Unnamed Action',
        type: detail.type,
        isCorrect: detail.isCorrect === true,
        attemptsCount: detail.attemptsCount ?? 0,
        response: detail.response ?? detail.conceptEvaluations,
        isOptional: detail.isOptional === true,
        pointsAwarded: detail.pointsAwarded ?? 0,
      };

      // Separate distractors from mandatory/optional
      if (detail.type === 'distractor') {
        distractorDetails.push(actionInfo);
      } else if (detail.isOptional === true) {
        optionalDetails.push(actionInfo);
      } else {
        mandatoryDetails.push(actionInfo);
      }
    }

    const scoreByCategory: Record<string, unknown> = {};

    for (const rubricItem of rubricItems) {
      if (
        rubricItem.subCategory === 'Action' ||
        rubricItem.subCategory === 'Actions & Interventions'
      ) {
        const weight = typeof rubricItem.weight === 'number' ? rubricItem.weight : 0;
        const x = actionMarks.positiveActions || 0;
        const y = actionMarks.totalRequiredActions || 0;

        const rawPercentage = y > 0 ? (x / y) * 100 : null;

        scoreByCategory[rubricItem.name ?? 'Actions & Interventions'] = {
          name: rubricItem.name ?? 'Actions & Interventions',
          weight,
          score: rawPercentage !== null ? Number(rawPercentage.toFixed(2)) : null, // Return percentage, not weighted score
          maxScore: weight,
          percentage: rawPercentage !== null ? Number(rawPercentage.toFixed(2)) : null,
          x,
          y,
          mandatoryCount: y,
          completedCount: x,
          details: mandatoryDetails,
        };
      }
    }

    const completedOptional = optionalDetails.filter((a) => a.isCorrect === true).length;
    const totalOptional = optionalDetails.length;

    const actionSummary = {
      totalMandatory: actionMarks.totalRequiredActions || 0,
      completedMandatory: actionMarks.positiveActions || 0,
      totalOptional,
      completedOptional,
      mandatoryPercentage:
        actionMarks.totalRequiredActions > 0
          ? Number(
            ((actionMarks.positiveActions / actionMarks.totalRequiredActions) * 100).toFixed(2),
          )
          : null,
    };

    return {
      scoreByCategory,
      mandatoryActionDetails: mandatoryDetails,
      optionalActionDetails: optionalDetails,
      distractorActionDetails: distractorDetails,
      actionSummary,
    };
  }

  buildActionFeedback(details: ActionDetail[]): ActionFeedback {
    const strengths: Array<{ point: string; example: string }> = [];
    const weaknesses: Array<{ point: string; example: string }> = [];

    for (const detail of details || []) {
      // Skip distractor actions - they're now shown in a separate "Distractor" section
      if (String(detail.type || '').toLowerCase() === 'distractor') {
        continue;
      }

      const title = String(detail.title || 'Unnamed action');
      const isCorrect = detail.isCorrect === true;
      const attemptsCount = typeof detail.attemptsCount === 'number' ? detail.attemptsCount : 0;
      const isOptional = detail.isOptional === true;
      const isVital = String(detail.type || '').toLowerCase() === 'vital';

      // Vital actions are handled separately by generateVitalActionFeedback
      if (isVital) {
        continue;
      }

      if (isCorrect) {
        // Optional completed items are tracked separately via optionalActionDetails;
        // only mandatory completed actions belong in Strengths.
        if (!isOptional) {
          strengths.push({
            point: `Completed action "${title}" correctly`,
            example: `Action "${title}" was completed successfully.`,
          });
        }
      } else {
        if (!isOptional) {
          let example = `The action "${title}" was not performed.`;
          if (attemptsCount > 0) {
            if (detail.conceptEvaluations) {
              example = `Action was performed but did not satisfy all mandatory clinical concepts.`;
            } else {
              example = `Action was performed but the response/selection was incorrect.`;
            }
          }
          weaknesses.push({
            point: `Action "${title}" was not completed correctly`,
            example,
          });
        }
      }
    }

    return { strengths, weaknesses };
  }

  generateVitalActionFeedback(
    actionsTimeline: ActionAttempt[],
    scenarioActions: ScenarioActionDef[],
    summaryByCategory?: SummaryByCategoryLike,
    summaryEntries?: ActionAttempt[],
  ): {
    strengths: Array<{ point: string; example: string }>;
    improvements: Array<{ point: string; example: string }>;
  } {
    type RubricFeedback = { point: string; example: string };
    const strengths: RubricFeedback[] = [];
    const improvements: RubricFeedback[] = [];

    const vitalActions = scenarioActions.filter((a) => a.type === 'vital');
    const fieldKeyMap: Record<string, string[]> = {
      heartRate: ['heartRate', 'hr', 'pulse'],
      bloodPressure: ['bloodPressure', 'bp'],
      respiratoryRate: ['respiratoryRate', 'rr', 'respiration'],
      temperature: ['temperature', 'temp'],
      spO2: ['spO2', 'spo2', 'o2'],
      weight: ['weight'],
      height: ['height'],
    };

    const getTakenCount = (takenVitals: Record<string, unknown>, field: string) => {
      const candidates = fieldKeyMap[field] ?? [field];
      for (const key of candidates) {
        const value = takenVitals[key];
        if (Array.isArray(value)) {
          return value.length;
        }
        if (value && typeof value === 'object') {
          return Object.keys(value).length;
        }
        if (typeof value === 'string' && value.trim() !== '') {
          return 1;
        }
        if (typeof value === 'number') {
          return 1;
        }
      }
      return 0;
    };

    const normalizeTitle = (title: string) => title?.trim().toLowerCase();

    for (const action of vitalActions) {
      const normalizedActionTitle = normalizeTitle(action.title ?? '');

      // Priority 1: Check summaryEntries for vitals data (has vitals property)
      let attempts: ActionAttempt[] = [];
      if (summaryEntries && Array.isArray(summaryEntries)) {
        attempts = summaryEntries.filter(
          (entry: ActionAttempt) =>
            normalizeTitle(entry.title ?? '') === normalizedActionTitle && entry.vitals,
        );
      }

      // Priority 2: Fallback to summaryByCategory.actions
      if (attempts.length === 0 && summaryByCategory?.actions) {
        attempts = summaryByCategory.actions.filter(
          (entry: ActionAttempt) =>
            normalizeTitle(entry.title ?? '') === normalizedActionTitle && entry.vitals,
        );
      }

      // Priority 3: Fallback to actionsTimeline
      if (attempts.length === 0) {
        attempts = actionsTimeline.filter(
          (a) => normalizeTitle(a.title ?? '') === normalizedActionTitle,
        );
      }

      if (attempts.length > 0) {
        // Apply "best attempt wins" logic: check all attempts to find if ANY meets expectations
        let bestAttempt: ActionAttempt | null = null;

        for (const attempt of attempts) {
          const expectedVitals: Record<string, string[]> = action.vitals ?? {};
          const takenVitals: Record<string, unknown> = attempt.vitals ?? {};
          let attemptIsCorrect = true;

          // Check if this attempt meets all requirements
          for (const field in expectedVitals) {
            const expectedCount = (expectedVitals[field] ?? []).filter(
              (v: string) => v?.trim?.() !== '',
            ).length;
            const takenCount = getTakenCount(takenVitals, field);
            const requiredCount = getMandatoryVitalCount(action, field, expectedCount);

            if (expectedCount > 0 && requiredCount > 0 && takenCount < requiredCount) {
              attemptIsCorrect = false;
              break;
            }
          }

          if (attemptIsCorrect) {
            bestAttempt = attempt;
            break; // Found a correct attempt, use it
          }
        }

        // If no correct attempt found, use the last attempt for feedback
        if (!bestAttempt) {
          bestAttempt = attempts[attempts.length - 1];
        }

        const expectedVitals: Record<string, string[]> = action.vitals ?? {};
        const takenVitals: Record<string, unknown> = bestAttempt?.vitals ?? {};
        const actionFeedback: string[] = [];
        let hasMismatch = false;

        for (const field in expectedVitals) {
          const expectedCount = (expectedVitals[field] ?? []).filter(
            (v: string) => v?.trim?.() !== '',
          ).length;
          const takenCount = getTakenCount(takenVitals, field);
          const requiredCount = getMandatoryVitalCount(action, field, expectedCount);

          if (expectedCount > 0) {
            if (requiredCount === 0) {
              if (takenCount > 0) {
                actionFeedback.push(`${field} optionally taken ${takenCount} time(s)`);
              }
              continue;
            }

            if (takenCount === 0) {
              actionFeedback.push(`${field} was not taken, but required ${requiredCount} time(s)`);
              hasMismatch = true;
            } else if (takenCount < requiredCount) {
              actionFeedback.push(
                `${field} was taken ${takenCount} time(s), but required ${requiredCount} time(s)`,
              );
              hasMismatch = true;
            } else {
              actionFeedback.push(`${field} correctly taken ${takenCount} time(s)`);
            }
          }
        }

        if (!hasMismatch) {
          // Only add to strengths if it's a mandatory action (not optional, not distractor)
          const isOptional =
            action.isOptional === true || action.typeRequirement?.toLowerCase() === 'optional';
          const isDistractor =
            action.isDistractor === true || action.typeRequirement?.toLowerCase() === 'distractor';
          if (!isOptional && !isDistractor) {
            strengths.push({
              point: `Correctly performed vital signs action "${action.title}"`,
              example: actionFeedback.join(', '),
            });
          }
        } else {
          improvements.push({
            point: `In vital signs action "${action.title}"`,
            example: actionFeedback.join(', '),
          });
        }
      } else {
        const isOptional =
          action.isOptional === true || action.typeRequirement?.toLowerCase() === 'optional';
        const isDistractor =
          action.isDistractor === true || action.typeRequirement?.toLowerCase() === 'distractor';

        if (!isOptional && !isDistractor) {
          const isOptional2 =
            action.isOptional === true || action.typeRequirement?.toLowerCase() === 'optional';
          const isDistractor2 =
            action.isDistractor === true || action.typeRequirement?.toLowerCase() === 'distractor';

          if (!isOptional2 && !isDistractor2) {
            improvements.push({
              point: `Did not perform vital signs action "${action.title}"`,
              example: `The expected action was not completed in the scenario.`,
            });
          }
        }
      }
    }

    return { strengths, improvements };
  }

  // ── String similarity helpers ─────────────────────────────────────────────

  calculateSimilarity(s1: string, s2: string): number {
    if (!s1 || !s2) {
      return 0;
    }
    const distance = this.editDistance(s1, s2);
    const maxLength = Math.max(s1.length, s2.length);
    if (maxLength === 0) {
      return 1.0;
    }
    return 1.0 - distance / maxLength;
  }

  private editDistance(s1: string, s2: string): number {
    const d: number[][] = [];
    for (let i = 0; i <= s1.length; i++) {
      d[i] = [i];
    }
    for (let j = 0; j <= s2.length; j++) {
      d[0][j] = j;
    }
    for (let i = 1; i <= s1.length; i++) {
      for (let j = 1; j <= s2.length; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      }
    }
    return d[s1.length][s2.length];
  }

  getPerformanceCategory(percentage: number): string {
    if (percentage < 60) {
      return 'Needs Improvement';
    }
    if (percentage <= 80) {
      return 'Meets Expectations';
    }
    return 'Exceptional';
  }
}
