import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `educators.email` is empty for educators created via the v2-backed invite flow (their
 * identifier lives only on users.identifier), and `educators.district_admin_id` links to the
 * District Admin who owns this educator — see src/database/entities/educator.entity.ts.
 *
 * `educators.user_role_id` links an educator to the specific `user_roles` row for this
 * account's Educator role assignment (not directly to `users`), matching the same pattern as
 * `AddUserRoleIdToStudents` — see src/database/entities/educator.entity.ts.
 */
export class EducatorsEmailNullableAddDistrictAdminId1791871215399 implements MigrationInterface {
  name = 'EducatorsEmailNullableAddDistrictAdminId1791871215399';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "educators" DROP CONSTRAINT IF EXISTS "UQ_7fa629961c1543d4356941e1f8c"`,
    );
    await queryRunner.query(`ALTER TABLE "educators" ALTER COLUMN "email" DROP NOT NULL`);

    await queryRunner.query(
      `ALTER TABLE "educators" ADD COLUMN IF NOT EXISTS "district_admin_id" uuid`,
    );
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "educators"
        ADD CONSTRAINT "FK_educators_district_admin" FOREIGN KEY ("district_admin_id")
          REFERENCES "district_admins"("district_admin_id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`ALTER TABLE "educators" ADD COLUMN IF NOT EXISTS "user_role_id" uuid`);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "educators"
        ADD CONSTRAINT "FK_educators_user_role" FOREIGN KEY ("user_role_id")
          REFERENCES "user_roles"("user_role_id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    // user_role_id must be unique only among active (non-deleted) educators, so a
    // soft-deleted educator doesn't block re-linking the same user_roles row later.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_educators_user_role_id_active" ON "educators" ("user_role_id") WHERE "deleted_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_educators_user_role_id_active"`);
    await queryRunner.query(`
      ALTER TABLE "educators"
      DROP CONSTRAINT IF EXISTS "FK_educators_user_role",
      DROP COLUMN IF EXISTS "user_role_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "educators"
      DROP CONSTRAINT IF EXISTS "FK_educators_district_admin",
      DROP COLUMN IF EXISTS "district_admin_id"
    `);

    await queryRunner.query(`ALTER TABLE "educators" ALTER COLUMN "email" SET NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE "educators" ADD CONSTRAINT "UQ_7fa629961c1543d4356941e1f8c" UNIQUE ("email")`,
    );
  }
}
