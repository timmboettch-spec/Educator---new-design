import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Per-educator Google Classroom OAuth: one connection per (school, educator).
 * Existing rows keep connected_by_educator_id as the educator key (1:1 migrate).
 * Drops school-only uniqueness so a second educator can connect without overwrite.
 */
export class AlterGoogleSchoolConnectionsEducatorUnique1790683139255
  implements MigrationInterface
{
  name = 'AlterGoogleSchoolConnectionsEducatorUnique1790683139255';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('google_school_connections'))) {
      return;
    }

    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_google_school_connections_school_id"`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_google_school_connections_school_id" ON "google_school_connections" ("school_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_google_school_connections_school_educator" ON "google_school_connections" ("school_id", "connected_by_educator_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('google_school_connections'))) {
      return;
    }

    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_google_school_connections_school_educator"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_google_school_connections_school_id"`,
    );
    // Restore school-only unique only when each school has at most one row.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_google_school_connections_school_id" ON "google_school_connections" ("school_id")`,
    );
  }
}
