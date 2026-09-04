import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateInvitesTable1711431250000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "invite_status_enum" AS ENUM('PENDING', 'ACCEPTED', 'EXPIRED')`,
    );
    await queryRunner.createTable(
      new Table({
        name: 'invites',
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
            name: 'email',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'school_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'createdBy',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'invite_status_enum',
            default: "'PENDING'",
          },
          {
            name: 'expires_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
        foreignKeys: [
          {
            columnNames: ['school_id'],
            referencedTableName: 'schools',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          },
          {
            columnNames: ['createdBy'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          },
        ],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('invites');
    await queryRunner.query('DROP TYPE "invite_status_enum"');
  }
}
