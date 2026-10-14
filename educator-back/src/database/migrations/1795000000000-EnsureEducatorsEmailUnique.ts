import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Restores UNIQUE on educators.email required by EducatorRepository.upsertByEmail
 * (INSERT … ON CONFLICT (email)). Missing this constraint causes
 * POST /api/invites/create to 500 with:
 * "there is no unique or exclusion constraint matching the ON CONFLICT specification".
 *
 * Idempotent via IF NOT EXISTS. Fails if duplicate emails already exist.
 * Timestamp follows repo epoch-style convention (after 1794000000000).
 */
export class EnsureEducatorsEmailUnique1795000000000 implements MigrationInterface {
  name = 'EnsureEducatorsEmailUnique1795000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_educators_email"
      ON "educators" ("email")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_educators_email"
    `);
  }
}
