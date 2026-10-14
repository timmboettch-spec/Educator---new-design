import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gives the retired `simulation_reports.report_data` column a `'{}'` default. The entity no longer
 * maps it (ADR-0010), so inserts omit it and would otherwise violate its NOT NULL constraint.
 * Existing rows keep their stored value.
 */
export class DefaultSimulationReportsReportData1791543239702 implements MigrationInterface {
  name = 'DefaultSimulationReportsReportData1791543239702';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "simulation_reports" ALTER COLUMN "report_data" SET DEFAULT '{}'::jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "simulation_reports" ALTER COLUMN "report_data" DROP DEFAULT`,
    );
  }
}
