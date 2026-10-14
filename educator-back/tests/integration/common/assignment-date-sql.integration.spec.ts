import { DataSource } from 'typeorm';
import { databseConfig } from '../../../src/database/data-source';
import { buildAssignmentDateExpr } from '../../../src/common/utils/assignment-date-sql.util';

const hasDbConfig = Boolean(process.env.DB_HOST && process.env.DB_USERNAME && process.env.DB_NAME);

const describeWithDb = hasDbConfig ? describe : describe.skip;

/** Runs the real SQL expression in Postgres — the only place `make_date`'s range errors happen. */
describeWithDb('buildAssignmentDateExpr (Integration)', () => {
  let dataSource: DataSource;
  const DATE_EXPR = `to_char(${buildAssignmentDateExpr('$1::varchar')}, 'YYYY-MM-DD')`;

  const parse = async (value: string | null): Promise<string | null> => {
    const rows = (await dataSource.query(`SELECT ${DATE_EXPR} AS d`, [value])) as {
      d: string | null;
    }[];
    return rows[0].d;
  };

  beforeAll(async () => {
    dataSource = new DataSource({ ...databseConfig, synchronize: false, logging: false });
    await dataSource.initialize();
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it.each([
    ['2026-02-28', '2026-02-28'],
    ['2024-02-29', '2024-02-29'],
    ['2026-12-31', '2026-12-31'],
    ['2026-03-01T10:00:00.000Z', '2026-03-01'],
    ['12-31-2026', '2026-12-31'],
    ['02-29-2024', '2024-02-29'],
  ])('parses the valid date %p as %p', async (value, expected) => {
    expect(await parse(value)).toBe(expected);
  });

  it.each([
    '2026-02-31',
    '2026-02-29',
    '2026-04-31',
    '2026-13-01',
    '2026-00-10',
    '2026-01-00',
    '0000-01-01',
    '13-45-2026',
    '02-30-2026',
    '04-31-2026',
    'not-a-date',
    '',
    null,
  ])('returns NULL instead of raising for %p', async (value) => {
    expect(await parse(value)).toBeNull();
  });
});
