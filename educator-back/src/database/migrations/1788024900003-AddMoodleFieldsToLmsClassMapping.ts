import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMoodleFieldsToLmsClassMapping1788024900003 implements MigrationInterface {
  name = 'AddMoodleFieldsToLmsClassMapping1788024900003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "lms_class_mapping" ADD COLUMN IF NOT EXISTS "moodle_url" varchar NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "lms_class_mapping" ADD COLUMN IF NOT EXISTS "moodle_ws_token" varchar NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "lms_class_mapping" DROP COLUMN IF EXISTS "moodle_ws_token"`,
    );
    await queryRunner.query(`ALTER TABLE "lms_class_mapping" DROP COLUMN IF EXISTS "moodle_url"`);
  }
}
