import { useEffect } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  CheckCircle2,
  Trophy,
  XCircle,
} from 'lucide-react';
import { translateSequencingPhrase } from './translateSequencingPhrase';

const MEDICATION_NAME_ES: Record<string, string> = {
  'cold therapy - ice application': 'Terapia de Frío – Aplicación de Hielo',
};

const normalizeMedKey = (raw: string): string =>
  raw
    .normalize('NFKC')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

function translateMedName(name: string, language: 'en' | 'es'): string {
  if (!name || language !== 'es') return name;
  return MEDICATION_NAME_ES[normalizeMedKey(name)] ?? name;
}

export interface RubricsLabels {
  na: string;
  exceptional: string;
  meetsExpectations: string;
  needsImprovement: string;
  actions: string;
  medications: string;
  ppe: string;
  documentation: string;
  communication: string;
  sequencing: string;
  noMandatoryActions: string;
  noMandatoryPpe: string;
  performedMultipleTimes: string;
  teamCommunication: string;
  satisfactory: string;
  unsatisfactory: string;
  notDone: string;
  optionalActionsCompleted: string;
  optionalMedicationsCompleted: string;
  distractorActionsCompleted: string;
  noDistractorActions: string;
  noDistractorMedications: string;
  medicationAdministeredCorrectly: string;
  medicationNotAdministeredCorrectly: string;
  mandatoryMedicationMissed: string;
  medicationsSummaryNone: string;
  medicationsSummaryAllCorrect: string;
  medicationsSummaryAllMissed: string;
  medicationsSummaryPartial: string;
  medicationsSummaryOptional: string;
  sequencingPending: string;
  sequencingReview: string;
  inappropriateActions: string;
  inappropriateIntro: string;
  inappropriateMayReflect: string;
  recommendationsContext: string;
  inappropriateNoImpact: string;
  strengths: string;
  weaknesses: string;
  improvementRecommendations: string;
  noItemsIdentified: string;
  noItems: string;
  noneIdentified: string;
  weight: string;
  outOf100?: string;
  jumpTo?: string;
  seqSublabelPrioritizedCorrectly?: string;
  seqSublabelNotPrioritizedCorrectly?: string;
  seqExampleOutOfOrderGeneric?: string;
  seqSummaryContext?: string;
  seqPerfAll?: string;
  seqPerfMost?: string;
  seqPerfFew?: string;
  seqPerfNone?: string;
  seqRecReflectEbp?: string;
  priorityCompletedCorrectly?: string;
  priorityCompletedIncorrectly?: string;
  priorityNotCompleted?: string;
  nonPriorityActionsPerformed?: string;
  otherNonPriorityCompleted?: string;
  recReviewEvidenceBased?: string;
  recReviewBriefingSbar?: string;
  recReflect?: string;
  recReflectSafety?: string;
  recReflectDocumentation?: string;
  recReflectCommunication?: string;
  recReflectMedication?: string;
  actionsTitle?: string;
  prioritySummary?: string;
  distractorSummary?: string;
  optionalSummary?: string;
  otherNonPrioritySummary?: string;
}

const defaultRubricsLabels: RubricsLabels = {
  na: 'N/A',
  exceptional: 'EXCEPTIONAL',
  meetsExpectations: 'MEETS EXPECTATIONS',
  needsImprovement: 'NEEDS IMPROVEMENT',
  actions: 'Actions & Interventions',
  medications: 'Medications',
  ppe: 'Implementation of Common Strategies for Privacy, Infection Prevention & Environmental Safety',
  documentation: 'Completion of Documentation in the Electronic Record',
  communication: 'Demonstration of Professional & Therapeutic Communication',
  sequencing: 'Prioritization of Care',
  noMandatoryActions:
    'No mandatory actions or interventions were configured for this scenario.',
  noMandatoryPpe:
    'No mandatory PPE, privacy or safety requirements were configured for this scenario.',
  performedMultipleTimes: 'Performed multiple times',
  teamCommunication: 'TEAM COMMUNICATION',
  satisfactory: 'SATISFACTORY',
  unsatisfactory: 'UNSATISFACTORY',
  notDone: 'NOT DONE',
  optionalActionsCompleted: 'Optional Actions Completed',
  optionalMedicationsCompleted: 'Optional Medications Completed',
  distractorActionsCompleted: 'Distractor Actions Completed',
  noDistractorActions: 'No distractor actions performed.',
  noDistractorMedications: 'No distractor medications administered.',
  medicationAdministeredCorrectly: 'Medication administered correctly.',
  medicationNotAdministeredCorrectly:
    'Medication was not administered correctly.',
  mandatoryMedicationMissed: 'Mandatory medication was not administered.',
  medicationsSummaryNone: 'No medication orders were administered.',
  medicationsSummaryAllCorrect:
    'All mandatory medication orders were administered correctly.',
  medicationsSummaryAllMissed: '{n} mandatory medication order(s) were missed.',
  medicationsSummaryPartial:
    '{a} of {b} mandatory medication order(s) were administered correctly.',
  medicationsSummaryOptional: '{n} optional medication(s) completed correctly.',
  sequencingPending: 'Sequencing & Prioritization grading is pending',
  sequencingReview:
    'Review the sequencing requirements for these steps to improve clinical prioritization.',
  inappropriateActions: 'Inappropriate Actions',
  inappropriateIntro:
    'During this simulation, one or more actions were classified as inappropriate or distractor actions within the context of this scenario. These actions were not aligned with the expected clinical pathway or defined scenario objectives. Although identified as inappropriate, these actions do not affect the overall score or grade for this simulation.',
  inappropriateMayReflect: 'Inappropriate actions may reflect:',
  recommendationsContext:
    'The actions listed above were inappropriate within the context of this scenario. These actions should generally be avoided in clinical situations similar to this one unless clearly supported by patient assessment findings.',
  inappropriateNoImpact:
    'The inappropriate actions identified here do not impact',
  strengths: 'Strengths',
  weaknesses: 'Weaknesses / Opportunities',
  improvementRecommendations: 'Improvement Recommendations',
  noItemsIdentified: 'No items identified.',
  noItems: 'No items.',
  noneIdentified: 'None identified.',
  priorityCompletedCorrectly: 'PRIORITY ITEMS COMPLETED CORRECTLY',
  priorityCompletedIncorrectly: 'PRIORITY ITEMS COMPLETED INCORRECTLY',
  priorityNotCompleted: 'PRIORITY ITEMS NOT COMPLETED',
  nonPriorityActionsPerformed: 'NON-PRIORITY ACTIONS PERFORMED',
  otherNonPriorityCompleted: 'Other Non-Priority Items Completed',
  recReviewEvidenceBased:
    'Review the evidence-based rationale and guidelines for clinical interventions performed during patient care.',
  recReviewBriefingSbar:
    'Review the pre-simulation scenario briefing, clinical documentation, and SBAR handover to ensure all mandatory assessments, interventions, and safety checks are identified and completed.',
  recReflect:
    'Reflect on your overall clinical decision-making during the simulation and identify specific opportunities to improve care delivery in future scenarios.',
  recReflectSafety:
    'Reflect on infection prevention, patient privacy, and environmental safety protocols to ensure a safe clinical environment.',
  recReflectDocumentation:
    'Reflect on thorough and timely electronic health record documentation standards to support continuity of care.',
  recReflectCommunication:
    'Reflect on professional communication and SBAR handoff protocols to enhance care team collaboration and patient interaction.',
  recReflectMedication:
    'Reflect on safe medication administration rights and verification protocols to prevent medication errors.',
  actionsTitle: 'Completion of Assessments, Care, Interventions, & Tasks',
  prioritySummary:
    'The student correctly completed {correct} of the {total} required priority item(s) for this simulation.',
  distractorSummary:
    'The student also performed {count} distractor item(s) that were not an appropriate or prioritized item for this simulation.',
  optionalSummary:
    'The student also completed {count} non-priority optional action(s).',
  otherNonPrioritySummary:
    'Other non-priority items were also completed correctly ({count}).',
  weight: 'WEIGHT',
  outOf100: 'out of 100',
  jumpTo: 'Jump To',
  seqSublabelPrioritizedCorrectly: 'Items Prioritized Correctly',
  seqSublabelNotPrioritizedCorrectly: 'Items Not Prioritized Correctly',
  seqExampleOutOfOrderGeneric:
    'Review scenario clinical guidelines to ensure critical actions are performed in the correct sequence.',
  seqSummaryContext:
    'During a clinical scenario, performing actions in the proper order is essential to ensure patient safety, support effective care transitions, and prevent complications.',
  seqPerfAll:
    'The student prioritized and performed all {passed} of {total} required clinical actions in the correct sequence.',
  seqPerfMost:
    'The student prioritized and performed most clinical actions ({passed} of {total}) in the correct sequence.',
  seqPerfFew:
    'The student prioritized and performed few clinical actions ({passed} of {total}) in the correct sequence.',
  seqPerfNone:
    'The student did not prioritize or perform any of the required clinical actions in the correct sequence.',
  seqRecReflectEbp:
    'Reflect on evidence-based practice rationale for sequencing actions to establish a clear clinical workflow during patient care.',
};

type StrengthWeakness = {
  point: string;
  example?: string;
  count?: number;
};

interface ActionDetail {
  type?: string;
  title?: string;
  [key: string]: unknown;
}

