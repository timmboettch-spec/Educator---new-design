import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the TTS voice-profile catalog and lets a scenario point at one
 * (`simulations_v2.voice_profile_id`).
 *
 * DELIBERATE DEVIATION from database-migrations-rules.md ("timestamps must be
 * real", "generate, don't hand-write"), for the same reason as
 * 2026092809000-CreateAvatarsTable:
 *
 *   - A real Date.now() timestamp (~1790700000000) sorts BEFORE
 *     1791200000000-CreateSimulationV2Schema, so on a fresh database this
 *     migration would run before the table it alters exists and abort the
 *     container's startup `migration:run`. 2026093010500 is date-shaped
 *     (30 Sep 2026 10:00), unique, and sorts after every existing migration,
 *     including 2026092809000-CreateAvatarsTable.
 *   - The case-insensitive display-name index is an expression index
 *     (`lower(display_name)`) that `migration:generate` cannot produce, so the
 *     SQL is written by hand. Every other object here matches the entity
 *     decorators in voice-profile.entity.ts / simulation-v2.entity.ts exactly
 *     (enum names, column types, nullability, index and constraint names), so a
 *     DriftCheck generate after this migration produces no statements for them.
 *
 * The FK is ON DELETE RESTRICT: a profile is retired (status = 'retired'),
 * never deleted, and the service refuses to retire one a scenario still uses.
 */
export class CreateVoiceProfiles2026093010500 implements MigrationInterface {
  name = 'CreateVoiceProfiles2026093010500';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "voice_profile_status" AS ENUM('active', 'retired')`);
    await queryRunner.query(`CREATE TYPE "voice_profile_gender" AS ENUM('female', 'male')`);

    await queryRunner.query(`
      CREATE TABLE "voice_profiles" (
        "voice_profile_id"   uuid                    NOT NULL DEFAULT uuid_generate_v4(),
        "display_name"       varchar(100)            NOT NULL,
        "status"             "voice_profile_status"  NOT NULL DEFAULT 'active',
        "blob_path"          varchar(255)            NOT NULL,
        "duration_ms"        integer                 NOT NULL,
        "default_for_gender" "voice_profile_gender",
        "created_by"         uuid,
        "updated_by"         uuid,
        "retired_at"         TIMESTAMPTZ,
        "created_at"         TIMESTAMPTZ             NOT NULL DEFAULT now(),
        "updated_at"         TIMESTAMPTZ             NOT NULL DEFAULT now(),
        "deleted_at"         TIMESTAMPTZ,
        CONSTRAINT "PK_voice_profiles" PRIMARY KEY ("voice_profile_id")
      )
    `);

    // One stock default per gender among active profiles.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_voice_profiles_default_for_gender_active"
         ON "voice_profiles" ("default_for_gender")
         WHERE "status" = 'active' AND "default_for_gender" IS NOT NULL`,
    );

    // Display names are unique among active profiles, ignoring case. A retired
    // profile's name may be reused.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_voice_profiles_display_name_active"
         ON "voice_profiles" (lower("display_name"))
         WHERE "status" = 'active'`,
    );

    await queryRunner.query(`ALTER TABLE "simulations_v2" ADD "voice_profile_id" uuid`);
    await queryRunner.query(
      `CREATE INDEX "IDX_simulations_v2_voice_profile_id" ON "simulations_v2" ("voice_profile_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "simulations_v2"
         ADD CONSTRAINT "FK_simulations_v2_voice_profile"
         FOREIGN KEY ("voice_profile_id") REFERENCES "voice_profiles"("voice_profile_id")
         ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "simulations_v2" DROP CONSTRAINT IF EXISTS "FK_simulations_v2_voice_profile"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_simulations_v2_voice_profile_id"`);
    await queryRunner.query(
      `ALTER TABLE "simulations_v2" DROP COLUMN IF EXISTS "voice_profile_id"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_voice_profiles_display_name_active"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_voice_profiles_default_for_gender_active"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "voice_profiles"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "voice_profile_gender"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "voice_profile_status"`);
  }
}
