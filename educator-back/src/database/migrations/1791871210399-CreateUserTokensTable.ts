import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A single, purpose-tagged place to hold an OTP or a verification token — see
 * src/database/entities/user-token.entity.ts.
 */
export class CreateUserTokensTable1791871210399 implements MigrationInterface {
  name = 'CreateUserTokensTable1791871210399';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "user_token_purpose_enum" AS ENUM (
          'forgot_password',
          'educator_invite'
        );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_tokens" (
        "user_token_id" uuid                        NOT NULL DEFAULT uuid_generate_v4(),
        "purpose"       "user_token_purpose_enum"   NOT NULL,
        "user_id"       uuid                        NOT NULL,
        "token"         text                        NOT NULL,
        "expires_at"    TIMESTAMPTZ                 NOT NULL,
        "created_at"    TIMESTAMPTZ                 NOT NULL DEFAULT now(),
        "updated_at"    TIMESTAMPTZ                 NOT NULL DEFAULT now(),
        "deleted_at"    TIMESTAMPTZ,
        CONSTRAINT "PK_user_tokens" PRIMARY KEY ("user_token_id"),
        CONSTRAINT "FK_user_tokens_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_user_tokens_user_id" ON "user_tokens" ("user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "user_tokens"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "user_token_purpose_enum"`);
  }
}
