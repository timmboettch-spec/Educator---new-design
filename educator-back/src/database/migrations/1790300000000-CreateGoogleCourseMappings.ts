import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateGoogleCourseMappings1790300000000 implements MigrationInterface {
  name = 'CreateGoogleCourseMappings1790300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'google_course_mappings',
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
            name: 'google_course_name',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'linked_by_educator_id',
            type: 'uuid',
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
      }),
      true,
    );

    await queryRunner.createIndex(
      'google_course_mappings',
      new TableIndex({
        name: 'idx_google_course_mappings_class_id',
        columnNames: ['class_id'],
        isUnique: true,
      }),
    );

    await queryRunner.createIndex(
      'google_course_mappings',
      new TableIndex({
        name: 'idx_google_course_mappings_school_course',
        columnNames: ['school_id', 'google_course_id'],
        isUnique: true,
      }),
    );

    await queryRunner.createIndex(
      'google_course_mappings',
      new TableIndex({
        name: 'idx_google_course_mappings_school_id',
        columnNames: ['school_id'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('google_course_mappings', true);
  }
}