type SequencingParentResult = {
  parentRef: string;
  parentLabel?: string;
  passed: boolean;
  assessmentPassed: boolean;
  beforePassed: boolean;
  afterPassed: boolean;
  orderPassed: boolean;
  timingPassed: boolean;
  failedReasons?: string[];
};

interface CriteriaResult {
  criterionId: string;
  title: string;
  passed: boolean;
  rationale: string;
}

// Medication grading result from the session transcript
export interface MedicationGradingResult {
  medicationId?: string;
  medicationName: string;
  orderTitle?: string;
  overallScore: number;
  totalExpected: number;
  totalCorrect: number;
  mandatory?: boolean;
  comparisons: Array<{
    field: string;
    expected: string | string[] | undefined;
    actual: string | string[] | undefined;
    isCorrect: boolean;
    confidence?: number;
    explanation?: string;
  }>;
  educationResult?: {
    expected: string[];
    actual: string[];
    matched: string[];
    missing: string[];
    isCorrect: boolean;
  };
  verificationResult?: {
    expected: string[];
    actual: string[];
    matched: string[];
    missing: string[];
    isCorrect: boolean;
  };
}

type RubricItem = {
  id?: string;
  name?: string;
  subCategory?: string;
  score?: number;
  weightedScore?: number;
  weight?: number;
  maxScore?: number;
  summary?: string;
  strengths?: StrengthWeakness[];
  weaknesses?: StrengthWeakness[];
  recommendations?: string[];
  actionDetails?: ActionDetail[];
  criteriaResults?: CriteriaResult[];
  parentResults?: SequencingParentResult[];
};

export type RubricsPayload = {
  overallSummary?: string;
  totalScore?: number;
  totalWeight?: number;
  items?: Record<string, RubricItem>;
};

function formatScore(value: unknown) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—';
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function BadgeTrophy({ label, score }: { label?: string; score?: number }) {
  if (typeof score !== 'number' || isNaN(score) || !label) {
    return null;
  }

  const isExceptional =
    label.toLowerCase().includes('exceptional') ||
    label.toLowerCase().includes('excepcional');

  const isMeets =
    label.toLowerCase().includes('meets') ||
    label.toLowerCase().includes('cumple');

  if (isExceptional) {
    return (
      <Trophy
        data-pdf-trophy
        className="w-4 h-4 text-amber-500 fill-amber-400 flex-shrink-0 overflow-visible"
      />
    );
  }

  if (isMeets) {
    return (
      <Trophy
        data-pdf-trophy
        className="w-4 h-4 text-slate-400 fill-slate-300 flex-shrink-0 overflow-visible"
      />
    );
  }

  return null;
}

function ScoreBadge({
  score,
  weightedScore,
  weight,
  subCategory,
  labels = defaultRubricsLabels,
}: {
  score?: number;
  weightedScore?: number;
  weight?: number;
  subCategory?: string;
  labels?: RubricsLabels;
}) {
  const num = typeof score === 'number' && !isNaN(score) ? score : undefined;

  const displayValue =
    typeof weightedScore === 'number' && !isNaN(weightedScore)
      ? weightedScore
      : score;
  const maxValue = weight ?? 100;

  const isDocumentation =
    subCategory?.toLowerCase() === 'documentation' ||
    subCategory?.toLowerCase() === 'clinical documentation';

  const styleKey =
    num === undefined
      ? 'na'
      : isDocumentation
        ? num >= 70
          ? 'exceptional'
          : num >= 51
            ? 'meet'
            : 'needsImprovement'
        : num > 90
          ? 'exceptional'
          : num >= 75
            ? 'meetsExpectations'
            : 'needsImprovement';

  const styleMap: Record<
    string,
    { bg: string; border: string; text: string; color: string; label: string }
  > = {
    na: {
      bg: 'bg-gray-100',
      border: 'border-gray-300',
      text: 'text-gray-500',
      color: '#6b7280',
      label: labels.na,
    },
    exceptional: {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      text: 'text-blue-600',
      color: '#1d4ed8',
      label: labels.exceptional,
    },
    meet: {
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      text: 'text-emerald-600',
      color: '#059669',
      label: labels.meetsExpectations,
    },
    meetsExpectations: {
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      text: 'text-emerald-600',
      color: '#059669',
      label: labels.meetsExpectations,
    },
    needsImprovement: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      text: 'text-red-700',
      color: '#b91c1c',
      label: labels.needsImprovement,
    },
  };

  const styles = styleMap[styleKey];

  return (
    <div
      className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold uppercase tracking-wider whitespace-nowrap flex-shrink-0"
      title={
        displayValue !== undefined
          ? `Score: ${formatScore(displayValue)} / ${maxValue}`
          : undefined
      }
    >
      <BadgeTrophy label={styles.label} score={num} />
      <span style={{ color: styles.color }}>{styles.label}</span>
    </div>
  );
}

function SequencingLabelBadge({
  score,
  labels = defaultRubricsLabels,
}: {
  score?: number;
  labels?: RubricsLabels;
}) {
  const pct = typeof score === 'number' && !isNaN(score) ? score : undefined;
  const styleKey =
    pct === undefined
      ? 'na'
      : pct > 90
        ? 'exceptional'
        : pct >= 75
          ? 'meetsExpectations'
          : 'needsImprovement';
  const styleMap: Record<string, { color: string; label: string }> = {
    na: { color: '#6b7280', label: labels.na },
    exceptional: { color: '#1d4ed8', label: labels.exceptional },
    meetsExpectations: { color: '#059669', label: labels.meetsExpectations },
    needsImprovement: { color: '#b91c1c', label: labels.needsImprovement },
  };
  const styles = styleMap[styleKey];
  return (
    <div className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold uppercase tracking-wider whitespace-nowrap flex-shrink-0">
      <BadgeTrophy label={styles.label} score={pct} />
      <span style={{ color: styles.color }}>{styles.label}</span>
    </div>
  );
}

type BadgeTone = 'good' | 'warn' | 'info' | 'danger' | 'neutral' | 'orange';

const BADGE_STYLES: Record<BadgeTone, { pill: string; dot: string }> = {
  good: {
    pill: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    dot: 'bg-emerald-500',
  },
  warn: {
    pill: 'bg-amber-50 border-amber-200 text-amber-800',
    dot: 'bg-amber-500',
  },
  info: {
    pill: 'bg-blue-50 border-blue-200 text-blue-800',
    dot: 'bg-blue-500',
  },
  danger: {
    pill: 'bg-red-50 border-red-200 text-red-800',
    dot: 'bg-red-500',
  },
  orange: {
    pill: 'bg-orange-50 border-orange-200 text-orange-800',
    dot: 'bg-orange-500',
  },
  neutral: {
    pill: 'bg-gray-100 border-gray-300 text-gray-600',
    dot: 'bg-gray-400',
  },
};

