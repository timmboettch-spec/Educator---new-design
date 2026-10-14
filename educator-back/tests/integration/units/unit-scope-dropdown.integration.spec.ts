import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { databseConfig } from '../../../src/database/data-source';
import { EducatorSimulation, SimulationV2, Unit } from '../../../src/database/entities';
import { EducatorSimulationRepository } from '../../../src/database/repositories/educator-simulation.repository';
import { UnitRepository } from '../../../src/database/repositories/unit.repository';
import { EducatorSimulationsController } from '../../../src/educator-simulations/educator-simulations.controller';
import { EducatorSimulationsService } from '../../../src/educator-simulations/educator-simulations.service';
import { UnitsController } from '../../../src/units/units.controller';
import { UnitsService } from '../../../src/units/units.service';
import {
  EDUCATOR_SIMULATION_REPOSITORY,
  SIMULATION_V2_REPOSITORY,
  UNIT_REPOSITORY,
} from '../../../src/database/tokens';
import { buildTestApp, TEST_USERS } from '../setup/test-app.factory';

const hasDbConfig = Boolean(process.env.DB_HOST && process.env.DB_USERNAME && process.env.DB_NAME);
const describeWithDb = hasDbConfig ? describe : describe.skip;

const MARKER = 'UNITDD-TEST-';
const OTHER_EDUCATOR_ID = '550e8400-e29b-41d4-a716-4466554400cc';
const LIBRARY_ROUTE = '/api/units/my-library/dropdown';
const CATALOG_ROUTE = '/api/units/catalog/dropdown';

interface DropdownBody {
  data: { id: string; name: string }[];
  meta: { total: number; page: number; pageSize: number; totalPages: number };
}

/**
 * Unit dropdowns for the My Library and Catalogue filters (RE-242), HTTP + real Postgres. Every
 * assertion narrows the request with the marker as `search`, so other data in the database never
 * leaks into an expected list.
 */
