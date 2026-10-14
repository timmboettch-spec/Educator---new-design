import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SimulationController } from '../../../src/simulation/simulation.controller';
import { SimulationService } from '../../../src/simulation/simulation.service';
import { StudentsService } from '../../../src/students/students.service';
import { VoiceProfilesService } from 'src/voice-profiles/voice-profiles.service';

import { buildTestApp, TEST_USERS } from '../setup/test-app.factory';
import { SimulationV2 } from 'src/database/entities';
import {
  EDUCATOR_SIMULATION_REPOSITORY,
  SIMULATION_CATALOG_REPOSITORY,
  SIMULATION_V2_REPOSITORY,
  UNIT_REPOSITORY,
} from 'src/database/tokens';

type TestBody = {
  message?: string;
  data?: unknown;
  meta?: unknown;
  error?: unknown;
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

/** `ResponseInterceptor` puts a successful response on the wire as
 * `{ message, data, meta, error: null }` — there is no `status` field. */
const expectSuccessEnvelope = (res: request.Response): void => {
  const body = parseBody(res);
  expect(body.error).toBeNull();
  expect(body).toHaveProperty('data');
};

const mockSimulationItem = {
  id: 101,
  title: 'Stroke Evaluation',
  unit: 'Emergency',
  category: 'Cardiology',
  created_at: new Date(),
  updated_at: new Date(),
};

// Fixture moved from the former tests/integration/simulations spec.
const mockSim: SimulationV2 = {
  id: 'sim-1',
  title: 'Cardiac Arrest',
  unitId: 'unit-1',
} as unknown as SimulationV2;

const VOICE = { id: 'vp-1', displayName: 'Stock Female 1', source: 'scenario' };
const resolveForScenario = jest.fn().mockResolvedValue(VOICE);

describe('Simulation (Integration)', () => {
  let app: INestApplication;
  let signToken: (user?: object) => string;
  let adminToken: string;
  let educatorToken: string;

  const httpServer = (): Parameters<typeof request>[0] => {
    const server: unknown = app.getHttpServer();
    return server as Parameters<typeof request>[0];
  };

  const simulationRepo = {
    find: jest.fn(),
  };
  const educatorSimRepo = { find: jest.fn().mockResolvedValue([]), findOne: jest.fn() };
  const unitRepo = {
    find: jest.fn().mockResolvedValue([]),
  };
  const simulationV2Repo = {
    find: jest.fn().mockResolvedValue([]),
    findByUnitId: jest.fn().mockResolvedValue([]),
    findByBusinessId: jest.fn().mockResolvedValue(null),
  };
  beforeAll(async () => {
    ({ app, signToken } = await buildTestApp({
      controllers: [SimulationController],
      providers: [
        SimulationService,
        { provide: SIMULATION_CATALOG_REPOSITORY, useValue: simulationRepo },
        { provide: EDUCATOR_SIMULATION_REPOSITORY, useValue: educatorSimRepo },
        { provide: UNIT_REPOSITORY, useValue: unitRepo },
        { provide: SIMULATION_V2_REPOSITORY, useValue: simulationV2Repo },
        { provide: StudentsService, useValue: { getSimulationsByCode: jest.fn() } },
        {
          // Resolves a voice for every scenario. The public share-link route must not use it.
          provide: VoiceProfilesService,
          useValue: { resolveForScenario: resolveForScenario },
        },
      ],
    }));
    adminToken = signToken(TEST_USERS.districtAdmin);
    educatorToken = signToken(TEST_USERS.educator);
  });

  afterAll(async () => app.close());
  afterEach(() => jest.clearAllMocks());

  describe('GET /api/simulations', () => {
    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      return request(httpServer()).get('/api/simulations').expect(401);
    });

    it('INTEGRATION: returns 200 with catalog list', async () => {
      simulationRepo.find.mockResolvedValue([mockSimulationItem]);
      return request(httpServer())
        .get('/api/simulations')
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200)
        .expect((res) => {
          expectSuccessEnvelope(res);
          const body = parseBody(res);
          expect(Array.isArray(body.data)).toBe(true);
        });
    });

    it('INTEGRATION: returns 200 with empty list when no catalog items', async () => {
      simulationRepo.find.mockResolvedValue([]);
      return request(httpServer())
        .get('/api/simulations')
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200)
        .expect((res) => {
          expectSuccessEnvelope(res);
        });
    });
  });

  describe('GET /api/simulations/educators', () => {
    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      return request(httpServer()).get('/api/simulations/educators').expect(401);
    });

    it('INTEGRATION: returns 200 with scenarios for an authenticated educator', async () => {
      simulationV2Repo.find.mockResolvedValue([mockSim]);

      return request(httpServer())
        .get('/api/simulations/educators')
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200)
        .expect((res) => {
          expectSuccessEnvelope(res);
        });
    });
  });

  describe('GET /api/simulations/combined', () => {
    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      return request(httpServer()).get('/api/simulations/combined').expect(401);
    });

    it('INTEGRATION: returns 200 for an authenticated educator', async () => {
      simulationV2Repo.find.mockResolvedValue([mockSim]);

      return request(httpServer())
        .get('/api/simulations/combined')
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200)
        .expect((res) => {
          expectSuccessEnvelope(res);
          const body = parseBody(res);
          const data = asRecord(body.data);
          expect(data).toHaveProperty('catalog');
          expect(data).toHaveProperty('scenarios');
        });
    });
  });

  describe('GET /api/simulations/:scenarioId/public', () => {
    it('INTEGRATION: returns 404 for an unknown scenario (public route, no token needed)', async () => {
      simulationV2Repo.findByBusinessId.mockResolvedValue(null);
      simulationV2Repo.find.mockResolvedValue([]);

      return request(httpServer()).get('/api/simulations/missing/public').expect(404);
    });

    it('INTEGRATION: strips voiceProfile and voiceProfileId from the public response (direct match)', async () => {
      simulationV2Repo.findByBusinessId.mockResolvedValue({
        ...mockSim,
        status: 'published',
        voiceProfileId: 'vp-1',
      });

      const res = await request(httpServer()).get('/api/simulations/sim-1/public').expect(200);

      const data = asRecord(parseBody(res).data);
      expect(data.id).toBe('sim-1');
      expect(data).not.toHaveProperty('voiceProfile');
      expect(data).not.toHaveProperty('voiceProfileId');
      expect(resolveForScenario).not.toHaveBeenCalled();
    });

    it('INTEGRATION: strips the voice on the id-normalised / title fallback path too', async () => {
      simulationV2Repo.findByBusinessId.mockResolvedValue(null);
      simulationV2Repo.find.mockResolvedValue([
        { ...mockSim, status: 'published', voiceProfileId: 'vp-1' },
      ]);

      const res = await request(httpServer()).get('/api/simulations/SIM_1/public').expect(200);

      const data = asRecord(parseBody(res).data);
      expect(data.id).toBe('sim-1');
      expect(data).not.toHaveProperty('voiceProfile');
      expect(data).not.toHaveProperty('voiceProfileId');
      expect(resolveForScenario).not.toHaveBeenCalled();
    });

    it('INTEGRATION: returns 200 for a known scenario', async () => {
      simulationV2Repo.findByBusinessId.mockResolvedValue(mockSim);

      return request(httpServer())
        .get('/api/simulations/sim-1/public')
        .expect(200)
        .expect((res) => {
          expectSuccessEnvelope(res);
        });
    });
  });

  describe('GET /api/simulations/by-unit/:id', () => {
    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      return request(httpServer()).get('/api/simulations/by-unit/unit-1').expect(401);
    });

    it('INTEGRATION: returns 200 for the unit route', async () => {
      simulationV2Repo.findByUnitId.mockResolvedValue([mockSim]);
      simulationV2Repo.findByBusinessId.mockResolvedValue(null);

      return (
        request(httpServer())
          .get('/api/simulations/by-unit/unit-1')
          // by-unit is @RequiredRoles(EDUCATOR) — a district-admin token is refused by the guard.
          .set('Authorization', `Bearer ${educatorToken}`)
          .expect(200)
          .expect((res) => {
            expectSuccessEnvelope(res);
            expect(simulationV2Repo.findByUnitId).toHaveBeenCalledWith('unit-1');
            expect(simulationV2Repo.findByBusinessId).not.toHaveBeenCalled();
          })
      );
    });

    it('INTEGRATION: backfills default action categories', async () => {
      simulationV2Repo.findByUnitId.mockResolvedValue([mockSim]);

      return (
        request(httpServer())
          .get('/api/simulations/by-unit/unit-1')
          // by-unit is @RequiredRoles(EDUCATOR) — a district-admin token is refused by the guard.
          .set('Authorization', `Bearer ${educatorToken}`)
          .expect(200)
          .expect((res) => {
            const body = parseBody(res);
            const rows = Array.isArray(body.data) ? body.data : [];
            const first = asRecord(rows[0]);
            expect(first.actionCategories).toEqual([
              { id: 'cat_actions', name: 'ACTIONS', scenarioId: 'sim-1' },
              { id: 'cat_assessments', name: 'ASSESSMENTS', scenarioId: 'sim-1' },
              { id: 'cat_care', name: 'CARE', scenarioId: 'sim-1' },
              { id: 'cat_interventions', name: 'INTERVENTIONS', scenarioId: 'sim-1' },
              { id: 'cat_tasks', name: 'TASKS', scenarioId: 'sim-1' },
            ]);
          })
      );
    });
  });
});
