import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Links a student to the specific `user_roles` row for this account's Student role
 * assignment (not directly to `users`) — see src/database/entities/students.entity.ts.
 */
export class AddUserRoleIdToStudents1791871213399 implements MigrationInterface {
  name = 'AddUserRoleIdToStudents1791871213399';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "user_role_id" uuid`);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "students"
        ADD CONSTRAINT "FK_students_user_role" FOREIGN KEY ("user_role_id")
          REFERENCES "user_roles"("user_role_id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    // user_role_id must be unique only among active (non-deleted) students, so a
    // soft-deleted student doesn't block re-linking the same user_roles row later.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_students_user_role_id_active" ON "students" ("user_role_id") WHERE "deleted_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_students_user_role_id_active"`);
    await queryRunner.query(`
      ALTER TABLE "students"
      DROP CONSTRAINT IF EXISTS "FK_students_user_role",
      DROP COLUMN IF EXISTS "user_role_id"
    `);
  }
}
