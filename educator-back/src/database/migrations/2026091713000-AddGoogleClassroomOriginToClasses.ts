import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Class origin + Google course id for Classroom-provisioned classes.
 * Runs after google_coursework_mappings (17904*) and google_student_mappings (17905*).
 *
 * Partial unique index on (school_id, google_course_id) WHERE google_course_id
 * IS NOT NULL is intentional: at most one class per school may be linked to a
 * given Google course (manual classes keep google_course_id NULL and can share
 * a school freely). Linking a second class to the same course must fail.
 */
export class AddGoogleClassroomOriginToClasses2026091713000
  implements MigrationInterface
{
  name = 'AddGoogleClassroomOriginToClasses2026091713000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "classes"
      ADD COLUMN IF NOT EXISTS "origin" varchar NOT NULL DEFAULT 'manual'
    `);

    await queryRunner.query(`
      ALTER TABLE "classes"
      ADD COLUMN IF NOT EXISTS "google_course_id" varchar NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_classes_school_google_course_id"
        ON "classes" ("school_id", "google_course_id")
        WHERE "google_course_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_classes_school_google_course_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "classes"
      DROP COLUMN IF EXISTS "google_course_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "classes"
      DROP COLUMN IF EXISTS "origin"
    `);
  }
}
