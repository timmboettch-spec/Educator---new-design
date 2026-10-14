import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { databseConfig } from '../../../src/database/data-source';
import { EducatorSimulation, SimulationV2, Unit } from '../../../src/database/entities';
import { EducatorSimulationRepository } from '../../../src/database/repositories/educator-simulation.repository';
import { EducatorSimulationsController } from '../../../src/educator-simulations/educator-simulations.controller';
import { EducatorSimulationsService } from '../../../src/educator-simulations/educator-simulations.service';
import {
  EDUCATOR_SIMULATION_REPOSITORY,
  SIMULATION_V2_REPOSITORY,
  UNIT_REPOSITORY,
} from '../../../src/database/tokens';
import { buildTestApp, TEST_USERS } from '../setup/test-app.factory';

const hasDbConfig = Boolean(process.env.DB_HOST && process.env.DB_USERNAME && process.env.DB_NAME);

const describeWithDb = hasDbConfig ? describe : describe.skip;

const MARKER = 'MYLIBLIST-TEST-';
const OTHER_EDUCATOR_ID = '550e8400-e29b-41d4-a716-4466554400aa';
const ROUTE = '/api/educator-simulations/my-library/list';

interface ListItem {
  id: string;
  unitId: string;
  unit: { id: string; name: string; imageUrl: string | null } | null;
  scenario: {
    id: string;
    title: string;
    description: string | null;
    learnerLevel: string | null;
    difficulty: string | null;
    estimatedDuration: string | null;
    timeAllotment: string | null;
    scenarioImage: string | null;
    avatarEnabled: boolean;
    productName: string | null;
    clinicalSetting: string | null;
    learningObjectives: string[];
  };
}

