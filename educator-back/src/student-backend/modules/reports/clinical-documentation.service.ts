import { Injectable } from '@nestjs/common';

import { LoggerService } from '../../../common/services';

import {
  type ChecklistItem,
  type ChecklistItemStatus,
  type DocumentationScoreResult,
} from './types/scoring.types';

interface ScenarioActionCategory {
  id?: string;
  name?: string;
}

interface ScenarioAction {
  title?: string;
  categoryId?: string;
}

interface ScenarioPatientData {
  [key: string]: unknown;
}

interface ScenarioLike {
  title?: string;
  description?: string;
  patientData?: ScenarioPatientData;
  actionCategories?: ScenarioActionCategory[];
  actions?: ScenarioAction[];
}

interface StudentSummaryAction {
  title?: string;
  details?: string;
  notes?: string; // Observation field from frontend
}

interface StudentSummaryHistoryEntry {
  observation?: string;
  [key: string]: unknown;
}

interface StudentSummaryLike {
  actions?: StudentSummaryAction[];
  history?: StudentSummaryHistoryEntry[];
  historyNotes?: string;
  actionNotes?: string;
  chiefComplaint?: string;
  allergies?: string;
  currentMedications?: string | string[];
  socialHistory?: Record<string, unknown>;
  immunizations?: string;
  vitals?: Record<string, unknown[]> | unknown[];
  patientData?: Record<string, unknown>;
  [key: string]: unknown;
}

interface TechnicalSkillItemLike {
  subCategory?: string;
  checklistItems?: ChecklistItem[];
}

interface ActionEntry {
  title: string;
  categoryName: string;
  observation: string;
  details: string;
}

@Injectable()
export class ClinicalDocumentationService {
  constructor(private readonly logger: LoggerService) {}

