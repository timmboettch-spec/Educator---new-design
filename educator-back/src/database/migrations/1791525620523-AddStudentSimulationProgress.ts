import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Simulation Progress storage (ADR-0010):
 * - `student_simulation_progress`: one row per `(student_id, simulation_id)` holding the Practice /
 *   Assessment Attempt counts, status and Forfeit. CHECKs keep the Assessment count within
 *   0..3 and allow Forfeit only after at least one Assessment Attempt;
 * - `simulation_reports.attempt_number`: nullable, unique per `(student_id, scenario_id, mode,
 *   attempt_number)` and limited to 1..3 for Assessment. Existing rows keep it null (no backfill);
 *   NULLs never collide in the unique constraint.
 *
 * The limit `3` is hard-coded because migrations stay frozen. To change
 * `SimulationAttemptConstants.MAX_ASSESSMENT_ATTEMPTS`, add a new migration that recreates the CHECKs.
 */
export class AddStudentSimulationProgress1791525620523 implements MigrationInterface {
  name = 'AddStudentSimulationProgress1791525620523';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."simulation_progress_status_enum" AS ENUM('in_progress', 'completed', 'forfeited')`,
    );
    await queryRunner.query(
      `CREATE TABLE "student_simulation_progress" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "student_id" uuid NOT NULL, "simulation_id" uuid NOT NULL, "class_simulation_id" uuid NOT NULL, "practice_attempts_count" integer NOT NULL DEFAULT '0', "assessment_attempts_count" smallint NOT NULL DEFAULT '0', "status" "public"."simulation_progress_status_enum" NOT NULL DEFAULT 'in_progress', "forfeited_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_student_simulation_progress_student_simulation" UNIQUE ("student_id", "simulation_id"), CONSTRAINT "CHK_student_simulation_progress_forfeit_needs_attempt" CHECK ("forfeited_at" IS NULL OR "assessment_attempts_count" >= 1), CONSTRAINT "CHK_student_simulation_progress_assessment_attempts_range" CHECK ("assessment_attempts_count" BETWEEN 0 AND 3), CONSTRAINT "PK_222127fe2b51f7d7ff6e07577ff" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`ALTER TABLE "simulation_reports" ADD "attempt_number" integer`);
    await queryRunner.query(
      `ALTER TABLE "simulation_reports" ADD CONSTRAINT "CHK_simulation_reports_assessment_attempt_number_range" CHECK ("mode" <> 'Assessment' OR "attempt_number" IS NULL OR "attempt_number" BETWEEN 1 AND 3)`,
    );
    await queryRunner.query(
      `ALTER TABLE "simulation_reports" ADD CONSTRAINT "UQ_simulation_reports_student_scenario_mode_attempt" UNIQUE ("student_id", "scenario_id", "mode", "attempt_number")`,
    );
    await queryRunner.query(
      `ALTER TABLE "student_simulation_progress" ADD CONSTRAINT "FK_fa2991a82dacd5031e56d1e8b4b" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "student_simulation_progress" ADD CONSTRAINT "FK_85f5aed2f82b32a323e560e6a29" FOREIGN KEY ("simulation_id") REFERENCES "simulations_v2"("simulation_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "student_simulation_progress" ADD CONSTRAINT "FK_ea3da329e68a1fc70f58460745e" FOREIGN KEY ("class_simulation_id") REFERENCES "class_simulations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "student_simulation_progress" DROP CONSTRAINT "FK_ea3da329e68a1fc70f58460745e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "student_simulation_progress" DROP CONSTRAINT "FK_85f5aed2f82b32a323e560e6a29"`,
    );
    await queryRunner.query(
      `ALTER TABLE "student_simulation_progress" DROP CONSTRAINT "FK_fa2991a82dacd5031e56d1e8b4b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "simulation_reports" DROP CONSTRAINT "UQ_simulation_reports_student_scenario_mode_attempt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "simulation_reports" DROP CONSTRAINT "CHK_simulation_reports_assessment_attempt_number_range"`,
    );
    await queryRunner.query(`ALTER TABLE "simulation_reports" DROP COLUMN "attempt_number"`);
    await queryRunner.query(`DROP TABLE "student_simulation_progress"`);
    await queryRunner.query(`DROP TYPE "public"."simulation_progress_status_enum"`);
  }
}
