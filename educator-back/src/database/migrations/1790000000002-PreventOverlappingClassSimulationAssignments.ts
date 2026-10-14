import { MigrationInterface, QueryRunner } from 'typeorm';

export class PreventOverlappingClassSimulationAssignments1790000000002
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS uq_class_simulations_active_start_close_dates',
    );
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
      WITH overlapping_rows AS (
        SELECT later.id
        FROM class_simulations later
        INNER JOIN class_simulations earlier
          ON earlier.class_id = later.class_id
          AND earlier.simulation_id = later.simulation_id
          AND earlier.is_active = true
          AND (earlier.created_at, earlier.id) < (later.created_at, later.id)
          AND earlier.assignment_start_date <= later.assignment_end_date
          AND earlier.assignment_end_date >= later.assignment_start_date
        WHERE later.is_active = true
          AND later.assignment_start_date IS NOT NULL
          AND later.assignment_end_date IS NOT NULL
      )
      UPDATE class_simulations cs
      SET is_active = false, deleted_at = now()
      FROM overlapping_rows duplicate_assignment
      WHERE cs.id = duplicate_assignment.id
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TRIGGER IF EXISTS set_class_simulation_assignment_dates_trigger ON class_simulations',
    );
    await queryRunner.query('DROP FUNCTION IF EXISTS set_class_simulation_assignment_dates()');
    await queryRunner.query(`
      ALTER TABLE class_simulations
      DROP COLUMN IF EXISTS assignment_start_date,
      DROP COLUMN IF EXISTS assignment_end_date
    `);
  }
}