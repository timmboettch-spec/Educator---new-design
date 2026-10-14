import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/** Google OAuth tokens per school. Depends on schools table. Legacy hand-picked timestamp — see DATABASE-GUIDE.md. */
export class CreateGoogleSchoolConnections1790200000000 implements MigrationInterface {
  name = 'CreateGoogleSchoolConnections1790200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Postgres requires ADD VALUE to run outside the migration's own transaction block.
    await queryRunner.query(
      `ALTER TYPE "lms_type_enum" ADD VALUE IF NOT EXISTS 'google_classroom'`,
    );

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'google_connection_status_enum') THEN
          CREATE TYPE google_connection_status_enum AS ENUM ('active', 'revoked', 'error');
        END IF;
      END
      $$;
    `);

    await queryRunner.createTable(
      new Table({
        name: 'google_school_connections',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'school_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'connected_by_educator_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'google_account_email',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'google_account_id',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'access_token',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'refresh_token',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'token_expires_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'scopes',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'status',
            type: 'google_connection_status_enum',
            isNullable: false,
            default: `'active'`,
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
      }),
      true,
    );

    await queryRunner.createIndex(
      'google_school_connections',
      new TableIndex({
        name: 'idx_google_school_connections_school_id',
        columnNames: ['school_id'],
        isUnique: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('google_school_connections', true);
    await queryRunner.query(`DROP TYPE IF EXISTS google_connection_status_enum`);
    // Postgres cannot easily remove an enum value from lms_type_enum; leave it in place.
  }
}
