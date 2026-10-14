import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Junction table for the many-to-many relationship between users (v2
 * accounts) and roles — see src/database/entities/user-role.entity.ts.
 */
export class CreateUserRolesTable1791871209399 implements MigrationInterface {
  name = 'CreateUserRolesTable1791871209399';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "user_role_status_enum" AS ENUM (
          'ACTIVE', 'INACTIVE', 'PENDING', 'DRAFT', 'ARCHIVED', 'ATTENTION', 'ARCHIEVED'
        );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_roles" (
        "user_role_id" uuid                     NOT NULL DEFAULT uuid_generate_v4(),
        "user_id"      uuid                     NOT NULL,
        "role_id"      uuid                     NOT NULL,
        "assigned_at"  TIMESTAMPTZ              NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "status"       "user_role_status_enum"  NOT NULL DEFAULT 'PENDING',
        "created_at"   TIMESTAMPTZ              NOT NULL DEFAULT now(),
        "updated_at"   TIMESTAMPTZ              NOT NULL DEFAULT now(),
        "deleted_at"   TIMESTAMPTZ,
        CONSTRAINT "PK_user_roles" PRIMARY KEY ("user_role_id"),
        CONSTRAINT "FK_user_roles_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_user_roles_role" FOREIGN KEY ("role_id")
          REFERENCES "role"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_user_roles_user_id" ON "user_roles" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_user_roles_role_id" ON "user_roles" ("role_id")`,
    );

    // (user_id, role_id) must be unique only among active (non-deleted) assignments,
    // so a soft-deleted assignment doesn't block re-assigning the same role later.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_user_roles_user_id_role_id_active" ON "user_roles" ("user_id", "role_id") WHERE "deleted_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "user_roles"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "user_role_status_enum"`);
  }
}
