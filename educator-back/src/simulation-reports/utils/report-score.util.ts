import type { ReportLabelRow, ReportScoreRow } from 'src/common/interfaces';
import type { SimulationReport } from 'src/database/entities/simulation-report.entity';

const SCORE_MIN = 0;
const SCORE_MAX = 100;

function clampScore(value: number): number {
  return Math.min(SCORE_MAX, Math.max(SCORE_MIN, value));
}

function parseScoreValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= SCORE_MIN) {
    return clampScore(value);
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    if (Number.isFinite(parsed) && parsed >= SCORE_MIN) {
      return clampScore(parsed);
    }
  }
  return null;
}

/**
 * The `score` column, falling back to
 * `score_json.overallScore`. Same 0-100 clamping.
 */
export function extractOverallScoreFromRow(row: ReportScoreRow): number | null {
  return parseScoreValue(row.score) ?? parseScoreValue(row.scoreJson?.overallScore);
}

function extractReportMode(mode: string | null | undefined): 'Practice' | 'Assessment' | null {
  const normalized = mode?.trim();
  if (!normalized) return null;
  if (/practice/i.test(normalized)) return 'Practice';
  if (/assessment/i.test(normalized)) return 'Assessment';
  return null;
}

/** Practice sims are ungraded — never pass their scores to the LMS gradebook. */
export function isPracticeReport(mode: string | null | undefined): boolean {
  return extractReportMode(mode) === 'Practice';
}

function firstNonEmptyString(candidates: unknown[]): string | null {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
}

/**
 * Performance label: `score_json.overallLabel`, falling back to the
 * `performance_label` column. Read verbatim, never derived from the score.
 */
export function extractPerformanceQualityFromRow(row: ReportLabelRow): string | null {
  return firstNonEmptyString([row.scoreJson?.overallLabel, row.performanceLabel]);
}

/** The `total_time_seconds` column as `HH:MM:SS`. */
export function formatTimeSpentFromRow(
  row: Pick<SimulationReport, 'totalTimeSeconds'>,
): string | null {
  const seconds = row.totalTimeSeconds;
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
