import { CsvConstants } from '../constants/csv.constants';

/**
 * Escapes one CSV cell: neutralises formula-trigger prefixes with a leading `'` (names and
 * class titles are user-supplied), then RFC 4180-quotes it when it holds a comma, quote or
 * line break. `null`/`undefined` become an empty cell.
 */
export function escapeCsvCell(value: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  const safe = CsvConstants.FORMULA_TRIGGER.test(value)
    ? `${CsvConstants.FORMULA_ESCAPE_PREFIX}${value}`
    : value;
  return CsvConstants.NEEDS_QUOTING.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Joins escaped cells into one CSV record (no line terminator). */
export function toCsvLine(cells: (string | null | undefined)[]): string {
  return cells.map(escapeCsvCell).join(',');
}

/**
 * `Content-Disposition: attachment` value for a download. The plain `filename` is restricted to
 * `[A-Za-z0-9._-]` (so no header injection via quotes/CRLF, and old clients get a sane name);
 * `filename*` carries the RFC 5987 UTF-8 original for clients that support it.
 */
export function buildAttachmentDisposition(filename: string): string {
  const asciiName = filename.replace(CsvConstants.UNSAFE_FILENAME_CHARS, '_');
  const encodedName = encodeURIComponent(filename).replace(
    CsvConstants.RFC5987_EXTRA_CHARS,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`;
}
