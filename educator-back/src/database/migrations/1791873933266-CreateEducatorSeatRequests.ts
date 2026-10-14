import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEducatorSeatRequests1791873933266 implements MigrationInterface {
  name = 'CreateEducatorSeatRequests1791873933266';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "educator_seat_requests" ("seat_request_id" uuid NOT NULL DEFAULT uuid_generate_v4(), "educator_id" uuid NOT NULL, "district_admin_id" uuid NOT NULL, "requested_seats" integer, "note" text, "requested_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "CHK_educator_seat_requests_requested_seats_positive" CHECK ("requested_seats" > 0), CONSTRAINT "PK_68138c4c867874c553432156000" PRIMARY KEY ("seat_request_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_seat_requests_educator_requested_at" ON "educator_seat_requests" ("educator_id", "requested_at" DESC) WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "educator_seat_requests" ADD CONSTRAINT "FK_cb7f44dac2b83a1aef09f8e70eb" FOREIGN KEY ("educator_id") REFERENCES "educators"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "educator_seat_requests" ADD CONSTRAINT "FK_c1e6024c9eab00d52f0095dfac5" FOREIGN KEY ("district_admin_id") REFERENCES "district_admins"("district_admin_id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "educator_seat_requests" DROP CONSTRAINT "FK_c1e6024c9eab00d52f0095dfac5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "educator_seat_requests" DROP CONSTRAINT "FK_cb7f44dac2b83a1aef09f8e70eb"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_seat_requests_educator_requested_at"`);
    await queryRunner.query(`DROP TABLE "educator_seat_requests"`);
  }
}
