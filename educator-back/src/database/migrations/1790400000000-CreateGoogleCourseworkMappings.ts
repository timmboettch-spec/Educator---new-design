import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateGoogleCourseworkMappings1790400000000 implements MigrationInterface {
  name = 'CreateGoogleCourseworkMappings1790400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'google_coursework_mappings',
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
            name: 'class_simulation_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'simulation_id',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'google_course_id',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'google_coursework_id',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'title',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'alternate_link',
            type: 'varchar',
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
      'google_coursework_mappings',
      new TableIndex({
        name: 'idx_google_coursework_mappings_class_sim',
        columnNames: ['class_id', 'simulation_id'],
        isUnique: true,
      }),
    );

    await queryRunner.createIndex(
      'google_coursework_mappings',
      new TableIndex({
        name: 'idx_google_coursework_mappings_class_simulation_id',
        columnNames: ['class_simulation_id'],
      }),
    );

    await queryRunner.createIndex(
      'google_coursework_mappings',
      new TableIndex({
        name: 'idx_google_coursework_mappings_school_id',
        columnNames: ['school_id'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('google_coursework_mappings', true);
  }
}
