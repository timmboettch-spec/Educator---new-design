import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DashboardController } from '../../../src/dashboard/dashboard.controller';
import { DashboardService } from '../../../src/dashboard/dashboard.service';
import { Schools } from '../../../src/schools/entity/schools.entity';
import { Educator } from '../../../src/educators/entity/educator.entity';
import { Class } from '../../../src/class/entity/class.entity';
import { Student } from '../../../src/students/entity/students.entity';
import { ClassSimulation } from '../../../src/class-simulations/entity/class-simulation.entity';
import { buildTestApp, TEST_USERS } from '../setup/test-app.factory';

type DashboardBody = {
  status?: string;
  message?: string;
  data?: unknown;
};

const parseBody = (res: request.Response): DashboardBody => {
  const body: unknown = res.body;
  if (typeof body === 'object' && body !== null) {
    return body;
  }
  throw new Error('Expected response body to be an object');
};

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value === 'object' && value !== null) {
    return value as Record<string, unknown>;
  }
  throw new Error('Expected value to be an object');
};

const expectStatus = (res: request.Response, expected: string): void => {
  const body = parseBody(res);
  expect(body.status).toBe(expected);
};

// ── Query-builder factory ────────────────────────────────────────────────────
// Must include every method the service chains: innerJoin, where, andWhere,
// take, getMany, getCount.
type MockQb = {
  innerJoin: jest.Mock;
  where: jest.Mock;
  andWhere: jest.Mock;
  take: jest.Mock;
  getMany: jest.Mock;
  getCount: jest.Mock;
};

const makeMockQueryBuilder = (): MockQb => {
  const qb: MockQb = {
    innerJoin: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    take: jest.fn(),
    getMany: jest.fn().mockResolvedValue([]),
    getCount: jest.fn().mockResolvedValue(0),
  };
  // Every chained method returns the same builder object
  qb.innerJoin.mockReturnValue(qb);
  qb.where.mockReturnValue(qb);
  qb.andWhere.mockReturnValue(qb);
  qb.take.mockReturnValue(qb);
  return qb;
};

// ── Repository factory ───────────────────────────────────────────────────────
type MockRepo = {
  count: jest.Mock;
  find: jest.Mock;
  createQueryBuilder: jest.Mock;
  _qb: MockQb;
};

const makeRepo = (): MockRepo => {
  const qb = makeMockQueryBuilder();
  return {
    count: jest.fn().mockResolvedValue(0),
    find: jest.fn().mockResolvedValue([]),
    createQueryBuilder: jest.fn().mockReturnValue(qb),
    _qb: qb,
  };
};

