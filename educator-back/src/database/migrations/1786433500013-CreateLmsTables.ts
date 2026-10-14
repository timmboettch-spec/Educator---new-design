import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLmsTables1786433500013 implements MigrationInterface {
  name = 'CreateLmsTables1786433500013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum types (safe - ignored if already exists)
    await queryRunner.query(`
      DO $$
      BEGIN
        CREATE TYPE "lms_type_enum" AS ENUM ('moodle', 'canvas', 'blackboard');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        CREATE TYPE "lms_config_status_enum" AS ENUM ('active', 'inactive');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END
      $$;
    `);

    // Create lms_school_config table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "lms_school_config" (
        "id"                       uuid        NOT NULL DEFAULT uuid_generate_v4(),
        "school_id"                uuid        NOT NULL,
        "lms_type"                 "lms_type_enum" NOT NULL DEFAULT 'moodle',
        "issuer"                   varchar     NOT NULL,
        "client_id"                varchar     NOT NULL,
        "deployment_id"            varchar,
        "auth_endpoint"            varchar     NOT NULL,
        "token_endpoint"           varchar     NOT NULL,
        "jwks_url"                 varchar     NOT NULL,
        "platform_private_key_pem" text        NOT NULL,
        "platform_key_id"          varchar     NOT NULL,
        "status"                   "lms_config_status_enum" NOT NULL DEFAULT 'active',
        "share_pii"                boolean     NOT NULL DEFAULT true,
        "created_at"               timestamptz NOT NULL DEFAULT now(),
        "updated_at"               timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_lms_school_config" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_lms_school_config_school_id"
        ON "lms_school_config" ("school_id")
    `);

    // Create lms_class_mapping table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "lms_class_mapping" (
        "id"             uuid        NOT NULL DEFAULT uuid_generate_v4(),
        "school_id"      uuid        NOT NULL,
        "class_id"       uuid        NOT NULL,
        "lms_course_id"  varchar     NOT NULL,
        "lms_context_id" varchar,
        "nrps_url"       varchar     NOT NULL,
        "created_at"     timestamptz NOT NULL DEFAULT now(),
        "updated_at"     timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_lms_class_mapping" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_lms_class_mapping_class_id"
        ON "lms_class_mapping" ("class_id")
    `);

    // Create lms_student_mapping table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "lms_student_mapping" (
        "id"           uuid        NOT NULL DEFAULT uuid_generate_v4(),
        "school_id"    uuid        NOT NULL,
        "class_id"     uuid        NOT NULL,
        "lms_user_id"  varchar     NOT NULL,
        "student_code" varchar     NOT NULL,
        "created_at"   timestamptz NOT NULL DEFAULT now(),
        "updated_at"   timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_lms_student_mapping" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_lms_student_mapping_class_student"
        ON "lms_student_mapping" ("class_id", "student_code")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_lms_student_mapping_class_user"
        ON "lms_student_mapping" ("class_id", "lms_user_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "lms_student_mapping"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "lms_class_mapping"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "lms_school_config"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "lms_config_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "lms_type_enum"`);
  }
}