interface ListBody {
  message: string;
  data: ListItem[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
  error: unknown;
}

describeWithDb('GET /api/educator-simulations/my-library/list (HTTP + Postgres)', () => {
  let dataSource: DataSource;
  let app: INestApplication;
  let educatorToken: string;
  let adminToken: string;
  let signTokenFn: (user?: object) => string;
  const educatorId = TEST_USERS.educator.educatorId;
  /** `educator_simulations.id` per seeded scenario, for the educator under test. */
  const rowIds: Record<string, string> = {};

  const httpServer = (): Parameters<typeof request>[0] => {
    const server: unknown = app.getHttpServer();
    return server as Parameters<typeof request>[0];
  };

  const cleanup = async (): Promise<void> => {
    await dataSource.query(`DELETE FROM educator_simulations WHERE scenario_id LIKE '${MARKER}%'`);
    await dataSource.query(`DELETE FROM simulations_v2 WHERE id LIKE '${MARKER}%'`);
    await dataSource.query(`DELETE FROM units WHERE id LIKE '${MARKER}%'`);
  };

  const seed = async (): Promise<void> => {
    await dataSource.getRepository(SimulationV2).save([
      {
        id: `${MARKER}beta`,
        title: 'beta Mobility',
        status: 'published',
        unitId: `${MARKER}unit`,
        description: 'Beta description',
        learnerLevel: 'High School Health Science',
        difficulty: 'Beginner',
        // A blank `estimatedDuration` is null; the time allotment is its own field, not a fallback.
        estimatedDuration: '   ',
        studentBriefing: { timeAllotment: '30 minutes' },
        // JSONB array form, with a blank entry that must be dropped.
        learningObjective: [' Beta one ', '', 'Beta two'],
      },
      {
        id: `${MARKER}alpha`,
        title: 'Alpha Care',
        status: 'published',
        unitId: `${MARKER}unit`,
        description: 'Alpha text',
        estimatedDuration: '45 minutes',
        studentBriefing: { timeAllotment: '50 minutes' },
        scenarioImage: 'https://cdn.example.com/alpha.png',
        avatarEnabled: true,
        productSetup: { title: 'Alpha Product' },
        // A title left behind after the setup is no longer required is still shown.
        requiresProductSetup: false,
        department: 'Medical-Surgical Unit',
        // JSONB string form: one objective per line.
        learningObjective: 'Recognise arrest\n Start CPR \n\n',
      },
      // Null status counts as visible.
      {
        id: `${MARKER}charlie`,
        title: 'Charlie Null Status',
        status: undefined,
        unitId: `${MARKER}gone-unit`,
      },
      { id: `${MARKER}draft`, title: 'Aardvark Draft', status: 'draft' },
      { id: `${MARKER}archived`, title: 'Aardvark Archived', status: ' ARCHIVED ' },
      { id: `${MARKER}removed`, title: 'Aardvark Removed', status: 'published' },
      {
        id: `${MARKER}deleted`,
        title: 'Aardvark Deleted',
        status: 'published',
        deletedAt: new Date(),
      },
      { id: `${MARKER}theirs`, title: 'Aardvark Theirs', status: 'published' },
      // A retired version and the live one share a business id: only the live one may show.
      {
        id: `${MARKER}twin`,
        title: 'Delta Twin',
        status: 'published',
        unitId: `${MARKER}retired-unit`,
      },
      {
        id: `${MARKER}twin`,
        title: 'Aardvark Twin Old',
        status: 'published',
        deletedAt: new Date(),
      },
    ]);

    await dataSource.getRepository(Unit).save([
      {
        id: `${MARKER}unit`,
        name: `${MARKER}Adult Health`,
        imageUrl: 'https://cdn.example.com/unit.png',
      },
      { id: `${MARKER}retired-unit`, name: `${MARKER}Retired`, deletedAt: new Date() },
    ]);

    const repo = dataSource.getRepository(EducatorSimulation);
    const save = async (
      owner: string,
      scenario: string,
      createdAt: string,
      deletedAt: Date | null = null,
      unitId = `${MARKER}unit`,
    ): Promise<string> => {
      const row = await repo.save({
        educator_id: owner,
        unit_id: unitId,
        scenario_id: `${MARKER}${scenario}`,
        deleted_at: deletedAt,
      });
      await dataSource.query(`UPDATE educator_simulations SET created_at = $1 WHERE id = $2`, [
        createdAt,
        row.id,
      ]);
      return row.id;
    };

    // Saved newest-first, so title order and saved-time order disagree.
    rowIds.charlie = await save(
      educatorId,
      'charlie',
      '2026-01-03T00:00:00Z',
      null,
      `${MARKER}gone-unit`,
    );
    rowIds.beta = await save(educatorId, 'beta', '2026-01-02T00:00:00Z');
    rowIds.alpha = await save(educatorId, 'alpha', '2026-01-01T00:00:00Z');
    await save(educatorId, 'draft', '2026-01-04T00:00:00Z');
    await save(educatorId, 'archived', '2026-01-04T00:00:00Z');
    await save(educatorId, 'removed', '2026-01-04T00:00:00Z', new Date());
    await save(educatorId, 'deleted', '2026-01-04T00:00:00Z');
    await save(educatorId, 'missing', '2026-01-04T00:00:00Z');
    rowIds.twin = await save(
      educatorId,
      'twin',
      '2026-01-04T00:00:00Z',
      null,
      `${MARKER}retired-unit`,
    );
    await save(OTHER_EDUCATOR_ID, 'theirs', '2026-01-04T00:00:00Z');
    await save(OTHER_EDUCATOR_ID, 'alpha', '2026-01-04T00:00:00Z');
  };

  const get = (token?: string): request.Test => {
    const req = request(httpServer()).get(ROUTE);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  beforeAll(async () => {
    dataSource = new DataSource({ ...databseConfig, synchronize: false, logging: false });
    await dataSource.initialize();
    await cleanup();

    // The exact totals below assume the synthetic test educator has no saved entries of its own.
    const [{ count }] = (await dataSource.query(
      `SELECT COUNT(*)::int AS count FROM educator_simulations WHERE educator_id = $1`,
      [educatorId],
    )) as { count: number }[];
    if (count > 0) {
      throw new Error(
        `Test educator ${educatorId} already has ${count} saved library entries; use a clean test database.`,
      );
    }

    ({ app, signToken: signTokenFn } = await buildTestApp({
      controllers: [EducatorSimulationsController],
      providers: [
        EducatorSimulationsService,
        {
          provide: EDUCATOR_SIMULATION_REPOSITORY,
          useValue: new EducatorSimulationRepository(dataSource.getRepository(EducatorSimulation)),
        },
        { provide: UNIT_REPOSITORY, useValue: { find: jest.fn().mockResolvedValue([]) } },
        { provide: SIMULATION_V2_REPOSITORY, useValue: { find: jest.fn().mockResolvedValue([]) } },
      ],
    }));
    educatorToken = signTokenFn(TEST_USERS.educator);
    adminToken = signTokenFn(TEST_USERS.districtAdmin);
  });

  afterAll(async () => {
    await cleanup();
    await app?.close();
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  describe('access', () => {
    it('returns 401 without a token', async () => {
      await get().expect(401);
    });

    it('returns 403 for a role other than Educator', async () => {
      await get(adminToken).expect(403);
    });
  });

  describe('query parameters other than page, pageSize and lite', () => {
    // Refused, not ignored: `ls` (the library screen sends it to the old route) and unknown or invalid params must not silently do nothing.
    it.each(['?ls=en', '?foo=bar', '?modality=Simulation'])(
      'refuses %s with a 400',
      async (query) => {
        await request(httpServer())
          .get(`${ROUTE}${query}`)
          .set('Authorization', `Bearer ${educatorToken}`)
          .expect(400);
      },
    );
  });

  describe('an Educator with saved simulations', () => {
    beforeAll(seed);
    afterAll(cleanup);

    it('returns the first page with meta and the full item', async () => {
      const res = await get(educatorToken).expect(200);
      const body = res.body as ListBody;

      expect(body.error).toBeNull();
      expect(body.meta).toEqual({
        total: 4,
        page: 1,
        pageSize: 10,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      });
      expect(body.data[0]).toEqual({
        id: rowIds.alpha,
        unitId: `${MARKER}unit`,
        unit: {
          id: `${MARKER}unit`,
          name: `${MARKER}Adult Health`,
          imageUrl: 'https://cdn.example.com/unit.png',
        },
        scenario: {
          id: `${MARKER}alpha`,
          title: 'Alpha Care',
          description: 'Alpha text',
          learnerLevel: null,
          difficulty: null,
          estimatedDuration: '45 minutes',
          timeAllotment: '50 minutes',
          scenarioImage: 'https://cdn.example.com/alpha.png',
          avatarEnabled: true,
          productName: 'Alpha Product',
          clinicalSetting: 'Medical-Surgical Unit',
          learningObjectives: ['Recognise arrest', 'Start CPR'],
        },
      });
    });

    it('sends a blank estimate as null and the time allotment as its own field, and defaults the optional full fields', async () => {
      const res = await get(educatorToken).expect(200);
      const [, beta] = (res.body as ListBody).data;

      expect(beta).toMatchObject({
        id: rowIds.beta,
        scenario: {
          estimatedDuration: null,
          timeAllotment: '30 minutes',
          scenarioImage: null,
          avatarEnabled: false,
          productName: null,
          clinicalSetting: null,
          learningObjectives: ['Beta one', 'Beta two'],
        },
      });
    });

    it('sends a null unit when the unit is missing or soft-deleted, and still lists the entry', async () => {
      const res = await get(educatorToken).expect(200);
      const items = (res.body as ListBody).data;
      const charlie = items.find((item) => item.id === rowIds.charlie);
      const twin = items.find((item) => item.id === rowIds.twin);

      expect(charlie).toMatchObject({ unitId: `${MARKER}gone-unit`, unit: null });
      expect(twin).toMatchObject({ unitId: `${MARKER}retired-unit`, unit: null });
    });

    it("shows the Simulation's current unit, not the unit saved with the entry", async () => {
      // The Simulation was moved to another unit after the entry was saved: the saved copy is stale.
      await dataSource.query(`UPDATE educator_simulations SET unit_id = $1 WHERE id = $2`, [
        `${MARKER}stale-unit`,
        rowIds.alpha,
      ]);
      try {
        const res = await get(educatorToken).expect(200);
        const alpha = (res.body as ListBody).data.find((item) => item.id === rowIds.alpha);

        expect(alpha).toMatchObject({
          unitId: `${MARKER}unit`,
          unit: { id: `${MARKER}unit`, name: `${MARKER}Adult Health` },
        });
      } finally {
        await dataSource.query(`UPDATE educator_simulations SET unit_id = $1 WHERE id = $2`, [
          `${MARKER}unit`,
          rowIds.alpha,
        ]);
      }
    });

    it('sends an empty unitId and a null unit when the Simulation has no current unit', async () => {
      await dataSource.query(
        `UPDATE simulations_v2 SET unit_id = NULL WHERE id = $1 AND deleted_at IS NULL`,
        [`${MARKER}beta`],
      );
      try {
        const res = await get(educatorToken).expect(200);
        const beta = (res.body as ListBody).data.find((item) => item.id === rowIds.beta);

        expect(beta).toMatchObject({ unitId: '', unit: null });
      } finally {
        await dataSource.query(
          `UPDATE simulations_v2 SET unit_id = $1 WHERE id = $2 AND deleted_at IS NULL`,
          [`${MARKER}unit`, `${MARKER}beta`],
        );
      }
    });

    it('orders by case-insensitive title', async () => {
      const res = await get(educatorToken).expect(200);
      const titles = (res.body as ListBody).data.map((item) => item.scenario.title);

      expect(titles).toEqual(['Alpha Care', 'beta Mobility', 'Charlie Null Status', 'Delta Twin']);
    });

    it('leaves out draft, archived, removed, soft-deleted, missing and other educators entries, and shows a re-versioned simulation once', async () => {
      const res = await get(educatorToken).expect(200);
      const ids = (res.body as ListBody).data.map((item) => item.scenario.id);

      expect(ids).toEqual([`${MARKER}alpha`, `${MARKER}beta`, `${MARKER}charlie`, `${MARKER}twin`]);
    });
  });

  describe('an Educator with an empty My Library', () => {
    beforeAll(async () => {
      await cleanup();
    });

    it('returns an empty first page with zero totals', async () => {
      const res = await get(educatorToken).expect(200);
      const body = res.body as ListBody;

      expect(body.data).toEqual([]);
      expect(body.meta).toEqual({
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
        hasNextPage: false,
        hasPrevPage: false,
      });
    });
  });

  describe('paging', () => {
    const TIE_TITLE = 'Tie Title';
    const distinctTitles = Array.from(
      { length: 12 },
      (_, i) => `Sim ${String(i + 1).padStart(2, '0')}`,
    );
    /** Scenario ids in the order the route must return them: titles A-Z, ties by entry id. */
    let expectedOrder: string[] = [];

    beforeAll(async () => {
      await cleanup();
      const sims = dataSource.getRepository(SimulationV2);
      const entries = dataSource.getRepository(EducatorSimulation);
      const tieKeys = ['tie-a', 'tie-b', 'tie-c'];

      await sims.save([
        ...distinctTitles.map((title, i) => ({
          id: `${MARKER}page-${i}`,
          title,
          status: 'published',
          unitId: `${MARKER}unit`,
        })),
        ...tieKeys.map((key) => ({
          id: `${MARKER}${key}`,
          title: TIE_TITLE,
          status: 'published',
          unitId: `${MARKER}unit`,
        })),
      ]);

      const saved: { scenario: string; entryId: string; title: string }[] = [];
      for (const [i, title] of distinctTitles.entries()) {
        const row = await entries.save({
          educator_id: educatorId,
          unit_id: `${MARKER}unit`,
          scenario_id: `${MARKER}page-${i}`,
        });
        saved.push({ scenario: `${MARKER}page-${i}`, entryId: row.id, title });
      }
      for (const key of tieKeys) {
        const row = await entries.save({
          educator_id: educatorId,
          unit_id: `${MARKER}unit`,
          scenario_id: `${MARKER}${key}`,
        });
        saved.push({ scenario: `${MARKER}${key}`, entryId: row.id, title: TIE_TITLE });
      }
      // Bulk add stamps rows with the same moment: only the entry id can order the ties.
      await dataSource.query(
        `UPDATE educator_simulations SET created_at = '2026-02-01T00:00:00Z'
         WHERE scenario_id LIKE '${MARKER}%'`,
      );

      expectedOrder = [...saved]
        .sort((a, b) =>
          a.title.toLowerCase() !== b.title.toLowerCase()
            ? a.title.toLowerCase().localeCompare(b.title.toLowerCase())
            : a.entryId.localeCompare(b.entryId),
        )
        .map((entry) => entry.scenario);
    });

    afterAll(cleanup);

    const page = async (query: string): Promise<ListBody> => {
      const res = await request(httpServer())
        .get(`${ROUTE}?${query}`)
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);
      return res.body as ListBody;
    };

    it('returns a middle page with the right items and meta', async () => {
      const body = await page('page=2&pageSize=4');

      expect(body.data.map((item) => item.scenario.id)).toEqual(expectedOrder.slice(4, 8));
      expect(body.meta).toEqual({
        total: 15,
        page: 2,
        pageSize: 4,
        totalPages: 4,
        hasNextPage: true,
        hasPrevPage: true,
      });
    });

    it('returns a partial last page with no next page', async () => {
      const body = await page('page=4&pageSize=4');

      expect(body.data.map((item) => item.scenario.id)).toEqual(expectedOrder.slice(12));
      expect(body.meta).toEqual({
        total: 15,
        page: 4,
        pageSize: 4,
        totalPages: 4,
        hasNextPage: false,
        hasPrevPage: true,
      });
    });

    it('reports no next page on a full last page when the total is an exact multiple', async () => {
      const body = await page('page=3&pageSize=5');

      expect(body.data.map((item) => item.scenario.id)).toEqual(expectedOrder.slice(10));
      expect(body.meta).toEqual({
        total: 15,
        page: 3,
        pageSize: 5,
        totalPages: 3,
        hasNextPage: false,
        hasPrevPage: true,
      });
    });

    it('returns an empty page with correct totals past the last page', async () => {
      const body = await page('page=5&pageSize=4');

      expect(body.data).toEqual([]);
      expect(body.meta).toEqual({
        total: 15,
        page: 5,
        pageSize: 4,
        totalPages: 4,
        hasNextPage: false,
        hasPrevPage: true,
      });
    });

    it('returns an empty page, not an error, at the highest accepted page', async () => {
      const body = await page('page=100000&pageSize=50');

      expect(body.data).toEqual([]);
      expect(body.meta).toMatchObject({ total: 15, page: 100000, hasNextPage: false });
    });

    it('accepts the maximum page size of 50 and returns the full item on every row', async () => {
      const body = await page('pageSize=50');

      expect(body.data).toHaveLength(15);
      expect(body.meta.pageSize).toBe(50);
      expect(body.meta.totalPages).toBe(1);
      for (const item of body.data) {
        expect(item).toMatchObject({ unitId: `${MARKER}unit`, unit: null });
        expect(item.scenario).toHaveProperty('avatarEnabled', false);
      }
    });

    it.each([
      'pageSize=51',
      'pageSize=0',
      'pageSize=-5',
      'pageSize=abc',
      'pageSize=2.5',
      'page=0',
      'page=-1',
      'page=abc',
      'page=1.5',
      'page=100001',
      'page=1000000000000000000',
    ])('refuses %s with a 400', async (query) => {
      await request(httpServer())
        .get(`${ROUTE}?${query}`)
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(400);
    });

    it.each([1, 4, 7])(
      'walking every page at pageSize %i returns each saved simulation exactly once, in order',
      async (pageSize) => {
        const first = await page(`page=1&pageSize=${pageSize}`);
        const seen: string[] = first.data.map((item) => item.scenario.id);
        for (let p = 2; p <= first.meta.totalPages; p += 1) {
          const next = await page(`page=${p}&pageSize=${pageSize}`);
          seen.push(...next.data.map((item) => item.scenario.id));
        }

        expect(new Set(seen).size).toBe(seen.length);
        expect(seen).toEqual(expectedOrder);
      },
    );
  });

  describe('lite flag', () => {
    beforeAll(seed);
    afterAll(cleanup);

    const lite = (query: string): request.Test =>
      request(httpServer()).get(`${ROUTE}${query}`).set('Authorization', `Bearer ${educatorToken}`);

    it('returns the light item shape for lite=true', async () => {
      const res = await lite('?lite=true').expect(200);
      const body = res.body as ListBody;

      expect(body.meta.total).toBe(4);
      expect(body.data[0]).toEqual({
        id: rowIds.alpha,
        scenario: {
          id: `${MARKER}alpha`,
          title: 'Alpha Care',
          description: 'Alpha text',
          learnerLevel: null,
          difficulty: null,
          avatarEnabled: true,
        },
      });
    });

    it.each(['', '?lite=false'])('serves the full item for %p', async (query) => {
      const res = await lite(query).expect(200);
      const body = res.body as ListBody;

      expect(body.meta.total).toBe(4);
      expect(body.data.map((item) => item.scenario.id)).toEqual([
        `${MARKER}alpha`,
        `${MARKER}beta`,
        `${MARKER}charlie`,
        `${MARKER}twin`,
      ]);
      expect(body.data[0]).toMatchObject({
        id: rowIds.alpha,
        unitId: `${MARKER}unit`,
        scenario: { title: 'Alpha Care', productName: 'Alpha Product' },
      });
    });

    it('pages the lite response like any other', async () => {
      const res = await lite('?lite=true&page=2&pageSize=3').expect(200);
      const body = res.body as ListBody;

      expect(body.data.map((item) => item.scenario.id)).toEqual([`${MARKER}twin`]);
      expect(body.meta).toEqual({
        total: 4,
        page: 2,
        pageSize: 3,
        totalPages: 2,
        hasNextPage: false,
        hasPrevPage: true,
      });
    });

    it('accepts the maximum page size of 50 on the lite response', async () => {
      const res = await lite('?lite=true&pageSize=50').expect(200);
      const body = res.body as ListBody;

      expect(body.data).toHaveLength(4);
      expect(body.meta.pageSize).toBe(50);
    });

    it.each(['pageSize=51', 'pageSize=500'])(
      'refuses lite=true with %s (above the maximum of 50) with a 400',
      async (query) => {
        await lite(`?lite=true&${query}`).expect(400);
      },
    );

    it.each(['?lite=abc', '?lite=1', '?lite='])('refuses %s with a 400', async (query) => {
      await lite(query).expect(400);
    });
  });
});
