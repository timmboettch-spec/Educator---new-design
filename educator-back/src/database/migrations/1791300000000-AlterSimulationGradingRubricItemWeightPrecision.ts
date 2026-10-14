import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlterSimulationGradingRubricItemWeightPrecision1791300000000
  implements MigrationInterface
{
  name = 'AlterSimulationGradingRubricItemWeightPrecision1791300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "simulation_grading_rubric_items"
      ALTER COLUMN "weight" TYPE numeric
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "simulation_grading_rubric_items"
      ALTER COLUMN "weight" TYPE numeric(5,2)
    `);
  }
}
