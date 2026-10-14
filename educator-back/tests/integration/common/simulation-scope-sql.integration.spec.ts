import { DataSource } from 'typeorm';
import { databseConfig } from '../../../src/database/data-source';
import { EducatorSimulation, SimulationV2 } from '../../../src/database/entities';
import { SimulationScope } from '../../../src/common/constants';
import { buildSimulationScopeSql } from '../../../src/common/utils/simulation.util';

const hasDbConfig = Boolean(process.env.DB_HOST && process.env.DB_USERNAME && process.env.DB_NAME);
const describeWithDb = hasDbConfig ? describe : describe.skip;

const MARKER = 'SIMSCOPE-TEST-';
const EDUCATOR_ID = '550e8400-e29b-41d4-a716-4466554400c1';
const OTHER_EDUCATOR_ID = '550e8400-e29b-41d4-a716-4466554400c2';

/** Runs the real scope predicate in Postgres, so the rule is checked against real rows. */
describeWithDb('buildSimulationScopeSql (Integration)', () => {
  let dataSource: DataSource;
  const id = (key: string): string => `${MARKER}${key}`;

  const idsInScope = async (scope: SimulationScope): Promise<string[]> => {
    const rows = await dataSource
      .createQueryBuilder()
      .select('sim.id', 'id')
      .from('simulations_v2', 'sim')
      .where(`sim.id LIKE '${MARKER}%'`)
      .andWhere(buildSimulationScopeSql(scope, 'sim'))
      .setParameter('educatorId', EDUCATOR_ID)
      .orderBy('sim.id')
      .getRawMany<{ id: string }>();
    return rows.map((row) => row.id.replace(MARKER, ''));
  };

  const cleanup = async (): Promise<void> => {
    await dataSource.query(`DELETE FROM educator_simulations WHERE scenario_id LIKE '${MARKER}%'`);
    await dataSource.query(`DELETE FROM simulations_v2 WHERE id LIKE '${MARKER}%'`);
  };

  beforeAll(async () => {
    dataSource = new DataSource({ ...databseConfig, synchronize: false, logging: false });
    await dataSource.initialize();
    await cleanup();

    await dataSource.getRepository(SimulationV2).save([
      { id: id('saved'), title: 'Saved', status: 'published' },
      { id: id('unsaved'), title: 'Unsaved', status: 'published' },
      { id: id('removed'), title: 'Removed', status: 'published' },
      { id: id('theirs'), title: 'Theirs', status: 'published' },
      { id: id('draft'), title: 'Draft', status: 'draft' },
      { id: id('archived'), title: 'Archived', status: ' ARCHIVED ' },
      { id: id('deleted'), title: 'Deleted', status: 'published', deletedAt: new Date() },
      { id: id('nostatus'), title: 'No status' },
    ]);
    const entries = dataSource.getRepository(EducatorSimulation);
    const save = (educatorId: string, key: string, deletedAt: Date | null = null) =>
      entries.save({
        educator_id: educatorId,
        unit_id: '',
        scenario_id: id(key),
        deleted_at: deletedAt,
      });
    await save(EDUCATOR_ID, 'saved');
    await save(EDUCATOR_ID, 'removed', new Date());
    await save(EDUCATOR_ID, 'draft');
    await save(EDUCATOR_ID, 'archived');
    await save(EDUCATOR_ID, 'deleted');
    await save(EDUCATOR_ID, 'nostatus');
    await save(OTHER_EDUCATOR_ID, 'theirs');
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await cleanup();
      await dataSource.destroy();
    }
  });

  it('catalogue scope is every visible, live Simulation, saved or not', async () => {
    expect(await idsInScope(SimulationScope.CATALOG)).toEqual([
      'nostatus',
      'removed',
      'saved',
      'theirs',
      'unsaved',
    ]);
  });

  it("my-library scope is the Educator's own non-removed saved entries that are visible", async () => {
    expect(await idsInScope(SimulationScope.MY_LIBRARY)).toEqual(['nostatus', 'saved']);
  });
});
