import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateClassesTable1711431400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "class_status_enum" AS ENUM('ACTIVE', 'INACTIVE', 'DRAFT', 'ARCHIEVED')`,
    );

    await queryRunner.createTable(
      new Table({
        name: 'classes',
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
            name: 'class_name',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'term',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'year',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'status',
            type: 'class_status_enum',
            default: "'ACTIVE'",
            isNullable: false,
          },
          {
            name: 'total_no_of_students',
            type: 'int',
            isNullable: false,
            default: 0,
          },
          {
            name: 'educator_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamp with time zone',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp with time zone',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'start_date',
            type: 'date',
            isNullable: false,
            default: `'2026-01-01'`,
          },
          {
            name: 'end_date',
            type: 'date',
            isNullable: false,
            default: `'2026-12-31'`,
          },
        ],
        foreignKeys: [
          {
            columnNames: ['educator_id'],
            referencedTableName: 'educators',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('classes');
    await queryRunner.query('DROP TYPE "class_status_enum"');
  }
}
