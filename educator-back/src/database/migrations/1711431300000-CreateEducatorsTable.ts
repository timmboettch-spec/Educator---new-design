import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateEducatorsTable1711431300000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'educators',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          { name: 'email', type: 'varchar', isUnique: true, isNullable: false },
          { name: 'password', type: 'varchar', isNullable: true },
          { name: 'full_name', type: 'varchar', isNullable: true },
          { name: 'phone_number', type: 'varchar', isNullable: true },
          { name: 'status', type: 'user_status_enum', default: "'ACTIVE'", isNullable: false },
          { name: 'school_id', type: 'uuid', isNullable: true },
          { name: 'admin_id', type: 'uuid', isNullable: true },
          { name: 'role_id', type: 'uuid', isNullable: true },
          { name: 'tokens', type: 'json', isNullable: true },
          { name: 'profile_picture', type: 'varchar', isNullable: true },
          { name: 'created_at', type: 'timestamptz', default: 'CURRENT_TIMESTAMP' },
          { name: 'updated_at', type: 'timestamptz', default: 'CURRENT_TIMESTAMP' },
        ],
        foreignKeys: [
          {
            columnNames: ['school_id'],
            referencedTableName: 'schools',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          },
          {
            columnNames: ['admin_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          },
          {
            columnNames: ['role_id'],
            referencedTableName: 'role',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('educators', true);
  }
}
