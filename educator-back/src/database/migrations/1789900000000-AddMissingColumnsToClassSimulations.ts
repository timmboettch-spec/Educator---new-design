import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMissingColumnsToClassSimulations1789900000000 implements MigrationInterface {
  name = 'AddMissingColumnsToClassSimulations1789900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "class_simulations"
        ADD COLUMN IF NOT EXISTS "is_active"  boolean     NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS "is_ai"      boolean     NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz          DEFAULT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "class_simulations"
        DROP COLUMN IF EXISTS "deleted_at",
        DROP COLUMN IF EXISTS "is_ai",
        DROP COLUMN IF EXISTS "is_active"
    `);
  }
}
