import { MigrationInterface, QueryRunner, Table, TableUnique } from 'typeorm';

export class CreateSimulationReportsTable1786433500006 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'simulation_reports',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          { name: 'student_id', type: 'uuid', isNullable: false },
          { name: 'student_name', type: 'varchar', isNullable: false },
          { name: 'scenario_id', type: 'varchar', isNullable: false },
          { name: 'report_data', type: 'jsonb', isNullable: false },
          { name: 'created_at', type: 'timestamp', default: 'now()' },
        ],
        uniques: [
          new TableUnique({
            name: 'UQ_SIMULATION_REPORTS_STUDENT_SCENARIO',
            columnNames: ['student_id', 'scenario_id'],
          }),
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('simulation_reports', true);
  }
}
