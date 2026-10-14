import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the avatar catalog and points `simulations.avatarId` at it.
 *
 * The foreign key is the point: a scenario must not be able to reference an
 * avatar that does not exist. Nothing stops it today, and the failure is
 * invisible until a student opens the scenario and gets no avatar.
 *
 * The eleven columns the avatar platform's Session Router SELECTs by name
 * (avatar_id, display_name, asset_path, voice_profile_id, gpu_sku,
 * min_replicas, max_replicas, scale_to_zero, status, unreal_map,
 * pixel_streaming_version) must all exist. Postgres errors on a SELECT naming a
 * missing column, and the Router catches PostgresError and returns None — so
 * dropping one does not surface as an error, it silently makes every avatar
 * lookup return "not found" and no session starts.
 */
/**
 * Escape a value for embedding in a SQL string literal.
 *
 * Only needed for the RAISE NOTICE blocks below: a `DO $$ ... $$` body is one
 * opaque string to the server, so bind parameters are not available inside it
 * and every value has to be inlined. Doubling single quotes is the standard
 * escape; the surrounding literal is added by the caller.
 */
function pgQuote(value: string): string {
  return String(value).replace(/'/g, "''");
}

export class CreateAvatarsTable2026092809000 implements MigrationInterface {
  name = 'CreateAvatarsTable2026092809000';

  /**
   * The six avatars in the current UE build, matching the blob layout
   * `packages/avatars/<n>/v4`. Appearance strings carry over verbatim from the
   * frontend's hardcoded list so the dropdown reads identically once it
   * switches to the API.
   */
  private static readonly SEED = [
    { id: 'avatar-10', map: 'L_AVT_10', look: 'appearance not yet seen' },
    { id: 'avatar-12', map: 'L_AVT_12', look: 'appearance not yet seen' },
    { id: 'avatar-21', map: 'L_AVT_21', look: 'lighter-skinned, dark hair' },
    { id: 'avatar-22', map: 'L_AVT_22', look: 'Black, braided hair' },
    { id: 'avatar-25', map: 'L_AVT_25', look: 'appearance not yet seen' },
    { id: 'avatar-26', map: 'L_AVT_26', look: 'appearance not yet seen' },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "avatar_status_enum" AS ENUM('syncing', 'ready', 'retired')`,
    );

    await queryRunner.query(`
      CREATE TABLE "avatars" (
        "avatar_uuid"             uuid                  NOT NULL DEFAULT uuid_generate_v4(),
        "avatar_id"               varchar(64)           NOT NULL,
        "display_name"            varchar(128)          NOT NULL,
        "appearance"              varchar(255),
        "unreal_map"              varchar(255),
        "asset_path"              varchar(255),
        "status"                  "avatar_status_enum"  NOT NULL DEFAULT 'syncing',
        "voice_profile_id"        varchar(128),
        "gpu_sku"                 varchar(64)           NOT NULL DEFAULT 'Standard_NV36ads_A10_v5',
        "min_replicas"            int                   NOT NULL DEFAULT 1,
        "max_replicas"            int                   NOT NULL DEFAULT 10,
        "scale_to_zero"           boolean               NOT NULL DEFAULT true,
        "pixel_streaming_version" int                   NOT NULL DEFAULT 2,
        "created_at"              TIMESTAMPTZ           NOT NULL DEFAULT now(),
        "updated_at"              TIMESTAMPTZ           NOT NULL DEFAULT now(),
        "deleted_at"              TIMESTAMPTZ,
        CONSTRAINT "avatars_pkey" PRIMARY KEY ("avatar_uuid")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_avatars_deleted_at" ON "avatars" ("deleted_at") WHERE "deleted_at" IS NOT NULL`,
    );

    // Unique only among active rows, matching the units pattern — a retired
    // avatar that is soft-deleted must not block re-publishing the same id.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_avatars_avatar_id_active" ON "avatars" ("avatar_id") WHERE "deleted_at" IS NULL`,
    );

    // The dropdown's default query is status = 'ready'; a partial index keeps
    // syncing and retired rows out of it.
    await queryRunner.query(
      `CREATE INDEX "IDX_avatars_status_ready" ON "avatars" ("status") WHERE "status" = 'ready'`,
    );

    for (const avatar of CreateAvatarsTable2026092809000.SEED) {
      await queryRunner.query(
        `INSERT INTO "avatars"
           ("avatar_id", "display_name", "appearance", "unreal_map", "asset_path", "status")
         VALUES ($1, $2, $3, $4, $5, 'ready')
         ON CONFLICT DO NOTHING`,
        [
          avatar.id,
          `${avatar.id} — ${avatar.look}`,
          avatar.look,
          `/Game/Maps/Production/${avatar.map}`,
          `packages/avatars/${avatar.id.replace('avatar-', '')}/v4`,
        ],
      );
    }

    // --- Repair before constraining -------------------------------------
    //
    // Two things would otherwise abort this migration on live data:
    //
    //   1. admin.service.ts wrote `avatarId: scenarioData.avatarId ?? ''` --
    //      an EMPTY STRING, not null, whenever a scenario had no avatar. '' is
    //      not NULL, so the FK would look for an avatar literally named '' and
    //      reject every one of those rows.
    //   2. Ids may exist that the seed does not cover. The hardcoded dropdown
    //      and the blob packages already disagree, so production may hold a
    //      third spelling.
    //
    // Rather than fail and leave a deploy half-applied, anything unmatched is
    // NULLed and named in a notice. A scenario whose avatar is unknown ends up
    // with no avatar -- the honest state, recoverable in the admin UI.

    const blanked: Array<{ count: string }> = (await queryRunner.query(
      `WITH updated AS (
         UPDATE "simulations" SET "avatarId" = NULL
         WHERE "avatarId" IS NOT NULL AND trim("avatarId") = ''
         RETURNING 1
       )
       SELECT count(*)::text AS count FROM updated`,
    )) as Array<{ count: string }>;
    if (blanked?.[0] && blanked[0].count !== '0') {
      // NOT parameterised: a DO block is a single string to the server, so $1
      // is not a placeholder and Postgres rejects the bind outright
      // ("bind message supplies 1 parameters, but prepared statement requires
      // 0", routine exec_bind_message). The value is a count from count(*),
      // so it is digits only -- but it is escaped anyway rather than trusted.
      await queryRunner.query(
        `DO $$ BEGIN RAISE NOTICE 'CreateAvatarsTable: cleared ${pgQuote(
          blanked[0].count,
        )} empty-string avatarId row(s) to NULL'; END $$`,
      );
    }

    const orphans: Array<{ avatarId: string; count: string }> = (await queryRunner.query(
      `SELECT s."avatarId", count(*)::text AS count
         FROM "simulations" s
         LEFT JOIN "avatars" a ON a."avatar_id" = s."avatarId" AND a."deleted_at" IS NULL
        WHERE s."avatarId" IS NOT NULL AND a."avatar_id" IS NULL
        GROUP BY s."avatarId"`,
    )) as Array<{ avatarId: string; count: string }>;
    for (const orphan of orphans ?? []) {
      // Same reason as above -- no bind parameters inside a DO block.
      // orphan.avatarId comes from the database, so it IS escaped: a stray
      // quote in a scenario's avatar id would otherwise break the block.
      await queryRunner.query(
        `DO $$ BEGIN RAISE NOTICE 'CreateAvatarsTable: avatarId ${pgQuote(
          orphan.avatarId,
        )} not in catalog — clearing on ${pgQuote(
          orphan.count,
        )} scenario(s). Re-assign in the admin UI.'; END $$`,
      );
    }
    await queryRunner.query(
      `UPDATE "simulations" s SET "avatarId" = NULL
        WHERE s."avatarId" IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM "avatars" a
             WHERE a."avatar_id" = s."avatarId" AND a."deleted_at" IS NULL
          )`,
    );

    // --- Now the constraint can be trusted -------------------------------
    //
    // References avatar_id, not the uuid primary key: simulations.avatarId has
    // always carried the business id, and rewriting every row to a uuid would
    // break the pod labels and blob paths that use the same string.
    //
    // ON DELETE RESTRICT, not CASCADE: deleting an avatar must never delete
    // somebody's scenario. Retire it (status = 'retired') instead.
    await queryRunner.query(
      `ALTER TABLE "avatars" ADD CONSTRAINT "UQ_avatars_avatar_id" UNIQUE ("avatar_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "simulations"
         ADD CONSTRAINT "FK_simulations_avatar"
         FOREIGN KEY ("avatarId") REFERENCES "avatars"("avatar_id")
         ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // The FK and table go; the NULLs do not come back. The original values were
    // invalid, which is why they were cleared, and re-inserting '' would only
    // recreate the problem this migration fixed.
    await queryRunner.query(
      `ALTER TABLE "simulations" DROP CONSTRAINT IF EXISTS "FK_simulations_avatar"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_avatars_status_ready"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_avatars_avatar_id_active"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_avatars_deleted_at"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "avatars"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "avatar_status_enum"`);
  }
}
