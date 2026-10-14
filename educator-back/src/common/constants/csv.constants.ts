/** Shared CSV formatting rules used by `src/common/utils/csv.util.ts`. */
export const CsvConstants = {
  /** Leading characters spreadsheet apps treat as a formula (OWASP CSV injection). */
  FORMULA_TRIGGER: /^[=+\-@\t\r]/,
  /** Prefix that makes a spreadsheet treat a formula-looking cell as plain text. */
  FORMULA_ESCAPE_PREFIX: "'",
  /** Cells containing any of these must be quoted per RFC 4180. */
  NEEDS_QUOTING: /[",\r\n]/,
  /** Characters not allowed in the plain `filename=` of `Content-Disposition`. */
  UNSAFE_FILENAME_CHARS: /[^A-Za-z0-9._-]+/g,
  /** Characters `encodeURIComponent` leaves alone but RFC 5987 `filename*` must percent-encode. */
  RFC5987_EXTRA_CHARS: /['()*]/g,
};
