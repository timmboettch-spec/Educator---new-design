import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStatusToSimulationCatalog1786433500006 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('simulation_catalog');
    const hasColumn = table?.columns.some((c) => c.name === 'status');
    if (!hasColumn) {
      await queryRunner.query(
        `ALTER TABLE "simulation_catalog" ADD COLUMN "status" varchar DEFAULT 'ACTIVE'`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "simulation_catalog" DROP COLUMN IF EXISTS "status"`);
  }
}
