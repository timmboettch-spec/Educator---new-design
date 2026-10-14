import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The v2 business identifier (e.g. 'educator', 'district_admin') on `role` — see
 * src/database/entities/role.entity.ts. Nullable/unpopulated for pre-v2 legacy rows;
 * unique where populated (a plain unique index, since `role` has no soft-delete
 * concept and Postgres unique constraints already treat multiple NULLs as distinct).
 */
export class AddSlugToRole1791871212399 implements MigrationInterface {
  name = 'AddSlugToRole1791871212399';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "role" ADD COLUMN IF NOT EXISTS "slug" varchar(50)`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_role_slug" ON "role" ("slug")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_role_slug"`);
    await queryRunner.query(`ALTER TABLE "role" DROP COLUMN IF EXISTS "slug"`);
  }
}
