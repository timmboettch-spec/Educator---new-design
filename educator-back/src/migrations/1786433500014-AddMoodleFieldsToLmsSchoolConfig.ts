import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMoodleFieldsToLmsSchoolConfig1786433500014 implements MigrationInterface {
  name = 'AddMoodleFieldsToLmsSchoolConfig1786433500014';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "lms_school_config" ADD COLUMN IF NOT EXISTS "moodle_url" varchar NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "lms_school_config" ADD COLUMN IF NOT EXISTS "moodle_ws_token" varchar NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "lms_school_config" DROP COLUMN IF EXISTS "moodle_ws_token"`,
    );
    await queryRunner.query(`ALTER TABLE "lms_school_config" DROP COLUMN IF EXISTS "moodle_url"`);
  }
}
