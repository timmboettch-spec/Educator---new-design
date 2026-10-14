import { MigrationInterface, QueryRunner } from 'typeorm';

export class PreventDuplicateClassSimulationStartAndCloseDates1790000000001
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE class_simulations
      SET start_date = CASE
        WHEN start_date ~ '^\\d{2}-\\d{2}-\\d{4}$' THEN to_char(to_date(start_date, 'MM-DD-YYYY'), 'YYYY-MM-DD')
        WHEN start_date ~ '^\\d{4}-\\d{2}-\\d{2}' THEN substring(start_date FROM 1 FOR 10)
        ELSE start_date
      END,
      end_date = CASE
        WHEN end_date ~ '^\\d{2}-\\d{2}-\\d{4}$' THEN to_char(to_date(end_date, 'MM-DD-YYYY'), 'YYYY-MM-DD')
        WHEN end_date ~ '^\\d{4}-\\d{2}-\\d{2}' THEN substring(end_date FROM 1 FOR 10)
        ELSE end_date
      END
    `);
    await queryRunner.query(`
      WITH duplicate_rows AS (
        SELECT id, row_number() OVER (
          PARTITION BY class_id, simulation_id, coalesce(start_date, ''), coalesce(end_date, '')
          ORDER BY created_at, id
        ) AS row_number
        FROM class_simulations
        WHERE is_active = true
      )
      UPDATE class_simulations cs
      SET is_active = false, deleted_at = now()
      FROM duplicate_rows duplicates
      WHERE cs.id = duplicates.id AND duplicates.row_number > 1
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_class_simulations_active_start_close_dates
      ON class_simulations (class_id, simulation_id, coalesce(start_date, ''), coalesce(end_date, ''))
      WHERE is_active = true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS uq_class_simulations_active_start_close_dates',
    );
  }
}