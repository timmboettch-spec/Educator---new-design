import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIsActiveToClassesAndClassSimulations1789700000003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "class_simulations" ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "class_simulations" DROP COLUMN IF EXISTS "is_active"`);
    await queryRunner.query(`ALTER TABLE "classes" DROP COLUMN IF EXISTS "is_active"`);
  }
}
