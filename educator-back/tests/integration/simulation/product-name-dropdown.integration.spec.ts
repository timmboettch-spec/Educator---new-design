import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { databseConfig } from '../../../src/database/data-source';
import { EducatorSimulation, SimulationV2 } from '../../../src/database/entities';
import { EducatorSimulationRepository } from '../../../src/database/repositories/educator-simulation.repository';
import { SimulationV2Repository } from '../../../src/database/repositories/simulation-v2.repository';
import { EducatorSimulationsController } from '../../../src/educator-simulations/educator-simulations.controller';
import { EducatorSimulationsService } from '../../../src/educator-simulations/educator-simulations.service';
import { SimulationController } from '../../../src/simulation/simulation.controller';
import { SimulationService } from '../../../src/simulation/simulation.service';
import { StudentsService } from '../../../src/students/students.service';
import {
  EDUCATOR_SIMULATION_REPOSITORY,
  SIMULATION_CATALOG_REPOSITORY,
  SIMULATION_V2_REPOSITORY,
  UNIT_REPOSITORY,
} from '../../../src/database/tokens';
import { buildTestApp, TEST_USERS } from '../setup/test-app.factory';

const hasDbConfig = Boolean(process.env.DB_HOST && process.env.DB_USERNAME && process.env.DB_NAME);
const describeWithDb = hasDbConfig ? describe : describe.skip;

const MARKER = 'PNDD-TEST-';
const OTHER_EDUCATOR_ID = '550e8400-e29b-41d4-a716-4466554400ee';
const LIBRARY_ROUTE = '/api/simulations/product-names/my-library/dropdown';
const CATALOG_ROUTE = '/api/simulations/product-names/catalog/dropdown';
const LIST_ROUTE = '/api/educator-simulations/my-library/list';

interface DropdownBody {
  data: string[];
  meta: { total: number; page: number; pageSize: number; totalPages: number };
}

/**
 * Required Product Name dropdowns for the My Library and Catalogue filters (RE-242), HTTP + real
 * Postgres. Every product name this suite seeds starts with the marker, and requests search for it, so
 * other data in the database never leaks into an expected list.
 */
