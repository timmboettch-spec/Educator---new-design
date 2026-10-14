import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotificationPreferencesTable1790000000003 implements MigrationInterface {
  name = 'CreateNotificationPreferencesTable1790000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ADD VALUE must run outside an explicit transaction in Postgres
    await queryRunner.query(
      `ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'SIMULATION_START_DATE_REMINDER'`,
    );
    await queryRunner.query(
      `ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'SIMULATION_END_DATE_REMINDER'`,
    );
    await queryRunner.query(
      `ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'CLASS_START_DATE_REMINDER'`,
    );
    await queryRunner.query(
      `ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'CLASS_END_DATE_REMINDER'`,
    );

    await queryRunner.query(`CREATE TYPE "notification_channel_enum" AS ENUM('IN_APP', 'EMAIL')`);
    await queryRunner.query(
      `CREATE TYPE "notification_frequency_enum" AS ENUM('IMMEDIATE', 'DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'NEVER')`,
    );

    await queryRunner.query(`
      CREATE TABLE "notification_preferences" (
        "id"                uuid        NOT NULL DEFAULT uuid_generate_v4(),
        "user_id"           varchar     NOT NULL,
        "notification_type" "notification_type_enum" NOT NULL,
        "channel"           "notification_channel_enum" NOT NULL,
        "enabled"           boolean     NOT NULL DEFAULT true,
        "frequency"         "notification_frequency_enum",
        "created_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_notif_prefs_user_id" ON "notification_preferences" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_notif_prefs_unique" ON "notification_preferences" ("user_id", "notification_type", "channel")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_preferences"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "notification_frequency_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "notification_channel_enum"`);
    // Enum values cannot be removed from notification_type_enum in Postgres
  }
}
