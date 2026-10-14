import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateUsersTable1711431100000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "user_status_enum" AS ENUM('ACTIVE', 'INACTIVE', 'PENDING', 'DRAFT', 'ARCHIVED')`,
    );
    await queryRunner.createTable(
      new Table({
        name: 'users',
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
          { name: 'status', type: 'user_status_enum', default: "'ACTIVE'", isNullable: false },
          { name: 'full_name', type: 'varchar', isNullable: true },
          { name: 'is_license_active', type: 'boolean', default: false, isNullable: true },
          {
            name: 'subscriptions',
            type: 'json',
            isNullable: true,
            default: "'[]'",
          },
          { name: 'role_id', type: 'uuid', isNullable: true },
          { name: 'profile_picture', type: 'varchar', isNullable: true },
          { name: 'created_at', type: 'timestamptz', default: 'CURRENT_TIMESTAMP' },
          { name: 'updated_at', type: 'timestamptz', default: 'CURRENT_TIMESTAMP' },
        ],
        foreignKeys: [
          {
            columnNames: ['role_id'],
            referencedTableName: 'role',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('users');
    await queryRunner.query('DROP TYPE "user_status_enum"');
  }
}
