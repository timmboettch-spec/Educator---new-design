import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds catalog-only demographic/performance tags to `voice_profiles`: gender,
 * age, ethnicity, emotion. None of these participate in
 * `resolveForScenario`'s auto-selection (still `default_for_gender` only) —
 * they're metadata for the admin catalog UI to display and filter by.
 *
 * `gender` here is deliberately a separate free-text column from the existing
 * `default_for_gender` enum: the enum answers "which profile to fall back to
 * for a patient of this gender", this answers "what does this voice sound
 * like" — the service validates the two can't contradict each other.
 *
 * DELIBERATE DEVIATION from database-migrations-rules.md ("timestamps must be
 * real"), same reason as 2026093010500-CreateVoiceProfiles and
 * 2026092809000-CreateAvatarsTable before it: a real Date.now() timestamp
 * sorts before this migration's own predecessor otherwise. 2026093011000 is
 * date-shaped, unique, and sorts immediately after
 * 2026093010500-CreateVoiceProfiles.
 */
export class AddVoiceProfileDemographics2026093011000 implements MigrationInterface {
  name = 'AddVoiceProfileDemographics2026093011000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "voice_profiles"
        ADD "gender"    varchar(50),
        ADD "age"       integer,
        ADD "ethnicity" varchar(50),
        ADD "emotion"   varchar(50)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "voice_profiles"
        DROP COLUMN IF EXISTS "emotion",
        DROP COLUMN IF EXISTS "ethnicity",
        DROP COLUMN IF EXISTS "age",
        DROP COLUMN IF EXISTS "gender"
    `);
  }
}
