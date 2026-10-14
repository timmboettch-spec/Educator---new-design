import { MigrationInterface, QueryRunner } from "typeorm";

export class AlignSchemaWithEntities1790224730322 implements MigrationInterface {
    name = 'AlignSchemaWithEntities1790224730322'

    private readonly statusValues = [
        'ACTIVE',
        'INACTIVE',
        'PENDING',
        'DRAFT',
        'ARCHIVED',
        'ATTENTION',
        'ARCHIEVED',
    ];

    // Timestamp columns whose default is aligned to now() (was CURRENT_TIMESTAMP).
    private readonly nowDefaultColumns: [string, string][] = [
        ['users', 'created_at'],
        ['users', 'updated_at'],
        ['schools', 'created_at'],
        ['schools', 'updated_at'],
        ['classes', 'created_at'],
        ['classes', 'updated_at'],
        ['role', 'created_at'],
        ['role', 'updated_at'],
        ['educators', 'created_at'],
        ['educators', 'updated_at'],
        ['invites', 'created_at'],
        ['invites', 'updated_at'],
        ['google_school_connections', 'created_at'],
        ['google_school_connections', 'updated_at'],
        ['google_course_mappings', 'created_at'],
        ['google_course_mappings', 'updated_at'],
        ['google_coursework_mappings', 'created_at'],
        ['google_coursework_mappings', 'updated_at'],
        ['google_student_mappings', 'created_at'],
        ['google_student_mappings', 'updated_at'],
        ['lms_assignment_mapping', 'created_at'],
        ['lms_assignment_mapping', 'updated_at'],
        ['lms_grade_sync_log', 'attempted_at'],
        ['redemptions', 'redeemed_at'],
    ];

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Skips tables absent from a drifted DB (e.g. LMS grade-passback tables dropped by hand).
        for (const [table, column] of this.nowDefaultColumns) {
            if (!(await queryRunner.hasColumn(table, column))) continue;
            await queryRunner.query(`ALTER TABLE "${table}" ALTER COLUMN "${column}" SET DEFAULT now()`);
        }
        if (await queryRunner.hasColumn('schools', 'google_classroom_enabled')) {
            await queryRunner.query(
                `ALTER TABLE "schools" ALTER COLUMN "google_classroom_enabled" SET DEFAULT false`,
            );
        }
        // Soft-delete columns for the entities' @DeleteDateColumn.
        await queryRunner.query(
            `ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP WITH TIME ZONE`,
        );
        await queryRunner.query(
            `ALTER TABLE "invites" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP WITH TIME ZONE`,
        );
        // On dev these were hand-added as `timestamp`; convert in place, keeping soft-delete markers.
        for (const table of ['classes', 'invites']) {
            if ((await this.columnUdt(queryRunner, table, 'deleted_at')) === 'timestamp') {
                await queryRunner.query(
                    `ALTER TABLE "${table}" ALTER COLUMN "deleted_at" TYPE TIMESTAMP WITH TIME ZONE USING "deleted_at" AT TIME ZONE 'UTC'`,
                );
            }
        }
        // Optional in every invite-creation path (DTO, bulk school import, educator re-invite).
        await queryRunner.query(`ALTER TABLE "invites" ALTER COLUMN "full_name" DROP NOT NULL`);

        // Status enums: rename to the names TypeORM derives from the entities (metadata-only),
        // then add the CommonStatus values the DB types are missing.
        await this.renameTypeIfExists(queryRunner, 'school_status_enum', 'schools_status_enum');
        await this.renameTypeIfExists(queryRunner, 'class_status_enum', 'classes_status_enum');
        for (const typeName of ['schools_status_enum', 'classes_status_enum', 'user_status_enum']) {
            for (const value of this.statusValues) {
                await queryRunner.query(`ALTER TYPE "public"."${typeName}" ADD VALUE IF NOT EXISTS '${value}'`);
            }
        }

