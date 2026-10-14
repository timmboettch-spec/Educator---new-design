import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClassesStatusEndDateIndex1794000000000 implements MigrationInterface {
  name = 'AddClassesStatusEndDateIndex1794000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_classes_status_end_date"
        ON "classes"("status", "end_date")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_classes_status_end_date"`);
  }
}
