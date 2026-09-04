/**
 * Transcript rendering utilities — ported/adapted from the Student
 * codebase (`HS-online-AI-app/frontend/app/reports/[id]/transcript/utils.ts`
 * and `frontend/lib/transcript-logic.ts`).
 *
 * Kept as a standalone module (no React / DOM imports) so it can be used by
 * both the standalone `generateTranscriptPDF` function and any future PDF
 * helper modules without pulling in the React tree.
 *
 * Phase 1 of Student → Educator transcript PDF parity port.
 */

// ─── Speaker priority (from transcript-logic.ts) ─────────────────────────────

/**
 * Sort priority for equal-elapsed-time timeline items. Lower numbers appear
 * earlier so the timeline ordering matches the on-page rendering exactly:
 * system → orders → SBAR init → student → student TC → patient → provider →
 * evaluations / summaries.
 */
export const SPEAKER_PRIORITY: Record<string, number> = {
  system: 0,
  order: 1,
  sbar_report: 2, // Initiation
  user: 3,
  student_team_comm: 4, // Student SBAR segments
  assistant: 5,
  provider: 6,
  summary: 7, // Default for summary entries / evaluations
};

// ─── Elapsed-time parsing ────────────────────────────────────────────────────

/**
 * Parse `mm:ss` (or `hh:mm:ss` — best-effort) into absolute seconds. Returns 0
 * for empty / malformed input so it is safe to use inside sort comparators.
 */
export function parseElapsedTimeToSeconds(elapsedTime: string): number {
  if (!elapsedTime) return 0;
  const parts = elapsedTime.split(":");
  if (parts.length === 2) {
    const minutes = parseInt(parts[0], 10) || 0;
    const seconds = parseInt(parts[1], 10) || 0;
    return minutes * 60 + seconds;
  }
  if (parts.length === 3) {
    const hours = parseInt(parts[0], 10) || 0;
    const minutes = parseInt(parts[1], 10) || 0;
    const seconds = parseInt(parts[2], 10) || 0;
    return hours * 3600 + minutes * 60 + seconds;
  }
  return 0;
}

// ─── Timeline sort value + comparator ────────────────────────────────────────

interface TimelineItemShape {
  type?: string;
  data?: Record<string, unknown> & {
    elapsedSeconds?: number;
    elapsedTime?: string;
    timestampValue?: number;
    timestampMs?: number;
    speaker?: string;
    category?: string;
    _originalIndex?: number;
  };
  [key: string]: unknown;
}

/**
 * Compute a unified sort value in ms for a timeline entry. Prefers elapsed
 * time (relative to scenario start) so the displayed mm:ss order matches the
 * rendered order; falls back to absolute epoch-ms timestamps.
 */
export function getTimelineSortValue(item: TimelineItemShape): number {
  const data = (item.data ?? (item as Record<string, unknown>)) as Record<string, unknown> & {
    elapsedSeconds?: number;
    elapsedTime?: string;
    timestampValue?: number;
    timestampMs?: number;
  };

  if (typeof data.elapsedSeconds === "number") {
    return data.elapsedSeconds * 1000;
  }
  if (typeof data.elapsedTime === "string" && data.elapsedTime) {
    return parseElapsedTimeToSeconds(data.elapsedTime) * 1000;
  }

  const ts = data.timestampValue ?? data.timestampMs;
  if (typeof ts === "number" && ts > 0) return ts;

  return 0;
}

/**
 * Universal comparator for timeline entries (messages, summary entries, common
 * actions). Ports the Student behaviour exactly, including the student/patient
 * tiebreaker for equal-second events and the stable `_originalIndex` fallback.
 */
