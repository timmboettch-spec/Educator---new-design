import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTranscriptsTable1791871207399 implements MigrationInterface {
  name = 'CreateTranscriptsTable1791871207399';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "transcript_scenario_type_enum" AS ENUM('Practice', 'Assessment');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "transcripts" (
        "transcript_id"        uuid                 NOT NULL DEFAULT uuid_generate_v4(),
        "id"                   varchar(255)         NOT NULL,
        "user_id"               varchar(255)         NOT NULL,
        "scenario_id"           varchar(255),
        "student_name"          varchar(255),
        "student_key"           varchar(255),
        "student_class"         varchar(255),
        "login_session_id"      varchar(255),
        "scenario_type"         "transcript_scenario_type_enum",
        "session_id"            varchar(255),
        "scenario_instance_id"  varchar(255),
        "messages"              jsonb,
        "started_at"            TIMESTAMPTZ          NOT NULL,
        "ended_at"              TIMESTAMPTZ,
        "created_at"            TIMESTAMPTZ          NOT NULL DEFAULT now(),
        "updated_at"            TIMESTAMPTZ          NOT NULL DEFAULT now(),
        "deleted_at"            TIMESTAMPTZ,
        CONSTRAINT "transcripts_pkey" PRIMARY KEY ("transcript_id")
      )
    `);

    // No FOREIGN KEY on scenario_id -> simulations_v2.id: simulations_v2.id is
    // only backed by a partial unique index (WHERE deleted_at IS NULL), which
    // Postgres cannot target with a FOREIGN KEY constraint. The relation is
    // query-time-only (see Transcript.simulation in transcript.entity.ts).

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_transcripts_id_active" ON "transcripts" ("id") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_transcripts_user_id" ON "transcripts" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_transcripts_scenario_id" ON "transcripts" ("scenario_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_transcripts_started_at" ON "transcripts" ("started_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_transcripts_deleted_at" ON "transcripts" ("deleted_at") WHERE "deleted_at" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "transcripts"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "transcript_scenario_type_enum"`);
  }
}
