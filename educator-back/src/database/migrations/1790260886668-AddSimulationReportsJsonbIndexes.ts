import { MigrationInterface, QueryRunner } from 'typeorm';

function numericOrNull(jsonExpr: string): string {
  return `(CASE WHEN ${jsonExpr} ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (${jsonExpr})::numeric ELSE NULL END)`;
}

/**
 * Functional (expression) indexes on `simulation_reports.report_data` so RE-192's listing
 * endpoint can sort/filter by mode/score/timeSpent without a full table scan. `report_data`
 * has no fixed schema (untyped jsonb), so each expression mirrors the exact fallback-key
 * chain its extraction util uses — the repository query must use the identical expression
 * or Postgres won't pick the index up. See docs-local/re-38/RE-192-Design-Decisions.md.
 *
 * The expressions are inlined here (they were once shared with the listing query, which no
 * longer reads `report_data`) so this historical migration has no dependency on shared utils.
 *
 * Hand-written (not entity-diff generated): expression indexes on a jsonb column have no
 * TypeORM entity representation, so there is nothing for `migration:generate` to diff.
 */
export class AddSimulationReportsJsonbIndexes1790260886668 implements MigrationInterface {
  name = 'AddSimulationReportsJsonbIndexes1790260886668';

  private static readonly MODE_EXPR = `COALESCE(
    report_data->>'mode',
    report_data->>'reportMode',
    report_data->>'attemptMode',
    report_data->>'attempt_mode'
  )`;

  private static readonly SCORE_EXPR = `COALESCE(
    ${numericOrNull(`report_data->>'overallScore'`)},
    ${numericOrNull(`report_data->>'score'`)},
    ${numericOrNull(`report_data->>'Score'`)},
    ${numericOrNull(`report_data->'scoreJson'->>'overallScore'`)}
  )`;

  // Only the numeric primary key (totalTimeSeconds) is indexed — the `timeSpent` string
  // fallback is differently typed (pre-formatted HH:MM:SS) and rare in practice; indexing
  // a mixed numeric/string COALESCE would need a lossy cast, so it's left unindexed and the
  // repository sorts/filters those few rows without index support.
  private static readonly TIME_SPENT_EXPR = numericOrNull(`report_data->>'totalTimeSeconds'`);

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_simulation_reports_mode
      ON simulation_reports ((${AddSimulationReportsJsonbIndexes1790260886668.MODE_EXPR}))
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_simulation_reports_score
      ON simulation_reports ((${AddSimulationReportsJsonbIndexes1790260886668.SCORE_EXPR}))
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_simulation_reports_time_spent
      ON simulation_reports ((${AddSimulationReportsJsonbIndexes1790260886668.TIME_SPENT_EXPR}))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_simulation_reports_time_spent`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_simulation_reports_score`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_simulation_reports_mode`);
  }
}