export function timelineComparator(
  a: TimelineItemShape,
  b: TimelineItemShape,
): number {
  const valA = getTimelineSortValue(a);
  const valB = getTimelineSortValue(b);

  const dataA = (a.data ?? a) as Record<string, unknown> & {
    speaker?: string;
    elapsedSeconds?: number;
    elapsedTime?: string;
    _originalIndex?: number;
    category?: string;
  };
  const dataB = (b.data ?? b) as Record<string, unknown> & {
    speaker?: string;
    elapsedSeconds?: number;
    elapsedTime?: string;
    _originalIndex?: number;
    category?: string;
  };

  const sA = dataA.speaker;
  const sB = dataB.speaker;

  // Student/patient tiebreaker for equal elapsed second — student always first.
  if (
    (sA === "user" && sB === "assistant") ||
    (sA === "assistant" && sB === "user")
  ) {
    const getElapsed = (d: typeof dataA): number | undefined => {
      if (typeof d.elapsedSeconds === "number") return d.elapsedSeconds;
      if (typeof d.elapsedTime === "string" && d.elapsedTime) {
        return parseElapsedTimeToSeconds(d.elapsedTime);
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
      return sA === "user" ? -1 : 1;
    }
  }

  if (valA !== valB) return valA - valB;

  // Tiebreaker 1: speaker priority table.
  const getPriority = (item: TimelineItemShape): number => {
    const type = item.type;
    const data = (item.data ?? item) as { speaker?: string; category?: string };
    if (type === "message" || data.speaker) {
      return SPEAKER_PRIORITY[data.speaker ?? ""] ?? 99;
    }
    if (type === "summary" || data.category) {
      return SPEAKER_PRIORITY.summary;
    }
    return 50; // commonAction
  };

  const prioA = getPriority(a);
  const prioB = getPriority(b);
  if (prioA !== prioB) return prioA - prioB;

  // Tiebreaker 2: original index (stable sort for concurrent messages).
  const idxA = dataA._originalIndex ?? 0;
  const idxB = dataB._originalIndex ?? 0;
  return idxA - idxB;
}

// ─── Display formatters (from transcript/utils.ts) ───────────────────────────

/** Format seconds as `mm:ss`. */
export function formatElapsedLabel(seconds: number): string {
  const safeValue = Math.max(0, Math.round(seconds));
  const mins = Math.floor(safeValue / 60);
  const secs = safeValue % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/** Format seconds as a compact duration string (`6s` or `1m 5s`). */
export function formatDurationLabel(seconds: number): string {
  const safeValue = Math.max(0, Math.round(seconds));
  if (safeValue < 60) return `${safeValue}s`;
  const mins = Math.floor(safeValue / 60);
  const secs = safeValue % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

/**
 * Clean a summary-entry `details` string by removing redundant fields that are
 * already rendered elsewhere (Started/Ended timestamps, Duration, Score,
 * Prompt/Response bodies, Result/Submitted labels). Kept identical to the
 * Student implementation so both PDFs strip the same noise.
 */
export function cleanDetails(
  details: string | undefined,
  hasAnswer?: boolean,
): string {
  if (!details) return "";

  // Strip everything from "| Started:" onwards.
  let cleaned = details.split(/\|\s*Started:/i)[0];

  cleaned = cleaned.replace(/\s*Duration:\s*(\d+m?\s*\d*s?)\s*/i, "");
  cleaned = cleaned.replace(/\s*Score:\s*(\d+%)\s*/i, "");

  cleaned = cleaned.replace(/\s*Prompt:\s*.*?(?=\n|$|\|)/gi, "");
  cleaned = cleaned.replace(/\s*Response:\s*.*?(?=\n|$|\|)/gi, "");
  cleaned = cleaned.replace(/Student responded to question: ".*?"\n?/gi, "");

  if (hasAnswer) {
    cleaned = cleaned.replace(/\s*Result:\s*.*?(?=\n|$|\|)/gi, "");
    cleaned = cleaned.replace(/\s*Submitted:\s*.*?(?=\n|$|\|)/gi, "");
  }

  cleaned = cleaned.trim();
  cleaned = cleaned.replace(/[|\s]+$/, "").replace(/^[|\s]+/, "");

  if (details.toLowerCase().startsWith("started:")) return "";

  return cleaned;
}

/** Map an internal question sub-type to a display label. */
export function formatActionType(type: string): string {
  switch (type) {
    case "single":
      return "Multiple Choice Question";
    case "question":
      return "Open-Ended Question";
    case "ordering":
      return "Sequential Question";
    case "vital-signs":
      return "Vital Signs";
    default:
      return type;
  }
}

/** Format an epoch-ms timestamp as `MM/DD/YYYY, HH:MM:SS` (24h). */
export function formatWallClock(epochMs: number | null | undefined): string {
  if (!epochMs) return "";
  try {
    const d = new Date(epochMs);
    return d.toLocaleString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return "";
  }
}

/** Format an epoch-ms timestamp as `Jan 01, 06:15` (short, 24h). */
export function formatAdminDate(epochMs: number | null | undefined): string {
  if (!epochMs) return "";
  try {
    const d = new Date(epochMs);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString("en-US", {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "";
  }
}

// ─── Vitals ──────────────────────────────────────────────────────────────────

/** Vital-title → display unit mapping (matches Student vitalUnitMap). */
export const vitalUnitMap: Record<string, { unit: string; suffix: boolean }> = {
  "heart rate recorded": { unit: "bpm", suffix: false },
  "blood pressure recorded": { unit: "mmHg", suffix: false },
  "respiratory rate recorded": { unit: "breaths/min", suffix: false },
  "temperature recorded": { unit: "\u00B0F", suffix: true },
  "spo2 recorded": { unit: "%", suffix: true },
  "oxygen saturation recorded": { unit: "%", suffix: true },
};

/**
 * Return a display-formatted vital value with unit appended (e.g. `78 bpm`).
 * Returns null when there is no numeric value to render.
 */
export function getVitalValue(
  title: string,
  details: string | undefined,
): string | null {
  const vitalMeta = vitalUnitMap[title.toLowerCase()];
  const rawValue = details?.replace(/^Value:\s*/i, "").trim();

  if (!rawValue) return null;
  if (!vitalMeta) return rawValue;

  if (rawValue.endsWith(vitalMeta.unit)) return rawValue;

  return vitalMeta.suffix
    ? `${rawValue}${vitalMeta.unit}`
    : `${rawValue} ${vitalMeta.unit}`;
}
