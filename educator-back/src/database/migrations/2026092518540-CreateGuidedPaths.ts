import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `guided_paths` table (RE-54 / RE-126 "Guided Path" feature).
 *
 * One row per `(user_id, role_type)` pair, enforced via a unique index —
 * deliberately decoupled from `user_roles` (no FK): `userId`/`roleType` are
 * read straight off `ICurrentUser` on every request, so no join/lookup
 * against `user_roles` is needed to resolve this row. `state` is an opaque,
 * frontend-owned jsonb blob — the backend never reads/validates its contents
 * (see `GuidedPath` entity's inline comments). `completed` is a real,
 * independently queryable column.
 *
 * Hand-written (not `migration:generate` output as-is) because this dev
 * database is otherwise out of sync with unrelated entity drift; only the
 * `guided_paths` table/index are included here.
 */
export class CreateGuidedPaths2026092518540 implements MigrationInterface {
  name = 'CreateGuidedPaths2026092518540';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "guided_paths" (
        "guided_path_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "role_type" character varying(50) NOT NULL,
        "state" jsonb NOT NULL DEFAULT '{}',
        "completed" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_guided_paths_guided_path_id" PRIMARY KEY ("guided_path_id")
      )
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "guided_paths"."state" IS 'Opaque, frontend-owned guided-path progress. The backend stores and returns this verbatim and never reads/validates/interprets its contents.'
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_guided_paths_user_id_role_type" ON "guided_paths" ("user_id", "role_type")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."UQ_guided_paths_user_id_role_type"`);
    await queryRunner.query(`DROP TABLE "guided_paths"`);
  }
}
