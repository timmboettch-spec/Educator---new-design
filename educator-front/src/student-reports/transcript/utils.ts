// Transcript page utility functions

/**
 * Format seconds as mm:ss elapsed time label
 */
export const formatElapsedLabel = (seconds: number): string => {
  const safeValue = Math.max(0, Math.round(seconds));
  const mins = Math.floor(safeValue / 60);
  const secs = safeValue % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

/**
 * Format duration for display (e.g. 6s or 1m 5s)
 */
export const formatDurationLabel = (seconds: number): string => {
  const safeValue = Math.max(0, Math.round(seconds));
  if (safeValue < 60) {
    return `${safeValue}s`;
  }
  const mins = Math.floor(safeValue / 60);
  const secs = safeValue % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
};

/**
 * Clean details string by removing redundant information
 */
export const cleanDetails = (
  details: string | undefined,
  hasAnswer?: boolean
): string => {
  if (!details) {
    return '';
  }
  // Strip everything from "| Started:" onwards
  let cleaned = details.split(/\|\s*Started:/i)[0];

  // Remove "Duration: ..." and "Score: ..." patterns which are now shown in the header
  cleaned = cleaned.replace(/\s*Duration:\s*(\d+m?\s*\d*s?)\s*/i, '');
  cleaned = cleaned.replace(/\s*Score:\s*(\d+%)\s*/i, '');

  // Remove Prompt and Response patterns as they are now in dedicated boxes
  cleaned = cleaned.replace(/\s*Prompt:\s*.*?(?=\n|$|\|)/gi, '');
  cleaned = cleaned.replace(/\s*Response:\s*.*?(?=\n|$|\|)/gi, '');
  cleaned = cleaned.replace(/Student responded to question: ".*?"\n?/gi, '');

  if (hasAnswer) {
    cleaned = cleaned.replace(/\s*Result:\s*.*?(?=\n|$|\|)/gi, '');
    cleaned = cleaned.replace(/\s*Submitted:\s*.*?(?=\n|$|\|)/gi, '');
  }

  cleaned = cleaned.trim();
  // Remove trailing and leading separators
  cleaned = cleaned.replace(/[|\s]+$/, '').replace(/^[|\s]+/, '');

  if (details.toLowerCase().startsWith('started:')) {
    return '';
  }
  return cleaned;
};

/**
 * Format action type for display
 */
export const formatActionType = (type: string): string => {
  switch (type) {
    case 'single':
      return 'Multiple Choice Question';
    case 'question':
      return 'Open-Ended Question';
    case 'ordering':
      return 'Sequential Question';
    case 'vital-signs':
      return 'Vital Signs';
    default:
      return type;
  }
};

/**
 * Format an epoch-ms value as mm/dd/yyyy, hh:mm:ss
 */
export const formatWallClock = (epochMs: number | null | undefined): string => {
  if (!epochMs) {
    return '';
  }
  try {
    const d = new Date(epochMs);
    return d.toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return '';
  }
};

/**
 * Vital unit mapping for display
 */
export const vitalUnitMap: Record<string, { unit: string; suffix: boolean }> = {
  'heart rate recorded': { unit: 'bpm', suffix: false },
  'blood pressure recorded': { unit: 'mmHg', suffix: false },
  'respiratory rate recorded': { unit: 'breaths/min', suffix: false },
  'temperature recorded': { unit: '°F', suffix: true },
  'spo2 recorded': { unit: '%', suffix: true },
  'oxygen saturation recorded': { unit: '%', suffix: true },
};

/**
 * Get formatted vital value with unit
 */
export const getVitalValue = (
  title: string,
  details: string | undefined
): string | null => {
  const vitalMeta = vitalUnitMap[title.toLowerCase()];
  const rawValue = details?.replace(/^Value:\s*/i, '').trim();

  if (!rawValue) {
    return null;
  }

  if (!vitalMeta) {
    return rawValue;
  }

  if (rawValue.endsWith(vitalMeta.unit)) {
    return rawValue;
  }

  return vitalMeta.suffix
    ? `${rawValue}${vitalMeta.unit}`
    : `${rawValue} ${vitalMeta.unit}`;
};
