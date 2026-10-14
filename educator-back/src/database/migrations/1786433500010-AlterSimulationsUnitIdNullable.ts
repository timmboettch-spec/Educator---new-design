import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlterSimulationsUnitIdNullable1786433500010 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = (queryRunner.connection.options as { schema?: string }).schema || 'public';

    await queryRunner.query(`
      ALTER TABLE "${schema}"."simulations" 
      ALTER COLUMN "unit_id" DROP NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = (queryRunner.connection.options as { schema?: string }).schema || 'public';

    await queryRunner.query(`
      ALTER TABLE "${schema}"."simulations" 
      ALTER COLUMN "unit_id" SET NOT NULL;
    `);
  }
}
