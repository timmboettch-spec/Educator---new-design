import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLmsClassIdToClasses1788024900002 implements MigrationInterface {
  name = 'AddLmsClassIdToClasses1788024900002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "classes"
      ADD COLUMN IF NOT EXISTS "lms_class_id" character varying
    `);

    await queryRunner.query(`
      UPDATE "classes"
      SET "lms_class_id" = UPPER(SUBSTRING(MD5((RANDOM()::text || "id"::text)) FROM 1 FOR 8))
      WHERE "lms_class_id" IS NULL OR "lms_class_id" = ''
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "classes"
      DROP COLUMN IF EXISTS "lms_class_id"
    `);
  }
}
