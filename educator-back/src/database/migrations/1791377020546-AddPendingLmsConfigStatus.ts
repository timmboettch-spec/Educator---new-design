import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `pending` to `lms_config_status_enum`: a first save is stored as pending so the LMS
 * can verify our key via /lti/jwks, while launches and issuer lookups still only use `active`.
 */
export class AddPendingLmsConfigStatus1791377020546 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."lms_config_status_enum" ADD VALUE IF NOT EXISTS 'pending'`,
    );
  }

  /** Postgres cannot drop an enum value, so the type is rebuilt; pending rows were never verified. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "lms_school_config" WHERE "status" = 'pending'`);
    await queryRunner.query(
      `ALTER TYPE "public"."lms_config_status_enum" RENAME TO "lms_config_status_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."lms_config_status_enum" AS ENUM ('active', 'inactive')`,
    );
    await queryRunner.query(`ALTER TABLE "lms_school_config" ALTER COLUMN "status" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "lms_school_config" ALTER COLUMN "status" TYPE "public"."lms_config_status_enum" USING "status"::"text"::"public"."lms_config_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "lms_school_config" ALTER COLUMN "status" SET DEFAULT 'active'`,
    );
    await queryRunner.query(`DROP TYPE "public"."lms_config_status_enum_old"`);
  }
}
