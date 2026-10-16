import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SALES3: assessment attempts are effectively unlimited (MAX_ASSESSMENT_ATTEMPTS = 9999), so the two
 * CHECKs that hard-code the old limit of 3 are recreated with the new bound. `down` restores 3.
 */
export class RaiseAssessmentAttemptLimit1792100696555 implements MigrationInterface {
  name = 'RaiseAssessmentAttemptLimit1792100696555';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.setLimit(queryRunner, 9999);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.setLimit(queryRunner, 3);
  }

  private async setLimit(queryRunner: QueryRunner, max: number): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "student_simulation_progress" DROP CONSTRAINT "CHK_student_simulation_progress_assessment_attempts_range"`,
    );
    await queryRunner.query(
      `ALTER TABLE "student_simulation_progress" ADD CONSTRAINT "CHK_student_simulation_progress_assessment_attempts_range" CHECK ("assessment_attempts_count" BETWEEN 0 AND ${max})`,
    );
    await queryRunner.query(
      `ALTER TABLE "simulation_reports" DROP CONSTRAINT "CHK_simulation_reports_assessment_attempt_number_range"`,
    );
    await queryRunner.query(
      `ALTER TABLE "simulation_reports" ADD CONSTRAINT "CHK_simulation_reports_assessment_attempt_number_range" CHECK ("mode" <> 'Assessment' OR "attempt_number" IS NULL OR "attempt_number" BETWEEN 1 AND ${max})`,
    );
  }
}
