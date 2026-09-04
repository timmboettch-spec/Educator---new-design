import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { ScenariosController } from '@/modules/scenarios/scenarios.controller';
import { ScenariosService } from '@/modules/scenarios/scenarios.service';
import { JsonDataService } from '@/data/json-data.service';
import { ScenarioAuthGuard } from '@/guards/scenario-auth.guard';
import { ScenarioAssignmentGuard } from '@/modules/scenarios/guards/scenario-assignment.guard';

describe('Scenarios API (Integration)', () => {
  let app: INestApplication;

  const mockUnit = { id: 'unit-001', name: 'Nursing' };

  const mockScenario = {
    id: 'scenario-001',
    title: 'Test Scenario',
    unitId: 'unit-001',
  };

  const mockScenarios = [
    { id: 'scenario-001', title: 'Scenario 1', unitId: 'unit-001' },
    { id: 'scenario-002', title: 'Scenario 2', unitId: 'unit-001' },
  ];

  const mockJsonDataService = {
    getDefaultScenario: jest.fn(),
    getScenarioByIdFresh: jest.fn(),
    getScenarios: jest.fn(),
    getScenariosByUnitId: jest.fn(),
    getScenarioById: jest.fn(),
    // Localized wrappers used by ScenariosService. Delegate to the plain
    // getters so existing test setup that seeds `.getScenarios`,
    // `.getScenariosByUnitId`, and `.getScenarioByIdFresh` continues to
    // drive the endpoints without duplicating fixture wiring.
    getAllScenariosLocalized: jest.fn(),
    getScenariosByUnitIdLocalized: jest.fn(),
    getScenarioByIdLocalized: jest.fn(),
    getUnitById: jest.fn(),
    getTranscriptsByUserId: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ScenariosController],
      providers: [ScenariosService, { provide: JsonDataService, useValue: mockJsonDataService }],
    })
      .overrideGuard(ScenarioAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ScenarioAssignmentGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockJsonDataService.getUnitById.mockReturnValue(mockUnit);
    mockJsonDataService.getTranscriptsByUserId.mockReturnValue([]);
    // Wire the localized wrappers to delegate to the non-localized fakes
    // that the individual tests seed via `.mockReturnValue(...)`.
    mockJsonDataService.getAllScenariosLocalized.mockImplementation(async () =>
      mockJsonDataService.getScenarios(),
    );
    mockJsonDataService.getScenariosByUnitIdLocalized.mockImplementation(async (unitId: string) =>
      mockJsonDataService.getScenariosByUnitId(unitId),
    );
    mockJsonDataService.getScenarioByIdLocalized.mockImplementation(async (id: string) =>
      mockJsonDataService.getScenarioByIdFresh(id),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /scenarios/default
  // ─────────────────────────────────────────────────────────────────────────

  describe('GET /scenarios/default', () => {
    it('returns 200 with the default scenario', async () => {
      mockJsonDataService.getDefaultScenario.mockReturnValue(mockScenario);

      const res = await request(app.getHttpServer()).get('/scenarios/default').expect(200);

      expect(res.body.id).toBe('scenario-001');
    });

    it('returns 404 when no default scenario is configured', async () => {
      mockJsonDataService.getDefaultScenario.mockReturnValue(null);

      await request(app.getHttpServer()).get('/scenarios/default').expect(404);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /scenarios/default/:id
  // ─────────────────────────────────────────────────────────────────────────

  describe('GET /scenarios/default/:id', () => {
    it('returns 200 with the matching scenario when id exists', async () => {
      mockJsonDataService.getScenarioByIdFresh.mockResolvedValue(mockScenario);

      const res = await request(app.getHttpServer())
        .get('/scenarios/default/scenario-001')
        .expect(200);

      expect(res.body.id).toBe('scenario-001');
      expect(mockJsonDataService.getScenarioByIdFresh).toHaveBeenCalledWith('scenario-001');
    });

    it('returns 404 when the scenario id does not exist', async () => {
      mockJsonDataService.getScenarioByIdFresh.mockResolvedValue(undefined);

      await request(app.getHttpServer()).get('/scenarios/default/non-existent').expect(404);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /scenarios
  // ─────────────────────────────────────────────────────────────────────────

  describe('GET /scenarios', () => {
    it('returns 200 with an array of all scenarios', async () => {
      mockJsonDataService.getScenarios.mockReturnValue(mockScenarios);

      const res = await request(app.getHttpServer()).get('/scenarios').expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);
    });

    it('each scenario includes the unit object', async () => {
      mockJsonDataService.getScenarios.mockReturnValue(mockScenarios);

      const res = await request(app.getHttpServer()).get('/scenarios').expect(200);

      expect(res.body[0].unit).toEqual(mockUnit);
    });

    it('returns empty array when no scenarios exist', async () => {
      mockJsonDataService.getScenarios.mockReturnValue([]);

      const res = await request(app.getHttpServer()).get('/scenarios').expect(200);

      expect(res.body).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /scenarios/unit/:unitId
  // ─────────────────────────────────────────────────────────────────────────

  describe('GET /scenarios/unit/:unitId', () => {
    it('returns 200 with scenarios for the given unit', async () => {
      mockJsonDataService.getScenariosByUnitId.mockReturnValue(mockScenarios);

      const res = await request(app.getHttpServer()).get('/scenarios/unit/unit-001').expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0].unitId).toBe('unit-001');
      expect(mockJsonDataService.getScenariosByUnitId).toHaveBeenCalledWith('unit-001');
    });

    it('does not include completed/progress when no Authorization header', async () => {
      mockJsonDataService.getScenariosByUnitId.mockReturnValue(mockScenarios);

      const res = await request(app.getHttpServer()).get('/scenarios/unit/unit-001').expect(200);

      expect(res.body[0].completed).toBeUndefined();
      expect(res.body[0].progress).toBeUndefined();
    });

    it('includes completion info when Authorization header is provided', async () => {
      mockJsonDataService.getScenariosByUnitId.mockReturnValue(mockScenarios);
      mockJsonDataService.getTranscriptsByUserId.mockReturnValue([
        { scenarioId: 'scenario-001', userId: 'user1', endedAt: '2024-01-01' },
      ]);

      const res = await request(app.getHttpServer())
        .get('/scenarios/unit/unit-001')
        .set('Authorization', 'Bearer token-user1')
        .expect(200);

      const completed = res.body.find((s: { id: string }) => s.id === 'scenario-001');
      const incomplete = res.body.find((s: { id: string }) => s.id === 'scenario-002');

      expect(completed.completed).toBe(true);
      expect(completed.progress).toBe(100);
      expect(incomplete.completed).toBe(false);
      expect(incomplete.progress).toBe(0);
    });

    it('returns empty array when no scenarios exist for the unit', async () => {
      mockJsonDataService.getScenariosByUnitId.mockReturnValue([]);

      const res = await request(app.getHttpServer()).get('/scenarios/unit/unit-999').expect(200);

      expect(res.body).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /scenarios/:id
  // ─────────────────────────────────────────────────────────────────────────

  describe('GET /scenarios/:id', () => {
    it('returns 200 with the scenario and its unit', async () => {
      mockJsonDataService.getScenarioByIdFresh.mockResolvedValue(mockScenario);

      const res = await request(app.getHttpServer()).get('/scenarios/scenario-001').expect(200);

      expect(res.body.id).toBe('scenario-001');
      expect(res.body.unit).toEqual(mockUnit);
    });

    it('returns 404 when scenario does not exist', async () => {
      mockJsonDataService.getScenarioByIdFresh.mockResolvedValue(undefined);

      await request(app.getHttpServer()).get('/scenarios/non-existent').expect(404);
    });

    it('includes completed=true and progress=100 when user has a completed transcript', async () => {
      mockJsonDataService.getScenarioByIdFresh.mockResolvedValue(mockScenario);
      mockJsonDataService.getTranscriptsByUserId.mockReturnValue([
        { scenarioId: 'scenario-001', userId: 'user1', endedAt: '2024-01-01' },
      ]);

      const res = await request(app.getHttpServer())
        .get('/scenarios/scenario-001')
        .set('Authorization', 'Bearer token-user1')
        .expect(200);

      expect(res.body.completed).toBe(true);
      expect(res.body.progress).toBe(100);
    });

    it('includes completed=false and progress=0 when user has no matching transcript', async () => {
      mockJsonDataService.getScenarioByIdFresh.mockResolvedValue(mockScenario);

      const res = await request(app.getHttpServer())
        .get('/scenarios/scenario-001')
        .set('Authorization', 'Bearer token-user1')
        .expect(200);

      expect(res.body.completed).toBe(false);
      expect(res.body.progress).toBe(0);
    });

    it('does not include completed/progress when no Authorization header', async () => {
      mockJsonDataService.getScenarioByIdFresh.mockResolvedValue(mockScenario);

      const res = await request(app.getHttpServer()).get('/scenarios/scenario-001').expect(200);

      expect(res.body.completed).toBeUndefined();
      expect(res.body.progress).toBeUndefined();
    });
  });
});
