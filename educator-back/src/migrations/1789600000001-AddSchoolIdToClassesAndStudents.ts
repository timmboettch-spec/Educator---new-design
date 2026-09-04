import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSchoolIdToClassesAndStudents1789600000001 implements MigrationInterface {
  name = 'AddSchoolIdToClassesAndStudents1789600000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add school_id to classes
    await queryRunner.query(`
      ALTER TABLE "classes"
      ADD COLUMN IF NOT EXISTS "school_id" uuid NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "classes"
      ADD CONSTRAINT "FK_classes_school"
        FOREIGN KEY ("school_id") REFERENCES "schools"("id")
        ON DELETE CASCADE
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_classes_school_id"
        ON "classes"("school_id")
    `);

    // 2. Add school_id to students
    await queryRunner.query(`
      ALTER TABLE "students"
      ADD COLUMN IF NOT EXISTS "school_id" uuid NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "students"
      ADD CONSTRAINT "FK_students_school"
        FOREIGN KEY ("school_id") REFERENCES "schools"("id")
        ON DELETE CASCADE
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_students_school_id"
        ON "students"("school_id")
    `);

    // 3. Back-fill: populate school_id on classes from the educator's legacy
    //    school_id FK where the class has no school yet.  This is a best-effort
    //    migration for single-school educators; multi-school educators will still
    //    have NULL school_id on their classes until re-assigned via the UI.
    await queryRunner.query(`
      UPDATE "classes" c
      SET    "school_id" = e.school_id
      FROM   "educators" e
      WHERE  c.educator_id = e.id
        AND  c.school_id   IS NULL
        AND  e.school_id   IS NOT NULL
    `);

    // 4. Back-fill students from their class's school_id
    await queryRunner.query(`
      UPDATE "students" s
      SET    "school_id" = c.school_id
      FROM   "classes" c
      WHERE  s.class_id  = c.id
        AND  s.school_id IS NULL
        AND  c.school_id IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "classes" DROP CONSTRAINT IF EXISTS "FK_classes_school"`);
    await queryRunner.query(`ALTER TABLE "classes" DROP COLUMN IF EXISTS "school_id"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "idx_students_school_id"`);
    await queryRunner.query(
      `ALTER TABLE "students" DROP CONSTRAINT IF EXISTS "FK_students_school"`,
    );
    await queryRunner.query(`ALTER TABLE "students" DROP COLUMN IF EXISTS "school_id"`);
  }
}
