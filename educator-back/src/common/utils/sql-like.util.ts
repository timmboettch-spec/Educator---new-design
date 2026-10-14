/** Escapes literal `%`/`_` in raw user input before it's wrapped in `%...%` for an ILIKE
 * query, so a search for a literal percent sign or underscore doesn't act as a SQL wildcard.
 * Backslashes are escaped first — otherwise a literal backslash immediately before a `%`/`_`
 * would combine with the wildcard's own escaping backslash and neutralize it. */
export function escapeLikeWildcards(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/[%_]/g, (match) => `\\${match}`);
}
