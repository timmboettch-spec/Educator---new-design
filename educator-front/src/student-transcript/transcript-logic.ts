export interface OrderDefinition {
  id: string;
  title: string;
  systemVisibility: 'Always Visible' | 'Hidden until trigger' | 'Hidden';
  unlockCondition?: string;
  unlockConditions?: string[];
}

const STT_NORMALIZATION_MAP: Record<string, string> = {
  // Contraindications family
  contradictions: 'contraindications',
  contradiction: 'contraindication',
  contractions: 'contraindications',
  contraction: 'contraindication',

  // Auscultation
  osculate: 'auscultate',
  oscillate: 'auscultate',
  'ask you late': 'auscultate',
  auscultation: 'auscultation',

  // ECG / EKG
  ekg: 'ecg',
  'e.k.g': 'ecg',
  'e.c.g': 'ecg',
  electrocardiogram: 'ecg',
  electrocardiograph: 'ecg',

  // IV / medication routes
  iv: 'intravenous',
  'i.v.': 'intravenous',
  im: 'intramuscular',
  'i.m.': 'intramuscular',
  po: 'oral',
  'p.o.': 'oral',
  subq: 'subcutaneous',
  'sub-q': 'subcutaneous',

  // Common medication misheard names
  asprin: 'aspirin',
  ibubrofen: 'ibuprofen',
  ibuprofin: 'ibuprofen',
  lisinipril: 'lisinopril',
  lisiniprol: 'lisinopril',
  'metoprolol succinate': 'metoprolol',
  metoprolal: 'metoprolol',
  amoxicillin: 'amoxicillin',
  amoxicillan: 'amoxicillin',
  cetirizine: 'cetirizine',

  // Anatomy / clinical procedures
  palpitation: 'palpation',
  inspection: 'inspection',
  percussion: 'percussion',
  'range of motion': 'range of motion',
  rom: 'range of motion',
  bp: 'blood pressure',
  'b.p.': 'blood pressure',
  hr: 'heart rate',
  'h.r.': 'heart rate',
  spo2: 'oxygen saturation',
  'spo 2': 'oxygen saturation',
  'o2 sat': 'oxygen saturation',
  o2sat: 'oxygen saturation',
  rr: 'respiratory rate',
  'r.r.': 'respiratory rate',

  // Assessment tools
  gcs: 'glasgow coma scale',
  avpu: 'avpu',
  fast: 'face arm speech time',
  nihss: 'stroke scale',

  // Common STT substitutions
  patience: 'patients',
  patent: 'patient',
  precedure: 'procedure',
  prostate: 'prostrate',
};

/**
 * Normalizes a raw STT transcript string by replacing known misheard
 * clinical terms with their intended equivalents. This improves keyword
 * matching accuracy without altering the original text stored in logs.
 */