describeWithDb('GET /api/simulations/product-names/{my-library,catalog}/dropdown', () => {
  let dataSource: DataSource;
  let app: INestApplication;
  let educatorToken: string;
  let districtAdminToken: string;
  let scenarioAdminToken: string;
  const educatorId = TEST_USERS.thirdEducator.educatorId;
  const id = (key: string): string => `${MARKER}${key}`;
  const name = (text: string): string => `${MARKER}${text}`;

  const httpServer = (): Parameters<typeof request>[0] => {
    const server: unknown = app.getHttpServer();
    return server as Parameters<typeof request>[0];
  };

  const get = (route: string, query = '', token = educatorToken): request.Test =>
    request(httpServer()).get(`${route}${query}`).set('Authorization', `Bearer ${token}`);

  const search = async (route: string, value: string, status = 200): Promise<DropdownBody> =>
    (await get(route, `?search=${value}`).expect(status)).body as DropdownBody;
  /** The dropdown narrowed to this suite's product names. */
  const dropdown = (route: string, extra = ''): Promise<DropdownBody> =>
    get(route, `?search=${MARKER}${extra}`).then((res) => res.body as DropdownBody);

  const cleanup = async (): Promise<void> => {
    await dataSource.query(`DELETE FROM educator_simulations WHERE scenario_id LIKE '${MARKER}%'`);
    await dataSource.query(`DELETE FROM simulations_v2 WHERE id LIKE '${MARKER}%'`);
  };

  const seed = async (): Promise<void> => {
    const sim = (
      key: string,
      productTitle: string | null,
      extra: Partial<SimulationV2> = {},
    ): Partial<SimulationV2> => ({
      id: id(key),
      title: `${MARKER}${key}`,
      status: 'published',
      productSetup: productTitle === null ? undefined : { title: productTitle },
      ...extra,
    });
    await dataSource.getRepository(SimulationV2).save([
      // Three spellings of one product name: the most frequent one represents it.
      sim('s1', name('High School')),
      sim('s2', `  ${name('high   SCHOOL')} `),
      sim('s3', name('High School')),
      sim('s4', name('Nursing')), // catalogue only
      sim('s5', name('Draft Product'), { status: 'draft' }),
      sim('s6', name('Theirs')), // saved only by someone else
      sim('s7', name('Archived Product'), { status: ' ARCHIVED ' }),
      sim('s8', name('Deleted Product'), { deletedAt: new Date() }),
      sim('s9', name('Removed')), // the Educator removed this entry
      sim('s10', name('Allied Health')),
      // Two equally frequent spellings: either may represent the group, but always the same one.
      sim('s11', name('Tie B')),
      sim('s12', name('tie b')),
      sim('s13', name('100% Pure')),
      sim('s14', '   '), // blank product name
      sim('s15', null), // no product name
      // The placeholder `none`, in any case, is not a product.
      sim('s16', 'none'),
      sim('s17', ' None '),
    ]);

    const entries = dataSource.getRepository(EducatorSimulation);
    const save = (owner: string, key: string, deletedAt: Date | null = null) =>
      entries.save({
        educator_id: owner,
        unit_id: '',
        scenario_id: id(key),
        deleted_at: deletedAt,
      });
    for (const key of [
      's1',
      's2',
      's3',
      's5',
      's7',
      's8',
      's10',
      's11',
      's12',
      's13',
      's14',
      's15',
      's16',
      's17',
    ]) {
      await save(educatorId, key);
    }
    await save(educatorId, 's9', new Date());
    await save(OTHER_EDUCATOR_ID, 's6');
  };

  beforeAll(async () => {
    dataSource = new DataSource({ ...databseConfig, synchronize: false, logging: false });
    await dataSource.initialize();
    await cleanup();

    let signToken: (user?: object) => string;
    ({ app, signToken } = await buildTestApp({
      controllers: [SimulationController, EducatorSimulationsController],
      providers: [
        SimulationService,
        EducatorSimulationsService,
        {
          provide: EDUCATOR_SIMULATION_REPOSITORY,
          useValue: new EducatorSimulationRepository(dataSource.getRepository(EducatorSimulation)),
        },
        {
          provide: SIMULATION_V2_REPOSITORY,
          useValue: new SimulationV2Repository(dataSource.getRepository(SimulationV2)),
        },
        { provide: SIMULATION_CATALOG_REPOSITORY, useValue: { find: jest.fn() } },
        { provide: UNIT_REPOSITORY, useValue: { find: jest.fn().mockResolvedValue([]) } },
        { provide: StudentsService, useValue: {} },
      ],
    }));
    educatorToken = signToken(TEST_USERS.thirdEducator);
    districtAdminToken = signToken(TEST_USERS.districtAdmin);
    scenarioAdminToken = signToken(TEST_USERS.scenarioAdmin);
    await seed();
  });

  afterAll(async () => {
    await cleanup();
    await app?.close();
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  /** The product name that stands for the two equally frequent `Tie B` spellings. */
  const tieValue = (values: string[]): string => {
    const tie = values.find((value) => value.toLowerCase() === name('tie b').toLowerCase());
    expect(tie).toBeDefined();
    return tie as string;
  };

  describe('my-library scope', () => {
    it('lists only the product names of the Educator’s own saved, visible, non-removed Simulations', async () => {
      const body = await dropdown(LIBRARY_ROUTE);

      // Not listed: nursing (not saved), draft, archived, deleted, removed, theirs, blank, none.
      expect(body.data.map((value) => value.toLowerCase())).toEqual([
        name('100% Pure').toLowerCase(),
        name('Allied Health').toLowerCase(),
        name('High School').toLowerCase(),
        name('Tie B').toLowerCase(),
      ]);
      expect(body.meta.total).toBe(4);
    });

    it('collapses spelling variants into the most frequent spelling', async () => {
      const body = await dropdown(LIBRARY_ROUTE);

      expect(body.data).toContain(name('High School'));
      expect(body.data).not.toContain(name('high SCHOOL'));
    });

    it('uses the first of equally frequent spellings in the database sort order', async () => {
      // `MODE() WITHIN GROUP (ORDER BY ...)` returns the first tied value, so the expected spelling
      // is the one Postgres itself sorts first, whatever the database collation.
      const [{ first }] = await dataSource.query<{ first: string }[]>(
        'SELECT v AS first FROM (VALUES ($1::text), ($2::text)) AS t(v) ORDER BY v LIMIT 1',
        [name('Tie B'), name('tie b')],
      );

      expect(tieValue((await dropdown(LIBRARY_ROUTE)).data)).toBe(first);
      expect(tieValue((await dropdown(CATALOG_ROUTE)).data)).toBe(first);
    });

    it('offers values that return every spelling variant through the My Library filter', async () => {
      const [value] = (await dropdown(LIBRARY_ROUTE, 'High')).data;
      const res = await request(httpServer())
        .get(LIST_ROUTE)
        .query({ productName: value })
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);

      expect((res.body as { meta: { total: number } }).meta.total).toBe(3);
    });
  });

  describe('catalog scope', () => {
    it('lists the product names of every visible Simulation, saved or not', async () => {
      const body = await dropdown(CATALOG_ROUTE);

      expect(body.data.map((value) => value.toLowerCase())).toEqual([
        name('100% Pure').toLowerCase(),
        name('Allied Health').toLowerCase(),
        name('High School').toLowerCase(),
        name('Nursing').toLowerCase(),
        name('Removed').toLowerCase(),
        name('Theirs').toLowerCase(),
        name('Tie B').toLowerCase(),
      ]);
      expect(body.meta.total).toBe(7);
    });

    it('never offers the placeholder `none`, in any case', async () => {
      for (const route of [LIBRARY_ROUTE, CATALOG_ROUTE]) {
        const body = await search(route, 'none');

        for (const value of body.data) expect(value.trim().toLowerCase()).not.toBe('none');
      }
    });

    it('never offers a blank value', async () => {
      const body = (await get(CATALOG_ROUTE, '?pageSize=500').expect(200)).body as DropdownBody;

      expect(body.data.every((value) => value.trim() !== '')).toBe(true);
    });
  });

  describe.each([
    ['my-library', LIBRARY_ROUTE, 4],
    ['catalog', CATALOG_ROUTE, 7],
  ])('search and paging (%s)', (_scope, route, total) => {
    it('finds part of a product name, ignoring case and extra spaces', async () => {
      expect((await search(route, 'PNDD-TEST-HIGH')).data).toEqual([name('High School')]);
      expect((await search(route, '%20%20pndd-test-high%20%20%20school')).data).toEqual([
        name('High School'),
      ]);
    });

    it('matches % literally', async () => {
      expect((await search(route, 'PNDD-TEST-100%25')).data).toEqual([name('100% Pure')]);
      const bare = await search(route, '%25');
      expect(bare.data).toContain(name('100% Pure'));
      for (const value of bare.data) expect(value).toContain('%');
    });

    it('returns an empty list with a count of 0 when nothing matches', async () => {
      const body = await search(route, 'zzzz-no-such-product name');

      expect(body.data).toEqual([]);
      expect(body.meta).toMatchObject({ total: 0, totalPages: 0 });
    });

    it('treats a blank search as no search', async () => {
      const plain = (await get(route).expect(200)).body as DropdownBody;
      const blank = (await get(route, '?search=%20%20').expect(200)).body as DropdownBody;

      expect(blank.meta.total).toBe(plain.meta.total);
    });

    it('pages within the searched set and counts the whole set', async () => {
      const first = (await get(route, `?search=${MARKER}&pageSize=2`).expect(200))
        .body as DropdownBody;
      const second = (await get(route, `?search=${MARKER}&pageSize=2&page=2`).expect(200))
        .body as DropdownBody;

      expect(first.data).toHaveLength(2);
      expect(second.data).toHaveLength(2);
      expect(first.data[0]).not.toBe(second.data[0]);
      expect(first.meta).toMatchObject({ total, pageSize: 2 });
    });

    it('accepts the maximum page size of 500 and refuses more', async () => {
      await get(route, `?search=${MARKER}&pageSize=500`).expect(200);
      await get(route, `?search=${MARKER}&pageSize=501`).expect(400);
    });

    it.each(['page=0', 'page=100001', 'pageSize=0', 'pageSize=abc', `search=${'a'.repeat(101)}`])(
      'refuses %s with a 400',
      async (query) => {
        await get(route, `?${query}`).expect(400);
      },
    );

    it('refuses an unknown query parameter', async () => {
      await get(route, '?unknown=1').expect(400);
    });
  });

  describe.each([
    ['my-library', LIBRARY_ROUTE],
    ['catalog', CATALOG_ROUTE],
  ])('access (%s)', (_scope, route) => {
    it('answers 401 without a token', async () => {
      await request(httpServer()).get(route).expect(401);
    });

    it('refuses a district admin and a scenario admin with 403', async () => {
      await get(route, '', districtAdminToken).expect(403);
      await get(route, '', scenarioAdminToken).expect(403);
    });
  });
});
