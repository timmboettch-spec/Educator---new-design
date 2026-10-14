/** Normalizes a query-string value that may arrive as a single string, a repeated-param
 * array, a comma-separated string, or undefined, into a plain string array (or undefined
 * when nothing was supplied) — the shared `@Transform` used by every multi-select query
 * filter (`school_id`, `class_id`, `status`, ...). */
export function toStringArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => toStringArray(entry) ?? []);
  }

  if (typeof value === 'string') {
    const parts = value
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    return parts.length > 0 ? parts : undefined;
  }

  return undefined;
}

export function toOptionalBoolean(value: unknown): unknown {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return value;
}

/** `@Transform` helper: trims each string entry of an array; anything else passes through. */
export function trimEach(value: unknown): unknown {
  return Array.isArray(value)
    ? value.map((entry: unknown) => (typeof entry === 'string' ? entry.trim() : entry))
    : value;
}

/** Like {@link toStringArray} but never splits on commas, for filters whose values may contain
 * one (a product name). A single value becomes a one-element array and a repeated parameter keeps
 * every entry (an exact repeat is kept once). Blank entries are dropped, so an absent, empty, blank or all-blank parameter means
 * "no filter" (the same as a blank `search`); a non-string entry is kept for validation to refuse. */
export function toRepeatedStringArray(value: unknown): unknown {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) && typeof value !== 'string') return value;
  const entries: unknown[] = Array.isArray(value) ? value : [value];
  const kept = entries
    .map((entry: unknown) => (typeof entry === 'string' ? entry.trim() : entry))
    .filter((entry: unknown) => entry !== '');
  const unique = [...new Set(kept)];
  return unique.length > 0 ? unique : undefined;
}
