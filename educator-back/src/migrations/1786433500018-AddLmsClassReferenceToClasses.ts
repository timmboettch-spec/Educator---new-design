import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLmsClassReferenceToClasses1786433500018 implements MigrationInterface {
  name = 'AddLmsClassReferenceToClasses1786433500018';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "classes"
      ADD COLUMN IF NOT EXISTS "lms_class_reference" varchar NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "classes"
      DROP COLUMN IF EXISTS "lms_class_reference"
    `);
  }
}
