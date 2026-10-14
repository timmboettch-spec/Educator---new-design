import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClassIdToClasses1786433500017 implements MigrationInterface {
  name = 'AddClassIdToClasses1786433500017';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "classes"
      ADD COLUMN IF NOT EXISTS "class_id" varchar NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "classes"
      DROP COLUMN IF EXISTS "class_id"
    `);
  }
}