  // ── DETERMINISTIC CLINICAL DOCUMENTATION SCORING ──────────────────────────
  // Evaluates each checklist item using specific rules tied to action categories.
  // Scoring formula: (Mandatory items passed / Total Mandatory) × 100
  computeDocumentationScore(
    checklistItems: ChecklistItem[],
    studentSummary: StudentSummaryLike | null | undefined,
    scenario: ScenarioLike,
    language: 'en' | 'es' = 'en',
  ): DocumentationScoreResult {
    const es = language === 'es';
    // ── Build action title → clinical category name map ──────────────────────
    const categoriesMap = new Map<string, string>();
    for (const cat of scenario?.actionCategories ?? []) {
      categoriesMap.set(String(cat.id ?? ''), String(cat.name ?? ''));
    }
    const actionTitleToCategory = new Map<string, string>();
    for (const action of scenario?.actions ?? []) {
      if (action.categoryId) {
        const catName = categoriesMap.get(String(action.categoryId)) ?? '';
        actionTitleToCategory.set((action.title ?? '').trim().toLowerCase(), catName);
      }
    }

    const isPatientEducationCategory = (name: string): boolean => {
      const n = (name ?? '').toLowerCase();
      return n.includes('patient education') || (n.includes('education') && !n.includes('nurse'));
    };

    const actionEntries: ActionEntry[] = (studentSummary?.actions ?? []).map(
      (entry: StudentSummaryAction): ActionEntry => {
        const titleKey = (entry.title ?? '').trim().toLowerCase();
        const catName = actionTitleToCategory.get(titleKey) ?? '';

        // Try notes field first (direct observation), then parse details field
        let observation = String(entry.notes ?? '').trim();
        if (!observation) {
          const details = String(entry.details ?? '');
          const obsMatch = details.match(/Observation:\s*([^|\n]+)/i);
          observation = obsMatch ? obsMatch[1].trim() : '';
        }

        // DEBUG: Log what we're receiving
        this.logger.debug(`[OBSERVATION-DEBUG] Action "${entry.title}"`);
        this.logger.debug(`[OBSERVATION-DEBUG]   - notes field: "${entry.notes}"`);
        this.logger.debug(
          `[OBSERVATION-DEBUG]   - details field: "${String(entry.details ?? '').substring(0, 100)}"`,
        );
        this.logger.debug(`[OBSERVATION-DEBUG]   - extracted observation: "${observation}"`);

        return {
          title: entry.title ?? '',
          categoryName: catName,
          observation,
          details: String(entry.details ?? ''),
        };
      },
    );

    const historyEntries: StudentSummaryHistoryEntry[] = studentSummary?.history ?? [];
    const historyNotes: string = (studentSummary?.historyNotes ?? '').trim();
    const _actionNotes: string = (studentSummary?.actionNotes ?? '').trim();
    const chiefComplaint: string = (studentSummary?.chiefComplaint ?? '').trim();
    const allergies: string = (studentSummary?.allergies ?? '').trim();
    const currentMedications =
      typeof studentSummary?.currentMedications === 'string'
        ? studentSummary.currentMedications.trim()
        : Array.isArray(studentSummary?.currentMedications)
          ? studentSummary.currentMedications.join(', ')
          : '';
    const socialHistory = studentSummary?.socialHistory ?? {};
    const hasSocialHistory = Object.values(socialHistory).some(
      (val) => typeof val === 'string' && val.trim().length > 0,
    );
    const immunizations: string = (studentSummary?.immunizations ?? '').trim();
    const vitalsData = studentSummary?.vitals;
    const hasVitals = Array.isArray(vitalsData)
      ? vitalsData.length > 0
      : vitalsData && typeof vitalsData === 'object'
        ? Object.keys(vitalsData).length > 0
        : false;

    // NOTE: doc-3 (Patient Emotional Response) is evaluated by AI using the prompt rule,
    // not by deterministic keyword matching. The deterministic check only verifies that
    // action observations exist for the AI to analyze.
    // Removed EMOTIONAL_KEYWORDS array - AI will detect emotional content naturally.

    const results: DocumentationScoreResult['results'] = [];
    let totalMandatory = 0;
    let passedMandatory = 0;

    for (const ci of checklistItems) {
      let status: ChecklistItemStatus = ci.status ?? 'Mandatory';
      if (!ci.status && ci.mandatory === false) {
        status = 'Optional';
      }
      if (status === 'Exclude') {
        continue;
      }

      // DEBUG: Log status determination for each checklist item
      this.logger.debug(`[DOC-STATUS-DEBUG] Checklist item: "${ci.text}"`);
      this.logger.debug(`[DOC-STATUS-DEBUG]   - ci.status: ${ci.status}`);
      this.logger.debug(`[DOC-STATUS-DEBUG]   - ci.mandatory: ${ci.mandatory}`);
      this.logger.debug(`[DOC-STATUS-DEBUG]   - computed status: ${status}`);

      if (status === 'Mandatory') {
        totalMandatory++;
        this.logger.debug(
          `[DOC-STATUS-DEBUG]   - counted as Mandatory (totalMandatory now: ${totalMandatory})`,
        );
      } else {
        this.logger.debug(`[DOC-STATUS-DEBUG]   - NOT counted as Mandatory (status: ${status})`);
      }

      const textLower = (ci.text ?? '').toLowerCase();
      let passed: boolean;
      let reason: string;

      // ── Rule 1: Assessment Findings Documented ────────────────────────────
      // PASS if ANY action (regardless of category) has a non-empty Observation
      if (
        ci.id === 'doc-1' ||
        textLower.includes('assessment findings') ||
        textLower.includes('assessment & intervention')
      ) {
        // Check ALL actions, not just "Assessments & Exams" category
        const firstWithObs = actionEntries.find((e) => e.observation.length > 0);
        passed = !!firstWithObs;
        reason = firstWithObs
          ? es
            ? `Observación de evaluación documentada para la acción "${firstWithObs.title}": "${firstWithObs.observation.substring(0, 80)}"`
            : `Assessment observation documented for action "${firstWithObs.title}": "${firstWithObs.observation.substring(0, 80)}"`
          : es
            ? 'No se documentaron observaciones en ninguna acción'
            : 'No observations documented in any action';

        // Debug logging
        this.logger.debug(`[doc-1] Total actions count: ${actionEntries.length}`);
        this.logger.debug(
          `[doc-1] Actions with observations: ${actionEntries.filter((e) => e.observation.length > 0).length}`,
        );
        this.logger.debug(`[doc-1] Result - passed: ${passed}`);
      }
      // ── Rule 2: Medical & Health History Updated ──────────────────────────────────────────────────────────────────────
      // PASS if ANY History tab field has been filled out (comprehensive check)
      else if (
        ci.id === 'doc-2' ||
        (textLower.includes('medical') && textLower.includes('history'))
      ) {
        // Debug logging for Chief Complaint
        this.logger.debug(`[doc-2] Chief Complaint raw value: "${studentSummary?.chiefComplaint}"`);
        this.logger.debug(`[doc-2] Chief Complaint length: ${chiefComplaint.length}`);
        this.logger.debug(`[doc-2] History entries count: ${historyEntries.length}`);
        this.logger.debug(`[doc-2] Vitals present: ${hasVitals}`);

        // NOTE: Vitals are excluded from this check because they come from actions (e.g., "Obtain Vital Signs" button clicks),
        // not from the History tab form. Vitals are already evaluated in the Actions rubric.
        passed =
          historyEntries.length > 0 ||
          historyNotes.length > 0 ||
          chiefComplaint.length > 0 ||
          allergies.length > 0 ||
          currentMedications.length > 0 ||
          hasSocialHistory ||
          immunizations.length > 0;
        // hasVitals removed - vitals are action-based, not History tab updates

        const filledFields: string[] = [];
        if (historyEntries.length > 0) {
          filledFields.push(
            `${historyEntries.length} recorded detail entr${historyEntries.length === 1 ? 'y' : 'ies'}`,
          );
        }
        if (historyNotes.length > 0) {
          filledFields.push('additional notes');
        }
        if (chiefComplaint.length > 0) {
          filledFields.push('chief complaint');
        }
        if (allergies.length > 0) {
          filledFields.push('allergies');
        }
        if (currentMedications.length > 0) {
          filledFields.push('current medications');
        }
        if (hasSocialHistory) {
          filledFields.push('social history');
        }
        if (immunizations.length > 0) {
          filledFields.push('immunizations');
        }
        // Vitals not included - they are action-based, not History tab form fields

        reason = passed
          ? es
            ? `Ficha de Historial actualizada: ${filledFields.join(', ')}`
            : `History tab updated: ${filledFields.join(', ')}`
          : es
            ? 'No se actualizaron los campos de la ficha de Historial (Detalles Registrados, Queja Principal, Alergias, Medicamentos, Historia Social, Inmunizaciones o Notas Adicionales)'
            : 'No History tab fields were updated (Recorded Details, Chief Complaint, Allergies, Medications, Social History, Immunizations, or Additional Notes)';

        this.logger.debug(
          `[doc-2] Result - passed: ${passed}, filled fields: [${filledFields.join(', ')}]`,
        );
      }
      // ── Rule 3: Patient Emotional Response Documented ─────────────────────
      // DETERMINISTIC FALLBACK: Check if ANY action observation contains emotional keywords
      // AI will provide more nuanced evaluation, but this ensures score is calculated correctly
      else if (
        ci.id === 'doc-3' ||
        textLower.includes('emotional') ||
        textLower.includes('emotional response')
      ) {
        // Emotional keywords to detect in action observations
        const emotionalKeywords = [
          'happy',
          'sad',
          'emotional',
          'anxious',
          'anxiety',
          'nervous',
          'worried',
          'fearful',
          'fear',
          'scared',
          'distressed',
          'crying',
          'upset',
          'calm',
          'calmed',
          'relaxed',
          'composed',
          'cooperative',
          'comfortable',
          'concerned',
          'stressed',
          'depressed',
          'angry',
          'frustrated',
          'reassured',
          'agitated',
          'tearful',
          'at ease',
          'tense',
          'relieved',
          'excited',
          'pleased',
          'disappointed',
          'embarrassed',
          'ashamed',
          'guilty',
          'proud',
          'content',
          'irritated',
          'annoyed',
          'hostile',
          'panicked',
          'terrified',
          'joyful',
          'elated',
          'gloomy',
          'melancholy',
          'somber',
          'cheerful',
          'delighted',
          'smile',
          'smiling',
          'laugh',
          'laughing',
          'frown',
          'frowning',
          'weeping',
          'sobbing',
          'troubled',
          'serene',
          'peaceful',
          'uneasy',
          'restless',
          'fidgeting',
        ];

        // Check if ANY action observation contains emotional keywords
        const hasEmotionalContent = actionEntries.some((entry) => {
          const obsLower = entry.observation.toLowerCase();
          return emotionalKeywords.some((keyword) => obsLower.includes(keyword));
        });

        passed = hasEmotionalContent;
        const firstWithEmotional = actionEntries.find((entry) => {
          const obsLower = entry.observation.toLowerCase();
          return emotionalKeywords.some((keyword) => obsLower.includes(keyword));
        });

        reason = firstWithEmotional
          ? es
            ? `Respuesta emocional documentada en la acción "${firstWithEmotional.title}": "${firstWithEmotional.observation.substring(0, 80)}"`
            : `Emotional response documented in action "${firstWithEmotional.title}": "${firstWithEmotional.observation.substring(0, 80)}"`
          : es
            ? 'No se documentó respuesta emocional en ninguna observación de acción'
            : 'No emotional response documented in any action observation';

        this.logger.debug(
          `[doc-3] Deterministic check - hasEmotionalContent: ${hasEmotionalContent}`,
        );
      }
      // ── Rule 4: Patient Education Documented ──────────────────────────────
      else if (ci.id === 'doc-4' || textLower.includes('patient education')) {
        const educationActions = actionEntries.filter((e) =>
          isPatientEducationCategory(e.categoryName),
        );
        const firstWithObs = educationActions.find((e) => e.observation.length > 0);
        passed = !!firstWithObs;
        reason = firstWithObs
          ? es
            ? `Observación de educación al paciente documentada para "${firstWithObs.title}"`
            : `Patient education observation documented for "${firstWithObs.title}"`
          : es
            ? 'No se documentaron observaciones para acciones de la categoría Educación al Paciente'
            : 'No observations documented for Patient Education category actions';
      }
      // ── Fallback ──────────────────────────────────────────────────────────
      else {
        passed = actionEntries.some((e) => e.observation.length > 0) || historyNotes.length > 0;
        reason = passed
          ? es
            ? 'Documentación presente'
            : 'Documentation present'
          : es
            ? 'No se encontró documentación'
            : 'No documentation found';
      }

      if (status === 'Mandatory' && passed) {
        passedMandatory++;
      }
      results.push({ text: ci.text, status, passed, reason });
    }

    const docScore = totalMandatory > 0 ? (passedMandatory / totalMandatory) * 100 : 100;

    // DEBUG: Log final calculation
    this.logger.debug(`[DOC-SCORE-DEBUG] Final Documentation Score Calculation:`);
    this.logger.debug(`[DOC-SCORE-DEBUG]   - totalMandatory: ${totalMandatory}`);
    this.logger.debug(`[DOC-SCORE-DEBUG]   - passedMandatory: ${passedMandatory}`);
    this.logger.debug(`[DOC-SCORE-DEBUG]   - docScore: ${docScore}%`);

    return { totalMandatory, passedMandatory, docScore, results };
  }

