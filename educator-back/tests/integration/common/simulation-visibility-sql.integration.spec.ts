import { DataSource } from 'typeorm';
import { databseConfig } from '../../../src/database/data-source';
import {
  isSimulationVisibleToEducators,
  buildSimulationVisibleToEducatorsSql,
} from '../../../src/common/utils/simulation-visibility.util';

const hasDbConfig = Boolean(process.env.DB_HOST && process.env.DB_USERNAME && process.env.DB_NAME);

const describeWithDb = hasDbConfig ? describe : describe.skip;

/** Runs the real SQL expression in Postgres and checks it against the in-memory rule. */
describeWithDb('buildSimulationVisibleToEducatorsSql (Integration)', () => {
  let dataSource: DataSource;

  const isVisibleInSql = async (status: string | null): Promise<boolean> => {
    const rows = (await dataSource.query(
      `SELECT ${buildSimulationVisibleToEducatorsSql('t.status')} AS visible
       FROM (SELECT $1::varchar AS status) t`,
      [status],
    )) as { visible: boolean }[];
    return rows[0].visible;
  };

  beforeAll(async () => {
    dataSource = new DataSource({ ...databseConfig, synchronize: false, logging: false });
    await dataSource.initialize();
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it.each([
    [null, true],
    ['', true],
    ['published', true],
    ['PUBLISHED', true],
    ['  Published  ', true],
    ['live', true],
    ['draft', false],
    ['DRAFT', false],
    [' Draft ', false],
    ['archived', false],
    ['Archived', false],
    ['ARCHIVED', false],
    ['\tarchived\n', false],
    ['\u00a0draft\u00a0', false],
  ])('treats status %p as visible=%p, same as the in-memory rule', async (status, expected) => {
    expect(await isVisibleInSql(status)).toBe(expected);
    expect(isSimulationVisibleToEducators(status)).toBe(expected);
  });
});
