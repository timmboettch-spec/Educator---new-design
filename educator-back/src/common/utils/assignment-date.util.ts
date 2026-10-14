import { ClassSimulationAssignmentConstants } from '../constants/class-simulation.constants';
import type { IAssignmentDateRange } from '../interfaces/class-simulation.interface';
import { toUtc } from './dayjs.utils';

/**
 * `class_simulations` date → `YYYY-MM-DD`. Accepts `MM-DD-YYYY` or ISO (a time suffix is cut
 * off); anything else is `undefined`. Shape-only — `02-31-2026` still maps to `2026-02-31`; use
 * `parseStrictAssignmentDate` when the calendar date must be real.
 */
export function normalizeAssignmentDate(rawDate?: string | null): string | undefined {
  if (!rawDate) return undefined;
  const value = rawDate.trim();
  const isoDate = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (isoDate) return isoDate;

  const match = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return undefined;
  const [, month, day, year] = match;
  return `${year}-${month}-${day}`;
}

/**
 * Like `normalizeAssignmentDate`, but `null` unless the value is a real calendar date. dayjs
 * rolls an impossible date over (`2026-02-31` → March 3), so a round-trip mismatch means invalid.
 */
export function parseStrictAssignmentDate(rawDate?: string | null): string | null {
  if (!rawDate || !ClassSimulationAssignmentConstants.DATE.INPUT_REGEX.test(rawDate.trim())) {
    return null;
  }
  const normalized = normalizeAssignmentDate(rawDate);
  if (!normalized) return null;

  const parsed = toUtc(normalized);
  return parsed.isValid() &&
    parsed.format(ClassSimulationAssignmentConstants.DATE.STORAGE_FORMAT) === normalized
    ? normalized
    : null;
}

/**
 * Inclusive overlap of two assignment windows (touching days overlap). No conflict when either
 * side is missing a start or end date — the rule `ClassSimulationService.assign` has always used.
 */
export function assignmentRangesOverlap(a: IAssignmentDateRange, b: IAssignmentDateRange): boolean {
  const aStart = normalizeAssignmentDate(a.startDate);
  const aEnd = normalizeAssignmentDate(a.endDate);
  const bStart = normalizeAssignmentDate(b.startDate);
  const bEnd = normalizeAssignmentDate(b.endDate);
  return !!(aStart && aEnd && bStart && bEnd && aStart <= bEnd && aEnd >= bStart);
}

/** Same start and end day (after normalising both sides). */
export function isSameAssignmentRange(a: IAssignmentDateRange, b: IAssignmentDateRange): boolean {
  return (
    normalizeAssignmentDate(a.startDate) === normalizeAssignmentDate(b.startDate) &&
    normalizeAssignmentDate(a.endDate) === normalizeAssignmentDate(b.endDate)
  );
}
