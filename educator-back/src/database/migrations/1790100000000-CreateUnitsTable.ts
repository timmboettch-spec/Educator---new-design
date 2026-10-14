import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUnitsTable1790100000000 implements MigrationInterface {
  name = 'CreateUnitsTable1790100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "unit_category_enum" AS ENUM('AI Only', 'Manikin', 'Trainer')`,
    );

    await queryRunner.query(`
      CREATE TABLE "units" (
        "unit_id"                  uuid                 NOT NULL DEFAULT uuid_generate_v4(),
        "id"                       varchar(255)         NOT NULL,
        "name"                     varchar(255)         NOT NULL,
        "description"              text,
        "image_url"                varchar(2048),
        "category"                 "unit_category_enum",
        "action_group_name"        varchar(255),
        "action_group_description" text,
        "actions"                  jsonb,
        "created_at"               TIMESTAMPTZ          NOT NULL DEFAULT now(),
        "updated_at"               TIMESTAMPTZ          NOT NULL DEFAULT now(),
        "deleted_at"               TIMESTAMPTZ,
        CONSTRAINT "units_pkey" PRIMARY KEY ("unit_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_units_deleted_at" ON "units" ("deleted_at") WHERE "deleted_at" IS NOT NULL`,
    );

    // Enforce uniqueness of "id" only among active (non-deleted) records
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_units_id_active" ON "units" ("id") WHERE "deleted_at" IS NULL`,
    );

    // Enforce uniqueness of "name" only among active (non-deleted) records
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_units_name_active" ON "units" ("name") WHERE "deleted_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "units"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "unit_category_enum"`);
  }
}
