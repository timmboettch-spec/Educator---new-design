import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateSimulationLibraryTable1786433500001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'simulation_library',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          { name: 'unit_id', type: 'varchar', isNullable: true },
          { name: 'name', type: 'varchar', isNullable: true },
          { name: 'description', type: 'text', isNullable: true },
          { name: 'imageURL', type: 'varchar', isNullable: true },
          { name: 'order', type: 'integer', isNullable: true },
          { name: 'status', type: 'varchar', isNullable: true },
          { name: 'category', type: 'varchar', isNullable: true },
          { name: 'actions', type: 'jsonb', isNullable: true },
          { name: 'actionGroupName', type: 'varchar', isNullable: true },
          { name: 'actionGroupDescription', type: 'text', isNullable: true },
          { name: 'created_at', type: 'timestamp', default: 'now()' },
          { name: 'updated_at', type: 'timestamp', default: 'now()' },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('simulation_library', true);
  }
}
