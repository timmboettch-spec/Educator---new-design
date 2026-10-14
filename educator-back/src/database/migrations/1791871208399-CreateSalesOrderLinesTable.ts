import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migrates the redeem-code sales-order-line catalog off the Azure Blob
 * `sales-order-lines.json` and into Postgres (see
 * src/database/seeders/sales-order-lines.seeder.ts for the one-time import
 * and src/sales-order-lines/sales-order-lines.service.ts for the read path).
 */
export class CreateSalesOrderLinesTable1791871208399 implements MigrationInterface {
  name = 'CreateSalesOrderLinesTable1791871208399';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sales_order_lines" (
        "sales_order_line_id"  uuid                 NOT NULL DEFAULT uuid_generate_v4(),
        "so"                   varchar(255)         NOT NULL,
        "line"                 integer              NOT NULL,
        "customer"             varchar(255)         NOT NULL,
        "redeem_code"          varchar(255)         NOT NULL,
        "sku"                  varchar(255)         NOT NULL,
        "qty"                  integer              NOT NULL,
        "product_name"         varchar(255),
        "type"                 varchar(255),
        "sim_group"            varchar(255),
        "category"             varchar(255),
        "platform"             varchar(255),
        "ai"                   varchar(255),
        "hw"                   varchar(255),
        "start"                date,
        "end"                  date,
        "created_at"           TIMESTAMPTZ          NOT NULL DEFAULT now(),
        "updated_at"           TIMESTAMPTZ          NOT NULL DEFAULT now(),
        "deleted_at"           TIMESTAMPTZ,
        CONSTRAINT "sales_order_lines_pkey" PRIMARY KEY ("sales_order_line_id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_sales_order_lines_deleted_at" ON "sales_order_lines" ("deleted_at") WHERE "deleted_at" IS NOT NULL`,
    );

    // Enforce uniqueness of (so, line) only among active (non-deleted) records —
    // the natural key of a single sales order line, used for idempotent upsert
    // by the seeder.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_sales_order_lines_so_line_active" ON "sales_order_lines" ("so", "line") WHERE "deleted_at" IS NULL`,
    );

    // Plain (non-unique) index for the redeem-code lookup path.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_sales_order_lines_redeem_code" ON "sales_order_lines" ("redeem_code")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "sales_order_lines"`);
  }
}
