import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class CreateLmsGradePassbackTables1789900000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create lms_assignment_mapping table
    await queryRunner.createTable(
      new Table({
        name: 'lms_assignment_mapping',
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
            isNullable: true,
          },
          {
            name: 'lms_line_item_url',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'lms_line_item_label',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'lms_resource_link_id',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'lms_client_id',
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

    // Create indexes for assignment mapping
    await queryRunner.createIndex(
      'lms_assignment_mapping',
      new TableIndex({
        name: 'idx_lms_assignment_class',
        columnNames: ['class_id'],
      }),
    );

    await queryRunner.createIndex(
      'lms_assignment_mapping',
      new TableIndex({
        name: 'idx_lms_assignment_simulation',
        columnNames: ['simulation_id'],
      }),
    );

    await queryRunner.createIndex(
      'lms_assignment_mapping',
      new TableIndex({
        name: 'idx_lms_assignment_resource_link',
        columnNames: ['class_id', 'lms_resource_link_id'],
        isUnique: true,
      }),
    );

    // Create lms_grade_sync_log table
    await queryRunner.createTable(
      new Table({
        name: 'lms_grade_sync_log',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'mapping_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'student_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'lms_user_id',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'score_given',
            type: 'numeric',
            isNullable: false,
          },
          {
            name: 'score_maximum',
            type: 'numeric',
            isNullable: false,
          },
          {
            name: 'status',
            type: 'varchar',
            isNullable: false,
            default: "'pending'",
          },
          {
            name: 'error_message',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'attempted_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'completed_at',
            type: 'timestamptz',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // Create indexes for grade sync log
    await queryRunner.createIndex(
      'lms_grade_sync_log',
      new TableIndex({
        name: 'idx_lms_grade_sync_mapping',
        columnNames: ['mapping_id'],
      }),
    );

    await queryRunner.createIndex(
      'lms_grade_sync_log',
      new TableIndex({
        name: 'idx_lms_grade_sync_student',
        columnNames: ['student_id'],
      }),
    );

    await queryRunner.createIndex(
      'lms_grade_sync_log',
      new TableIndex({
        name: 'idx_lms_grade_sync_status',
        columnNames: ['status', 'attempted_at'],
      }),
    );

    // Create foreign key to lms_assignment_mapping
    await queryRunner.createForeignKey(
      'lms_grade_sync_log',
      new TableForeignKey({
        name: 'fk_lms_grade_sync_log_mapping',
        columnNames: ['mapping_id'],
        referencedTableName: 'lms_assignment_mapping',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('lms_grade_sync_log', true);
    await queryRunner.dropTable('lms_assignment_mapping', true);
  }
}
