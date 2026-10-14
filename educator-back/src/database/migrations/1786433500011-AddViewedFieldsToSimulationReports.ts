import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddViewedFieldsToSimulationReports1786433500011 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE simulation_reports
        ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMP WITH TIME ZONE NULL DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS viewed_by UUID NULL DEFAULT NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_simulation_reports_viewed_at
        ON simulation_reports (viewed_at);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_simulation_reports_student_id
        ON simulation_reports (student_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_simulation_reports_viewed_at`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_simulation_reports_student_id`);
    await queryRunner.query(`
      ALTER TABLE simulation_reports
        DROP COLUMN IF EXISTS viewed_at,
        DROP COLUMN IF EXISTS viewed_by;
    `);
  }
}
