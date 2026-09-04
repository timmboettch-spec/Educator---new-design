import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

async function createIndexIfMissing(
  queryRunner: QueryRunner,
  table: string,
  index: TableIndex,
): Promise<void> {
  const tbl = await queryRunner.getTable(table);
  if (tbl?.indices.some((i) => i.name === index.name)) return;
  await queryRunner.createIndex(table, index);
}

export class AddPerformanceIndexes1789700000005 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await createIndexIfMissing(
      queryRunner,
      'classes',
      new TableIndex({
        name: 'idx_classes_educator_active',
        columnNames: ['educator_id', 'is_active'],
      }),
    );

    await createIndexIfMissing(
      queryRunner,
      'students',
      new TableIndex({
        name: 'idx_students_class_id',
        columnNames: ['class_id'],
      }),
    );

    await createIndexIfMissing(
      queryRunner,
      'students',
      new TableIndex({
        name: 'idx_students_educator_id',
        columnNames: ['educator_id'],
      }),
    );

    await createIndexIfMissing(
      queryRunner,
      'class_simulations',
      new TableIndex({
        name: 'idx_class_simulations_class_active',
        columnNames: ['class_id', 'is_active'],
      }),
    );

    await createIndexIfMissing(
      queryRunner,
      'simulation_reports',
      new TableIndex({
        name: 'idx_simulation_reports_student_id',
        columnNames: ['student_id'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('classes', 'idx_classes_educator_active');
    await queryRunner.dropIndex('students', 'idx_students_class_id');
    await queryRunner.dropIndex('students', 'idx_students_educator_id');
    await queryRunner.dropIndex('class_simulations', 'idx_class_simulations_class_active');
    await queryRunner.dropIndex('simulation_reports', 'idx_simulation_reports_student_id');
  }
}
