import { MigrationInterface, QueryRunner } from 'typeorm';
export class CreateEducatorSchoolsTable1786433500019 implements MigrationInterface {
  name = 'CreateEducatorSchoolsTable1786433500019';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "educator_schools" (
        "id"          uuid        NOT NULL DEFAULT uuid_generate_v4(),
        "educator_id" uuid        NOT NULL,
        "school_id"   uuid        NOT NULL,
        "is_primary"  boolean     NOT NULL DEFAULT false,
        "assigned_at" timestamptz NOT NULL DEFAULT NOW(),
        "created_at"  timestamptz NOT NULL DEFAULT NOW(),
        "updated_at"  timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_educator_schools"          PRIMARY KEY ("id"),
        CONSTRAINT "UQ_educator_schools_pair"     UNIQUE ("educator_id", "school_id"),
        CONSTRAINT "FK_educator_schools_educator" FOREIGN KEY ("educator_id")
          REFERENCES "educators"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_educator_schools_school"   FOREIGN KEY ("school_id")
          REFERENCES "schools"("id") ON DELETE CASCADE
      )
    `);

    // 2. Create lookup indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_educator_schools_educator_id"
        ON "educator_schools"("educator_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_educator_schools_school_id"
        ON "educator_schools"("school_id")
    `);

    await queryRunner.query(`
      INSERT INTO "educator_schools" ("educator_id", "school_id", "is_primary")
      SELECT "id", "school_id", true
      FROM   "educators"
      WHERE  "school_id" IS NOT NULL
        AND  "is_active"  = true
      ON CONFLICT ("educator_id", "school_id") DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "educator_schools" ("educator_id", "school_id", "is_primary")
      SELECT "id", "school_id", true
      FROM   "educators"
      WHERE  "school_id" IS NOT NULL
        AND  "is_active"  = false
      ON CONFLICT ("educator_id", "school_id") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_educator_schools_school_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_educator_schools_educator_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "educator_schools"`);
  }
}
