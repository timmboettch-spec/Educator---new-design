import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropProductsTable1789900000003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "products" CASCADE`);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Migration is irreversible, the legacy products table schema is no longer available
  }
}
