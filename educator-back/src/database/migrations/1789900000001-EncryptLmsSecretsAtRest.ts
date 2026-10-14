import { decryptSecret, encryptSecret } from 'src/lms/utils/lms-secret-crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';

export class EncryptLmsSecretsAtRest1789900000001 implements MigrationInterface {
  name = 'EncryptLmsSecretsAtRest1789900000001';

  private static readonly TARGETS: ReadonlyArray<{ table: string; column: string }> = [
    { table: 'lms_school_config', column: 'lms_api_token' },
    { table: 'lms_school_config', column: 'platform_private_key_pem' },
    { table: 'lms_class_mapping', column: 'lms_api_token' },
  ];

  private async transform(
    queryRunner: QueryRunner,
    apply: (value: string) => string,
  ): Promise<void> {
    for (const { table, column } of EncryptLmsSecretsAtRest1789900000001.TARGETS) {
      const rows = (await queryRunner.query(
        `SELECT "id", "${column}" AS "value" FROM "${table}"
         WHERE "${column}" IS NOT NULL AND "${column}" <> ''`,
      )) as Array<{ id: string; value: string }>;

      for (const row of rows) {
        const next = apply(row.value);
        if (next === row.value) {
          continue;
        }
        await queryRunner.query(`UPDATE "${table}" SET "${column}" = $1 WHERE "id" = $2`, [
          next,
          row.id,
        ]);
      }
    }
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.transform(queryRunner, encryptSecret);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.transform(queryRunner, decryptSecret);
  }
}
