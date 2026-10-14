import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

/**
 * Google Classroom grade passback sync log.
 * Idempotent (hasTable / IF NOT EXISTS / ensureForeignKey) so re-runs are safe
 * if the table already exists from an earlier local attempt.
 */
export class CreateGoogleGradeSyncLog2026091712150 implements MigrationInterface {
  name = 'CreateGoogleGradeSyncLog2026091712150';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('google_grade_sync_log');
    if (!tableExists) {
      await queryRunner.createTable(
        new Table({
          name: 'google_grade_sync_log',
          columns: [
            {
              name: 'id',
              type: 'uuid',
              isPrimary: true,
              generationStrategy: 'uuid',
              default: 'uuid_generate_v4()',
            },
            {
              name: 'coursework_mapping_id',
              type: 'uuid',
              isNullable: false,
            },
            {
              name: 'student_id',
              type: 'uuid',
              isNullable: false,
            },
            {
              name: 'google_user_id',
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
            },
            {
              name: 'error_message',
              type: 'text',
              isNullable: true,
            },
            {
              name: 'attempted_at',
              type: 'timestamptz',
              default: 'now()',
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
    }

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_google_grade_sync_log_coursework_mapping_id"
      ON "google_grade_sync_log" ("coursework_mapping_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_google_grade_sync_log_student_id"
      ON "google_grade_sync_log" ("student_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_google_grade_sync_log_status_attempted_at"
      ON "google_grade_sync_log" ("status", "attempted_at")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_google_grade_sync_log_pending"
      ON "google_grade_sync_log" ("coursework_mapping_id", "student_id")
      WHERE "status" = 'pending'
    `);

    await this.ensureForeignKey(
      queryRunner,
      'FK_google_grade_sync_log_coursework_mapping',
      ['coursework_mapping_id'],
      'google_coursework_mappings',
      ['id'],
    );
    await this.ensureForeignKey(
      queryRunner,
      'FK_google_grade_sync_log_student',
      ['student_id'],
      'students',
      ['id'],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('google_grade_sync_log', true);
  }

  private async ensureForeignKey(
    queryRunner: QueryRunner,
    name: string,
    columnNames: string[],
    referencedTableName: string,
    referencedColumnNames: string[],
  ): Promise<void> {
    const table = await queryRunner.getTable('google_grade_sync_log');
    if (!table) return;
    if (table.foreignKeys.some((fk) => fk.name === name)) {
      return;
    }
    // Also skip if the same columns already reference the target (older unnamed FK).
    const alreadyLinked = table.foreignKeys.some(
      (fk) =>
        fk.columnNames.join(',') === columnNames.join(',') &&
        fk.referencedTableName === referencedTableName,
    );
    if (alreadyLinked) return;

    await queryRunner.createForeignKey(
      'google_grade_sync_log',
      new TableForeignKey({
        name,
        columnNames,
        referencedTableName,
        referencedColumnNames,
        onDelete: 'CASCADE',
      }),
    );
  }
}
