import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStudentSoftDeleteColumns1786433500012 implements MigrationInterface {
  name = 'AddStudentSoftDeleteColumns1786433500012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP NULL`,
    );
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_students_student_id_unique;
    `);

    await queryRunner.query(`
      DO $$
      DECLARE
        con_name TEXT;
      BEGIN
        SELECT conname INTO con_name
          FROM pg_constraint
         WHERE conrelid = 'students'::regclass
           AND contype = 'u'
           AND conname ILIKE '%student_id%'
         LIMIT 1;

        IF con_name IS NOT NULL THEN
          EXECUTE format('ALTER TABLE students DROP CONSTRAINT %I', con_name);
        END IF;
      END;
      $$;
    `);

    await queryRunner.query(`
      ALTER TABLE students ALTER COLUMN student_id DROP NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "students" DROP COLUMN IF EXISTS "deleted_at"`);
    await queryRunner.query(`ALTER TABLE "students" DROP COLUMN IF EXISTS "is_active"`);
  }
}