describe('Dashboard (Integration)', () => {
  let app: INestApplication;
  let signToken: (user?: object) => string;
  let adminToken: string;
  const httpServer = (): Parameters<typeof request>[0] => {
    const server: unknown = app.getHttpServer();
    return server as Parameters<typeof request>[0];
  };

  const schoolRepo = makeRepo();
  const educatorRepo = makeRepo();
  const classRepo = makeRepo();
  const studentRepo = makeRepo();
  const classSimRepo = makeRepo();

  beforeAll(async () => {
    ({ app, signToken } = await buildTestApp({
      controllers: [DashboardController],
      providers: [
        DashboardService,
        { provide: getRepositoryToken(Schools), useValue: schoolRepo },
        { provide: getRepositoryToken(Educator), useValue: educatorRepo },
        { provide: getRepositoryToken(Class), useValue: classRepo },
        { provide: getRepositoryToken(Student), useValue: studentRepo },
        { provide: getRepositoryToken(ClassSimulation), useValue: classSimRepo },
      ],
    }));
    adminToken = signToken(TEST_USERS.districtAdmin);
  });

  afterAll(async () => app.close());

  afterEach(() => {
    jest.clearAllMocks();
    // Re-wire the query builder chain after clearAllMocks resets mockReturnValue
    for (const repo of [schoolRepo, educatorRepo, classRepo, studentRepo, classSimRepo]) {
      const qb = repo._qb;
      qb.innerJoin.mockReturnValue(qb);
      qb.where.mockReturnValue(qb);
      qb.andWhere.mockReturnValue(qb);
      qb.take.mockReturnValue(qb);
      qb.getMany.mockResolvedValue([]);
      qb.getCount.mockResolvedValue(0);
      repo.createQueryBuilder.mockReturnValue(qb);
      repo.count.mockResolvedValue(0);
      repo.find.mockResolvedValue([]);
    }
  });

  describe('GET /api/dashboard/overview', () => {
    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      return request(httpServer()).get('/api/dashboard/overview').expect(401);
    });

    it('INTEGRATION: returns 200 with overview data for authenticated admin', async () => {
      schoolRepo.count.mockResolvedValue(2);
      schoolRepo.find.mockResolvedValue([]);
      educatorRepo.count.mockResolvedValue(5);
      educatorRepo.find.mockResolvedValue([]);
      classRepo.count.mockResolvedValue(4);
      classRepo.find.mockResolvedValue([]);
      // students use createQueryBuilder → getCount / getMany
      studentRepo._qb.getCount.mockResolvedValue(30);
      studentRepo._qb.getMany.mockResolvedValue([]);
      // classSimulations use createQueryBuilder → getMany
      classSimRepo._qb.getMany.mockResolvedValue([]);

      return request(httpServer())
        .get('/api/dashboard/overview')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          const body = parseBody(res);
          expect(body.status).toBe('SUCCESS');
          expect(body.message).toBe('Dashboard overview fetched');
          expect(body.data).toBeDefined();
        });
    });

    it('INTEGRATION: returns 200 for Super Admin as well', async () => {
      const superToken = signToken(TEST_USERS.superAdmin);

      schoolRepo.count.mockResolvedValue(0);
      schoolRepo.find.mockResolvedValue([]);
      educatorRepo.count.mockResolvedValue(0);
      educatorRepo.find.mockResolvedValue([]);
      classRepo.count.mockResolvedValue(0);
      classRepo.find.mockResolvedValue([]);
      studentRepo._qb.getCount.mockResolvedValue(0);
      studentRepo._qb.getMany.mockResolvedValue([]);
      classSimRepo._qb.getMany.mockResolvedValue([]);

      return request(httpServer())
        .get('/api/dashboard/overview')
        .set('Authorization', `Bearer ${superToken}`)
        .expect(200)
        .expect((res) => {
          expectStatus(res, 'SUCCESS');
        });
    });

    it('INTEGRATION: includes required keys in overview response', async () => {
      schoolRepo.count.mockResolvedValue(1);
      schoolRepo.find.mockResolvedValue([]);
      educatorRepo.count.mockResolvedValue(1);
      educatorRepo.find.mockResolvedValue([]);
      classRepo.count.mockResolvedValue(1);
      classRepo.find.mockResolvedValue([]);
      studentRepo._qb.getCount.mockResolvedValue(1);
      studentRepo._qb.getMany.mockResolvedValue([]);
      classSimRepo._qb.getMany.mockResolvedValue([]);

      return request(httpServer())
        .get('/api/dashboard/overview')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          const body = parseBody(res);
          const data = asRecord(body.data);
          expect(data).toHaveProperty('schools');
          expect(data).toHaveProperty('educators');
          expect(data).toHaveProperty('classes');
          expect(data).toHaveProperty('students');
        });
    });

    // ── Empty response contract ──────────────────────────────────────────────

    it('INTEGRATION: returns 200 with all-zero sections when no data exists (empty state)', async () => {
      // All repos return zero counts and empty arrays — deterministic empty state
      for (const repo of [schoolRepo, educatorRepo, classRepo]) {
        repo.count.mockResolvedValue(0);
        repo.find.mockResolvedValue([]);
      }
      studentRepo._qb.getCount.mockResolvedValue(0);
      studentRepo._qb.getMany.mockResolvedValue([]);
      classSimRepo._qb.getMany.mockResolvedValue([]);

      return request(httpServer())
        .get('/api/dashboard/overview')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          const body = parseBody(res);
          const data = asRecord(body.data);
          for (const key of ['schools', 'educators', 'students', 'classes', 'classSimulations']) {
            const section = asRecord(data[key]);
            expect(section.total).toBe(0);
            expect(section.data).toEqual([]);
          }
        });
    });

    it('INTEGRATION: empty state preserves all five section keys in response', async () => {
      for (const repo of [schoolRepo, educatorRepo, classRepo]) {
        repo.count.mockResolvedValue(0);
        repo.find.mockResolvedValue([]);
      }
      studentRepo._qb.getCount.mockResolvedValue(0);
      studentRepo._qb.getMany.mockResolvedValue([]);
      classSimRepo._qb.getMany.mockResolvedValue([]);

      return request(httpServer())
        .get('/api/dashboard/overview')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          const data = asRecord(parseBody(res).data);
          for (const key of ['schools', 'educators', 'students', 'classes', 'classSimulations']) {
            expect(data).toHaveProperty(key);
          }
        });
    });

    // ── Controlled 5xx / backend failure ────────────────────────────────────

    it('INTEGRATION: returns 500 when the DB throws during overview fetch', async () => {
      // Simulate a database failure on the first repository call
      schoolRepo.count.mockRejectedValue(new Error('DB connection lost'));

      return request(httpServer())
        .get('/api/dashboard/overview')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(500)
        .expect((res) => {
          const body = parseBody(res);
          // Must not leak internal error details to the client
          expect(JSON.stringify(body)).not.toMatch(/DB connection lost/);
          expect(JSON.stringify(body)).not.toMatch(/at Object\.|at Function\.|node_modules/);
        });
    });

    it('INTEGRATION: 500 response body contains a message field', async () => {
      schoolRepo.count.mockRejectedValue(new Error('Simulated DB failure'));

      return request(httpServer())
        .get('/api/dashboard/overview')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(500)
        .expect((res) => {
          expect(res.body).toHaveProperty('message');
        });
    });

    it('INTEGRATION: 500 response does not expose a stack trace', async () => {
      schoolRepo.count.mockRejectedValue(new Error('Simulated DB failure'));

      return request(httpServer())
        .get('/api/dashboard/overview')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(500)
        .expect((res) => {
          expect(res.body).not.toHaveProperty('stack');
        });
    });

    it('INTEGRATION: failure on any single repo still results in 500, not partial data', async () => {
      // Only classRepo fails — partial data must not be returned silently
      schoolRepo.count.mockResolvedValue(2);
      schoolRepo.find.mockResolvedValue([]);
      educatorRepo.count.mockResolvedValue(1);
      educatorRepo.find.mockResolvedValue([]);
      classRepo.count.mockRejectedValue(new Error('classes table unavailable'));
      studentRepo._qb.getCount.mockResolvedValue(0);
      studentRepo._qb.getMany.mockResolvedValue([]);
      classSimRepo._qb.getMany.mockResolvedValue([]);

      const res = await request(httpServer())
        .get('/api/dashboard/overview')
        .set('Authorization', `Bearer ${adminToken}`);

      // Partial success must not be silently swallowed — a proper error is returned
      expect(res.status).toBe(500);
    });
  });
});
