import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlterSchoolFkToCascade1789600000002 implements MigrationInterface {
  name = 'AlterSchoolFkToCascade1789600000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── classes ──────────────────────────────────────────────────────────────
    await queryRunner.query(`ALTER TABLE "classes" DROP CONSTRAINT IF EXISTS "FK_classes_school"`);
    await queryRunner.query(`
      ALTER TABLE "classes"
      ADD CONSTRAINT "FK_classes_school"
        FOREIGN KEY ("school_id") REFERENCES "schools"("id")
        ON DELETE CASCADE
    `);

    // ── students ─────────────────────────────────────────────────────────────
    await queryRunner.query(
      `ALTER TABLE "students" DROP CONSTRAINT IF EXISTS "FK_students_school"`,
    );
    await queryRunner.query(`
      ALTER TABLE "students"
      ADD CONSTRAINT "FK_students_school"
        FOREIGN KEY ("school_id") REFERENCES "schools"("id")
        ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "students" DROP CONSTRAINT IF EXISTS "FK_students_school"`,
    );
    await queryRunner.query(`
      ALTER TABLE "students"
      ADD CONSTRAINT "FK_students_school"
        FOREIGN KEY ("school_id") REFERENCES "schools"("id")
        ON DELETE SET NULL
    `);

    await queryRunner.query(`ALTER TABLE "classes" DROP CONSTRAINT IF EXISTS "FK_classes_school"`);
    await queryRunner.query(`
      ALTER TABLE "classes"
      ADD CONSTRAINT "FK_classes_school"
        FOREIGN KEY ("school_id") REFERENCES "schools"("id")
        ON DELETE SET NULL
    `);
  }
}
