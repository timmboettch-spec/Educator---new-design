import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * School-level Google Classroom feature gate (single migration).
 * Previously split as educators-column then move-to-schools; merged because
 * neither intermediate state shipped to production.
 *
 * Existing schools stay enabled (DEFAULT true). New TypeORM inserts use entity default false.
 * Timestamp is YYYYMMDDHHmmss (sequential after other GC migrations), not unix-ms.
 */
export class AddGoogleClassroomEnabledToSchools2026091714000
  implements MigrationInterface
{
  name = 'AddGoogleClassroomEnabledToSchools2026091714000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "schools"
      ADD COLUMN IF NOT EXISTS "google_classroom_enabled" boolean NOT NULL DEFAULT true
    `);
    // Drop leftover educator column if an older draft of this branch applied it.
    await queryRunner.query(`
      ALTER TABLE "educators"
      DROP COLUMN IF EXISTS "google_classroom_enabled"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "schools"
      DROP COLUMN IF EXISTS "google_classroom_enabled"
    `);
  }
}
