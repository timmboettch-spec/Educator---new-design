import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SimulationsController } from '../../../src/simulations/simulations.controller';
import { SimulationsService } from '../../../src/simulations/simulations.service';
import { Simulation } from '../../../src/simulations/entity/simulation.entity';
import { TutorPatientService } from '../../../src/common/utils/tutor-patient.service';
import { buildTestApp, TEST_USERS } from '../setup/test-app.factory';

type TestBody = {
  status?: string;
  data?: unknown;
};

const parseBody = (res: request.Response): TestBody => {
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

const mockSim: Simulation = {
  id: 'sim-1',
  title: 'Cardiac Arrest',
  unit_id: 'unit-1',
  disabled: false,
  created_at: new Date(),
  updated_at: new Date(),
};

describe('Simulations (Integration)', () => {
  let app: INestApplication;
  let signToken: (user?: object) => string;
  let adminToken: string;

  const httpServer = (): Parameters<typeof request>[0] => {
    const server: unknown = app.getHttpServer();
    return server as Parameters<typeof request>[0];
  };

  const simRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(),
    manager: { query: jest.fn() },
  };
  const tutorPatientService = {
    getScenarios: jest.fn().mockResolvedValue([]),
    getUnits: jest.fn().mockResolvedValue([]),
    getReports: jest.fn().mockResolvedValue([]),
  };

  beforeAll(async () => {
    ({ app, signToken } = await buildTestApp({
      controllers: [SimulationsController],
      providers: [
        SimulationsService,
        { provide: getRepositoryToken(Simulation), useValue: simRepo },
        { provide: TutorPatientService, useValue: tutorPatientService },
      ],
    }));
    adminToken = signToken(TEST_USERS.districtAdmin);
  });

  afterAll(async () => app.close());
  afterEach(() => jest.clearAllMocks());

  describe('GET /api/simulations', () => {
    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      return request(httpServer()).get('/api/simulations').expect(401);
    });

    it('INTEGRATION: returns 200 with simulation list', async () => {
      tutorPatientService.getScenarios.mockResolvedValue([mockSim]);

      return request(httpServer())
        .get('/api/simulations')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          const body = parseBody(res);
          expect(body.status).toBe('SUCCESS');
          expect(Array.isArray(body.data)).toBe(true);
        });
    });

    it('INTEGRATION: returns 200 with empty list when no simulations', async () => {
      tutorPatientService.getScenarios.mockResolvedValue([]);

      return request(httpServer())
        .get('/api/simulations')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          const body = parseBody(res);
          expect(Array.isArray(body.data) ? body.data : []).toHaveLength(0);
        });
    });

    it('INTEGRATION: returns 400 when service fails', async () => {
      tutorPatientService.getScenarios.mockRejectedValue(new Error('External API down'));

      return request(httpServer())
        .get('/api/simulations')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400)
        .expect((res) => {
          expectStatus(res, 'FAILED');
        });
    });
  });

  describe('GET /api/simulations/:id', () => {
    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      return request(httpServer()).get('/api/simulations/sim-1').expect(401);
    });

    it('INTEGRATION: returns 200 when simulation found by id', async () => {
      tutorPatientService.getScenarios.mockResolvedValue([mockSim]);

      return request(httpServer())
        .get('/api/simulations/sim-1')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          const body = parseBody(res);
          const data = asRecord(body.data);
          expect(body.status).toBe('SUCCESS');
          expect(data.id).toBe('sim-1');
        });
    });

    it('INTEGRATION: returns 404 when simulation not found', async () => {
      tutorPatientService.getScenarios.mockResolvedValue([]);

      return request(httpServer())
        .get('/api/simulations/nonexistent')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404)
        .expect((res) => {
          expectStatus(res, 'FAILED');
        });
    });
  });
});
