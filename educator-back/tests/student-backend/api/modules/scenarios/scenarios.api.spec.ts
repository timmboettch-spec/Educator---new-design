/// <reference types="jest" />
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { ScenariosController } from '../../../../../src/student-backend/modules/scenarios/scenarios.controller';
import { ScenariosService } from '../../../../../src/student-backend/modules/scenarios/scenarios.service';
import { JsonDataService } from '../../../../../src/student-backend/data/json-data.service';
import { ScenarioAuthGuard } from '../../../../../src/student-backend/guards/scenario-auth.guard';
import { ScenarioAssignmentGuard } from '../../../../../src/student-backend/modules/scenarios/guards/scenario-assignment.guard';
import { createTestApp, closeTestApp } from '../../common/setup/supertest.setup';
import { apiGet } from '../../common/utils/api.helper';
import { ENDPOINTS } from '../../common/constants/endpoints';
import { STATUS } from '../../common/constants/status-codes';

/**
 * HTTP contract tests for the Scenarios API.
 * Validates response shapes, headers, and behaviour under real HTTP round-trips.
 */
describe('Scenarios API — HTTP contract', () => {
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
    getUnitById: jest.fn(),
    getTranscriptsByUserId: jest.fn(),
    getAllScenariosLocalized: jest.fn(),
    getScenariosByUnitIdLocalized: jest.fn(),
    getScenarioByIdLocalized: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ScenariosController],
      providers: [ScenariosService, { provide: JsonDataService, useValue: mockJsonDataService }],
    })
      .overrideGuard(ScenarioAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ScenarioAssignmentGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = await createTestApp(moduleRef);
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockJsonDataService.getUnitById.mockReturnValue(mockUnit);
    mockJsonDataService.getScenarios.mockReturnValue(mockScenarios);
    mockJsonDataService.getScenarioById.mockReturnValue(mockScenario);
    mockJsonDataService.getScenarioByIdFresh.mockResolvedValue(mockScenario);
    mockJsonDataService.getScenariosByUnitId.mockReturnValue(mockScenarios);
    mockJsonDataService.getDefaultScenario.mockReturnValue(mockScenario);
    mockJsonDataService.getTranscriptsByUserId.mockReturnValue([]);
    mockJsonDataService.getAllScenariosLocalized.mockResolvedValue(mockScenarios);
    mockJsonDataService.getScenariosByUnitIdLocalized.mockResolvedValue(mockScenarios);
    mockJsonDataService.getScenarioByIdLocalized.mockResolvedValue(mockScenario);
  });

  // ─── GET /scenarios — array shape ─────────────────────────────────────────────

  describe('GET /scenarios', () => {
    it('responds with an array', async () => {
      const res = await apiGet(app, ENDPOINTS.SCENARIOS.ROOT);

      expect(res.status).toBe(STATUS.OK);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('returns objects that have id and title fields', async () => {
      const res = await apiGet(app, ENDPOINTS.SCENARIOS.ROOT);

      for (const item of res.body) {
        expect(item).toHaveProperty('id');
        expect(item).toHaveProperty('title');
      }
    });
  });

  // ─── GET /scenarios/:id — object shape ────────────────────────────────────────

  describe('GET /scenarios/:id', () => {
    it('returns an object with id matching the path param', async () => {
      const res = await apiGet(app, ENDPOINTS.SCENARIOS.BY_ID('scenario-001'));

      expect(res.status).toBe(STATUS.OK);
      expect(res.body).toMatchObject({
        id: 'scenario-001',
        title: 'Test Scenario',
      });
    });
  });

  // ─── GET /scenarios/unit/:unitId ──────────────────────────────────────────────

  describe('GET /scenarios/unit/:unitId', () => {
    it('returns only scenarios belonging to that unit', async () => {
      const res = await apiGet(app, ENDPOINTS.SCENARIOS.BY_UNIT('unit-001'));

      expect(res.status).toBe(STATUS.OK);
      expect(Array.isArray(res.body)).toBe(true);
      for (const item of res.body) {
        expect(item.unitId).toBe('unit-001');
      }
    });
  });

  // ─── GET /scenarios/default ───────────────────────────────────────────────────

  describe('GET /scenarios/default', () => {
    it('returns a scenario object', async () => {
      const res = await apiGet(app, ENDPOINTS.SCENARIOS.DEFAULT);

      expect(res.status).toBe(STATUS.OK);
      expect(res.body).toHaveProperty('id');
    });
  });
});
