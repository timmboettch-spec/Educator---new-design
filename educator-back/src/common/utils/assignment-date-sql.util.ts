/**
 * `make_date` that returns `NULL` for an impossible date (year 0, Feb 31) instead of raising.
 * Expects m 1-12, d 1-31. Uses `CASE`, not `AND`: only `CASE` guarantees evaluation order.
 */
function safeMakeDateExpr(yearExpr: string, monthExpr: string, dayExpr: string): string {
  return `(CASE
      WHEN ${yearExpr} = 0 THEN NULL
      WHEN ${dayExpr} > EXTRACT(DAY FROM (make_date(${yearExpr}, ${monthExpr}, 1) + INTERVAL '1 month - 1 day')) THEN NULL
      ELSE make_date(${yearExpr}, ${monthExpr}, ${dayExpr})
    END)`;
}

/**
 * SQL `date` expression for a `class_simulations` varchar date column (`start_date`/`due_date`/
 * `end_date`). New rows are normalised to `YYYY-MM-DD` on assign (optionally with a time
 * suffix), but legacy/updated rows may still be `MM-DD-YYYY` — the same two formats the class
 * page parses. Anything else, including an impossible date (`2026-02-31`), is `NULL`, never an
 * error: no window bound, and sorted last.
 */
export function buildAssignmentDateExpr(column: string): string {
  const isoDate = safeMakeDateExpr(
    `substring(${column} from 1 for 4)::int`,
    `substring(${column} from 6 for 2)::int`,
    `substring(${column} from 9 for 2)::int`,
  );
  const usDate = safeMakeDateExpr(
    `substring(${column} from 7 for 4)::int`,
    `substring(${column} from 1 for 2)::int`,
    `substring(${column} from 4 for 2)::int`,
  );

  return `(CASE
    WHEN ${column} ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])' THEN ${isoDate}
    WHEN ${column} ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])-[0-9]{4}$' THEN ${usDate}
    ELSE NULL
  END)`;
}
