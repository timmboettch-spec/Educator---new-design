import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateStudentsTable1711431500000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'students',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'student_id',
            type: 'varchar',
          },
          {
            name: 'student_name',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'email',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'varchar',
            default: `'ACTIVE'`,
          },
          {
            name: 'class_id',
            type: 'uuid',
          },
          {
            name: 'educator_id',
            type: 'uuid',
          },
          {
            name: 'score',
            type: 'decimal',
            precision: 5,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'attempt',
            type: 'int',
            default: 0,
          },
          {
            name: 'sims_completed',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'submission_date',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'time_spent',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'time_remaining',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
        foreignKeys: [
          {
            columnNames: ['class_id'],
            referencedTableName: 'classes',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
          {
            columnNames: ['educator_id'],
            referencedTableName: 'educators',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
        indices: [
          new TableIndex({ name: 'idx_students_class_id', columnNames: ['class_id'] }),
          new TableIndex({ name: 'idx_students_educator_id', columnNames: ['educator_id'] }),
          new TableIndex({ name: 'idx_students_student_id', columnNames: ['student_id'] }),
          new TableIndex({ name: 'idx_students_email', columnNames: ['email'] }),
        ],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('students');
  }
}
