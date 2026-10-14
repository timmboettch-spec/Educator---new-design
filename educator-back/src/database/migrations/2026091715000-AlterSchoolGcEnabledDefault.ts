import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Aligns schools.google_classroom_enabled column DEFAULT with the entity
 * (default: false / GC opt-in). Corrects AddGoogleClassroomEnabledToSchools,
 * which added the column with DEFAULT true. Existing row values are unchanged.
 *
 * Timestamp is after 2026091714000 so fresh DBs add the column first, then
 * this migration flips the DEFAULT (hasColumn guard is never a no-op here).
 */
export class AlterSchoolGcEnabledDefault2026091715000 implements MigrationInterface {
  name = 'AlterSchoolGcEnabledDefault2026091715000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('schools', 'google_classroom_enabled'))) {
      return;
    }
    await queryRunner.query(
      `ALTER TABLE "schools" ALTER COLUMN "google_classroom_enabled" SET DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('schools', 'google_classroom_enabled'))) {
      return;
    }
    await queryRunner.query(
      `ALTER TABLE "schools" ALTER COLUMN "google_classroom_enabled" SET DEFAULT true`,
    );
  }
}
