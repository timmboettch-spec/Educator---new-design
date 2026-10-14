import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tracks seeder run bookkeeping for `src/database/seeders/index.ts` —
 * analogous to how TypeORM's own `migrations` table tracks which migrations
 * have already executed. Not a TypeORM entity (no file under
 * `src/database/entities/`), same as `migrations` itself: this is runner-
 * internal state, managed directly via raw queries in seeders/index.ts, not
 * a domain concept the rest of the app has any business injecting.
 *
 * `type` is 'once' (run only the first time ever, e.g. seeders hydrating
 * from Azure Blob Storage — too expensive to repeat on every container boot,
 * see the Dockerfile's CMD which runs `npm run seed:prod` unconditionally)
 * or 'everytime' (re-run on every boot, the previous default behavior for
 * every seeder). Once a row exists, its `type` wins over the default in
 * seeders/index.ts's SEEDER_RUN_TYPES map — an operator can flip a seeder's
 * type directly in this table without a code change/redeploy.
 */
export class CreateSeedRunsTable1791000000000 implements MigrationInterface {
  name = 'CreateSeedRunsTable1791000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "seed_runs" (
        "seeder_name"  varchar     NOT NULL,
        "type"         varchar     NOT NULL DEFAULT 'everytime',
        "last_run_at"  TIMESTAMPTZ,
        "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "seed_runs_pkey" PRIMARY KEY ("seeder_name"),
        CONSTRAINT "seed_runs_type_check" CHECK ("type" IN ('once', 'everytime'))
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "seed_runs"`);
  }
}
