/** SQL expressions over the `simulation_reports` row's typed columns. */

function safeNumericJsonbExpr(jsonExpr: string): string {
  return `(CASE WHEN ${jsonExpr} ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (${jsonExpr})::numeric ELSE NULL END)`;
}

/**
 * The `score` column, falling back to `score_json.overallScore`.
 * `alias` is the table alias the query selects `simulation_reports` under.
 */
export function buildScoreColumnExpr(alias: string): string {
  return `COALESCE(
    ${alias}.score::numeric,
    ${safeNumericJsonbExpr(`${alias}.score_json->>'overallScore'`)}
  )`;
}

/** The `total_time_seconds` column. */
export function buildTimeSpentColumnExpr(alias: string): string {
  return `${alias}.total_time_seconds::numeric`;
}
