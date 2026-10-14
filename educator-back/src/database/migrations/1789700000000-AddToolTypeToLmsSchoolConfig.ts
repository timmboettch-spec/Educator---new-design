import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddToolTypeToLmsSchoolConfig1789700000000 implements MigrationInterface {
  name = 'AddToolTypeToLmsSchoolConfig1789700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        CREATE TYPE "lms_tool_type_enum" AS ENUM ('educator', 'student');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END
      $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "lms_school_config"
      ADD COLUMN IF NOT EXISTS "tool_type" "lms_tool_type_enum" NOT NULL DEFAULT 'educator'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "lms_school_config" DROP COLUMN IF EXISTS "tool_type"
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS "lms_tool_type_enum"
    `);
  }
}
