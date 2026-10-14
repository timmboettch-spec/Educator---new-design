import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `simulation_reports` becomes one row per Attempt (ADR-0009, RE-233):
 * - drops the one-row-per-(student, scenario) unique constraint so repeat Attempts can be stored;
 * - adds a column for every top-level field of a generated report (`report_data` stays verbatim);
 * - makes `transcript_id` unique — the Attempt's identity and the duplicate guard;
 * - adds the `(student_id, scenario_id, created_at, id)` index used to pick the earliest Attempt;
 * - adds the partial `(student_id, created_at DESC)` index backing `GET /reports`
 *   (SimulationReportRepository.findListRowsByStudentId) — a Student's live Attempts, newest first;
 *   stubs (`report_id IS NULL`) and soft-deleted rows are outside it. Hand-written because `@Index`
 *   can't express DESC; the entity declares the same columns and `where` so `migration:generate`
 *   sees no drift;
 * - converts `created_at` to timestamptz in place (existing values are read as UTC).
 *
 * Existing rows keep `transcript_id` null (no backfill), so the unique index can't fail on them.
 * `down()` re-adds the unique constraint, which fails if repeat Attempts were stored meanwhile.
 */
export class SimulationReportsOneRowPerAttempt1791282650034 implements MigrationInterface {
  name = 'SimulationReportsOneRowPerAttempt1791282650034';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Dev carries the Postgres default name; databases built from migrations carry the explicit one.
    await queryRunner.query(
      `ALTER TABLE "simulation_reports" DROP CONSTRAINT IF EXISTS "UQ_SIMULATION_REPORTS_STUDENT_SCENARIO"`,
    );
    await queryRunner.query(
      `ALTER TABLE "simulation_reports" DROP CONSTRAINT IF EXISTS "simulation_reports_student_id_scenario_id_key"`,
    );

    await queryRunner.query(
      `ALTER TABLE "simulation_reports" ALTER COLUMN "student_name" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "simulation_reports" ALTER COLUMN "scenario_id" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "simulation_reports" ALTER COLUMN "created_at" TYPE TIMESTAMP WITH TIME ZONE USING "created_at" AT TIME ZONE 'UTC'`,
    );
    await queryRunner.query(
      `ALTER TABLE "simulation_reports" ALTER COLUMN "created_at" SET NOT NULL`,
    );

    await queryRunner.query(`
      ALTER TABLE "simulation_reports"
        ADD "transcript_id" character varying,
        ADD "deleted_at" TIMESTAMP WITH TIME ZONE,
        ADD "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        ADD "report_id" character varying,
        ADD "key" character varying,
        ADD "user_id" character varying,
        ADD "student_code" character varying,
        ADD "student_class" character varying,
        ADD "scenario_title" character varying,
        ADD "scenario_start_time" TIMESTAMP WITH TIME ZONE,
        ADD "scenario_end_time" TIMESTAMP WITH TIME ZONE,
        ADD "total_time_seconds" double precision,
        ADD "mode" character varying,
        ADD "score" double precision,
        ADD "performance_label" character varying,
        ADD "score_json" jsonb DEFAULT '{}'::jsonb,
        ADD "summary" text,
        ADD "summary_entries" jsonb DEFAULT '[]'::jsonb,
        ADD "summary_by_category" jsonb DEFAULT '{}'::jsonb,
        ADD "feedback" text,
        ADD "common_action_tracker" jsonb DEFAULT '{}'::jsonb,
        ADD "communication_assessment" jsonb DEFAULT '{}'::jsonb,
        ADD "rubrics_summary" text,
        ADD "rubrics_total" double precision,
        ADD "debrief_reflection" text,
        ADD "action_scores" jsonb DEFAULT '{}'::jsonb,
        ADD "action_summary" jsonb DEFAULT '{}'::jsonb,
        ADD "mandatory_actions" jsonb DEFAULT '[]'::jsonb,
        ADD "optional_actions" jsonb DEFAULT '[]'::jsonb,
        ADD "distractor_actions" jsonb DEFAULT '[]'::jsonb
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_simulation_reports_transcript_id" ON "simulation_reports" ("transcript_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_simulation_reports_report_id" ON "simulation_reports" ("report_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_simulation_reports_student_scenario_created" ON "simulation_reports" ("student_id", "scenario_id", "created_at", "id") `,
    );
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_simulation_reports_student_created_live
      ON simulation_reports (student_id, created_at DESC)
      WHERE report_id IS NOT NULL AND deleted_at IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_simulation_reports_student_created_live`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_simulation_reports_student_scenario_created"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_simulation_reports_report_id"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_simulation_reports_transcript_id"`);

    await queryRunner.query(`
      ALTER TABLE "simulation_reports"
        DROP COLUMN "distractor_actions",
        DROP COLUMN "optional_actions",
        DROP COLUMN "mandatory_actions",
        DROP COLUMN "action_summary",
        DROP COLUMN "action_scores",
        DROP COLUMN "debrief_reflection",
        DROP COLUMN "rubrics_total",
        DROP COLUMN "rubrics_summary",
        DROP COLUMN "communication_assessment",
        DROP COLUMN "common_action_tracker",
        DROP COLUMN "feedback",
        DROP COLUMN "summary_by_category",
        DROP COLUMN "summary_entries",
        DROP COLUMN "summary",
        DROP COLUMN "score_json",
        DROP COLUMN "performance_label",
        DROP COLUMN "score",
        DROP COLUMN "mode",
        DROP COLUMN "total_time_seconds",
        DROP COLUMN "scenario_end_time",
        DROP COLUMN "scenario_start_time",
        DROP COLUMN "scenario_title",
        DROP COLUMN "student_class",
        DROP COLUMN "student_code",
        DROP COLUMN "user_id",
        DROP COLUMN "key",
        DROP COLUMN "report_id",
        DROP COLUMN "updated_at",
        DROP COLUMN "deleted_at",
        DROP COLUMN "transcript_id"
    `);

    await queryRunner.query(
      `ALTER TABLE "simulation_reports" ALTER COLUMN "created_at" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "simulation_reports" ALTER COLUMN "created_at" TYPE TIMESTAMP WITHOUT TIME ZONE USING "created_at" AT TIME ZONE 'UTC'`,
    );
    await queryRunner.query(
      `ALTER TABLE "simulation_reports" ALTER COLUMN "scenario_id" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "simulation_reports" ALTER COLUMN "student_name" SET NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "simulation_reports" ADD CONSTRAINT "UQ_SIMULATION_REPORTS_STUDENT_SCENARIO" UNIQUE ("student_id", "scenario_id")`,
    );
  }
}
