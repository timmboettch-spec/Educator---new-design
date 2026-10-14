import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddReportBlobIdToLmsGradeSyncLog1791357409888 implements MigrationInterface {
  name = 'AddReportBlobIdToLmsGradeSyncLog1791357409888';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'lms_grade_sync_log',
      new TableColumn({
        name: 'report_blob_id',
        type: 'varchar',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('lms_grade_sync_log', 'report_blob_id');
  }
}