function SectionBadge({
  title,
  count,
  tone,
}: {
  title: string;
  count: number;
  tone: BadgeTone;
}) {
  const s = BADGE_STYLES[tone];
  // PDF text color mapped by label text (matches user-requested spec)
  const lower = title.toLowerCase();
  const pdfColor = lower.includes('strength')
    ? '#065f46'
    : lower.includes('weakness') || lower.includes('opportunit')
      ? '#dc2626'
      : lower.includes('optional')
        ? '#eab308'
        : lower.includes('distractor')
          ? '#b45309'
          : '#374151';
  return (
    <>
      {/* On-screen pill — stripped from PDF via ignoreElements */}
      <div
        className={`pdf-hide inline-flex items-center gap-2 rounded-full border px-3 py-1 ${s.pill}`}
      >
        <span className="text-xs font-bold uppercase tracking-wide">
          {title}
        </span>
        <span
          className={`${s.dot} text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0`}
        >
          {count}
        </span>
      </div>
      {/* PDF-only plain text label with numeric count — revealed in html2canvas onclone */}
      <span
        data-pdfonly
        aria-hidden="true"
        style={{
          display: 'none',
          color: pdfColor,
          fontWeight: 600,
          fontSize: '12px',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {title} ({count})
      </span>
    </>
  );
}

function cleanSequencingStrengthPoint(rawPoint: string): string {
  let cleaned = rawPoint.trim();
  cleaned = cleaned.replace(/^correctly\s+sequenced\s*:\s*/i, '');
  cleaned = cleaned.replace(/^correctly\s+sequenced\s+/i, '');
  cleaned = cleaned.replace(
    /\s*\(\s*(group|subgroup)\s+[a-z0-9\s>]+\s*\)/gi,
    ''
  );
  cleaned = cleaned.replace(/→\s*and\s+\d+\s+more.*/i, '');
  cleaned = cleaned.replace(/and\s+\d+\s+more.*/i, '');
  cleaned = cleaned.replace(/\s*performed\s*$/i, '');
  cleaned = cleaned.replace(/^['"“‘]+|['"”’]+$/g, '');
  return cleaned.trim() || rawPoint;
}

function isGenericGroupLabel(txt: string): boolean {
  if (!txt) return true;
  const clean = txt.trim().toLowerCase();
  if (/overall\s+sequencing/i.test(clean)) return true;
  if (/\bgroup\s+[a-z0-9]/i.test(clean)) return true;
  if (/\bsubgroup\s+[a-z0-9]/i.test(clean)) return true;
  if (/all\s+groups/i.test(clean)) return true;
  if (/\b(strict|flexible)\b/i.test(clean)) return true;
  if (/timing\s+requirement/i.test(clean)) return true;
  if (/review\s+scenario\s+clinical\s+guidelines/i.test(clean)) return true;
  return false;
}

function extractActionNamesFromSentence(text: string): string[] {
  if (!text) return [];
  const extracted: string[] = [];

  const matches = text.match(/['"“]([^'"”]+)['"”]/g);
  if (matches) {
    matches.forEach((m) => {
      const cleaned = cleanSequencingStrengthPoint(m);
      if (cleaned && !isGenericGroupLabel(cleaned)) {
        extracted.push(cleaned);
      }
    });
  }

  if (extracted.length === 0) {
    let cleanText = text;
    cleanText = cleanText.replace(/^specific\s+issues\s*:\s*/i, '');
    cleanText = cleanText.replace(/was\s+performed\s+(before|after).*/i, '');
    cleanText = cleanText.replace(/was\s+not\s+(completed|performed).*/i, '');
    cleanText = cleanText.replace(/was\s+completed\s+out\s+of\s+order.*/i, '');
    cleanText = cleanText.replace(
      /this\s+(group|subgroup)\s+includes\s*:\s*/i,
      ''
    );
    cleanText = cleanText.replace(/no\s+items\s+were\s+completed.*/i, '');
    const cleaned = cleanSequencingStrengthPoint(cleanText);
    if (cleaned && !isGenericGroupLabel(cleaned) && cleaned.length > 2) {
      extracted.push(cleaned);
    }
  }

  return extracted;
}

function extractOutOfOrderActions(
  weaknessList: StrengthWeakness[],
  parentResultsArr: SequencingParentResult[],
  _fallbackDefault?: string
): string[] {
  const actions: string[] = [];

  for (const w of weaknessList) {
    if (w.point) {
      actions.push(...extractActionNamesFromSentence(w.point));
    }
    if (w.example) {
      actions.push(...extractActionNamesFromSentence(w.example));
    }
  }

  if (Array.isArray(parentResultsArr)) {
    for (const pr of parentResultsArr) {
      if (Array.isArray(pr.failedReasons)) {
        for (const reason of pr.failedReasons) {
          actions.push(...extractActionNamesFromSentence(reason));
        }
      }
      if (pr.parentLabel && !isGenericGroupLabel(pr.parentLabel)) {
        const cleaned = cleanSequencingStrengthPoint(pr.parentLabel);
        if (cleaned && !isGenericGroupLabel(cleaned)) {
          actions.push(cleaned);
        }
      }
    }
  }

  return Array.from(new Set(actions)).filter(Boolean);
}

function buildSequencingSummaryText(
  passedCount: number,
  totalCount: number,
  labels: RubricsLabels
): string {
  const contextSentence =
    labels.seqSummaryContext || defaultRubricsLabels.seqSummaryContext!;
  let performanceSentence = '';

  if (passedCount === totalCount) {
    performanceSentence = (
      labels.seqPerfAll || defaultRubricsLabels.seqPerfAll!
    )
      .replace('{passed}', String(passedCount))
      .replace('{total}', String(totalCount));
  } else if (passedCount > 0 && passedCount >= Math.floor(totalCount / 2)) {
    performanceSentence = (
      labels.seqPerfMost || defaultRubricsLabels.seqPerfMost!
    )
      .replace('{passed}', String(passedCount))
      .replace('{total}', String(totalCount));
  } else if (passedCount > 0) {
    performanceSentence = (
      labels.seqPerfFew || defaultRubricsLabels.seqPerfFew!
    )
      .replace('{passed}', String(passedCount))
      .replace('{total}', String(totalCount));
  } else {
    performanceSentence = (
      labels.seqPerfNone || defaultRubricsLabels.seqPerfNone!
    )
      .replace('{passed}', String(passedCount))
      .replace('{total}', String(totalCount));
  }

  return `${contextSentence} ${performanceSentence}`;
}

export function isNotPerformed(text?: string | null): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return (
    lower.includes('no evidence') ||
    lower.includes('not documented') ||
    lower.includes('not found') ||
    lower.includes('not detected') ||
    lower.includes('not recorded') ||
    lower.includes('was not performed') ||
    lower.includes('was not administered') ||
    lower.includes('not performed') ||
    lower.includes('not completed') ||
    lower.includes('no se realizó') ||
    lower.includes('no documentado')
  );
}

export function stripActionPhrasing(text?: string | null): string {
  if (!text) return '';

  // Prefer quoted title when available (e.g. '...action "Obtain Vital Signs"' -> 'Obtain Vital Signs')
  const quotedMatch = text.match(/["'“]([^"'”]+)["'”]/);
  if (quotedMatch && quotedMatch[1]?.trim()) {
    return quotedMatch[1].trim();
  }

  // De-duplicate action phrasing
  const cleaned = text
    .replace(
      /^Correctly\s+(?:completed|performed|administered)\s*(?:action\s*)?:?\s*/i,
      ''
    )
    .replace(
      /^(?:Failed to|Did not|Omitted|Missed)\s+(?:complete|perform|administer)\s*(?:action\s*)?:?\s*/i,
      ''
    )
    .replace(/^Correctly performed vital signs action\s*/i, '')
    .replace(/^Completed action\s*/i, '')
    .replace(/\s+correctly$/i, '')
    .replace(/^Criterion\s+(?:not\s+)?met\s*:\s*/i, '')
    .replace(/^Criterio\s+(?:no\s+)?cumplido\s*:\s*/i, '')
    .trim();

  return cleaned || text;
}

function buildGeneratedNarrative(
  allStrengthsCount: number,
  allWeaknessesCount: number,
  distractorCount: number,
  optionalCount: number,
  fallbackSummary: string | undefined,
  labels: RubricsLabels
): string {
  const totalPriority = allStrengthsCount + allWeaknessesCount;

  if (totalPriority === 0) {
    return (
      fallbackSummary ||
      labels.noMandatoryActions ||
      'No mandatory actions required for this simulation.'
    );
  }

  let narrative = (
    labels.prioritySummary ||
    'The student correctly completed {correct} of the {total} required priority item(s) for this simulation.'
  )
    .replace('{correct}', String(allStrengthsCount))
    .replace('{total}', String(totalPriority));

  const nonPriorityCount = distractorCount + optionalCount;
  if (nonPriorityCount > 0) {
    narrative +=
      ' ' +
      (
        labels.otherNonPrioritySummary ||
        'Other non-priority items were also completed correctly ({count}).'
      ).replace('{count}', String(nonPriorityCount));
  }

  return narrative;
}

function ItemRow({
  item,
  tone,
  performedMultipleTimesLabel = 'Performed multiple times',
}: {
  item: StrengthWeakness;
  tone: BadgeTone;
  performedMultipleTimesLabel?: string;
}) {
  const s = BADGE_STYLES[tone];
  const Icon = tone === 'good' ? CheckCircle : AlertCircle;
  return (
    <div data-pdf-nobreak className="flex items-start gap-3 py-2.5">
      <div
        className={`w-6 h-6 rounded-full ${s.dot} flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm`}
      >
        <Icon className="w-3.5 h-3.5 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-800 leading-relaxed">
          {stripActionPhrasing(item.point)}
        </p>
        {(() => {
          const isMultipleTimes =
            (typeof item.count === 'number' && item.count > 1) ||
            /performed\s+multiple\s+times|multiple\s+times|varias\s+veces|realizado\s+varias\s+veces|repetido/i.test(
              `${item.example ?? ''} ${item.point ?? ''}`
            );

          const isMultipleTimesExample =
            /^(performed\s+multiple\s+times|multiple\s+times|varias\s+veces|realizado\s+varias\s+veces|repetido)$/i.test(
              (item.example ?? '').trim()
            );

          const isMedication =
            (item.example ?? '').toLowerCase().includes('medication') ||
            (item.example ?? '').toLowerCase().includes('medicamento');

          return (
            <>
              {isMultipleTimes && (
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                  {performedMultipleTimesLabel}
                </p>
              )}
              {isMedication ? (
                tone === 'good' ? (
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                    {item.example}
                  </p>
                ) : (
                  <p className="text-xs text-gray-500 mt-0.5 italic leading-relaxed">
                    {item.example}
                  </p>
                )
              ) : item.example && tone !== 'good' && !isMultipleTimesExample ? (
                <p className="text-xs text-gray-500 mt-0.5 italic leading-relaxed">
                  {item.example}
                </p>
              ) : null}
            </>
          );
        })()}
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ActionRow({
  action,
  tone,
}: {
  action: ActionDetail;
  tone: BadgeTone;
}) {
  const s = BADGE_STYLES[tone];
  const isInstructor = tone === 'neutral';
  // Optional medications surface in this row regardless of correctness so the
  // learner can see they administered it. Reflect the result with a status
  // badge / red icon when the attempt was not fully correct.
  const isMedication = action.type === 'medication';
  const isIncorrect = isMedication && action.isCorrect === false;
  return (
    <div data-pdf-nobreak className="flex items-start gap-3 py-2.5">
      <div
        className={`w-6 h-6 rounded-full ${
          isIncorrect ? 'bg-red-500' : s.dot
        } flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm`}
      >
        {isIncorrect ? (
          <XCircle className="w-3.5 h-3.5 text-white" />
        ) : (
          <CheckCircle className="w-3.5 h-3.5 text-white" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={`text-sm leading-relaxed ${isInstructor ? 'italic text-gray-500' : 'font-medium text-gray-800'}`}
        >
          {action.title}
        </p>
        {isMedication && (
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
            {isIncorrect
              ? 'Medication performed incorrectly'
              : 'Medication performed correctly'}
          </p>
        )}
        {isInstructor && (
          <p className="text-xs text-gray-400 mt-0.5">
            Not part of the scenario codes — excluded for educator review
          </p>
        )}
      </div>
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <p className="text-sm text-gray-400 italic pl-1 py-1">{text}</p>;
}

// ─────────────────────────────────────────────────────────────

export default function RubricsSection({
  rubrics,
  userRole,
  mode,
  mandatoryActions: _ma,
  optionalActions: _oa,
  medicationGradingResults,
  mandatoryMedicationTitles,
  sbarStatus,
  scenarioRubricConfig,
  tcTypeRequirement,
  labels = defaultRubricsLabels,
  language = 'en',
  sequenceLabelMap,
  onFlatScoreComputed,
}: {
  rubrics: RubricsPayload;
  userRole?: string;
  mode?: 'Practice' | 'Assessment' | string;
  mandatoryActions?: ActionDetail[];
  optionalActions?: ActionDetail[];
  medicationGradingResults?: MedicationGradingResult[];
  mandatoryMedicationTitles?: string[];
  sbarStatus?: string | null;
  scenarioRubricConfig?: Array<{
    id: string;
    weight: number;
    subCategory: string;
  }>;
  tcTypeRequirement?: string;
  labels?: RubricsLabels;
  language?: 'en' | 'es';
  sequenceLabelMap?: Record<string, string>;
  onFlatScoreComputed?: (
    flatScore: number,
    combinedWeight: number,
    backendActionsWeightedScore: number,
    backendMedsWeightedScore: number
  ) => void;
}) {
  const isPractice = mode === 'Practice';
  const isAdmin = userRole === 'admin' || userRole === 'Admin';
  const itemsArray: RubricItem[] = rubrics?.items
    ? Object.values(rubrics.items)
    : [];

  const categoryOrder = [
    'Action',
    'Actions & Interventions',
    'Medications',
    'Expected Actions',
    'PPE, Privacy, & Safety Actions',
    'PPE',
    'Privacy & Safety',
    'Documentation',
    'Clinical Documentation',
    'Communication',
    'Professional Communication',
    'Timeline',
    'Timing',
  ];

  // Flat-pool combined score for the Actions+Medications card badge.
  // Computed inside the medications block and reused in the grouped Map merge.
  let flatPoolMergedScore: number | undefined;
  let flatPoolCombinedWeight: number | undefined;
  let flatScoreArgs: {
    combinedScore: number;
    combinedWeight: number;
    actionWS: number;
    medWS: number;
  } | null = null;

  // Build / replace the Medications rubric item using medicationGradingResults
  // (MAR data). Scoring is all-or-nothing per medication: a medication is only
  // counted as correct when every configured expected field matches; otherwise
  // it receives zero credit. Optional medications (Grading Configuration
  // toggle = Optional) are still surfaced (and visible in the transcript) but
  // do not contribute to mandatory totals — they appear in the rubric's
  // "Optional Actions Completed" group only when administered correctly.
  if (
    (medicationGradingResults && medicationGradingResults.length > 0) ||
    (mandatoryMedicationTitles && mandatoryMedicationTitles.length > 0)
  ) {
    const medStrengths: StrengthWeakness[] = [];
    const medWeaknesses: StrengthWeakness[] = [];
    const optionalActionDetails: ActionDetail[] = [];
    const distractorActionDetails: ActionDetail[] = [];
    const administeredTitles = new Set<string>();
    let mandatoryTotal = 0;
    let mandatoryCorrect = 0;
    // Only the FIRST administration of each medication counts toward grading.
    // PRN and repeat administrations would otherwise show the same medication
    // in both Strengths and Weaknesses (e.g. first attempt correct, second
    // attempt incorrect would double-count the same order). Dedupe by the
    // medication id when available, else by the order title.
    const seenMedKeys = new Set<string>();
    const dedupedResults = (medicationGradingResults ?? []).filter((r) => {
      const key = (r.medicationId || r.orderTitle || r.medicationName || '')
        .trim()
        .toLowerCase();
      if (!key) {
        return true;
      }
      if (seenMedKeys.has(key)) {
        return false;
      }
      seenMedKeys.add(key);
      return true;
    });
    for (const medResult of dedupedResults) {
      const medName = medResult.orderTitle || medResult.medicationName;
      administeredTitles.add(medName.trim().toLowerCase());
      const isCorrect = medResult.overallScore >= 100;

      // Distractor: administered but should NOT have been
      if ((medResult as { isDistractor?: boolean }).isDistractor) {
        distractorActionDetails.push({
          title: medName,
          type: 'distractor',
          isOptional: false,
          isCorrect,
          attemptsCount: 1,
        });
        continue;
      }

      // mandatory defaults to true for backwards-compatibility with results
      // produced before the Mandatory/Optional toggle was introduced.
      const isMandatory = medResult.mandatory !== false;
      if (!isMandatory) {
        optionalActionDetails.push({
          title: medName,
          type: 'medication',
          isOptional: true,
          isCorrect,
          attemptsCount: 1,
        });
        continue;
      }
      mandatoryTotal += 1;
      if (isCorrect) {
        mandatoryCorrect += 1;
        medStrengths.push({
          point: medName,
          example: labels.medicationAdministeredCorrectly,
        });
      } else {
        medWeaknesses.push({
          point: medName,
          example: labels.medicationNotAdministeredCorrectly,
        });
      }
    }
    // Surface mandatory medications that the learner never attempted as
    // weaknesses so they count against the rubric score.
    //
    // The scenario endpoint returns canonical (English) medication titles
    // while grading results carry localized (translated) titles, so a
    // title-only lookup can misclassify an administered medication as
    // "missed" (double-counting it in both Strengths and Weaknesses).
    // Cap the number of missed entries by the count of mandatory titles
    // that lack a corresponding mandatory grading result — if the learner
    // has as many mandatory results as expected, treat all as attempted.
    const expectedMandatoryCount = (mandatoryMedicationTitles ?? []).length;
    const mandatoryResultsCount = dedupedResults.filter(
      (r) =>
        r.mandatory !== false && !(r as { isDistractor?: boolean }).isDistractor
    ).length;
    const trueMissedCount = Math.max(
      0,
      expectedMandatoryCount - mandatoryResultsCount
    );
    let missedMandatoryCount = 0;
    for (const title of mandatoryMedicationTitles ?? []) {
      if (missedMandatoryCount >= trueMissedCount) {
        break;
      }
      const key = title.trim().toLowerCase();
      if (!key || administeredTitles.has(key)) {
        continue;
      }
      mandatoryTotal += 1;
      missedMandatoryCount += 1;
      medWeaknesses.push({
        point: title,
        example: labels.mandatoryMedicationMissed,
      });
    }
    const avgScore =
      mandatoryTotal > 0
        ? Math.round((mandatoryCorrect / mandatoryTotal) * 100)
        : 100;
    // Get actual weight from scenario rubric configuration, fallback to 15
    const medsWeight =
      scenarioRubricConfig?.find(
        (r) => r.subCategory === 'Medications' || r.id === 'rubric_medications'
      )?.weight ?? 15;
    // Count only correctly administered optional medications
    const correctOptionalCount = optionalActionDetails.filter(
      (d) => d.isCorrect === true
    ).length;
    const summaryText =
      mandatoryTotal === 0
        ? correctOptionalCount > 0
          ? labels.medicationsSummaryOptional.replace(
              '{n}',
              String(correctOptionalCount)
            )
          : labels.medicationsSummaryNone
        : mandatoryCorrect === mandatoryTotal
          ? labels.medicationsSummaryAllCorrect
          : missedMandatoryCount > 0 && mandatoryCorrect === 0
            ? labels.medicationsSummaryAllMissed.replace(
                '{n}',
                String(missedMandatoryCount)
              )
            : labels.medicationsSummaryPartial
                .replace('{a}', String(mandatoryCorrect))
                .replace('{b}', String(mandatoryTotal));
    const medRubricItem: RubricItem = {
      id: 'rubric_medications',
      name: 'Medications',
      subCategory: 'Medications',
      score: avgScore,
      weightedScore: Math.round((avgScore / 100) * medsWeight),
      weight: medsWeight,
      summary: summaryText,
      strengths: medStrengths,
      weaknesses: medWeaknesses,
      actionDetails: [...optionalActionDetails, ...distractorActionDetails],
    };

    // Compute flat-pool score (Actions + Medications treated as equal items)
    // and notify the parent so it can show a corrected overall score.
    {
      const actionIdx = itemsArray.findIndex((it) => {
        const sub = (it?.subCategory ?? '').toLowerCase();
        const nm = (it?.name ?? '').toLowerCase();
        return (
          sub === 'action' ||
          sub === 'actions & interventions' ||
          sub === 'action / clinical interventions' ||
          nm === 'action' ||
          nm === 'actions & interventions'
        );
      });
      if (actionIdx >= 0) {
        const actionItem = itemsArray[actionIdx];
        const mandatoryActionDetails = (actionItem.actionDetails ?? []).filter(
          (d) => d.isOptional !== true && d.type !== 'distractor'
        );
        const mandatoryActionsTotal = mandatoryActionDetails.length;
        const mandatoryActionsCorrect = mandatoryActionDetails.filter((d) => {
          if (d.type === 'vital') {
            return ((d.attemptsCount as number) ?? 0) > 0;
          }
          return d.isCorrect === true;
        }).length;
        const actionWeight = actionItem.weight ?? 0;
        const combinedWeight = actionWeight + medsWeight;
        const flatTotal = mandatoryActionsTotal + mandatoryTotal;
        const flatCorrect = mandatoryActionsCorrect + mandatoryCorrect;
        const combinedScore =
          flatTotal > 0
            ? Math.round((flatCorrect / flatTotal) * 100)
            : (actionItem.score ?? 100);
        flatPoolMergedScore = combinedScore;
        flatPoolCombinedWeight = combinedWeight;
        flatScoreArgs = {
          combinedScore,
          combinedWeight,
          actionWS: actionItem.weightedScore ?? 0,
          medWS: medRubricItem.weightedScore ?? 0,
        };
      }
    }

    // If a Medications rubric already exists (e.g. AI-generated), replace it
    // so the UI consistently shows the MAR-driven per-medication result.
    const existingIdx = itemsArray.findIndex(
      (it) =>
        (it?.subCategory ?? '').toLowerCase() === 'medications' ||
        (it?.name ?? '').toLowerCase() === 'medications'
    );
    if (existingIdx >= 0) {
      itemsArray[existingIdx] = medRubricItem;
    } else {
      itemsArray.push(medRubricItem);
    }
  }

  useEffect(() => {
    if (flatScoreArgs && onFlatScoreComputed) {
      onFlatScoreComputed(
        flatScoreArgs.combinedScore,
        flatScoreArgs.combinedWeight,
        flatScoreArgs.actionWS,
        flatScoreArgs.medWS
      );
    }
  }, [
    flatScoreArgs?.combinedScore,
    flatScoreArgs?.combinedWeight,
    flatScoreArgs?.actionWS,
    flatScoreArgs?.medWS,
    onFlatScoreComputed,
  ]);

  const sortedItems = [...itemsArray].sort((a, b) => {
    const aKey = (a?.subCategory ?? a?.name ?? '').toLowerCase();
    const bKey = (b?.subCategory ?? b?.name ?? '').toLowerCase();
    const ai = categoryOrder.findIndex((c) => aKey === c.toLowerCase());
    const bi = categoryOrder.findIndex((c) => bKey === c.toLowerCase());
    if (ai !== -1 && bi !== -1) {
      return ai - bi;
    }
    if (ai !== -1) {
      return -1;
    }
    if (bi !== -1) {
      return 1;
    }
    return 0;
  });

  const isSequencingItem = (item: RubricItem): boolean => {
    const subCategory = String(item?.subCategory ?? '')
      .toLowerCase()
      .trim();
    const name = String(item?.name ?? '')
      .toLowerCase()
      .trim();
    const hasSequencingLabel =
      /sequencing|prioritization/.test(subCategory) ||
      /sequencing|prioritization/.test(name);
    return (
      hasSequencingLabel ||
      subCategory === 'timeline' ||
      name === 'timeline & timing'
    );
  };

  const sequencingCandidates = sortedItems.filter((item) =>
    isSequencingItem(item)
  );
  const preferredSequencingItem =
    sequencingCandidates.find(
      (item) =>
        Array.isArray(item.parentResults) && item.parentResults.length > 0
    ) ?? sequencingCandidates[0];

  const normalizedItems: RubricItem[] = sortedItems.filter(
    (item) => !isSequencingItem(item)
  );

  if (preferredSequencingItem) {
    normalizedItems.push({
      ...preferredSequencingItem,
      name: labels.sequencing,
      subCategory: 'Sequencing & Prioritization',
    });
  }

  // Translator for sequencing-specific point/example strings (applies label map
  // then known phrase templates, then default label word swaps)
  const translateSeqText = (raw: string | undefined | null): string =>
    translateSequencingPhrase(raw, language, sequenceLabelMap);

  // Standard documentation / action checklist point titles and example strings
  // are stored in English inside the report JSON (they are canonical labels
  // produced by the backend). Translate them here for display so existing
  // reports render in the active locale without requiring regeneration.
  // Mirrors the HS-online-AI-app implementation.
  const DOC_POINT_ES: Record<string, string> = {
    'assessment findings documented via action tab observations':
      'Hallazgos de evaluación documentados mediante observaciones de la pestaña de acciones',
    'assessment findings documented':
      'Hallazgos de evaluación documentados mediante observaciones de la pestaña de acciones',
    'interventions documented via action tab observations':
      'Intervenciones documentadas mediante observaciones de la pestaña de acciones',
    'interventions documented':
      'Intervenciones documentadas mediante observaciones de la pestaña de acciones',
    'vital signs documented': 'Signos vitales documentados',
    'medical & health history updated':
      'Historia médica y de salud actualizada',
    'medical and health history updated':
      'Historia médica y de salud actualizada',
    'medical history updated': 'Historia médica y de salud actualizada',
    'medical and health history tab updated':
      'Ficha de historial médico y de salud actualizada',
    'patient emotional response documented':
      'Respuesta emocional del paciente documentada',
    'patient education documented': 'Educación al paciente documentada',
    'actions, assessment & intervention documentation':
      'Documentación de acciones, evaluación e intervención',
    'actions, assessment and intervention documentation':
      'Documentación de acciones, evaluación e intervención',
  };

  const DOC_EXAMPLE_ES: Record<string, string> = {
    'no history tab fields were updated (recorded details, chief complaint, allergies, medications, social history, immunizations, or additional notes)':
      'No se actualizaron los campos de la ficha de Historial (Detalles Registrados, Queja Principal, Alergias, Medicamentos, Historia Social, Inmunizaciones o Notas Adicionales)',
    'no observations documented in any action':
      'No se documentaron observaciones en ninguna acción',
    'no documentation found': 'No se encontró documentación',
    'medication was not administered correctly.':
      'El medicamento no se administró correctamente.',
    'mandatory medication was not administered.':
      'El medicamento obligatorio no fue administrado.',
  };

  // Communication rubric weakness/strength points sometimes arrive prefixed
  // with "Criterion not met: <English title>" (or the partially-translated
  // Spanish "Criterio no cumplido: <English title>"). Translate the trailing
  // criterion title when it matches a well-known default.
  const CRITERION_TITLE_ES: Record<string, string> = {
    'demonstrate empathy': 'Demostrar empatía',
    'use patient-centered communication strategies':
      'Utilizar estrategias de comunicación centradas en el paciente',
  };

  const translateCriterionTitle = (title: string): string => {
    if (!title) return title;
    const normalized = title.trim().toLowerCase().replace(/\s+/g, ' ');
    return CRITERION_TITLE_ES[normalized] ?? title;
  };

  const CRITERION_PREFIX_RE =
    /^(Criterio(?:n)?\s+(?:no\s+)?(?:not\s+)?(?:met|cumplido)\s*:\s*)(.+)$/i;

  const translateDocPoint = (raw?: string | null): string => {
    if (!raw) return raw ?? '';
    if (language !== 'es') return raw;
    const key = raw.toLowerCase().trim();
    const direct = DOC_POINT_ES[key];
    if (direct) return direct;
    const m = raw.match(CRITERION_PREFIX_RE);
    if (m) {
      return `${m[1]}${translateCriterionTitle(m[2])}`;
    }
    return translateCriterionTitle(raw);
  };

  const translateDocExample = (raw?: string | null): string | undefined => {
    if (!raw) return raw ?? undefined;
    if (language !== 'es') return raw;
    const key = raw.toLowerCase().trim();
    return DOC_EXAMPLE_ES[key] ?? raw;
  };

  const translateSwItem = (s: StrengthWeakness): StrengthWeakness => {
    // Try a medication-name lookup first so titles like
    // "Cold Therapy – Ice Application" become their Spanish counterpart.
    // Fall back to the generic documentation-point translator (which also
    // no-ops when language is English).
    const medTranslated = translateMedName(s.point, language);
    return {
      ...s,
      point:
        medTranslated !== s.point ? medTranslated : translateDocPoint(s.point),
      example: s.example ? translateDocExample(s.example) : s.example,
    };
  };

  // Translate backend-stored English rubric section names to the active locale
  // using the labels already provided by the parent (same source as HS app).
  const translateRubricName = (name?: string | null): string => {
    if (!name) return 'Rubric Item';
    const key = name.toLowerCase().trim();
    const actionsTitleVal = labels.actionsTitle || labels.actions;
    const nameMap: Record<string, string> = {
      action: actionsTitleVal,
      'actions & interventions': actionsTitleVal,
      'actions and interventions': actionsTitleVal,
      'expected actions': actionsTitleVal,
      'completion of assessments, care, interventions, & tasks':
        actionsTitleVal,
      medications: labels.medications,
      medication: labels.medications,
      ppe: labels.ppe,
      'ppe, privacy & safety': labels.ppe,
      'ppe, privacy, & safety actions': labels.ppe,
      'privacy & safety': labels.ppe,
      documentation: labels.documentation,
      'clinical documentation': labels.documentation,
      'clinical documentation quality': labels.documentation,
      'completion of documentation in the electronic record':
        labels.documentation,
      communication: labels.communication,
      'professional communication': labels.communication,
      'demonstration of professional & therapeutic communication':
        labels.communication,
      'prioritization of care': labels.sequencing,
      'sequencing & prioritization': labels.sequencing,
      sequencing: labels.sequencing,
    };
    return nameMap[key] ?? name;
  };

  const grouped = new Map<string, RubricItem[]>();
  for (const item of normalizedItems) {
    const key = item?.subCategory ?? 'Other';
    const bucket = grouped.get(key) ?? [];
    bucket.push(item);
    grouped.set(key, bucket);
  }

  // Consolidate Medications into the Actions & Interventions section
  // (mirrors HS student app behaviour — one combined card instead of two)
  {
    const actionKeys = [
      'action',
      'actions & interventions',
      'actions and interventions',
      'expected actions',
    ];
    const medicationKeys = ['medications', 'medication'];
    let actionGroupKey: string | undefined;
    let medicationGroupKey: string | undefined;
    for (const key of grouped.keys()) {
      const lk = key.toLowerCase().trim();
      if (!actionGroupKey && actionKeys.some((ak) => lk === ak))
        actionGroupKey = key;
      if (!medicationGroupKey && medicationKeys.some((mk) => lk === mk))
        medicationGroupKey = key;
    }
    if (actionGroupKey && medicationGroupKey) {
      const actionItems = grouped.get(actionGroupKey)!;
      const medItems = grouped.get(medicationGroupKey)!;
      const primaryAction = actionItems[0];
      const primaryMed = medItems[0];
      if (primaryAction && primaryMed) {
        const combinedActionWeight = primaryAction.weight ?? 0;
        const combinedMedWeight = primaryMed.weight ?? 0;
        const combinedWeight =
          flatPoolCombinedWeight ?? combinedActionWeight + combinedMedWeight;
        // Use flat-pool count-based score when available (matches HS student app badge)
        const mergedScore =
          flatPoolMergedScore !== undefined
            ? flatPoolMergedScore
            : combinedWeight > 0
              ? Math.round(
                  ((primaryAction.score ?? 100) * combinedActionWeight +
                    (primaryMed.score ?? 100) * combinedMedWeight) /
                    combinedWeight
                )
              : Math.min(primaryAction.score ?? 100, primaryMed.score ?? 100);
        const mergedWeightedScore = Math.round(
          (mergedScore / 100) * combinedWeight
        );
        const mergedSummary = [primaryAction.summary, primaryMed.summary]
          .filter(Boolean)
          .join(' ');
        // Match HS-online reference: only dedupe primaryAction.recommendations —
        // do NOT concatenate primaryMed.recommendations, which caused duplicate
        // "No items identified." bullets when the backend placed the same
        // placeholder in both action and medication rubric items.
        const mergedRecommendations = Array.from(
          new Set(
            (primaryAction.recommendations ?? [])
              .map((r) => (r ?? '').toString().trim())
              .filter(Boolean)
          )
        );
        const mergedItem: RubricItem = {
          ...primaryAction,
          score: mergedScore,
          weightedScore: mergedWeightedScore,
          weight: combinedWeight,
          summary: mergedSummary || primaryAction.summary,
          strengths: [
            ...(primaryAction.strengths ?? []),
            ...(primaryMed.strengths ?? []),
          ],
          weaknesses: [
            ...(primaryAction.weaknesses ?? []),
            ...(primaryMed.weaknesses ?? []),
          ],
          actionDetails: [
            ...(primaryAction.actionDetails ?? []),
            ...(primaryMed.actionDetails ?? []),
          ],
          recommendations: mergedRecommendations,
        };
        grouped.set(actionGroupKey, [mergedItem, ...actionItems.slice(1)]);
        grouped.delete(medicationGroupKey);
      }
    }
  }

  return (
    <div className="space-y-6">
      {Array.from(grouped.entries()).map(([subCategory, items]) =>
        items.map((item) => {
          // Medications are consolidated into the Actions section above.
          const _rawStrengths = item.strengths ?? [];
          const _rawWeaknesses = item.weaknesses ?? [];
          const isSeqItem = !!(item.subCategory ?? item.name ?? '')
            .toLowerCase()
            .match(/sequencing|prioritization/);
          const _rawAllStrengths: StrengthWeakness[] = isSeqItem
            ? _rawStrengths.map((s) => ({
                ...s,
                point: translateSeqText(s.point) || s.point,
                example: s.example ? translateSeqText(s.example) : s.example,
              }))
            : _rawStrengths.map(translateSwItem);
          const _rawAllWeaknesses: StrengthWeakness[] = isSeqItem
            ? _rawWeaknesses.map((s) => ({
                ...s,
                point: translateSeqText(s.point) || s.point,
                example: s.example ? translateSeqText(s.example) : s.example,
              }))
            : _rawWeaknesses.map(translateSwItem);

          const allStrengths: StrengthWeakness[] = [];
          const _seenSt = new Set<string>();
          for (const st of _rawAllStrengths) {
            const cleanPoint = stripActionPhrasing(st.point)
              .trim()
              .toLowerCase();
            const cleanEx = (st.example ?? '').trim().toLowerCase();
            const key = `${cleanPoint}::${cleanEx}`;
            if (!_seenSt.has(key)) {
              _seenSt.add(key);
              allStrengths.push(st);
            }
          }

          const allWeaknesses: StrengthWeakness[] = [];
          const _seenWk = new Set<string>();
          for (const wk of _rawAllWeaknesses) {
            const cleanPoint = stripActionPhrasing(wk.point)
              .trim()
              .toLowerCase();
            const cleanEx = (wk.example ?? '').trim().toLowerCase();
            const key = `${cleanPoint}::${cleanEx}`;
            if (!_seenWk.has(key)) {
              _seenWk.add(key);
              allWeaknesses.push(wk);
            }
          }

          const optionalDone = (item.actionDetails ?? []).filter(
            (d: ActionDetail) => {
              // For optional actions, show them if they were attempted (attemptsCount > 0)
              // For vital-type optional actions, even incorrect attempts should be shown as completed
              if (d.isOptional === true) {
                if (d.type === 'vital') {
                  return ((d.attemptsCount as number) ?? 0) > 0; // Show if any vitals were recorded
                }
                // Optional medications: only show if administered correctly.
                if (d.type === 'medication') {
                  return d.isCorrect === true;
                }
                return d.isCorrect === true; // For non-vitals, show only if correct
              }
              return false;
            }
          );
          // Distractor entries have no 'completed' field; their presence means they were performed
          const distractorDone = (item.actionDetails ?? []).filter(
            (d: ActionDetail) => d.type === 'distractor'
          );
          const isSequencing = !!(item.subCategory ?? item.name ?? '')
            .toLowerCase()
            .match(/sequencing|prioritization/);
          const hasParentValidation =
            isSequencing &&
            Array.isArray(item.parentResults) &&
            item.parentResults.length > 0;

          const rubricTitle = translateRubricName(item.name);
          const rawId = item.id || item.subCategory || item.name || 'rubric';
          const rubricAnchorId = `rubric-${rawId.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

          return (
            <div
              id={rubricAnchorId}
              key={item.id ?? item.name ?? subCategory}
              data-jump-section
              data-jump-title={rubricTitle}
              data-pdf-rubric
              className="scroll-mt-16 sm:scroll-mt-20 bg-white rounded-lg border border-gray-200 p-6"
            >
              {/* ── Section header ── */}
              <div className="mb-4 space-y-1">
                <div className="flex items-center justify-between gap-4">
                  <h3 className="text-xl font-bold text-[#db8833] min-w-0 flex-1">
                    {translateRubricName(item.name)}
                  </h3>
                  {isSequencing ? (
                    <SequencingLabelBadge score={item.score} labels={labels} />
                  ) : (
                    <ScoreBadge
                      score={item.score}
                      weightedScore={item.weightedScore}
                      weight={item.weight ?? 20}
                      subCategory={item.subCategory}
                      labels={labels}
                    />
                  )}
                </div>
                {!isPractice && (
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">
                    {labels.weight} {item.weight ?? 20}%
                  </p>
                )}
              </div>

              {/* ── Summary ── */}
              {isSequencing
                ? (() => {
                    const parentResultsArr = Array.isArray(item.parentResults)
                      ? item.parentResults
                      : [];
                    const totalCount = parentResultsArr.length;
                    const passedCount = parentResultsArr.filter(
                      (p) => p.passed
                    ).length;

                    if (totalCount === 0) {
                      return (
                        <p className="text-sm text-gray-500 italic mb-5">
                          {labels.sequencingPending}
                        </p>
                      );
                    }

                    const derivedSummary = buildSequencingSummaryText(
                      passedCount,
                      totalCount,
                      labels
                    );

                    return (
                      <p className="text-sm text-gray-600 mb-5 leading-relaxed">
                        {derivedSummary}
                      </p>
                    );
                  })()
                : (() => {
                    const isMedications =
                      item.subCategory?.toLowerCase() === 'medications' ||
                      item.name?.toLowerCase() === 'medications';

                    if (isMedications) {
                      return (
                        <p className="text-sm text-gray-600 mb-5 leading-relaxed whitespace-pre-line">
                          {item.summary}
                        </p>
                      );
                    }

                    const isComm =
                      item.subCategory?.toLowerCase() === 'communication' ||
                      item.subCategory?.toLowerCase() ===
                        'professional communication' ||
                      item.name?.toLowerCase().includes('communication');

                    const narrativeText = isComm
                      ? item.summary
                      : buildGeneratedNarrative(
                          allStrengths.length,
                          allWeaknesses.length,
                          distractorDone.length,
                          optionalDone.length,
                          item.summary,
                          labels
                        );

                    return narrativeText ? (
                      <p className="text-sm text-gray-600 mb-5 leading-relaxed whitespace-pre-line">
                        {narrativeText}
                      </p>
                    ) : null;
                  })()}

              {hasParentValidation && item.parentResults
                ? (() => {
                    const parentResultsArr = Array.isArray(item.parentResults)
                      ? item.parentResults
                      : [];

                    const sequencingStrengths: StrengthWeakness[] =
                      item.strengths && item.strengths.length > 0
                        ? item.strengths.map((s) => ({
                            ...s,
                            point: cleanSequencingStrengthPoint(
                              translateSeqText(s.point) || s.point
                            ),
                          }))
                        : parentResultsArr
                            .filter((p) => p.passed)
                            .map((parent) => ({
                              point: cleanSequencingStrengthPoint(
                                parent.parentLabel || parent.parentRef || ''
                              ),
                            }));

                    const rawWeaknessList =
                      item.weaknesses && item.weaknesses.length > 0
                        ? item.weaknesses
                        : [];

                    const fallbackDefault =
                      labels.seqExampleOutOfOrderGeneric ||
                      defaultRubricsLabels.seqExampleOutOfOrderGeneric!;

                    const outOfOrderActions = extractOutOfOrderActions(
                      rawWeaknessList,
                      parentResultsArr,
                      fallbackDefault
                    );

                    const sequencingWeaknesses: StrengthWeakness[] =
                      outOfOrderActions.map((actionName) => ({
                        point: actionName,
                      }));

                    return (
                      <div className="space-y-4">
                        {/* STRENGTHS */}
                        <div
                          data-pdf-card
                          className="rounded-2xl border border-emerald-100 bg-emerald-50/60 border-l-[3px] border-l-emerald-500 p-4 sm:p-5"
                        >
                          <div className="mb-3">
                            <SectionBadge
                              title={labels.strengths}
                              count={sequencingStrengths.length}
                              tone="good"
                            />
                          </div>
                          <div className="pl-3 sm:pl-4 space-y-3">
                            <p className="text-xs font-semibold text-emerald-800/80 uppercase tracking-wider">
                              {labels.seqSublabelPrioritizedCorrectly ||
                                'ITEMS PRIORITIZED CORRECTLY'}
                            </p>
                            {sequencingStrengths.length === 0 ? (
                              <EmptyNote text={labels.noItemsIdentified} />
                            ) : (
                              <div className="space-y-2">
                                {sequencingStrengths.map((it, idx) => (
                                  <div
                                    key={idx}
                                    data-pdf-nobreak
                                    className="rounded-xl bg-white border border-emerald-100/70 px-3 sm:px-4"
                                  >
                                    <ItemRow
                                      item={it}
                                      tone="good"
                                      performedMultipleTimesLabel={
                                        labels.performedMultipleTimes
                                      }
                                    />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* WEAKNESSES / OPPORTUNITIES */}
                        <div
                          data-pdf-card
                          className="rounded-2xl border border-red-200 bg-red-50/70 border-l-[3px] border-l-red-500 p-4 sm:p-5"
                        >
                          <div className="mb-3">
                            <SectionBadge
                              title={labels.weaknesses}
                              count={sequencingWeaknesses.length}
                              tone="danger"
                            />
                          </div>
                          <div className="pl-3 sm:pl-4 space-y-3">
                            <p className="text-xs font-semibold text-red-800/90 uppercase tracking-wider">
                              {labels.seqSublabelNotPrioritizedCorrectly ||
                                'ITEMS NOT PRIORITIZED CORRECTLY'}
                            </p>
                            {sequencingWeaknesses.length === 0 ? (
                              <EmptyNote text={labels.noItemsIdentified} />
                            ) : (
                              <div className="space-y-2">
                                {sequencingWeaknesses.map((it, idx) => (
                                  <div
                                    key={idx}
                                    data-pdf-nobreak
                                    className="rounded-xl bg-white border border-red-100 px-3 sm:px-4"
                                  >
                                    <ItemRow
                                      item={it}
                                      tone="danger"
                                      performedMultipleTimesLabel={
                                        labels.performedMultipleTimes
                                      }
                                    />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* IMPROVEMENT RECOMMENDATIONS */}
                        {sequencingWeaknesses.length > 0 && (
                          <div
                            data-pdf-nobreak
                            className="mt-4 p-6 rounded-xl border border-l-[3px] border-l-[#db8833] border-gray-100 bg-white shadow-[0_2px_8px_rgba(15,23,42,0.03)] space-y-4"
                          >
                            <h4 className="text-sm font-bold text-gray-900">
                              {labels.improvementRecommendations}
                            </h4>
                            <ul className="space-y-2">
                              {[
                                labels.seqRecReflectEbp ||
                                  defaultRubricsLabels.seqRecReflectEbp!,
                              ].map((rec, idx) => (
                                <li
                                  key={idx}
                                  className="flex items-start gap-2 text-sm text-gray-700"
                                >
                                  <span
                                    className="flex-shrink-0 text-[#db8833]"
                                    style={{ lineHeight: '1.5' }}
                                  >
                                    &#8226;
                                  </span>
                                  <span>{rec}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    );
                  })()
                : null}

              {/* Team Communication Badge - Only show if configured */}
              {(item.subCategory?.toLowerCase() === 'communication' ||
                item.subCategory?.toLowerCase() ===
                  'professional communication' ||
                item.name?.toLowerCase().includes('communication')) &&
                (() => {
                  const isOptionalOrDistractor =
                    tcTypeRequirement === 'Optional' ||
                    tcTypeRequirement === 'Distractor';
                  const isSatisfactory =
                    sbarStatus?.toLowerCase() === 'satisfactory';
                  const isNotAttempted = isOptionalOrDistractor && !sbarStatus;
                  const pillBg = isNotAttempted
                    ? 'bg-yellow-100 text-yellow-800'
                    : isSatisfactory
                      ? 'bg-teal-100 text-teal-700'
                      : 'bg-red-100 text-red-700';
                  const statusBg = isNotAttempted
                    ? 'bg-yellow-500'
                    : isSatisfactory
                      ? 'bg-emerald-600'
                      : 'bg-red-600';
                  const displayLabel = isNotAttempted
                    ? labels.notDone
                    : isSatisfactory
                      ? labels.satisfactory
                      : labels.unsatisfactory;
                  const pdfColor = isNotAttempted
                    ? '#854d0e'
                    : isSatisfactory
                      ? '#059669'
                      : '#b91c1c';
                  return (
                    <div className="mb-5">
                      {/* Pill — screen only, hidden in PDF */}
                      <div className="pdf-hide inline-flex items-center overflow-hidden rounded-full">
                        <div
                          className={`flex items-center gap-2 px-4 py-2 font-semibold text-sm ${pillBg}`}
                        >
                          {isSatisfactory ? (
                            <CheckCircle2 className="w-4 h-4" />
                          ) : (
                            <XCircle className="w-4 h-4" />
                          )}
                          <span className="uppercase tracking-wider">
                            {labels.teamCommunication}
                          </span>
                        </div>
                        <div
                          className={`px-4 py-2 font-bold text-sm text-white ${statusBg}`}
                        >
                          <span className="uppercase tracking-wider">
                            {displayLabel}
                          </span>
                        </div>
                      </div>
                      {/* Plain text — hidden on screen, revealed in PDF via onclone */}
                      <span
                        data-pdfonly
                        aria-hidden="true"
                        style={{
                          display: 'none',
                          fontWeight: 700,
                          fontSize: '13px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                        }}
                      >
                        <span
                          data-pdfcolor="#1d4ed8"
                          style={{ color: '#1d4ed8' }}
                        >
                          {labels.teamCommunication}
                        </span>
                        &nbsp;&nbsp;
                        <span
                          data-pdfcolor={pdfColor}
                          style={{ color: pdfColor }}
                        >
                          {displayLabel}
                        </span>
                      </span>
                    </div>
                  );
                })()}

              {!hasParentValidation ? (
                <div className="space-y-4">
                  {/* STRENGTHS */}
                  <div
                    data-pdf-card
                    className="rounded-2xl border border-emerald-100 bg-emerald-50/60 border-l-[3px] border-l-emerald-500 p-4 sm:p-5"
                  >
                    <div className="mb-3">
                      <SectionBadge
                        title={labels.strengths}
                        count={allStrengths.length}
                        tone="good"
                      />
                    </div>
                    <div className="pl-3 sm:pl-4 space-y-3">
                      <p className="text-xs font-semibold text-emerald-800/80 uppercase tracking-wider">
                        {labels.priorityCompletedCorrectly ||
                          'PRIORITY ITEMS COMPLETED CORRECTLY'}
                      </p>
                      {allStrengths.length === 0 ? (
                        <EmptyNote text={labels.noItemsIdentified} />
                      ) : (
                        <div className="space-y-2">
                          {allStrengths.map((it, idx) => (
                            <div
                              key={idx}
                              data-pdf-nobreak
                              className="rounded-xl bg-white border border-emerald-100/70 px-3 sm:px-4"
                            >
                              <ItemRow
                                item={it}
                                tone="good"
                                performedMultipleTimesLabel={
                                  labels.performedMultipleTimes
                                }
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* WEAKNESSES / OPPORTUNITIES */}
                  {allWeaknesses.length > 0 && (
                    <div
                      data-pdf-card
                      className="rounded-2xl border border-red-200 bg-red-50/70 border-l-[3px] border-l-red-500 p-4 sm:p-5"
                    >
                      <div className="mb-3">
                        <SectionBadge
                          title={labels.weaknesses}
                          count={allWeaknesses.length}
                          tone="danger"
                        />
                      </div>
                      <div className="pl-3 sm:pl-4 space-y-3">
                        <p className="text-xs font-semibold text-red-800/90 uppercase tracking-wider">
                          {labels.priorityCompletedIncorrectly ||
                            'PRIORITY ITEMS MISSED OR PERFORMED INCORRECTLY'}
                        </p>
                        <div className="space-y-2">
                          {allWeaknesses.map((it, idx) => (
                            <div
                              key={idx}
                              data-pdf-nobreak
                              className="rounded-xl bg-white border border-red-100 px-3 sm:px-4"
                            >
                              <ItemRow
                                item={it}
                                tone="danger"
                                performedMultipleTimesLabel={
                                  labels.performedMultipleTimes
                                }
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* BOX 3 — OTHER NON-PRIORITY ITEMS COMPLETED (Merged Optional & Distractors) */}
                  {(() => {
                    const isComm =
                      item.subCategory?.toLowerCase() === 'communication' ||
                      item.subCategory?.toLowerCase() ===
                        'professional communication' ||
                      item.name?.toLowerCase().includes('communication');

                    if (isComm) {
                      return null;
                    }

                    const isMedications =
                      item.subCategory?.toLowerCase() === 'medications' ||
                      item.name?.toLowerCase() === 'medications';

                    const mergedNonPriority = [
                      ...optionalDone.map((d) => ({
                        action: d,
                        isDistractor: false,
                      })),
                      ...distractorDone.map((d) => ({
                        action: d,
                        isDistractor: true,
                      })),
                    ];

                    if (mergedNonPriority.length === 0 && !isMedications) {
                      return null;
                    }

                    return (
                      <div
                        data-pdf-card
                        className="rounded-2xl border border-amber-200 bg-amber-50/60 border-l-[3px] border-l-amber-500 p-4 sm:p-5"
                      >
                        <div className="mb-3">
                          <SectionBadge
                            title={
                              isMedications
                                ? labels.optionalMedicationsCompleted
                                : labels.otherNonPriorityCompleted ||
                                  'Other Non-Priority Items Completed'
                            }
                            count={mergedNonPriority.length}
                            tone="warn"
                          />
                        </div>
                        {mergedNonPriority.length === 0 ? (
                          <p className="text-sm text-gray-400 italic pl-1 py-1">
                            {labels.noItems || 'No items.'}
                          </p>
                        ) : (
                          <div className="pl-3 sm:pl-4 space-y-2">
                            {mergedNonPriority.map((entry, idx) => (
                              <div
                                key={idx}
                                data-pdf-nobreak
                                className="rounded-xl bg-white border border-amber-100 px-3 sm:px-4"
                              >
                                <div
                                  data-pdf-nobreak
                                  className="flex items-start gap-3 py-2.5"
                                >
                                  <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
                                    <AlertTriangle className="w-3.5 h-3.5 text-white" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-gray-800 leading-relaxed">
                                      {stripActionPhrasing(
                                        typeof entry.action.title === 'string'
                                          ? entry.action.title
                                          : ''
                                      )}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              ) : null}

              {!hasParentValidation &&
                (() => {
                  const incorrectItems = allWeaknesses.filter(
                    (it) =>
                      !isNotPerformed(it.point) && !isNotPerformed(it.example)
                  );
                  const notCompletedItems = allWeaknesses.filter(
                    (it) =>
                      isNotPerformed(it.point) || isNotPerformed(it.example)
                  );

                  const recList: string[] = [];

                  const hasNeedsImprovement =
                    incorrectItems.length > 0 || notCompletedItems.length > 0;

                  if (incorrectItems.length > 0) {
                    recList.push(
                      labels.recReviewEvidenceBased ||
                        'Review the evidence-based rationale and guidelines for clinical interventions performed during patient care.'
                    );
                  }
                  if (notCompletedItems.length > 0) {
                    recList.push(
                      labels.recReviewBriefingSbar ||
                        'Review the pre-simulation scenario briefing, clinical documentation, and SBAR handover to ensure all mandatory assessments, interventions, and safety checks are identified and completed.'
                    );
                  }

                  if (hasNeedsImprovement) {
                    const catKey =
                      `${item.subCategory ?? ''} ${item.name ?? ''} ${item.id ?? ''}`.toLowerCase();
                    let reflectText =
                      labels.recReflect || defaultRubricsLabels.recReflect!;
                    if (/safety|privacy|infection|ppe/i.test(catKey)) {
                      reflectText =
                        labels.recReflectSafety ||
                        defaultRubricsLabels.recReflectSafety!;
                    } else if (/documentation|ehr/i.test(catKey)) {
                      reflectText =
                        labels.recReflectDocumentation ||
                        defaultRubricsLabels.recReflectDocumentation!;
                    } else if (/communication|sbar/i.test(catKey)) {
                      reflectText =
                        labels.recReflectCommunication ||
                        defaultRubricsLabels.recReflectCommunication!;
                    } else if (/medication/i.test(catKey)) {
                      reflectText =
                        labels.recReflectMedication ||
                        defaultRubricsLabels.recReflectMedication!;
                    }
                    recList.push(reflectText);
                  }

                  // Include any unique custom recommendations from backend item.recommendations
                  if (Array.isArray(item.recommendations)) {
                    for (const r of item.recommendations) {
                      if (!r || r === 'None identified.') continue;
                      const translated = isSeqItem ? translateSeqText(r) : r;
                      if (translated && !recList.includes(translated)) {
                        recList.push(translated);
                      }
                    }
                  }

                  const uniqueRecs = Array.from(new Set(recList));

                  if (uniqueRecs.length === 0) {
                    return null;
                  }

                  return (
                    <div
                      data-pdf-nobreak
                      className="mt-6 p-5 sm:p-6 rounded-2xl border border-gray-200/90 border-l-[3px] border-l-[#db8833] bg-white shadow-[0_2px_8px_rgba(15,23,42,0.03)] space-y-3"
                    >
                      <h4 className="text-sm sm:text-base font-bold text-gray-900">
                        {labels.improvementRecommendations}
                      </h4>
                      <ul className="space-y-2.5">
                        {uniqueRecs.map((recText, idx) => (
                          <li
                            key={idx}
                            className="flex items-start gap-2.5 text-sm text-[#374151] leading-relaxed"
                          >
                            <span className="text-[#db8833] text-base leading-tight flex-shrink-0">
                              &#8226;
                            </span>
                            <span>{recText}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })()}

              {/* Inappropriate Actions (Distractors) - ONLY FOR ADMINS */}
              {isAdmin &&
                item.subCategory?.toLowerCase() === 'action' &&
                item.actionDetails?.some((d) => d.type === 'distractor') && (
                  <div className="mt-8 pt-8 border-t border-gray-100 space-y-6">
                    <div className="space-y-4">
                      <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        {labels.inappropriateActions}
                      </h3>
                      <p className="text-sm text-gray-600 leading-relaxed">
                        {labels.inappropriateIntro}
                      </p>
                      <p className="text-sm text-gray-600">
                        {labels.inappropriateMayReflect}
                      </p>
                    </div>

                    <div className="space-y-3">
                      {item.actionDetails
                        .filter((d) => d.type === 'distractor')
                        .map((dist, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-4 p-4 rounded-xl border border-rose-100 bg-rose-50/50"
                          >
                            <div className="w-8 h-8 rounded-full bg-rose-500 flex items-center justify-center flex-shrink-0">
                              <AlertCircle className="w-5 h-5 text-white" />
                            </div>
                            <p className="text-sm font-medium text-gray-700 italic">
                              • {dist.title}
                            </p>
                          </div>
                        ))}
                    </div>

                    <div
                      data-pdf-nobreak
                      className="rounded-xl border border-blue-100 bg-blue-50/50 p-6 space-y-4"
                    >
                      <h4 className="text-sm font-bold text-gray-900">
                        {labels.improvementRecommendations}
                      </h4>
                      <p className="text-sm text-blue-800/80 leading-relaxed">
                        {labels.recommendationsContext}
                        <br />
                        Recommendations for improving future performance:
                      </p>
                      <ul className="space-y-2">
                        {[
                          'Avoid initiating interventions without confirmed clinical need.',
                          "Refrain from performing tasks that are not aligned with the scenario's primary priorities.",
                          'Ensure patient data is reassessed thoroughly before taking action.',
                          'Maintain focus on primary objectives before addressing secondary or unrelated tasks.',
                          'Pause and verify clinical reasoning when uncertainty arises.',
                        ].map((rec, i) => (
                          <li
                            key={i}
                            className="flex items-start gap-2 text-sm text-blue-800/80"
                          >
                            <span
                              className="flex-shrink-0"
                              style={{ color: '#60a5fa', lineHeight: '1.5' }}
                            >
                              &#8226;
                            </span>
                            <span>{rec}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="text-xs text-blue-700/60 font-medium">
                        This report is made available for administrative review
                        through the admin side of the application.
                      </p>
                    </div>

                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 space-y-2">
                      <h4 className="text-sm font-bold text-gray-900">
                        Disclaimer:
                      </h4>
                      <p className="text-sm text-rose-800/80 leading-relaxed">
                        This section is intended for educational feedback only.
                        The inappropriate actions identified here do not impact
                        your score for this simulation. They are highlighted to
                        support reflection, strengthen clinical reasoning, and
                        promote safe practice in future patient encounters.
                      </p>
                    </div>
                  </div>
                )}
            </div>
          );
        })
      )}
    </div>
  );
}
