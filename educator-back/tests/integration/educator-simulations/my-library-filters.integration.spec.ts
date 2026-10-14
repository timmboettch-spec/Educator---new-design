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

const MARKER = 'MYLIBFILT-TEST-';
const OTHER_EDUCATOR_ID = '550e8400-e29b-41d4-a716-4466554400bb';
const ROUTE = '/api/educator-simulations/my-library/list';

interface ListItem {
  id: string;
  unitId: string;
  scenario: { id: string; title: string };
}

interface ListBody {
  data: ListItem[];
  meta: { total: number; page: number; pageSize: number; totalPages: number };
}

/**
 * Library filters and search (RE-242), HTTP + real Postgres. Owns its own Educator so it cannot
 * collide with the paged-list suite's empty-library assertions when suites run in parallel.
 */
describeWithDb('GET /api/educator-simulations/my-library/list filters (HTTP + Postgres)', () => {
  let dataSource: DataSource;
  let app: INestApplication;
  let educatorToken: string;
  const educatorId = TEST_USERS.secondEducator.educatorId;
  const id = (key: string): string => `${MARKER}${key}`;

  const httpServer = (): Parameters<typeof request>[0] => {
    const server: unknown = app.getHttpServer();
    return server as Parameters<typeof request>[0];
  };

  /** Sends the query and returns the response body, scenario keys without the marker prefix. */
  const list = async (query = '', status = 200): Promise<ListBody> => {
    const res = await request(httpServer())
      .get(`${ROUTE}${query}`)
      .set('Authorization', `Bearer ${educatorToken}`)
      .expect(status);
    return res.body as ListBody;
  };
  const keys = (body: ListBody): string[] =>
    body.data.map((item) => item.scenario.id.replace(MARKER, ''));

  const cleanup = async (): Promise<void> => {
    await dataSource.query(`DELETE FROM educator_simulations WHERE scenario_id LIKE '${MARKER}%'`);
    await dataSource.query(`DELETE FROM simulations_v2 WHERE id LIKE '${MARKER}%'`);
    await dataSource.query(`DELETE FROM units WHERE id LIKE '${MARKER}%'`);
  };

  const seed = async (): Promise<void> => {
    await dataSource.getRepository(Unit).save([
      { id: id('u1'), name: `${MARKER}Alpha Unit` },
      { id: id('u2'), name: `${MARKER}Beta Unit` },
    ]);

    await dataSource.getRepository(SimulationV2).save([
      {
        id: id('cardiac'),
        title: 'Cardiac Arrest Response',
        status: 'published',
        unitId: id('u1'),
        learnerLevel: 'High School Allied Health',
        difficulty: 'Easy',
        avatarEnabled: true,
        productSetup: { title: 'Knee Set' },
      },
      // Inner runs of spaces in the stored title must not defeat a search.
      {
        id: id('stroke'),
        title: 'Stroke   Care Pathway',
        status: 'published',
        unitId: id('u1'),
        learnerLevel: 'Post-Secondary Nursing',
        difficulty: 'Medium',
        avatarEnabled: false,
        productSetup: { title: 'knee  set ' },
      },
      {
        id: id('dose'),
        title: '50% Dose Check',
        status: 'published',
        unitId: id('u2'),
        learnerLevel: 'BSN',
        difficulty: 'hard',
        avatarEnabled: false,
        productSetup: { title: 'Manikin' },
        // A title left behind after the setup is no longer required still counts.
        requiresProductSetup: false,
      },
      {
        id: id('under'),
        title: 'Under_score Case',
        status: 'published',
        unitId: id('u2'),
        difficulty: 'Medium',
        avatarEnabled: true,
        productSetup: { title: 'none' },
      },
      {
        id: id('wound'),
        // The backslash proves a literal backslash in a title is searchable.
        title: 'Wound Care\\Basics',
        status: 'published',
        unitId: id('u2'),
        learnerLevel: 'High School Nursing',
        difficulty: 'Easy',
      },
      // Never listed, whatever the search: they all contain "cardiac".
      { id: id('draft'), title: 'Cardiac Draft', status: 'draft' },
      { id: id('archived'), title: 'Cardiac Archived', status: ' ARCHIVED ' },
      { id: id('removed'), title: 'Cardiac Removed', status: 'published' },
      { id: id('theirs'), title: 'Cardiac Theirs', status: 'published' },
      {
        id: id('deleted'),
        title: 'Cardiac Deleted',
        status: 'published',
        deletedAt: new Date(),
      },
    ]);

    const entries = dataSource.getRepository(EducatorSimulation);
    const save = (owner: string, key: string, unit: string, deletedAt: Date | null = null) =>
      entries.save({
        educator_id: owner,
        unit_id: unit,
        scenario_id: id(key),
        deleted_at: deletedAt,
      });
    await save(educatorId, 'cardiac', id('u1'));
    await save(educatorId, 'stroke', id('u1'));
    await save(educatorId, 'dose', id('u2'));
    await save(educatorId, 'under', id('u2'));
    await save(educatorId, 'wound', id('u2'));
    await save(educatorId, 'draft', id('u1'));
    await save(educatorId, 'archived', id('u1'));
    await save(educatorId, 'removed', id('u1'), new Date());
    await save(educatorId, 'deleted', id('u1'));
    await save(OTHER_EDUCATOR_ID, 'theirs', id('u1'));
    await save(OTHER_EDUCATOR_ID, 'cardiac', id('u1'));
  };

  beforeAll(async () => {
    dataSource = new DataSource({ ...databseConfig, synchronize: false, logging: false });
    await dataSource.initialize();
    await cleanup();

    const [{ count }] = (await dataSource.query(
      `SELECT COUNT(*)::int AS count FROM educator_simulations WHERE educator_id = $1`,
      [educatorId],
    )) as { count: number }[];
    if (count > 0) {
      throw new Error(
        `Test educator ${educatorId} already has ${count} saved library entries; use a clean test database.`,
      );
    }

    let signToken: (user?: object) => string;
    ({ app, signToken } = await buildTestApp({
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
    educatorToken = signToken(TEST_USERS.secondEducator);
    await seed();
  });

  afterAll(async () => {
    await cleanup();
    await app?.close();
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  const everything = ['dose', 'cardiac', 'stroke', 'under', 'wound'];

  describe('no filters', () => {
    it('returns the whole visible library in title order, as before filters existed', async () => {
      const body = await list();

      expect(keys(body)).toEqual(everything);
      expect(body.meta.total).toBe(5);
    });
  });

  describe('search', () => {
    it('finds part of a title, ignoring case', async () => {
      expect(keys(await list('?search=cardiac'))).toEqual(['cardiac']);
      expect(keys(await list('?search=CARDIAC%20arrest'))).toEqual(['cardiac']);
    });

    it('ignores extra spaces in the query and in the stored title', async () => {
      expect(keys(await list('?search=stroke%20care'))).toEqual(['stroke']);
      expect(keys(await list('?search=%20%20care%20%20'))).toEqual(['stroke', 'wound']);
      expect(keys(await list('?search=stroke%20%20%20care'))).toEqual(['stroke']);
    });

    it('matches % _ and \\ literally', async () => {
      expect(keys(await list('?search=50%25'))).toEqual(['dose']);
      expect(keys(await list('?search=%25'))).toEqual(['dose']);
      expect(keys(await list('?search=_'))).toEqual(['under']);
      expect(keys(await list('?search=%5C'))).toEqual(['wound']);
      expect(keys(await list('?search=care%5Cbasics'))).toEqual(['wound']);
    });

    it.each(['', '%20', '%20%20%09'])('treats a blank search (%p) as no search', async (value) => {
      const body = await list(`?search=${value}`);

      expect(keys(body)).toEqual(everything);
      expect(body.meta.total).toBe(5);
    });

    it('returns an empty list with a count of 0 when nothing matches', async () => {
      const body = await list('?search=zzzz-no-such-title');

      expect(body.data).toEqual([]);
      expect(body.meta).toMatchObject({ total: 0, totalPages: 0 });
    });

    it('does not search the description', async () => {
      await dataSource.query(
        `UPDATE simulations_v2 SET description = 'findmeinhere' WHERE id = $1`,
        [id('wound')],
      );

      expect(keys(await list('?search=findmeinhere'))).toEqual([]);
    });

    it('counts and pages within the searched set', async () => {
      const first = await list('?search=care&pageSize=1');
      const second = await list('?search=care&pageSize=1&page=2');
      const beyond = await list('?search=care&pageSize=1&page=3');

      expect(keys(first)).toEqual(['stroke']);
      expect(first.meta).toMatchObject({ total: 2, totalPages: 2 });
      expect(keys(second)).toEqual(['wound']);
      expect(beyond.data).toEqual([]);
      expect(beyond.meta.total).toBe(2);
    });

    it('works with the lite variant, which keeps its light shape', async () => {
      const body = await list('?search=care&lite=true');

      expect(keys(body)).toEqual(['stroke', 'wound']);
      expect(Object.keys(body.data[0]).sort()).toEqual(['id', 'scenario']);
    });

    it('never lists draft, archived, removed, deleted or other Educators entries', async () => {
      // Every one of those titles contains "cardiac"; only the live, saved one may appear.
      expect(keys(await list('?search=cardiac'))).toEqual(['cardiac']);
    });

    it('accepts the longest search and refuses a longer one', async () => {
      await list(`?search=${'a'.repeat(100)}`, 200);
      await list(`?search=${'a'.repeat(101)}`, 400);
    });
  });
  describe('modality', () => {
    it('Avatar returns avatar simulations only', async () => {
      expect(keys(await list('?modality=Avatar'))).toEqual(['cardiac', 'under']);
    });

    it('Workstation returns simulations that are not avatar, including a missing flag', async () => {
      // Never the draft, archived, removed, deleted or another Educator's entries.
      expect(keys(await list('?modality=Workstation'))).toEqual(['dose', 'stroke', 'wound']);
    });

    it('both values together match everything', async () => {
      expect(keys(await list('?modality=Avatar&modality=Workstation'))).toEqual(everything);
    });

    it('reads a repeated value once and still refuses an unknown one', async () => {
      expect(keys(await list('?modality=Avatar&modality=Avatar&modality=Avatar'))).toEqual(
        keys(await list('?modality=Avatar')),
      );
      await list('?modality=Avatar&modality=Workstation&modality=Hybrid', 400);
    });

    it.each(['Hybrid', 'avatar', 'WORKSTATION'])('refuses %p with a 400', async (value) => {
      await list(`?modality=${value}`, 400);
    });
  });

  describe('difficulty', () => {
    it('matches one value, trimming the request and ignoring the case stored in the data', async () => {
      expect(keys(await list('?difficulty=Easy'))).toEqual(['cardiac', 'wound']);
      expect(keys(await list('?difficulty=%20Easy%20'))).toEqual(['cardiac', 'wound']);
      // `dose` is stored as `hard`.
      expect(keys(await list('?difficulty=Hard'))).toEqual(['dose']);
    });

    it('matches any of several values', async () => {
      expect(keys(await list('?difficulty=Easy&difficulty=Medium'))).toEqual([
        'cardiac',
        'stroke',
        'under',
        'wound',
      ]);
    });

    it('matches a stored difficulty that has odd case and surrounding spaces', async () => {
      await dataSource.getRepository(SimulationV2).save({
        id: id('spacey'),
        title: 'Spacey Difficulty Sim',
        status: 'published',
        difficulty: '  eAsY ',
      });
      await dataSource
        .getRepository(EducatorSimulation)
        .save({ educator_id: educatorId, unit_id: id('u1'), scenario_id: id('spacey') });
      try {
        expect(keys(await list('?difficulty=Easy'))).toEqual(['cardiac', 'spacey', 'wound']);
      } finally {
        await dataSource.query(`DELETE FROM educator_simulations WHERE scenario_id = $1`, [
          id('spacey'),
        ]);
        await dataSource.query(`DELETE FROM simulations_v2 WHERE id = $1`, [id('spacey')]);
      }
    });

    it.each(['Impossible', 'easy', 'HARD', 'Very%20Hard'])(
      'refuses %s, which is not exactly Easy, Medium or Hard',
      async (value) => {
        await list(`?difficulty=${value}`, 400);
      },
    );

    it('returns an empty list with a count of 0 for a valid value nothing has', async () => {
      const body = await list(`?difficulty=Hard&unitId=${id('u1')}`);

      expect(body.data).toEqual([]);
      expect(body.meta).toMatchObject({ total: 0, totalPages: 0 });
    });

    it('treats an empty or blank parameter as no filter and drops a blank entry among values', async () => {
      expect(keys(await list('?difficulty='))).toEqual(everything);
      expect(keys(await list('?difficulty=%20'))).toEqual(everything);
      expect(keys(await list('?difficulty=&difficulty=%20'))).toEqual(everything);
      expect(keys(await list('?difficulty=Easy&difficulty='))).toEqual(
        keys(await list('?difficulty=Easy')),
      );
      expect(keys(await list('?modality=&modality=Avatar'))).toEqual(
        keys(await list('?modality=Avatar')),
      );
    });
  });

  describe('unitId', () => {
    it('matches a moved Simulation by its current unit, not the unit saved with the entry', async () => {
      // `cardiac` now belongs to u1; the copy saved with the entry still says u2.
      await dataSource.query(
        `UPDATE educator_simulations SET unit_id = $1 WHERE scenario_id = $2 AND educator_id = $3`,
        [id('u2'), id('cardiac'), educatorId],
      );
      try {
        expect(keys(await list(`?unitId=${id('u1')}`))).toEqual(['cardiac', 'stroke']);
        expect(keys(await list(`?unitId=${id('u2')}`))).not.toContain('cardiac');
      } finally {
        await dataSource.query(
          `UPDATE educator_simulations SET unit_id = $1 WHERE scenario_id = $2 AND educator_id = $3`,
          [id('u1'), id('cardiac'), educatorId],
        );
      }
    });

    it("matches the Simulation's current unit", async () => {
      expect(keys(await list(`?unitId=${id('u1')}`))).toEqual(['cardiac', 'stroke']);
    });

    it('matches any of several units', async () => {
      expect(keys(await list(`?unitId=${id('u1')}&unitId=${id('u2')}`))).toEqual(everything);
    });

    it('returns an empty list for an unknown unit', async () => {
      const body = await list('?unitId=no-such-unit');

      expect(body.data).toEqual([]);
      expect(body.meta.total).toBe(0);
    });
  });

  describe('combining', () => {
    it('requires every filter to match', async () => {
      expect(keys(await list('?modality=Avatar&difficulty=Easy'))).toEqual(['cardiac']);
      expect(keys(await list(`?difficulty=Easy&unitId=${id('u2')}`))).toEqual(['wound']);
      expect(keys(await list('?modality=Avatar&difficulty=Hard'))).toEqual([]);
    });

    it('combines with search', async () => {
      expect(keys(await list('?search=care&modality=Workstation'))).toEqual(['stroke', 'wound']);
      expect(keys(await list('?search=care&difficulty=Easy'))).toEqual(['wound']);
    });

    it('counts and pages within the filtered set', async () => {
      const first = await list('?modality=Workstation&pageSize=2');
      const second = await list('?modality=Workstation&pageSize=2&page=2');

      expect(keys(first)).toEqual(['dose', 'stroke']);
      expect(first.meta).toMatchObject({ total: 3, totalPages: 2 });
      expect(keys(second)).toEqual(['wound']);
    });

    it('applies to the lite variant too', async () => {
      const body = await list('?modality=Avatar&lite=true');

      expect(keys(body)).toEqual(['cardiac', 'under']);
      expect(Object.keys(body.data[0]).sort()).toEqual(['id', 'scenario']);
    });
  });

  describe('value limits', () => {
    it('accepts 20 values and refuses 21', async () => {
      const many = (n: number): string =>
        Array.from({ length: n }, (_, i) => `targetAudience=d${i}`).join('&');

      await list(`?${many(20)}`, 200);
      await list(`?${many(21)}`, 400);
    });

    it('accepts a 255-character value and refuses 256', async () => {
      await list(`?targetAudience=${'a'.repeat(255)}`, 200);
      await list(`?targetAudience=${'a'.repeat(256)}`, 400);
    });
  });
  describe('learnerLevel', () => {
    it('Secondary returns simulations whose audience is high school or secondary', async () => {
      expect(keys(await list('?learnerLevel=Secondary'))).toEqual(['cardiac', 'wound']);
    });

    it('Post-Secondary returns post-secondary and any other non-empty audience such as BSN', async () => {
      expect(keys(await list('?learnerLevel=Post-Secondary'))).toEqual(['dose', 'stroke']);
    });

    it('both levels return every simulation that has audience text, and none without', async () => {
      // `under` has no audience text, so it matches neither level.
      expect(keys(await list('?learnerLevel=Secondary&learnerLevel=Post-Secondary'))).toEqual([
        'dose',
        'cardiac',
        'stroke',
        'wound',
      ]);
    });

    it.each(['secondary', 'Primary', 'Post Secondary', 'POST-SECONDARY'])(
      'refuses %p with a 400',
      async (value) => {
        await list(`?learnerLevel=${encodeURIComponent(value)}`, 400);
      },
    );

    describe('bucket rule on edge values', () => {
      const probes: [string, string | null, 'Secondary' | 'Post-Secondary' | null][] = [
        ['p1', 'High School', 'Secondary'],
        ['p2', 'Secondary School', 'Secondary'],
        ['p3', 'Post Secondary Health', 'Post-Secondary'],
        ['p4', 'post-secondary', 'Post-Secondary'],
        ['p5', 'POSTSECONDARY Nursing', 'Post-Secondary'],
        ['p6', 'PA/PT', 'Post-Secondary'],
        ['p7', 'Allied Health', 'Post-Secondary'],
        ['p8', 'Secondary and Post-Secondary mix', 'Post-Secondary'],
        ['p9', ' \t ', null],
        ['p10', null, null],
        ['p11', 'Post\u2013Secondary Nursing', 'Post-Secondary'],
        ['p12', 'Post - Secondary', 'Post-Secondary'],
        ['p13', 'post/secondary', 'Post-Secondary'],
        ['p14', 'High  School', 'Secondary'],
        ['p15', '\u00a0\u00a0', null],
      ];

      beforeAll(async () => {
        await dataSource.getRepository(SimulationV2).save(
          probes.map(([key, level]) => ({
            id: id(key),
            title: `Bucket Probe ${key}`,
            status: 'published',
            learnerLevel: level ?? undefined,
          })),
        );
        await dataSource.getRepository(EducatorSimulation).save(
          probes.map(([key]) => ({
            educator_id: educatorId,
            unit_id: id('u1'),
            scenario_id: id(key),
          })),
        );
      });

      afterAll(async () => {
        await dataSource.query(
          `DELETE FROM educator_simulations WHERE scenario_id = ANY($1::text[])`,
          [probes.map(([key]) => id(key))],
        );
        await dataSource.query(`DELETE FROM simulations_v2 WHERE id = ANY($1::text[])`, [
          probes.map(([key]) => id(key)),
        ]);
      });

      it.each(['Secondary', 'Post-Secondary'] as const)(
        'files %s probes correctly',
        async (level) => {
          const expected = probes.filter(([, , bucket]) => bucket === level).map(([key]) => key);

          const body = await list(`?search=bucket%20probe&learnerLevel=${level}&pageSize=50`);

          expect(keys(body).sort()).toEqual([...expected].sort());
        },
      );
    });
  });

  describe('targetAudience', () => {
    it('matches the audience text as written, ignoring case and extra spaces', async () => {
      expect(keys(await list('?targetAudience=BSN'))).toEqual(['dose']);
      expect(keys(await list('?targetAudience=%20bsn%20'))).toEqual(['dose']);
      expect(keys(await list('?targetAudience=high%20%20school%20nursing'))).toEqual(['wound']);
    });

    it('matches any of several audiences', async () => {
      expect(
        keys(
          await list(
            '?targetAudience=High%20School%20Allied%20Health&targetAudience=High%20School%20Nursing',
          ),
        ),
      ).toEqual(['cardiac', 'wound']);
    });

    it('does not match part of an audience', async () => {
      expect(keys(await list('?targetAudience=High%20School'))).toEqual([]);
    });

    it('returns an empty list with a count of 0 for an audience nothing has', async () => {
      const body = await list('?targetAudience=Astronauts');

      expect(body.data).toEqual([]);
      expect(body.meta.total).toBe(0);
    });

    it('combines with learner level and the other filters', async () => {
      expect(keys(await list('?learnerLevel=Secondary&targetAudience=BSN'))).toEqual([]);
      expect(keys(await list('?learnerLevel=Secondary&modality=Avatar'))).toEqual(['cardiac']);
      expect(keys(await list('?learnerLevel=Post-Secondary&search=stroke'))).toEqual(['stroke']);
    });

    it('applies to the lite variant too', async () => {
      const body = await list('?learnerLevel=Secondary&lite=true');

      expect(keys(body)).toEqual(['cardiac', 'wound']);
      expect(Object.keys(body.data[0]).sort()).toEqual(['id', 'scenario']);
    });
  });
  describe('productName', () => {
    it('matches the product setup title, ignoring case and extra spaces', async () => {
      // `stroke` is stored as 'knee  set ' and still matches 'Knee Set'.
      expect(keys(await list('?productName=Knee%20Set'))).toEqual(['cardiac', 'stroke']);
      expect(keys(await list('?productName=%20KNEE%20%20SET%20'))).toEqual(['cardiac', 'stroke']);
      expect(keys(await list('?productName=manikin'))).toEqual(['dose']);
    });

    it('matches any of several product names', async () => {
      expect(keys(await list('?productName=Manikin&productName=Knee%20Set'))).toEqual([
        'dose',
        'cardiac',
        'stroke',
      ]);
    });

    it('never matches a simulation without a product title', async () => {
      // `wound` has no product setup at all.
      const everyone = await list(
        '?productName=Knee%20Set&productName=Manikin&productName=none&productName=wound',
      );

      expect(keys(everyone)).not.toContain('wound');
    });

    it('does not match part of a product name', async () => {
      expect(keys(await list('?productName=Knee'))).toEqual([]);
    });

    it('returns an empty list with a count of 0 for a product nothing needs', async () => {
      const body = await list('?productName=Time%20Machine');

      expect(body.data).toEqual([]);
      expect(body.meta).toMatchObject({ total: 0, totalPages: 0 });
    });

    it('keeps a comma inside one product name', async () => {
      expect(keys(await list('?productName=Knee%20Set%2C%20large'))).toEqual([]);
    });

    it('combines with the other filters and search, and applies to lite', async () => {
      expect(keys(await list('?productName=Knee%20Set&modality=Avatar'))).toEqual(['cardiac']);
      expect(keys(await list('?productName=Knee%20Set&search=stroke'))).toEqual(['stroke']);
      const lite = await list('?productName=Manikin&lite=true');
      expect(keys(lite)).toEqual(['dose']);
      expect(Object.keys(lite.data[0]).sort()).toEqual(['id', 'scenario']);
    });
  });
});
