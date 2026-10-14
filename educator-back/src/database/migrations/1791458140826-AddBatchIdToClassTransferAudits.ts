import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `class_transfer_audits.batch_id`, grouping every audit row written by one bulk Class
 * Transfer call (RE-108). Nullable and additive: existing rows and single (legacy) transfers keep
 * `NULL`.
 */
export class AddBatchIdToClassTransferAudits1791458140826 implements MigrationInterface {
  name = 'AddBatchIdToClassTransferAudits1791458140826';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "class_transfer_audits" ADD "batch_id" uuid`);
    await queryRunner.query(
      `CREATE INDEX "IDX_cta_batch_id" ON "class_transfer_audits" ("batch_id") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_cta_batch_id"`);
    await queryRunner.query(`ALTER TABLE "class_transfer_audits" DROP COLUMN "batch_id"`);
  }
}
