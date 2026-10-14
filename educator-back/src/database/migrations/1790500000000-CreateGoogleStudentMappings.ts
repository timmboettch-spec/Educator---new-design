import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

/**
 * Google Classroom student ↔ roster mapping.
 * Timestamp is a sequential TypeORM slot (17905*), not a calendar/unix date.
 */
export class CreateGoogleStudentMappings1790500000000 implements MigrationInterface {
  name = 'CreateGoogleStudentMappings1790500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'google_student_mappings',
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
            name: 'class_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'google_course_id',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'google_user_id',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'google_email',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'google_name',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'student_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'student_code',
            type: 'varchar',
            isNullable: false,
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
      'google_student_mappings',
      new TableIndex({
        name: 'idx_google_student_mappings_class_google_user',
        columnNames: ['class_id', 'google_user_id'],
        isUnique: true,
      }),
    );

    await queryRunner.createIndex(
      'google_student_mappings',
      new TableIndex({
        name: 'idx_google_student_mappings_school_course',
        columnNames: ['school_id', 'google_course_id'],
      }),
    );

    await queryRunner.createForeignKey(
      'google_student_mappings',
      new TableForeignKey({
        name: 'FK_google_student_mappings_school',
        columnNames: ['school_id'],
        referencedTableName: 'schools',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
    await queryRunner.createForeignKey(
      'google_student_mappings',
      new TableForeignKey({
        name: 'FK_google_student_mappings_class',
        columnNames: ['class_id'],
        referencedTableName: 'classes',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
    await queryRunner.createForeignKey(
      'google_student_mappings',
      new TableForeignKey({
        name: 'FK_google_student_mappings_student',
        columnNames: ['student_id'],
        referencedTableName: 'students',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.query(`
      ALTER TABLE "google_course_mappings"
      ADD COLUMN IF NOT EXISTS "last_roster_synced_at" TIMESTAMPTZ NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "google_course_mappings"
      DROP COLUMN IF EXISTS "last_roster_synced_at"
    `);
    await queryRunner.dropTable('google_student_mappings', true);
  }
}
