import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 1:1 extension of a specific `user_roles` row (the account's District Admin
 * role assignment) — see src/database/entities/district-admin.entity.ts.
 */
export class CreateDistrictAdminsTable1791871211399 implements MigrationInterface {
  name = 'CreateDistrictAdminsTable1791871211399';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "district_admins" (
        "district_admin_id"  uuid          NOT NULL DEFAULT uuid_generate_v4(),
        "user_role_id"       uuid          NOT NULL,
        "full_name"          varchar,
        "is_license_active"  boolean       DEFAULT false,
        "subscriptions"      jsonb,
        "profile_picture"    varchar,
        "created_at"         TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "updated_at"         TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "deleted_at"         TIMESTAMPTZ,
        CONSTRAINT "PK_district_admins" PRIMARY KEY ("district_admin_id"),
        CONSTRAINT "FK_district_admins_user_role" FOREIGN KEY ("user_role_id")
          REFERENCES "user_roles"("user_role_id") ON DELETE CASCADE
      )
    `);

    // user_role_id must be unique only among active (non-deleted) rows, matching the
    // 1:1-extension-of-a-user_roles-row semantics without permanently locking out a
    // soft-deleted district admin's user_role_id from being reused.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_district_admins_user_role_id_active" ON "district_admins" ("user_role_id") WHERE "deleted_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "district_admins"`);
  }
}
