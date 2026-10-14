import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Points `avatars.asset_path` at the package version the cluster actually runs.
 *
 * CreateAvatarsTable seeded every row as `packages/avatars/<n>/v4`, hardcoded.
 * Dev has run `PACKAGE_VERSION=v5` since 23 Sep, so every row has been stale
 * since the day it was written.
 *
 * Harmless so far: nothing reads the column. The Router SELECTs it into an
 * `AvatarRecord` field and never forwards it — the pod derives its package path
 * from `PACKAGE_VERSION` in gitops and never learns the row exists.
 *
 * That is about to change. The planned per-avatar versioning makes this column
 * authoritative for which chunk a pod loads, so each avatar can move versions
 * independently. The moment that ships against these rows, every avatar
 * silently drops to v4. **This migration must be deployed BEFORE the entrypoint
 * starts honouring the column, not after.**
 *
 * Why an UPDATE rather than fixing the seed: the seed already ran everywhere it
 * is going to. Editing it changes nothing on a database that has it applied,
 * and TypeORM will not re-run it.
 */
export class CorrectAvatarAssetPathVersion2026093010000
  implements MigrationInterface
{
  /**
   * Rewrites the version LEAF only, leaving the prefix intact.
   *
   * Deliberately NOT a blanket overwrite to `packages/avatars/<n>/v5`. An
   * environment on a different version, or an avatar already moved by hand,
   * keeps whatever it has — only the literal `/v4` tail moves. An environment
   * that never ran v4 is untouched, which is what makes this safe to apply to
   * QA and prod as they migrate.
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows: Array<{ count: string }> = (await queryRunner.query(
      `WITH updated AS (
         UPDATE "avatars"
            SET "asset_path" = regexp_replace("asset_path", '/v4$', '/v5')
          WHERE "asset_path" LIKE 'packages/avatars/%/v4'
            AND "deleted_at" IS NULL
          RETURNING 1
       )
       SELECT count(*)::text AS count FROM updated`,
    )) as Array<{ count: string }>;

    const moved = rows?.[0]?.count ?? '0';
    if (moved !== '0') {
      await queryRunner.query(
        `DO $$ BEGIN RAISE NOTICE 'CorrectAvatarAssetPathVersion: moved ${moved.replace(/'/g, "''")} avatar row(s) from v4 to v5'; END $$`,
      );
    }

    // Anything still on v4 has a shape the pattern above did not match --
    // a hand-edited prefix, or a path that was never the seeded form. Naming
    // them is the point: silence here would hide a row the pipeline is about
    // to treat as authoritative.
    const stragglers: Array<{ avatar_id: string; asset_path: string }> =
      (await queryRunner.query(
        `SELECT "avatar_id", "asset_path"
           FROM "avatars"
          WHERE "asset_path" LIKE '%/v4'
            AND "deleted_at" IS NULL`,
      )) as Array<{ avatar_id: string; asset_path: string }>;

    for (const row of stragglers ?? []) {
      await queryRunner.query(
        `DO $$ BEGIN RAISE NOTICE 'CorrectAvatarAssetPathVersion: ${row.avatar_id.replace(/'/g, "''")} still on v4 with an unexpected path (${row.asset_path.replace(/'/g, "''")}) -- left as-is, check it by hand'; END $$`,
      );
    }
  }

  /**
   * Exact inverse: v5 back to v4 for the seeded shape only.
   *
   * A row moved to some other version after this ran is left alone -- reverting
   * it would be inventing a past it never had.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "avatars"
          SET "asset_path" = regexp_replace("asset_path", '/v5$', '/v4')
        WHERE "asset_path" LIKE 'packages/avatars/%/v5'
          AND "deleted_at" IS NULL`,
    );
  }
}
