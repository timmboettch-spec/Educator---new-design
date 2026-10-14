import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveStudentNameAndEmailFromStudents1789700000004 implements MigrationInterface {
  name = 'RemoveStudentNameAndEmailFromStudents1789700000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "students"
      DROP COLUMN IF EXISTS "student_name"
    `);

    await queryRunner.query(`
      ALTER TABLE "students"
      DROP COLUMN IF EXISTS "email"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "students"
      ADD COLUMN "student_name" character varying
    `);

    await queryRunner.query(`
      ALTER TABLE "students"
      ADD COLUMN "email" character varying
    `);
  }
}
