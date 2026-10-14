import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEducatorSimulationPreviews1791210941204 implements MigrationInterface {
  name = 'CreateEducatorSimulationPreviews1791210941204';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "educator_simulation_previews" ("educator_simulation_preview_id" uuid NOT NULL DEFAULT uuid_generate_v4(), "educator_id" uuid NOT NULL, "scenario_id" character varying(255) NOT NULL, "used_count" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "CHK_educator_simulation_previews_used_count_non_negative" CHECK ("used_count" >= 0), CONSTRAINT "PK_32b9dbb5871d8962842e6da976a" PRIMARY KEY ("educator_simulation_preview_id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_educator_simulation_previews_educator_scenario_active" ON "educator_simulation_previews" ("educator_id", "scenario_id") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "educator_simulation_previews" ADD CONSTRAINT "FK_fc36767db5daf6ee634e44ca447" FOREIGN KEY ("educator_id") REFERENCES "educators"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "educator_simulation_previews" DROP CONSTRAINT "FK_fc36767db5daf6ee634e44ca447"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_educator_simulation_previews_educator_scenario_active"`,
    );
    await queryRunner.query(`DROP TABLE "educator_simulation_previews"`);
  }
}
