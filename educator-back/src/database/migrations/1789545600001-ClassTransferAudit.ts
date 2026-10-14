import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClassTransferAudit1789545600001 implements MigrationInterface {
  name = 'ClassTransferAudit1789545600001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "public"."notification_type_enum"
      ADD VALUE IF NOT EXISTS 'CLASS_TRANSFERRED'
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."class_transfer_audits_status_enum"
          AS ENUM('SUCCESS', 'FAILED');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "class_transfer_audits" (
        "id"                    UUID          NOT NULL DEFAULT gen_random_uuid(),
        "class_id"              VARCHAR       NOT NULL,
        "class_name"            VARCHAR       NOT NULL,
        "source_educator_id"    VARCHAR       NOT NULL,
        "source_educator_name"  VARCHAR,
        "target_educator_id"    VARCHAR       NOT NULL,
        "target_educator_name"  VARCHAR,
        "admin_id"              VARCHAR       NOT NULL,
        "admin_email"           VARCHAR,
        "status"                "public"."class_transfer_audits_status_enum"
                                              NOT NULL DEFAULT 'SUCCESS',
        "notes"                 TEXT,
        "transferred_at"        TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_class_transfer_audits" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cta_class_id"
        ON "class_transfer_audits" ("class_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cta_source_educator_id"
        ON "class_transfer_audits" ("source_educator_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cta_target_educator_id"
        ON "class_transfer_audits" ("target_educator_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cta_admin_id"
        ON "class_transfer_audits" ("admin_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "class_transfer_audits"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."class_transfer_audits_status_enum"`);
  }
}
