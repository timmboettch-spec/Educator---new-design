import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLmsGradeSyncFailedNotificationType1791270387259 implements MigrationInterface {
  name = 'AddLmsGradeSyncFailedNotificationType1791270387259';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'LMS_GRADE_SYNC_FAILED'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "notifications" WHERE "type" = 'LMS_GRADE_SYNC_FAILED'`);
    await queryRunner.query(
      `DELETE FROM "notification_preferences" WHERE "notification_type" = 'LMS_GRADE_SYNC_FAILED'`,
    );
    const labels = (await queryRunner.query(
      `SELECT "enumlabel" FROM "pg_enum" WHERE "enumtypid" = '"notification_type_enum"'::regtype AND "enumlabel" <> 'LMS_GRADE_SYNC_FAILED' ORDER BY "enumsortorder"`,
    )) as { enumlabel: string }[];
    const values = labels.map(({ enumlabel }) => `'${enumlabel}'`).join(', ');
    await queryRunner.query(
      `ALTER TYPE "notification_type_enum" RENAME TO "notification_type_enum_old"`,
    );
    await queryRunner.query(`CREATE TYPE "notification_type_enum" AS ENUM(${values})`);
    await queryRunner.query(`ALTER TABLE "notifications" ALTER COLUMN "type" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "notifications" ALTER COLUMN "type" TYPE "notification_type_enum" USING "type"::text::"notification_type_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ALTER COLUMN "type" SET DEFAULT 'GENERAL'`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_preferences" ALTER COLUMN "notification_type" TYPE "notification_type_enum" USING "notification_type"::text::"notification_type_enum"`,
    );
    await queryRunner.query(`DROP TYPE "notification_type_enum_old"`);
  }
}
