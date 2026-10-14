import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DashboardController } from '../../../src/dashboard/dashboard.controller';
import { DashboardService } from '../../../src/dashboard/dashboard.service';
import {
  CLASS_REPOSITORY,
  CLASS_SIMULATION_REPOSITORY,
  EDUCATOR_REPOSITORY,
  SCHOOLS_REPOSITORY,
  STUDENT_REPOSITORY,
} from 'src/database/tokens';
import { buildTestApp, TEST_USERS } from '../setup/test-app.factory';
import { expectLegacySuccessBody } from '../setup/error-envelope.util';

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

// ── Repository mock factories ────────────────────────────────────────────────
// DashboardService talks to the repository-adapter classes directly
// (count/find, or their dedicated finder methods) — no raw TypeORM
// query-builder chaining is visible at this layer any more.

type CountFindRepo = { count: jest.Mock; find: jest.Mock };
type StudentRepoMock = { countActiveForAdmin: jest.Mock; findActiveForAdmin: jest.Mock };
type ClassSimRepoMock = { findPreviewForAdmin: jest.Mock };

const makeCountFindRepo = (): CountFindRepo => ({
  count: jest.fn().mockResolvedValue(0),
  find: jest.fn().mockResolvedValue([]),
});

const makeStudentRepo = (): StudentRepoMock => ({
  countActiveForAdmin: jest.fn().mockResolvedValue(0),
  findActiveForAdmin: jest.fn().mockResolvedValue([]),
});

const makeClassSimRepo = (): ClassSimRepoMock => ({
  findPreviewForAdmin: jest.fn().mockResolvedValue([]),
});

describe('Dashboard (Integration)', () => {
  let app: INestApplication;
  let signToken: (user?: object) => string;
  let adminToken: string;
  const httpServer = (): Parameters<typeof request>[0] => {
    const server: unknown = app.getHttpServer();
    return server as Parameters<typeof request>[0];
  };

  const schoolRepo = makeCountFindRepo();
  const educatorRepo = makeCountFindRepo();
  const classRepo = makeCountFindRepo();
  const studentRepo = makeStudentRepo();
  const classSimRepo = makeClassSimRepo();

  beforeAll(async () => {
    ({ app, signToken } = await buildTestApp({
      controllers: [DashboardController],
      providers: [
        DashboardService,
        { provide: SCHOOLS_REPOSITORY, useValue: schoolRepo },
        { provide: EDUCATOR_REPOSITORY, useValue: educatorRepo },
        { provide: CLASS_REPOSITORY, useValue: classRepo },
        { provide: STUDENT_REPOSITORY, useValue: studentRepo },
        { provide: CLASS_SIMULATION_REPOSITORY, useValue: classSimRepo },
      ],
    }));
    adminToken = signToken(TEST_USERS.districtAdmin);
  });

  afterAll(async () => app.close());

  afterEach(() => {
    jest.clearAllMocks();
    // Re-arm the default resolved values after clearAllMocks wipes them
    schoolRepo.count.mockResolvedValue(0);
    schoolRepo.find.mockResolvedValue([]);
    educatorRepo.count.mockResolvedValue(0);
    educatorRepo.find.mockResolvedValue([]);
    classRepo.count.mockResolvedValue(0);
    classRepo.find.mockResolvedValue([]);
    studentRepo.countActiveForAdmin.mockResolvedValue(0);
    studentRepo.findActiveForAdmin.mockResolvedValue([]);
    classSimRepo.findPreviewForAdmin.mockResolvedValue([]);
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
      studentRepo.countActiveForAdmin.mockResolvedValue(30);
      studentRepo.findActiveForAdmin.mockResolvedValue([]);
      classSimRepo.findPreviewForAdmin.mockResolvedValue([]);

      return request(httpServer())
        .get('/api/dashboard/overview')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expectLegacySuccessBody(res);
          const body = parseBody(res);
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
      studentRepo.countActiveForAdmin.mockResolvedValue(0);
      studentRepo.findActiveForAdmin.mockResolvedValue([]);
      classSimRepo.findPreviewForAdmin.mockResolvedValue([]);

      return request(httpServer())
        .get('/api/dashboard/overview')
        .set('Authorization', `Bearer ${superToken}`)
        .expect(200)
        .expect((res) => {
          expectLegacySuccessBody(res);
        });
    });

    it('INTEGRATION: includes required keys in overview response', async () => {
      schoolRepo.count.mockResolvedValue(1);
      schoolRepo.find.mockResolvedValue([]);
      educatorRepo.count.mockResolvedValue(1);
      educatorRepo.find.mockResolvedValue([]);
      classRepo.count.mockResolvedValue(1);
      classRepo.find.mockResolvedValue([]);
      studentRepo.countActiveForAdmin.mockResolvedValue(1);
      studentRepo.findActiveForAdmin.mockResolvedValue([]);
      classSimRepo.findPreviewForAdmin.mockResolvedValue([]);

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
      studentRepo.countActiveForAdmin.mockResolvedValue(0);
      studentRepo.findActiveForAdmin.mockResolvedValue([]);
      classSimRepo.findPreviewForAdmin.mockResolvedValue([]);

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
      studentRepo.countActiveForAdmin.mockResolvedValue(0);
      studentRepo.findActiveForAdmin.mockResolvedValue([]);
      classSimRepo.findPreviewForAdmin.mockResolvedValue([]);

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
      studentRepo.countActiveForAdmin.mockResolvedValue(0);
      studentRepo.findActiveForAdmin.mockResolvedValue([]);
      classSimRepo.findPreviewForAdmin.mockResolvedValue([]);

      const res = await request(httpServer())
        .get('/api/dashboard/overview')
        .set('Authorization', `Bearer ${adminToken}`);

      // Partial success must not be silently swallowed — a proper error is returned
      expect(res.status).toBe(500);
    });
  });
});
