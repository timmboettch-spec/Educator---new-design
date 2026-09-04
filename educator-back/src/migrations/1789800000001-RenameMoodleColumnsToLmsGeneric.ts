import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameMoodleColumnsToLmsGeneric1789800000001 implements MigrationInterface {
  name = 'RenameMoodleColumnsToLmsGeneric1789800000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "lms_school_config"
      RENAME COLUMN "moodle_url" TO "lms_base_url"
    `);
    await queryRunner.query(`
      ALTER TABLE "lms_school_config"
      RENAME COLUMN "moodle_ws_token" TO "lms_api_token"
    `);

    await queryRunner.query(`
      ALTER TABLE "lms_class_mapping"
      RENAME COLUMN "moodle_url" TO "lms_base_url"
    `);
    await queryRunner.query(`
      ALTER TABLE "lms_class_mapping"
      RENAME COLUMN "moodle_ws_token" TO "lms_api_token"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "lms_class_mapping"
      RENAME COLUMN "lms_api_token" TO "moodle_ws_token"
    `);
    await queryRunner.query(`
      ALTER TABLE "lms_class_mapping"
      RENAME COLUMN "lms_base_url" TO "moodle_url"
    `);

    await queryRunner.query(`
      ALTER TABLE "lms_school_config"
      RENAME COLUMN "lms_api_token" TO "moodle_ws_token"
    `);
    await queryRunner.query(`
      ALTER TABLE "lms_school_config"
      RENAME COLUMN "lms_base_url" TO "moodle_url"
    `);
  }
}
