import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ClassesController } from '../../../src/class/classes.controller';
import { ClassesService } from '../../../src/class/classes.service';
import { ClassSimulationService } from '../../../src/class-simulations/class-simulation.service';
import { CommonStatus } from '../../../src/common/enums/status.enum';
import { dayjs } from '../../../src/common/utils/dayjs.utils';
import { databseConfig } from '../../../src/database/data-source';
import { Class, Educator, Schools } from '../../../src/database/entities';
import { ClassRepository } from '../../../src/database/repositories/class.repository';
import {
  CLASS_EDUCATOR_REPOSITORY,
  CLASS_REPOSITORY,
  EDUCATOR_SCHOOL_REPOSITORY,
  GOOGLE_COURSE_MAPPING_REPOSITORY,
  GOOGLE_STUDENT_MAPPING_REPOSITORY,
  LMS_CLASS_MAPPING_REPOSITORY,
  LMS_STUDENT_MAPPING_REPOSITORY,
  SIMULATION_REPORT_REPOSITORY,
  USER_ROLE_REPOSITORY,
} from '../../../src/database/tokens';
import { LmsAssignmentService } from '../../../src/lms/services/lms-assignment.service';
import { LmsConfigService } from '../../../src/lms/services/lms-config.service';
import { LmsLookupService } from '../../../src/lms/services/lms-lookup.service';
import { LmsProvisionService } from '../../../src/lms/services/lms-provision.service';
import { LmsRosterService } from '../../../src/lms/services/lms-roster.service';
import {
  buildTestApp,
  defaultUserRoleRepositoryFindByUserId,
  TEST_USERS,
} from '../setup/test-app.factory';

const hasDbConfig = Boolean(process.env.DB_HOST && process.env.DB_USERNAME && process.env.DB_NAME);
// Skips without a database, like the other `*.db.integration.spec.ts` suites. The CI integration
// job sets no DB_* env, so this suite only runs locally against the DB `.env` points at.
const describeWithDb = hasDbConfig ? describe : describe.skip;

// Unique per run so concurrent runs against the shared dev DB never delete each other's rows.
const RUN_TAG = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const TAG = `CLASS-LIST-${RUN_TAG}`;

interface ListBody {
  data: Array<Record<string, unknown>>;
  meta: { total: number; page: number; pageSize: number; totalPages: number; hasNextPage: boolean };
}

/**
 * `GET /api/classes` through the real HTTP stack (auth guard, validation pipe, envelope) with
 * the real `ClassRepository` on a real Postgres database — the single seam for the class list.
 *
 * One fixture educator owns six live classes with end dates before, on and after 2026-06-15,
 * with mixed statuses. Three more classes must never be listed: another educator's, a
 * soft-deleted one, and one at an inactive school.
 */
