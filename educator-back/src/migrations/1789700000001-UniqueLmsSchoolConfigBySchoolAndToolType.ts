import { MigrationInterface, QueryRunner } from 'typeorm';

export class UniqueLmsSchoolConfigBySchoolAndToolType1789700000001 implements MigrationInterface {
  name = 'UniqueLmsSchoolConfigBySchoolAndToolType1789700000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop old unique constraint on school_id only
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_lms_school_config_school_id"
    `);

    // Create new unique constraint on (school_id, tool_type)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_lms_school_config_school_tool"
        ON "lms_school_config" ("school_id", "tool_type")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop composite unique constraint
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_lms_school_config_school_tool"
    `);

    // Restore old unique constraint on school_id only
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_lms_school_config_school_id"
        ON "lms_school_config" ("school_id")
    `);
  }
}
