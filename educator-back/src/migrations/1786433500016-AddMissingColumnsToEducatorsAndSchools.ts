import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMissingColumnsToEducatorsAndSchools1786433500016 implements MigrationInterface {
  name = 'AddMissingColumnsToEducatorsAndSchools1786433500016';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ----- educators table -----
    await queryRunner.query(`
      ALTER TABLE "educators"
        ADD COLUMN IF NOT EXISTS "is_active"            boolean     NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS "deleted_at"           timestamptz          DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS "token_invalidated_at" timestamptz          DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS "allocated_tokens"     json                 DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS "lms_enabled"          boolean     NOT NULL DEFAULT false
    `);

    // ----- schools table -----
    await queryRunner.query(`
      ALTER TABLE "schools"
        ADD COLUMN IF NOT EXISTS "is_active"  boolean     NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz          DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS "lms_enabled" boolean    NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "schools"
        DROP COLUMN IF EXISTS "lms_enabled",
        DROP COLUMN IF EXISTS "deleted_at",
        DROP COLUMN IF EXISTS "is_active"
    `);

    await queryRunner.query(`
      ALTER TABLE "educators"
        DROP COLUMN IF EXISTS "lms_enabled",
        DROP COLUMN IF EXISTS "allocated_tokens",
        DROP COLUMN IF EXISTS "token_invalidated_at",
        DROP COLUMN IF EXISTS "deleted_at",
        DROP COLUMN IF EXISTS "is_active"
    `);
  }
}