describeWithDb('GET /api/units/{my-library,catalog}/dropdown (HTTP + Postgres)', () => {
  let dataSource: DataSource;
  let app: INestApplication;
  let educatorToken: string;
  let districtAdminToken: string;
  let scenarioAdminToken: string;
  const educatorId = TEST_USERS.thirdEducator.educatorId;
  const id = (key: string): string => `${MARKER}${key}`;

  const httpServer = (): Parameters<typeof request>[0] => {
    const server: unknown = app.getHttpServer();
    return server as Parameters<typeof request>[0];
  };

  const get = (route: string, query = '', token = educatorToken): request.Test =>
    request(httpServer()).get(`${route}${query}`).set('Authorization', `Bearer ${token}`);

  /** The dropdown narrowed to this suite's units. */
  const dropdown = async (route: string, extra = '', status = 200): Promise<DropdownBody> => {
    const res = await get(route, `?search=${MARKER}${extra}`).expect(status);
    return res.body as DropdownBody;
  };
  const ids = (body: DropdownBody): string[] =>
    body.data.map((item) => item.id.replace(MARKER, ''));

  const cleanup = async (): Promise<void> => {
    await dataSource.query(`DELETE FROM educator_simulations WHERE scenario_id LIKE '${MARKER}%'`);
    await dataSource.query(`DELETE FROM simulations_v2 WHERE id LIKE '${MARKER}%'`);
    await dataSource.query(`DELETE FROM units WHERE id LIKE '${MARKER}%'`);
  };

  const seed = async (): Promise<void> => {
    const unit = (key: string, name: string, deletedAt?: Date): Partial<Unit> => ({
      id: id(key),
      name: `${MARKER}${name}`,
      deletedAt,
    });
    await dataSource
      .getRepository(Unit)
      .save([
        unit('alpha', 'Alpha'),
        unit('beta', 'Beta'),
        unit('charlie', 'charlie'),
        unit('delta', 'Delta'),
        unit('echo', 'Echo'),
        unit('foxtrot', 'Foxtrot'),
        unit('gamma', 'Gamma'),
        unit('zulu', 'Zulu'),
        unit('retired', 'Retired', new Date()),
        unit('pct', '100% Unit'),
      ]);

    await dataSource.getRepository(SimulationV2).save([
      { id: id('s1'), title: 'S1', status: 'published', unitId: id('alpha') },
      // A second Simulation in the same Unit must not list the Unit twice.
      { id: id('s2'), title: 'S2', status: 'published', unitId: id('alpha') },
      // Catalogue only: published but not saved by the Educator under test.
      { id: id('s3'), title: 'S3', status: 'published', unitId: id('beta') },
      { id: id('s4'), title: 'S4', status: 'published', unitId: id('charlie') },
      { id: id('s5'), title: 'S5', status: 'draft', unitId: id('delta') },
      // Saved only by someone else.
      { id: id('s6'), title: 'S6', status: 'published', unitId: id('echo') },
      {
        id: id('s7'),
        title: 'S7',
        status: 'published',
        unitId: id('foxtrot'),
        deletedAt: new Date(),
      },
      // The Educator removed this entry.
      { id: id('s8'), title: 'S8', status: 'published', unitId: id('zulu') },
      { id: id('s9'), title: 'S9', status: ' ARCHIVED ', unitId: id('zulu') },
      // Its Unit is deleted.
      { id: id('s10'), title: 'S10', status: 'published', unitId: id('retired') },
      { id: id('s11'), title: 'S11', status: 'published', unitId: id('pct') },
    ]);

    const entries = dataSource.getRepository(EducatorSimulation);
    const save = (owner: string, key: string, deletedAt: Date | null = null) =>
      entries.save({
        educator_id: owner,
        unit_id: '',
        scenario_id: id(key),
        deleted_at: deletedAt,
      });
    await save(educatorId, 's1');
    await save(educatorId, 's2');
    await save(educatorId, 's4');
    await save(educatorId, 's5');
    await save(educatorId, 's7');
    await save(educatorId, 's8', new Date());
    await save(educatorId, 's9');
    await save(educatorId, 's10');
    await save(educatorId, 's11');
    await save(OTHER_EDUCATOR_ID, 's6');
  };

  beforeAll(async () => {
    dataSource = new DataSource({ ...databseConfig, synchronize: false, logging: false });
    await dataSource.initialize();
    await cleanup();

    let signToken: (user?: object) => string;
    ({ app, signToken } = await buildTestApp({
      controllers: [UnitsController, EducatorSimulationsController],
      providers: [
        UnitsService,
        EducatorSimulationsService,
        {
          provide: EDUCATOR_SIMULATION_REPOSITORY,
          useValue: new EducatorSimulationRepository(dataSource.getRepository(EducatorSimulation)),
        },
        { provide: UNIT_REPOSITORY, useValue: new UnitRepository(dataSource.getRepository(Unit)) },
        { provide: SIMULATION_V2_REPOSITORY, useValue: { find: jest.fn().mockResolvedValue([]) } },
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

  describe('my-library scope', () => {
    it('lists only the Units of the Educator’s own saved, visible, non-removed entries', async () => {
      const body = await dropdown(LIBRARY_ROUTE);

      // Not listed: beta (not saved), delta (draft), echo (someone else's), foxtrot (deleted
      // Simulation), zulu (removed or archived), retired (deleted Unit), gamma (no Simulation).
      expect(ids(body)).toEqual(['pct', 'alpha', 'charlie']);
      expect(body.meta.total).toBe(3);
    });

    it('returns items as { id, name } only, ordered by name ignoring case', async () => {
      const body = await dropdown(LIBRARY_ROUTE);

      expect(body.data).toEqual([
        { id: id('pct'), name: `${MARKER}100% Unit` },
        { id: id('alpha'), name: `${MARKER}Alpha` },
        { id: id('charlie'), name: `${MARKER}charlie` },
      ]);
    });

    it('offers every Unit the My Library Unit filter can match', async () => {
      const body = await dropdown(LIBRARY_ROUTE);

      for (const item of body.data) {
        const res = await request(httpServer())
          .get('/api/educator-simulations/my-library/list')
          .query({ unitId: item.id })
          .set('Authorization', `Bearer ${educatorToken}`)
          .expect(200);

        expect((res.body as { meta: { total: number } }).meta.total).toBeGreaterThan(0);
      }
    });

    it('follows the Simulation when it moves to another Unit after saving', async () => {
      await dataSource.query(`UPDATE simulations_v2 SET unit_id = $1 WHERE id = $2`, [
        id('gamma'),
        id('s4'),
      ]);
      try {
        expect(ids(await dropdown(LIBRARY_ROUTE))).toEqual(['pct', 'alpha', 'gamma']);
      } finally {
        await dataSource.query(`UPDATE simulations_v2 SET unit_id = $1 WHERE id = $2`, [
          id('charlie'),
          id('s4'),
        ]);
      }
    });
  });

  describe('catalog scope', () => {
    it('lists the Units of every visible Simulation, saved or not', async () => {
      const body = await dropdown(CATALOG_ROUTE);

      // Not listed: delta (draft), foxtrot (deleted Simulation), retired (deleted Unit),
      // gamma (no Simulation).
      expect(ids(body)).toEqual(['pct', 'alpha', 'beta', 'charlie', 'echo', 'zulu']);
      expect(body.meta.total).toBe(6);
    });

    it('returns items as { id, name } only', async () => {
      const body = await dropdown(CATALOG_ROUTE, '', 200);

      expect(body.data[1]).toEqual({ id: id('alpha'), name: `${MARKER}Alpha` });
    });
  });

  describe.each([
    ['my-library', LIBRARY_ROUTE, ['pct', 'alpha', 'charlie']],
    ['catalog', CATALOG_ROUTE, ['pct', 'alpha', 'beta', 'charlie', 'echo', 'zulu']],
  ])('search and paging (%s)', (_name, route, expected) => {
    it('finds part of a Unit name, ignoring case and extra spaces', async () => {
      const search = async (value: string): Promise<DropdownBody> =>
        (await get(route, `?search=${value}`).expect(200)).body as DropdownBody;

      expect(ids(await search('UNITDD-TEST-ALPHA'))).toEqual(['alpha']);
      expect(ids(await search('%20%20unitdd-test-alpha%20%20'))).toEqual(['alpha']);
    });

    it('matches % literally', async () => {
      const search = async (value: string): Promise<DropdownBody> =>
        (await get(route, `?search=${value}`).expect(200)).body as DropdownBody;

      expect(ids(await search('UNITDD-TEST-100%25'))).toEqual(['pct']);
      // A bare % is a literal percent sign, not "match everything".
      const bare = await search('%25');
      expect(ids(bare)).toContain('pct');
      for (const item of bare.data) expect(item.name).toContain('%');
    });

    it('returns an empty list with a count of 0 when nothing matches', async () => {
      const body = await dropdown(route, 'zzzz-no-such-unit');

      expect(body.data).toEqual([]);
      expect(body.meta).toMatchObject({ total: 0, totalPages: 0 });
    });

    it('treats a blank search as no search', async () => {
      const plain = (await get(route).expect(200)).body as DropdownBody;
      const blank = (await get(route, '?search=%20%20').expect(200)).body as DropdownBody;

      expect(blank.meta.total).toBe(plain.meta.total);
    });

    it('pages within the searched set and counts the whole set', async () => {
      const first = await get(route, `?search=${MARKER}&pageSize=2`).expect(200);
      const second = await get(route, `?search=${MARKER}&pageSize=2&page=2`).expect(200);
      const firstBody = first.body as DropdownBody;
      const secondBody = second.body as DropdownBody;

      expect(ids(firstBody)).toEqual(expected.slice(0, 2));
      expect(ids(secondBody)).toEqual(expected.slice(2, 4));
      expect(firstBody.meta).toMatchObject({ total: expected.length, pageSize: 2 });
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
  ])('access (%s)', (_name, route) => {
    it('answers 401 without a token', async () => {
      await request(httpServer()).get(route).expect(401);
    });

    it('refuses a district admin and a scenario admin with 403', async () => {
      await get(route, '', districtAdminToken).expect(403);
      await get(route, '', scenarioAdminToken).expect(403);
    });
  });
});
