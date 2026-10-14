import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateSchoolsTable1711431200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "school_status_enum" AS ENUM('ACTIVE', 'INACTIVE', 'PENDING', 'DRAFT', 'ARCHIVED')`,
    );
    await queryRunner.createTable(
      new Table({
        name: 'schools',
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
            name: 'school_name',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'status',
            type: 'school_status_enum',
            default: "'ACTIVE'",
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
            name: 'user_id',
            type: 'uuid',
            isNullable: true,
          },
        ],
        foreignKeys: [
          {
            columnNames: ['user_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          },
        ],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('schools');
    await queryRunner.query('DROP TYPE "school_status_enum"');
  }
}