  // ── AI PROMPT BUILDER FOR DOCUMENTATION ────────────────────────────────────
  // Provides the AI with categorized action data and per-item evaluation rules.
  // doc-1 (Assessment observations) and doc-2 (History updates) use deterministic checks.
  // doc-3 (Patient Emotional Response) is evaluated by AI using natural language understanding
  // to detect emotional content in action observations - no keyword list required.
  buildDocumentationInstructions(
    studentSummary: StudentSummaryLike | null | undefined,
    technicalSkillItems: TechnicalSkillItemLike[],
    scenario: ScenarioLike,
  ): string {
    const documentationItem = technicalSkillItems.find(
      (item) =>
        String(item?.subCategory ?? '')
          .trim()
          .toLowerCase() === 'documentation',
    );

    if (!documentationItem) {
      return '';
    }

    // ── Build action title → category name map ────────────────────────────────
    const categoriesMap = new Map<string, string>();
    for (const cat of scenario?.actionCategories ?? []) {
      categoriesMap.set(String(cat.id ?? ''), String(cat.name ?? ''));
    }
    const actionTitleToCategory = new Map<string, string>();
    for (const action of scenario?.actions ?? []) {
      if (action.categoryId) {
        const catName = categoriesMap.get(String(action.categoryId)) ?? 'Uncategorized';
        actionTitleToCategory.set((action.title ?? '').trim().toLowerCase(), catName);
      }
    }

    // ── Build categorized action observation data for the AI ─────────────────
    const categorizedActions = (studentSummary?.actions ?? []).map((a: StudentSummaryAction) => {
      // Try notes field first (direct observation), then parse details field
      let observation = String(a.notes ?? '').trim();
      if (!observation) {
        const details = String(a.details ?? '');
        const obsMatch = details.match(/Observation:\s*([^|\n]+)/i);
        observation = obsMatch ? obsMatch[1].trim() : '';
      }

      // DEBUG: Log what we're sending to AI
      this.logger.debug(`[AI-PROMPT-DEBUG] Action "${a.title}"`);
      this.logger.debug(`[AI-PROMPT-DEBUG]   - notes field: "${a.notes}"`);
      this.logger.debug(`[AI-PROMPT-DEBUG]   - observation extracted: "${observation}"`);

      const categoryName =
        actionTitleToCategory.get((a.title ?? '').trim().toLowerCase()) ?? 'Uncategorized';
      return {
        title: a.title,
        category: categoryName,
        hasObservation: observation.length > 0,
        observation,
      };
    });

    // ── Build per-item rules for AI ───────────────────────────────────────────
    const checklistRules = (documentationItem.checklistItems ?? [])
      .map((cli: ChecklistItem) => {
        const status: string = cli.status ?? (cli.mandatory === false ? 'Optional' : 'Mandatory');
        if (status === 'Exclude') {
          return null;
        }

        const textLower = (cli.text ?? '').toLowerCase();
        let rule: string;

        if (
          cli.id === 'doc-1' ||
          textLower.includes('assessment findings') ||
          textLower.includes('assessment & intervention') ||
          textLower.includes('assessment observations')
        ) {
          rule =
            'RULE: PASS if the learner entered ANY non-empty observation text for ANY action, regardless of category, content quality, or meaningfulness. FAIL only if NO observations were entered for ANY action. Accept ANY text entry including single words, random characters, or test data in ANY action observation field.';
        } else if (
          cli.id === 'doc-2' ||
          (textLower.includes('medical') && textLower.includes('history'))
        ) {
          rule =
            "RULE: PASS if the learner made ANY changes or additions to ANY field in the History tab, including: Recorded Details entries, Additional Notes, Chief Complaint, Allergies, Current Medications, Social History, or Immunizations. FAIL only if ALL History tab fields remain completely empty. NOTE: Vitals are NOT included in this check as they are action-based (e.g., 'Obtain Vital Signs' button) and are evaluated separately in the Actions rubric.";
        } else if (cli.id === 'doc-3' || textLower.includes('emotional')) {
          rule =
            "RULE: Check ONLY the action Observation fields for any mention of the patient's emotional or psychological state. PASS if ANY action observation contains words describing emotion, mood, affect, feelings, or demeanor. \n\n" +
            'EXAMPLES THAT MUST PASS:\n' +
            "• 'Patient get happy while I explaining' ✓\n" +
            "• 'Patient get sad while treating' ✓\n" +
            "• 'Patient get emotional' ✓\n" +
            "• 'Patient appears calm' ✓\n" +
            "• 'looks anxious' ✓\n" +
            "• 'seems upset' ✓\n" +
            "• 'patient laughing' ✓\n" +
            "• 'patient crying' ✓\n" +
            '• ANY other emotional descriptor ✓\n\n' +
            'EMOTIONAL KEYWORDS (not exhaustive): happy, sad, emotional, anxious, anxiety, nervous, worried, fearful, fear, scared, distressed, crying, upset, calm, calmed, relaxed, composed, cooperative, comfortable, concerned, stressed, depressed, angry, frustrated, reassured, agitated, tearful, at ease, tense, relieved, excited, pleased, disappointed, embarrassed, ashamed, guilty, proud, content, irritated, annoyed, hostile, panicked, terrified, joyful, elated, gloomy, melancholy, somber, cheerful, delighted, smile, smiling, laugh, laughing, frown, frowning, weeping, sobbing, troubled, distressed, serene, peaceful, uneasy, restless, fidgeting, trembling (from fear/anxiety).\n\n' +
            "CRITICAL: Even informal or grammatically imperfect documentation MUST PASS if it mentions emotional state. The AI should use natural language understanding to detect ANY reference to feelings, emotions, mood, or psychological state, even if not in perfect clinical language. FAIL ONLY if there is absolutely NO mention of the patient's emotional, affective, or psychological state in ANY action observation.";
        } else if (cli.id === 'doc-4' || textLower.includes('patient education')) {
          rule =
            'RULE: Look at actions whose category is "Patient Education". PASS if the learner entered a non-empty observation for ANY Patient Education action. FAIL if no observation was entered for any Patient Education action.';
        } else {
          rule = 'RULE: Check if relevant documentation is present for this item.';
        }

        return `        * "${cli.text}" — Status: ${status}\n          ${rule}`;
      })
      .filter(Boolean)
      .join('\n');

    return `4. DOCUMENTATION (if present in rubric):

     STANDARD DOCUMENTATION CATEGORIES (fixed system categories — for your reference):
     Assessments & Exams | Bedside Procedures | Labs & Diagnostics | Medication Administration | Nursing Care & Interventions | Other | Patient Education | Team Communication

     STUDENT DATA TO EVALUATE:
     - Scenario Context: ${JSON.stringify({ title: scenario?.title, description: scenario?.description, patientData: scenario?.patientData })}
     - Chief Complaint: ${JSON.stringify(studentSummary?.chiefComplaint ?? '')}
     - Allergies: ${JSON.stringify(studentSummary?.allergies ?? '')}
     - Current Medications: ${JSON.stringify(studentSummary?.currentMedications ?? '')}
     - Social History: ${JSON.stringify(studentSummary?.socialHistory ?? {})}
     - Immunizations: ${JSON.stringify(studentSummary?.immunizations ?? '')}
     - Vitals: ${JSON.stringify(studentSummary?.vitals ?? {})}
     - History Tab Recorded Details: ${JSON.stringify(studentSummary?.history ?? [])}
     - History Tab Additional Notes: ${JSON.stringify(studentSummary?.historyNotes ?? '')}
     - Actions Tab Global Notes: ${JSON.stringify(studentSummary?.actionNotes ?? '')}
     - Actions with Category and Observation (use this to apply category-based rules):
       ${JSON.stringify(categorizedActions, null, 2)}

     CHECKLIST ITEMS — EVALUATE EACH INDIVIDUALLY USING ITS RULE:
${checklistRules}

     SCORING RULES (MANDATORY):
     - Status = "Mandatory": MUST pass to receive full credit. Missing = deduct from score. List as strength if passed, weakness if failed.
     - Status = "Optional": Does NOT affect score. Do NOT list in strengths or weaknesses. Track completion separately.
     - Status = "Exclude": Completely ignored. Do not evaluate. Do not mention.
     - Score formula: (Mandatory items passed ÷ Total mandatory items) × 100
     - Apply rubric weight to get weighted score.

     **CRITICAL - OPTIONAL ITEMS RULE:**
     DO NOT include Optional items in strengths or weaknesses arrays. Even if Optional items are completed, they should ONLY be tracked in criteriaResults, NOT in strengths. Strengths and weaknesses are EXCLUSIVELY for Mandatory items.

     CRITICAL RULES:
     * INDEPENDENT EVALUATION: Evaluate ONLY based on documentation data above. Do NOT use the conversation transcript.
     * INCLUDE CHIEF COMPLAINT: Chief Complaint field is now part of Medical History evaluation (doc-2).
     * EMOTIONAL RESPONSE (doc-3): CRITICAL - This is the most commonly missed. Check ONLY action observations. ANY word describing emotion, feelings, mood, or affect must PASS. Examples: "Patient get happy" ✓, "patient sad" ✓, "seems upset" ✓, "looks calm" ✓. Use natural language understanding. Even informal phrasing MUST PASS if it describes emotional state.
     * For doc-1 (Actions/Assessment Documentation): Accept ANY text entry, regardless of quality or meaningfulness. Do NOT check if content is relevant or meaningful.
     * Each checklist item must be individually evaluated using its specific rule above.

     FEEDBACK RULES:
     - Strengths: One entry per MANDATORY checklist item that PASSED. **NEVER include Optional items in strengths.**
     - Weaknesses: One entry per MANDATORY checklist item that FAILED. **NEVER include Optional items in weaknesses.**
     - Recommendations: Specific improvements for failed mandatory items only. If score is 100%, state "No items identified."
     - Summary: Generate a concise narrative by combining sentences for PASSED items first, then FAILED items, based strictly on the strengths and weaknesses lists:
       PASSED item sentences (include only if item is in strengths):
       * doc-1 passed: "The student documented an observation for at least one action, assessment, or intervention."
       * doc-2 passed: "The student made an addition or changes to information in the overview and history areas of the patient chart."
       * doc-3 passed: "The student documented the patient's emotional response as part of documentation on an action, assessment, or intervention."em sentences (include only if item is in weaknesses):
       * doc-1 failed: "No observations were documented for any action, assessment, or intervention."
       * doc-2 failed: "No additions or changes were made to the overview and history areas of the patient chart."
       * doc-3 failed: "The patient's emotional response was not documented in any action, assessment, or intervention."
       CRITICAL: Base every sentence strictly on the strengths/weaknesses result. Do NOT contradict the strengths or weaknesses lists. Do NOT add commentary beyond these sentences.
     - **CRITICAL:** Optional items (Status: "Optional") must NEVER appear in strengths or weaknesses sections, even if completed. They are tracked separately in criteriaResults only.
     - Provide: strengths, weaknesses, recommendations, summary`;
  }
}
