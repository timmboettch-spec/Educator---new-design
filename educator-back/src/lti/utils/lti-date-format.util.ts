/**
 * Convert RW assignment date strings to ISO 8601 datetime strings for LTI Deep Linking.
 * 
 * RW stores dates as:
 * - MM-DD-YYYY (e.g., "03-15-2026")
 * - YYYY-MM-DD (e.g., "2026-03-15")
 * 
 * LTI Deep Linking expects ISO 8601 datetime with timezone:
 * - ISO 8601: "2026-03-15T00:00:00Z" for start dates
 * - ISO 8601: "2026-03-15T23:59:59Z" for end/due dates
 */

/**
 * Convert a date string to ISO 8601 format with time set to start of day (00:00:00Z).
 * Used for `available.startDateTime` in Deep Linking content items.
 */
export function toIsoStartDateTime(rawDate: string | null | undefined): string | undefined {
  if (!rawDate) return undefined;

  const trimmed = rawDate.trim();
  if (!trimmed || trimmed.includes('undefined')) return undefined;

  const normalized = normalizeDate(trimmed);
  if (!normalized) return undefined;

  return `${normalized}T00:00:00Z`;
}

/**
 * Convert a date string to ISO 8601 format with time set to end of day (23:59:59Z).
 * Used for `available.endDateTime` and `submission.endDateTime` in Deep Linking content items.
 */
export function toIsoEndDateTime(rawDate: string | null | undefined): string | undefined {
  if (!rawDate) return undefined;

  const trimmed = rawDate.trim();
  if (!trimmed || trimmed.includes('undefined')) return undefined;

  const normalized = normalizeDate(trimmed);
  if (!normalized) return undefined;

  return `${normalized}T23:59:59Z`;
}

function isValidIsoDate(isoDate: string): boolean {
  const parts = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!parts) return false;

  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const d = new Date(Date.UTC(year, month - 1, day));

  return (
    !Number.isNaN(d.getTime()) &&
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

/**
 * Normalize a date string from MM-DD-YYYY or YYYY-MM-DD format to YYYY-MM-DD.
 * Returns undefined if the date string cannot be parsed.
 */
function normalizeDate(value: string): string | undefined {
  // Already in YYYY-MM-DD format (possibly with time component)
  const isoDate = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (isoDate) return isValidIsoDate(isoDate) ? isoDate : undefined;

  // Convert from MM-DD-YYYY to YYYY-MM-DD
  const match = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return undefined;

  const [, month, day, year] = match;
  const candidate = `${year}-${month}-${day}`;
  return isValidIsoDate(candidate) ? candidate : undefined;
}