describeWithDb('GET /api/classes against real Postgres (Integration)', () => {
  jest.setTimeout(120000);

  let app: INestApplication;
  let dataSource: DataSource;
  let educatorToken: string;
  let adminToken: string;
  let otherAdminToken: string;
  let educatorId: string;

  // Names sort alphabetically in the order listed, so name-sort assertions are deterministic.
  const LIVE = [
    { key: 'a', end: '2026-06-01', status: CommonStatus.ACTIVE },
    { key: 'b', end: '2026-06-14', status: CommonStatus.INACTIVE },
    { key: 'c', end: '2026-06-15', status: CommonStatus.ACTIVE },
    { key: 'd', end: '2026-06-16', status: CommonStatus.ACTIVE },
    { key: 'e', end: '2026-12-31', status: CommonStatus.INACTIVE },
    { key: 'f', end: '2027-03-01', status: CommonStatus.ACTIVE },
  ];
  const HIDDEN = ['z-other-educator', 'z-soft-deleted', 'z-inactive-school'];
  const idByKey: Record<string, string> = {};
  const nameOf = (key: string): string => `${TAG}-${key}`;
  const startOf = (index: number): string => `2026-01-${String(index + 1).padStart(2, '0')}`;
  const liveIds = (): string[] => LIVE.map(({ key }) => idByKey[key]);

  const httpServer = (): Parameters<typeof request>[0] => {
    const server: unknown = app.getHttpServer();
    return server as Parameters<typeof request>[0];
  };

  const listClasses = (
    token: string,
    query: Record<string, string | number | boolean> = {},
  ): request.Test =>
    request(httpServer()).get('/api/classes').query(query).set('Authorization', `Bearer ${token}`);

  // A `date` column is parsed by the pg driver as local midnight and serialised as an ISO
  // timestamp, so the expected string is the stored day at local midnight. Exact in any time zone.
  const serialisedDay = (calendarDay: string): string => dayjs(calendarDay).toISOString();

  const bodyOf = (res: request.Response): ListBody => res.body as ListBody;

  beforeAll(async () => {
    dataSource = new DataSource({ ...databseConfig, synchronize: false, logging: false });
    await dataSource.initialize();
    await seed();

    const unused = { useValue: {} };
    const built = await buildTestApp({
      controllers: [ClassesController],
      providers: [
        ClassesService,
        {
          provide: CLASS_REPOSITORY,
          useValue: new ClassRepository(dataSource.getRepository(Class)),
        },
        { provide: DataSource, useValue: dataSource },
        // The educator token resolves to the fixture educator row instead of the fixed test id.
        {
          provide: USER_ROLE_REPOSITORY,
          useValue: {
            findByUserId: jest.fn().mockImplementation(async (userId: string) => {
              const roles = await defaultUserRoleRepositoryFindByUserId(userId);
              return roles.map((role) =>
                role.educator ? { ...role, educator: { ...role.educator, id: educatorId } } : role,
              );
            }),
          },
        },
        { provide: CLASS_EDUCATOR_REPOSITORY, ...unused },
        { provide: EDUCATOR_SCHOOL_REPOSITORY, ...unused },
        { provide: GOOGLE_COURSE_MAPPING_REPOSITORY, ...unused },
        { provide: GOOGLE_STUDENT_MAPPING_REPOSITORY, ...unused },
        { provide: LMS_CLASS_MAPPING_REPOSITORY, ...unused },
        { provide: LMS_STUDENT_MAPPING_REPOSITORY, ...unused },
        { provide: SIMULATION_REPORT_REPOSITORY, ...unused },
        { provide: ClassSimulationService, ...unused },
        { provide: LmsProvisionService, ...unused },
        { provide: LmsConfigService, ...unused },
        { provide: LmsAssignmentService, ...unused },
        { provide: LmsLookupService, ...unused },
        { provide: LmsRosterService, ...unused },
      ],
    });
    app = built.app;
    educatorToken = built.signToken(TEST_USERS.educator);
    adminToken = built.signToken(TEST_USERS.districtAdmin);
    otherAdminToken = built.signToken(TEST_USERS.superAdmin);
  });

  afterAll(async () => {
    await app?.close();
    if (dataSource?.isInitialized) {
      await cleanup();
      await dataSource.destroy();
    }
  });

  // Seeding only saves educators, schools and classes through plain objects, and no trigger or
  // cascade on those tables writes other rows, so these three deletes remove everything created.
  async function cleanup(): Promise<void> {
    await dataSource.query(`DELETE FROM classes WHERE class_name LIKE $1`, [`${TAG}%`]);
    await dataSource.query(`DELETE FROM schools WHERE school_name LIKE $1`, [`${TAG}%`]);
    await dataSource.query(`DELETE FROM educators WHERE email LIKE $1`, [
      `class-list-${RUN_TAG}-%@example.com`,
    ]);
  }

  async function seed(): Promise<void> {
    const educatorRepo = dataSource.getRepository(Educator);
    const educator = await educatorRepo.save({
      email: `class-list-${RUN_TAG}-educator@example.com`,
      full_name: 'Class List Educator',
      status: CommonStatus.ACTIVE,
      is_active: true,
    });
    const otherEducator = await educatorRepo.save({
      email: `class-list-${RUN_TAG}-other@example.com`,
      full_name: 'Class List Other',
      status: CommonStatus.ACTIVE,
      is_active: true,
    });
    educatorId = educator.id;
    const inactiveSchool = await dataSource.getRepository(Schools).save({
      school_name: `${TAG}-School-Inactive`,
      status: CommonStatus.ACTIVE,
      is_active: false,
    });

    const owned = { educator_id: educatorId, is_active: true, school_id: null };
    const specs: Array<[string, Record<string, unknown>]> = [
      ...LIVE.map(({ key, end, status }, index): [string, Record<string, unknown>] => [
        key,
        { ...owned, status, start_date: startOf(index), end_date: end },
      ]),
      [
        HIDDEN[0],
        {
          ...owned,
          educator_id: otherEducator.id,
          status: CommonStatus.ACTIVE,
          start_date: '2026-01-01',
          end_date: '2026-12-31',
        },
      ],
      [
        HIDDEN[1],
        { ...owned, status: CommonStatus.ACTIVE, start_date: '2026-01-01', end_date: '2026-12-31' },
      ],
      [
        HIDDEN[2],
        {
          ...owned,
          school_id: inactiveSchool.id,
          status: CommonStatus.ACTIVE,
          start_date: '2026-01-01',
          end_date: '2026-12-31',
        },
      ],
    ];
    const saved = await dataSource
      .getRepository(Class)
      .save(specs.map(([key, values]) => ({ class_name: nameOf(key), ...values })) as never);
    specs.forEach(([key], index) => {
      idByKey[key] = saved[index].id as string;
    });
    await dataSource.query(`UPDATE classes SET deleted_at = now() WHERE id = $1`, [
      idByKey[HIDDEN[1]],
    ]);
  }

  describe('as an educator', () => {
    it('is refused without a token', async () => {
      await request(httpServer()).get('/api/classes').expect(401);
    });

    it("lists exactly the educator's live classes, with the full item shape", async () => {
      const res = await listClasses(educatorToken, { pageSize: 50 }).expect(200);

      const { data, meta } = bodyOf(res);
      expect(meta.total).toBe(LIVE.length);
      expect(data.map((item) => item.classId).sort()).toEqual([...liveIds()].sort());
      const first = data.find((item) => item.classId === idByKey.c);
      expect(Object.keys(first ?? {}).sort()).toEqual(
        [
          'classId',
          'className',
          'endDate',
          'reportsCount',
          'simsCount',
          'startDate',
          'status',
          'studentsCount',
          'unreadReportsCount',
        ].sort(),
      );
      expect(first).toMatchObject({ className: nameOf('c'), status: CommonStatus.ACTIVE });
      // The driver's `Date` is serialised as a timestamp, not a bare `YYYY-MM-DD` (see serialisedDay).
      expect(first?.startDate).toBe(serialisedDay('2026-01-03'));
      expect(first?.endDate).toBe(serialisedDay('2026-06-15'));
    });

    it.each([
      ['asc', LIVE.map(({ key }) => key)],
      ['desc', LIVE.map(({ key }) => key).reverse()],
    ])('sorts by class name %s', async (sortDir, expectedKeys) => {
      const res = await listClasses(educatorToken, {
        sortBy: 'class_name',
        sortDir,
        pageSize: 50,
      }).expect(200);

      expect(bodyOf(res).data.map((item) => item.className)).toEqual(expectedKeys.map(nameOf));
    });

    it('paginates: pages are disjoint, add up to the whole list, and totals stay correct', async () => {
      const query = { sortBy: 'class_name', sortDir: 'asc', pageSize: 4 };
      const page1 = bodyOf(await listClasses(educatorToken, { ...query, page: 1 }).expect(200));
      const page2 = bodyOf(await listClasses(educatorToken, { ...query, page: 2 }).expect(200));
      const page3 = bodyOf(await listClasses(educatorToken, { ...query, page: 3 }).expect(200));

      expect(page1.data).toHaveLength(4);
      expect(page2.data).toHaveLength(2);
      expect([...page1.data, ...page2.data].map((item) => item.classId)).toEqual(liveIds());
      expect(page1.meta).toMatchObject({ total: 6, totalPages: 2, hasNextPage: true });
      expect(page2.meta).toMatchObject({ total: 6, totalPages: 2, hasNextPage: false });
      expect(page3.data).toEqual([]);
      expect(page3.meta.total).toBe(6);
    });

    it('lite returns classId, className, startDate, endDate and status for the same classes', async () => {
      const res = await listClasses(educatorToken, { lite: true, pageSize: 50 }).expect(200);

      const { data, meta } = bodyOf(res);
      expect(meta.total).toBe(LIVE.length);
      expect(data.map((item) => item.classId).sort()).toEqual([...liveIds()].sort());
      for (const item of data) {
        expect(Object.keys(item).sort()).toEqual([
          'classId',
          'className',
          'endDate',
          'startDate',
          'status',
        ]);
      }
    });

    it('lite dates and status match the full list for every class', async () => {
      const full = bodyOf(await listClasses(educatorToken, { pageSize: 50 }).expect(200));
      const lite = bodyOf(
        await listClasses(educatorToken, { lite: true, pageSize: 50 }).expect(200),
      );

      const fullById = new Map(full.data.map((item) => [item.classId, item]));
      expect(lite.data).toHaveLength(LIVE.length);
      for (const item of lite.data) {
        const counterpart = fullById.get(item.classId);
        expect(item.startDate).toBe(counterpart?.startDate);
        expect(item.endDate).toBe(counterpart?.endDate);
        expect(item.status).toBe(counterpart?.status);
        expect(item.className).toBe(counterpart?.className);
      }
    });

    it('lite carries the dates and status each class was saved with', async () => {
      const lite = bodyOf(
        await listClasses(educatorToken, { lite: true, pageSize: 50 }).expect(200),
      );

      const itemById = new Map(lite.data.map((item) => [item.classId, item]));
      LIVE.forEach(({ key, end, status }, index) => {
        expect(itemById.get(idByKey[key])).toEqual({
          classId: idByKey[key],
          className: nameOf(key),
          startDate: serialisedDay(startOf(index)),
          endDate: serialisedDay(end),
          status,
        });
      });
    });
  });

  describe('endDateFrom (ends on or after)', () => {
    const idsOf = (res: request.Response): string[] =>
      bodyOf(res)
        .data.map((item) => item.classId as string)
        .sort();
    const idsFor = (keys: string[]): string[] => keys.map((key) => idByKey[key]).sort();

    it('leaves out classes that ended before the date and keeps one ending exactly on it', async () => {
      const res = await listClasses(educatorToken, {
        endDateFrom: '2026-06-15',
        pageSize: 50,
      }).expect(200);

      expect(idsOf(res)).toEqual(idsFor(['c', 'd', 'e', 'f']));
    });

    it.each([
      ['status', { status: CommonStatus.ACTIVE }, ['c', 'd', 'f']],
      ['search', { search: nameOf('e') }, ['e']],
      ['a search outside the date range', { endDateFrom: '2027-01-01', search: nameOf('e') }, []],
      ['startDateFrom', { endDateFrom: '2026-06-16', startDateFrom: '2026-01-05' }, ['e', 'f']],
      ['endDateTo', { endDateTo: '2026-06-16' }, ['c', 'd']],
    ])('combines with %s', async (_label, extra, keys) => {
      const res = await listClasses(educatorToken, {
        endDateFrom: '2026-06-15',
        ...extra,
      }).expect(200);

      expect(idsOf(res)).toEqual(idsFor(keys));
    });

    it('combines with the school scope', async () => {
      const unassigned = await listClasses(educatorToken, {
        endDateFrom: '2026-06-15',
        schoolIds: 'unassigned',
      }).expect(200);
      expect(idsOf(unassigned)).toEqual(idsFor(['c', 'd', 'e', 'f']));

      const otherSchool = await listClasses(educatorToken, {
        endDateFrom: '2026-06-15',
        schoolIds: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      }).expect(200);
      expect(idsOf(otherSchool)).toEqual([]);
    });

    it('keeps sorting on the filtered list', async () => {
      const res = await listClasses(educatorToken, {
        endDateFrom: '2026-06-15',
        sortBy: 'class_name',
        sortDir: 'desc',
      }).expect(200);

      expect(bodyOf(res).data.map((item) => item.className)).toEqual(
        ['f', 'e', 'd', 'c'].map(nameOf),
      );
    });

    it.each([
      ['full', {}],
      ['lite', { lite: true }],
    ])('paginates the filtered %s list with a total that matches it', async (_label, variant) => {
      const query = {
        ...variant,
        endDateFrom: '2026-06-15',
        sortBy: 'class_name',
        sortDir: 'asc',
        pageSize: 3,
      };
      const page1 = bodyOf(await listClasses(educatorToken, { ...query, page: 1 }).expect(200));
      const page2 = bodyOf(await listClasses(educatorToken, { ...query, page: 2 }).expect(200));
      const page3 = bodyOf(await listClasses(educatorToken, { ...query, page: 3 }).expect(200));

      expect(page1.data.map((item) => item.className)).toEqual(['c', 'd', 'e'].map(nameOf));
      expect(page2.data.map((item) => item.className)).toEqual([nameOf('f')]);
      expect(page1.meta).toMatchObject({ total: 4, totalPages: 2, hasNextPage: true });
      expect(page2.meta).toMatchObject({ total: 4, totalPages: 2, hasNextPage: false });
      expect(page3.data).toEqual([]);
      expect(page3.meta.total).toBe(4);
    });

    it('applies to the lite list as well', async () => {
      const res = await listClasses(educatorToken, {
        lite: true,
        endDateFrom: '2026-06-15',
        pageSize: 50,
      }).expect(200);

      expect(idsOf(res)).toEqual(idsFor(['c', 'd', 'e', 'f']));
      expect(bodyOf(res).meta.total).toBe(4);
    });

    it('returns the same list as before when the date is omitted', async () => {
      const res = await listClasses(educatorToken, { pageSize: 50 }).expect(200);

      expect(idsOf(res)).toEqual(idsFor(LIVE.map(({ key }) => key)));
    });

    it("never widens the list to classes outside the educator's live scope", async () => {
      const res = await listClasses(educatorToken, {
        endDateFrom: '2000-01-01',
        pageSize: 50,
      }).expect(200);

      expect(idsOf(res)).toEqual(idsFor(LIVE.map(({ key }) => key)));
      expect(bodyOf(res).meta.total).toBe(LIVE.length);
    });

    it('leaves the grouped-by-school listing as it was', async () => {
      const res = await request(httpServer())
        .get('/api/classes/schools')
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);

      const unassigned = bodyOf(res).data.find((group) => group.schoolId === null);
      expect(unassigned?.classCount).toBe(LIVE.length);
    });

    it.each([
      'not-a-date',
      '',
      // Impossible or non-calendar-date values must be refused up front, not reach Postgres (500).
      '2026-02-31',
      '2026-06-15T10:00:00Z',
      '20260615',
    ])('refuses %p with 400, naming endDateFrom', async (value) => {
      const res = await listClasses(educatorToken, { endDateFrom: value }).expect(400);

      expect(JSON.stringify(res.body)).toContain('endDateFrom');
    });

    it('refuses endDateFrom later than endDateTo with the date-range message', async () => {
      const res = await listClasses(educatorToken, {
        endDateFrom: '2026-07-01',
        endDateTo: '2026-06-01',
      }).expect(400);

      // Which two fields conflict is asserted in the ClassesService unit test, where the key's
      // parameters are visible; here only that it is the range error, not the generic one.
      expect(JSON.stringify(res.body)).toContain('INVALID_DATE_RANGE');
    });

    it('accepts endDateFrom equal to endDateTo and lists classes ending that day', async () => {
      const res = await listClasses(educatorToken, {
        endDateFrom: '2026-06-15',
        endDateTo: '2026-06-15',
      }).expect(200);

      expect(idsOf(res)).toEqual(idsFor(['c']));
    });

    it('accepts endDateFrom earlier than startDateFrom', async () => {
      await listClasses(educatorToken, {
        startDateFrom: '2026-03-01',
        endDateFrom: '2026-02-01',
      }).expect(200);
    });

    it('still refuses startDateFrom later than endDateTo as before', async () => {
      await listClasses(educatorToken, {
        startDateFrom: '2026-07-01',
        endDateTo: '2026-06-01',
      }).expect(400);
    });
  });

  describe('as a non-educator', () => {
    it.each([
      ['district admin', (): string => adminToken],
      ['second district admin', (): string => otherAdminToken],
    ])('refuses a %s with 403, with and without lite', async (_label, token) => {
      await listClasses(token()).expect(403);
      await listClasses(token(), { lite: true }).expect(403);
      await listClasses(token(), { endDateFrom: '2026-06-15' }).expect(403);
    });
  });
});
