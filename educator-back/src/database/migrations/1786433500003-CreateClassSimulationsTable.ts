import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class CreateClassSimulationsTable1786433500003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'class_simulations',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          { name: 'class_id', type: 'uuid', isNullable: false },
          { name: 'simulation_id', type: 'varchar', isNullable: false },
          { name: 'start_date', type: 'varchar', isNullable: true },
          { name: 'due_date', type: 'varchar', isNullable: true },
          { name: 'end_date', type: 'varchar', isNullable: true },
          { name: 'created_at', type: 'timestamp', default: 'now()' },
          { name: 'updated_at', type: 'timestamp', default: 'now()' },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'class_simulations',
      new TableForeignKey({
        name: 'FK_CLASS_SIMULATIONS_CLASS_ID',
        columnNames: ['class_id'],
        referencedTableName: 'classes',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('class_simulations');
    if (table) {
      for (const fk of table.foreignKeys) {
        await queryRunner.dropForeignKey('class_simulations', fk);
      }
    }
    await queryRunner.dropTable('class_simulations');
  }
}
