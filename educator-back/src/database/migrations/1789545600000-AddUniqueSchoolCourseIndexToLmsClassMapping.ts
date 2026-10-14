import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUniqueSchoolCourseIndexToLmsClassMapping1789545600000 implements MigrationInterface {
  name = 'AddUniqueSchoolCourseIndexToLmsClassMapping1789545600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_lms_class_mapping_school_course"
      ON "lms_class_mapping" ("school_id", "lms_course_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_lms_class_mapping_school_course"
    `);
  }
}