        // students.status: varchar -> enum, keeping each row's existing value.
        await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'students_status_enum') THEN
          CREATE TYPE "public"."students_status_enum" AS ENUM(${this.statusValues.map((v) => `'${v}'`).join(', ')});
        END IF;
      END $$`);
        if ((await this.columnUdt(queryRunner, 'students', 'status')) === 'varchar') {
            await queryRunner.query(`ALTER TABLE "students" ALTER COLUMN "status" DROP DEFAULT`);
            await queryRunner.query(
                `ALTER TABLE "students" ALTER COLUMN "status" TYPE "public"."students_status_enum" USING "status"::text::"public"."students_status_enum"`,
            );
            await queryRunner.query(`ALTER TABLE "students" ALTER COLUMN "status" SET DEFAULT 'ACTIVE'`);
        }

        // students.deleted_at: timestamp -> timestamptz, keeping soft-delete markers.
        if ((await this.columnUdt(queryRunner, 'students', 'deleted_at')) === 'timestamp') {
            await queryRunner.query(
                `ALTER TABLE "students" ALTER COLUMN "deleted_at" TYPE TIMESTAMP WITH TIME ZONE USING "deleted_at" AT TIME ZONE 'UTC'`,
            );
        }
        await queryRunner.query(`ALTER TABLE "students" ALTER COLUMN "created_at" SET DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "students" ALTER COLUMN "updated_at" SET DEFAULT now()`);

        // users.subscriptions: json -> jsonb, keeping data and the '[]' default.
        if ((await this.columnUdt(queryRunner, 'users', 'subscriptions')) === 'json') {
            await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "subscriptions" DROP DEFAULT`);
            await queryRunner.query(
                `ALTER TABLE "users" ALTER COLUMN "subscriptions" TYPE jsonb USING "subscriptions"::jsonb`,
            );
            await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "subscriptions" SET DEFAULT '[]'::jsonb`);
        }

        // Relations the entities declare as nullable. Relaxing NOT NULL never affects existing rows.
        await queryRunner.query(`ALTER TABLE "students" ALTER COLUMN "class_id" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "students" ALTER COLUMN "educator_id" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "classes" ALTER COLUMN "educator_id" DROP NOT NULL`);
        // term/year are optional in the create/update DTOs and nullable on the entity.
        await queryRunner.query(`ALTER TABLE "classes" ALTER COLUMN "term" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "classes" ALTER COLUMN "year" DROP NOT NULL`);
        // Hard-coded 2026 defaults: every class-creation path (DTO, Google, LMS) passes explicit dates.
        await queryRunner.query(`ALTER TABLE "classes" ALTER COLUMN "start_date" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "classes" ALTER COLUMN "end_date" DROP DEFAULT`);

        // Boolean flags the entities declare NOT NULL: backfill any NULL with the column default first.
        const flags: [string, string, boolean][] = [
            ['schools', 'is_active', true],
            ['educators', 'is_active', true],
            ['students', 'is_active', true],
            ['classes', 'is_active', true],
            ['class_simulations', 'is_active', true],
            ['class_simulations', 'is_ai', false],
            ['invites', 'is_active', true],
        ];
        for (const [table, column, fallback] of flags) {
            await queryRunner.query(`UPDATE "${table}" SET "${column}" = ${fallback} WHERE "${column}" IS NULL`);
            await queryRunner.query(`ALTER TABLE "${table}" ALTER COLUMN "${column}" SET NOT NULL`);
        }

        // Overlap trigger from 1790000000002 and the columns it maintains: overlap is enforced in
        // ClassSimulationService.assign(). The trigger must go first — it writes to these columns.
        await queryRunner.query(
            `DROP TRIGGER IF EXISTS "set_class_simulation_assignment_dates_trigger" ON "class_simulations"`,
        );
        await queryRunner.query(`DROP FUNCTION IF EXISTS "set_class_simulation_assignment_dates"()`);
        await queryRunner.query(`ALTER TABLE "class_simulations" DROP COLUMN IF EXISTS "assignment_start_date"`);
        await queryRunner.query(`ALTER TABLE "class_simulations" DROP COLUMN IF EXISTS "assignment_end_date"`);

        // Legacy varchar column, unreferenced by any entity or query (classes PK is `id`).
        await queryRunner.query(`ALTER TABLE "classes" DROP COLUMN IF EXISTS "class_id"`);

        // Indexes: drop the one superseded by idx_classes_status_end_date, ensure the entity ones exist.
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_classes_active_end_date"`);
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "idx_students_educator_active" ON "students" ("educator_id", "is_active")`,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "idx_classes_educator_active" ON "classes" ("educator_id", "is_active")`,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "idx_classes_status_end_date" ON "classes" ("status", "end_date")`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Added enum values cannot be removed in PostgreSQL; only the type renames are reverted.
        await queryRunner.query(`ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "class_id" character varying`);

        // Restore the overlap trigger exactly as 1790000000002 created it.
        await queryRunner.query(`
      ALTER TABLE class_simulations
      ADD COLUMN IF NOT EXISTS assignment_start_date date,
      ADD COLUMN IF NOT EXISTS assignment_end_date date
    `);
        await queryRunner.query(`
      UPDATE class_simulations
      SET assignment_start_date = start_date::date,
          assignment_end_date = end_date::date
      WHERE start_date ~ '^\\d{4}-\\d{2}-\\d{2}$'
        AND end_date ~ '^\\d{4}-\\d{2}-\\d{2}$'
    `);
        await queryRunner.query(`
      CREATE OR REPLACE FUNCTION set_class_simulation_assignment_dates()
      RETURNS trigger AS $$
      BEGIN
        NEW.assignment_start_date := CASE
          WHEN NEW.start_date ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN NEW.start_date::date
          ELSE NULL
        END;
        NEW.assignment_end_date := CASE
          WHEN NEW.end_date ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN NEW.end_date::date
          ELSE NULL
        END;

        IF NEW.is_active
          AND NEW.assignment_start_date IS NOT NULL
          AND NEW.assignment_end_date IS NOT NULL THEN
          PERFORM pg_advisory_xact_lock(
            hashtext(NEW.class_id::text),
            hashtext(NEW.simulation_id::text)
          );

          IF EXISTS (
            SELECT 1
            FROM class_simulations existing
            WHERE existing.class_id = NEW.class_id
              AND existing.simulation_id = NEW.simulation_id
              AND existing.is_active = true
              AND (TG_OP = 'INSERT' OR existing.id <> NEW.id)
              AND existing.assignment_start_date <= NEW.assignment_end_date
              AND existing.assignment_end_date >= NEW.assignment_start_date
          ) THEN
            RAISE EXCEPTION 'Class simulation assignment dates overlap'
              USING ERRCODE = '23P01';
          END IF;
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
        await queryRunner.query(`
      DROP TRIGGER IF EXISTS set_class_simulation_assignment_dates_trigger ON class_simulations;
      CREATE TRIGGER set_class_simulation_assignment_dates_trigger
      BEFORE INSERT OR UPDATE OF start_date, end_date ON class_simulations
      FOR EACH ROW EXECUTE FUNCTION set_class_simulation_assignment_dates()
    `);

        // Only invites.is_active was nullable before `up`; the other flags were already NOT NULL on dev.
        await queryRunner.query(`ALTER TABLE "invites" ALTER COLUMN "is_active" DROP NOT NULL`);

        // term/year stay nullable: that is their original state on dev, and a NOT NULL would fail
        // on classes created without them after `up`.
        await queryRunner.query(`ALTER TABLE "classes" ALTER COLUMN "start_date" SET DEFAULT '2026-01-01'`);
        await queryRunner.query(`ALTER TABLE "classes" ALTER COLUMN "end_date" SET DEFAULT '2026-12-31'`);

        // Restoring NOT NULL fails if rows with NULL were created after `up` — resolve those first.
        await queryRunner.query(`ALTER TABLE "classes" ALTER COLUMN "educator_id" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "students" ALTER COLUMN "educator_id" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "students" ALTER COLUMN "class_id" SET NOT NULL`);

        if ((await this.columnUdt(queryRunner, 'users', 'subscriptions')) === 'jsonb') {
            await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "subscriptions" DROP DEFAULT`);
            await queryRunner.query(
                `ALTER TABLE "users" ALTER COLUMN "subscriptions" TYPE json USING "subscriptions"::json`,
            );
            await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "subscriptions" SET DEFAULT '[]'::json`);
        }

        await queryRunner.query(`ALTER TABLE "students" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "students" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP`);
        if ((await this.columnUdt(queryRunner, 'students', 'deleted_at')) === 'timestamptz') {
            await queryRunner.query(
                `ALTER TABLE "students" ALTER COLUMN "deleted_at" TYPE TIMESTAMP WITHOUT TIME ZONE USING "deleted_at" AT TIME ZONE 'UTC'`,
            );
        }

        if ((await this.columnUdt(queryRunner, 'students', 'status')) === 'students_status_enum') {
            await queryRunner.query(`ALTER TABLE "students" ALTER COLUMN "status" DROP DEFAULT`);
            await queryRunner.query(
                `ALTER TABLE "students" ALTER COLUMN "status" TYPE character varying USING "status"::text`,
            );
            await queryRunner.query(`ALTER TABLE "students" ALTER COLUMN "status" SET DEFAULT 'ACTIVE'`);
        }
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."students_status_enum"`);

        await this.renameTypeIfExists(queryRunner, 'classes_status_enum', 'class_status_enum');
        await this.renameTypeIfExists(queryRunner, 'schools_status_enum', 'school_status_enum');

        // classes/invites.deleted_at are kept (and stay timestamptz): on dev they pre-date this
        // migration, so dropping them on revert would erase existing soft-delete markers.
        if (await queryRunner.hasColumn('schools', 'google_classroom_enabled')) {
            await queryRunner.query(
                `ALTER TABLE "schools" ALTER COLUMN "google_classroom_enabled" SET DEFAULT true`,
            );
        }
        for (const [table, column] of this.nowDefaultColumns) {
            if (!(await queryRunner.hasColumn(table, column))) continue;
            await queryRunner.query(
                `ALTER TABLE "${table}" ALTER COLUMN "${column}" SET DEFAULT CURRENT_TIMESTAMP`,
            );
        }
    }

    private async columnUdt(
        queryRunner: QueryRunner,
        table: string,
        column: string,
    ): Promise<string | undefined> {
        const rows = (await queryRunner.query(
            `SELECT udt_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
            [table, column],
        )) as { udt_name: string }[];
        return rows[0]?.udt_name;
    }

    private async renameTypeIfExists(queryRunner: QueryRunner, from: string, to: string): Promise<void> {
        await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = '${from}')
          AND NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '${to}') THEN
          ALTER TYPE "public"."${from}" RENAME TO "${to}";
        END IF;
      END $$`);
    }

}