export function normalizeSpeech(text: string): string {
  if (!text) {
    return text;
  }
  let normalized = text.toLowerCase();
  for (const [mishearing, intended] of Object.entries(STT_NORMALIZATION_MAP)) {
    // Use word-boundary-aware replacement where possible
    try {
      normalized = normalized.replace(
        new RegExp(
          `\\b${mishearing.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
          'gi'
        ),
        intended
      );
    } catch {
      // Regex construction can fail for terms with boundary edge cases — fall back to simple replace
      normalized = normalized.split(mishearing).join(intended);
    }
  }
  return normalized;
}

/**
 * Checks if the spoken text matches the unlock conditions for an order.
 * Applies STT normalization and flexible multi-word matching before
 * performing keyword comparison.
 */
export function isOrderMatched(text: string, order: OrderDefinition): boolean {
  if (!text || !order) {
    return false;
  }

  // Apply STT normalization to improve accuracy for domain vocabulary
  const speechNormalized = normalizeSpeech(text);
  // Also keep raw lowercase for simple substring matches
  const speechRaw = text.toLowerCase();

  const conditions = [
    order.unlockCondition,
    ...(order.unlockConditions || []),
  ].filter(Boolean) as string[];

  return conditions.some((condition) => {
    const condLower = condition.toLowerCase();
    const condNormalized = normalizeSpeech(condition);

    // 1. Direct inclusion match (raw)
    if (speechRaw.includes(condLower)) {
      return true;
    }

    // 2. Normalized inclusion match (both sides normalized)
    if (speechNormalized.includes(condNormalized)) {
      return true;
    }

    // 3. Flexible word-by-word matching for complex conditions (e.g., "Pain score ≥ 4")
    const words = condNormalized
      .split(/[\s≥≤=<>]+/)
      .filter((w) => w.length >= 2);

    if (words.length > 0) {
      const matchesAll = words.every((word) => {
        // Contraindications family is already handled by normalizeSpeech above,
        // but keep explicit fallback for robustness.
        if (word === 'contraindications' || word === 'contraindication') {
          return (
            speechNormalized.includes('contraindication') ||
            speechRaw.includes('contradiction') ||
            speechRaw.includes('contraction')
          );
        }
        return speechNormalized.includes(word) || speechRaw.includes(word);
      });

      if (matchesAll) {
        return true;
      }
    }
    return false;
  });
}

/**
 * Sorting priority for different types of transcript/timeline speakers.
 * Lower numbers sort first.
 */
export const SPEAKER_PRIORITY: Record<string, number> = {
  system: 0,
  order: 1,
  sbar_report: 2, // Initiation
  user: 3,
  student_team_comm: 4, // Student SBAR segments
  assistant: 5,
  provider: 6,
  summary: 7, // Default for summary entries/evaluations
};

/**
 * Parses mm:ss format to absolute seconds.
 */
export function parseElapsedTimeToSeconds(elapsedTime: string): number {
  if (!elapsedTime) {
    return 0;
  }
  const parts = elapsedTime.split(':');
  if (parts.length === 2) {
    const minutes = parseInt(parts[0], 10) || 0;
    const seconds = parseInt(parts[1], 10) || 0;
    return minutes * 60 + seconds;
  }
  return 0;
}

export type TimelineSortItem = {
  type?: string;
  data?: Record<string, unknown>;
  elapsedSeconds?: number;
  elapsedTime?: string;
  timestampValue?: number;
  timestampMs?: number;
  speaker?: string;
  category?: string;
  _originalIndex?: number;
};

function timelineData(item: TimelineSortItem): TimelineSortItem {
  const nested = item.data;
  if (nested && typeof nested === 'object') {
    return { ...item, ...nested };
  }
  return item;
}

/**
 * Calculates a unified sort value in milliseconds.
 * Prefers elapsed time (relative to scenario start) so the displayed mm:ss
 * order matches the rendered order. Falls back to absolute epoch-ms timestamps.
 */
export function getTimelineSortValue(item: TimelineSortItem): number {
  const data = timelineData(item);

  // Prioritize elapsed time — this is what is displayed and should drive order.
  if (typeof data.elapsedSeconds === 'number') {
    return data.elapsedSeconds * 1000;
  }
  if (data.elapsedTime) {
    return parseElapsedTimeToSeconds(data.elapsedTime) * 1000;
  }

  // Fallback to absolute timestamp (epoch ms) when no elapsed time is available.
  const ts = data.timestampValue ?? data.timestampMs;
  if (typeof ts === 'number' && ts > 0) {
    return ts;
  }

  return 0;
}

/**
 * Universal comparator for timeline entries (messages, actions, summaries).
 * Uses absolute time with speaker-priority tiebreakers.
 */
export function timelineComparator(
  a: TimelineSortItem,
  b: TimelineSortItem
): number {
  const valA = getTimelineSortValue(a);
  const valB = getTimelineSortValue(b);

  // Special case: student (user) vs patient (assistant) messages that share
  // the same displayed elapsed second (mm:ss).  Sub-second timestamp noise in
  // the AI pipeline can make the patient response appear to start fractionally
  // before the student message that triggered it.  When both map to the same
  // elapsed second, student always sorts before patient.
  const dataA = timelineData(a);
  const dataB = timelineData(b);
  const sA = dataA.speaker;
  const sB = dataB.speaker;

  if (
    (sA === 'user' && sB === 'assistant') ||
    (sA === 'assistant' && sB === 'user')
  ) {
    const getElapsed = (data: TimelineSortItem): number | undefined => {
      if (typeof data.elapsedSeconds === 'number') {
        return data.elapsedSeconds;
      }
      if (data.elapsedTime) {
        return parseElapsedTimeToSeconds(data.elapsedTime);
      }
      return undefined;
    };
    const elapsedA = getElapsed(dataA);
    const elapsedB = getElapsed(dataB);

    if (
      elapsedA !== undefined &&
      elapsedB !== undefined &&
      elapsedA === elapsedB
    ) {
      // Same elapsed second: student always appears before patient
      return sA === 'user' ? -1 : 1;
    }
  }

  if (valA !== valB) {
    return valA - valB;
  }

  // Tiebreaker 1: Speaker priority
  const getPriority = (item: TimelineSortItem): number => {
    const type = item.type;
    const data = timelineData(item);
    if (type === 'message' || data.speaker) {
      return SPEAKER_PRIORITY[String(data.speaker ?? '')] ?? 99;
    }
    if (type === 'summary' || data.category) {
      return SPEAKER_PRIORITY.summary;
    }
    return 50; // commonAction
  };

  const prioA = getPriority(a);
  const prioB = getPriority(b);
  if (prioA !== prioB) {
    return prioA - prioB;
  }

  // Tiebreaker 2: Original index for stable sorting of concurrent messages
  const idxA = dataA._originalIndex ?? 0;
  const idxB = dataB._originalIndex ?? 0;
  return idxA - idxB;
}
