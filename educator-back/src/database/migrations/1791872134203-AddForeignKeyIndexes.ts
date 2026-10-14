import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddForeignKeyIndexes1791872134203 implements MigrationInterface {
  name = 'AddForeignKeyIndexes1791872134203';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_schools_user_id" ON "schools" ("user_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_educators_district_admin_id" ON "educators" ("district_admin_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_educators_school_id" ON "educators" ("school_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_simulations_v2_avatar_id" ON "simulations_v2" ("avatar_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_student_simulation_progress_class_simulation_id" ON "student_simulation_progress" ("class_simulation_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_student_simulation_progress_simulation_id" ON "student_simulation_progress" ("simulation_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_invites_created_by" ON "invites" ("createdBy") `,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_invites_school_id" ON "invites" ("school_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_google_student_mappings_student_id" ON "google_student_mappings" ("student_id") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."idx_google_student_mappings_student_id"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_invites_school_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_invites_created_by"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."idx_student_simulation_progress_simulation_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."idx_student_simulation_progress_class_simulation_id"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_simulations_v2_avatar_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_educators_school_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_educators_district_admin_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_schools_user_id"`);
  }
}
