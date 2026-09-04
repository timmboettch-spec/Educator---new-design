import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAndExpandNotifications1786433500015 implements MigrationInterface {
  name = 'CreateAndExpandNotifications1786433500015';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        CREATE TYPE "notification_type_enum" AS ENUM (
          'EDUCATOR_REGISTERED',
          'TOKENS_ALLOCATED',
          'CLASS_CREATED',
          'SIMULATION_ASSIGNED',
          'STUDENT_REPORT_AVAILABLE',
          'SIMULATION_DUE_DATE_REMINDER',
          'EDUCATOR_LOW_SEAT_WARNING',
          'SCHOOL_LOW_SEAT_WARNING',
          'GENERAL'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        CREATE TYPE "notification_recipient_type_enum" AS ENUM (
          'admin',
          'educator'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notifications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "type" "notification_type_enum" NOT NULL DEFAULT 'GENERAL',
        "title" character varying NOT NULL,
        "message" text NOT NULL,
        "recipient_id" character varying NOT NULL,
        "recipient_type" "notification_recipient_type_enum" NOT NULL,
        "is_read" boolean NOT NULL DEFAULT false,
        "metadata" jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notifications_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_notifications_recipient_id" ON "notifications" ("recipient_id")`,
    );

    await queryRunner.query(
      `ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'EDUCATOR_REGISTERED'`,
    );
    await queryRunner.query(
      `ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'TOKENS_ALLOCATED'`,
    );
    await queryRunner.query(
      `ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'CLASS_CREATED'`,
    );
    await queryRunner.query(
      `ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'SIMULATION_ASSIGNED'`,
    );
    await queryRunner.query(
      `ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'STUDENT_REPORT_AVAILABLE'`,
    );
    await queryRunner.query(
      `ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'SIMULATION_DUE_DATE_REMINDER'`,
    );
    await queryRunner.query(
      `ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'EDUCATOR_LOW_SEAT_WARNING'`,
    );
    await queryRunner.query(
      `ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'SCHOOL_LOW_SEAT_WARNING'`,
    );
    await queryRunner.query(
      `ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'GENERAL'`,
    );
  }

  public async down(): Promise<void> {
    // Intentionally left empty. This migration is additive and safe for live data.
  }
}
