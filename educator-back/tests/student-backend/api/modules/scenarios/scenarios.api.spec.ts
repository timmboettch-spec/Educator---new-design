/// <reference types="jest" />
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { ScenariosController } from '../../../../../src/student-backend/modules/scenarios/scenarios.controller';
import { ScenariosService } from '../../../../../src/student-backend/modules/scenarios/scenarios.service';
import { AutomationAccessService } from 'src/common/services/automation-access.service';
import { SIMULATION_V2_REPOSITORY, UNIT_REPOSITORY } from 'src/database/tokens';
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

  const mockSimulationV2Repository = {
    find: jest.fn(),
    findByUnitId: jest.fn(),
    findByBusinessId: jest.fn(),
  };

  const mockUnitRepository = {
    findByBusinessId: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ScenariosController],
      providers: [
        ScenariosService,
        {
          provide: AutomationAccessService,
          useValue: {
            filterRecords: jest.fn((records) => records),
            canAccessRecord: jest.fn(() => true),
          },
        },
        { provide: UNIT_REPOSITORY, useValue: mockUnitRepository },
        { provide: SIMULATION_V2_REPOSITORY, useValue: mockSimulationV2Repository },
      ],
    }).compile();

    app = await createTestApp(moduleRef);
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockSimulationV2Repository.find.mockResolvedValue(mockScenarios);
    mockSimulationV2Repository.findByUnitId.mockResolvedValue(mockScenarios);
    mockSimulationV2Repository.findByBusinessId.mockResolvedValue(mockScenario);
    mockUnitRepository.findByBusinessId.mockResolvedValue(mockUnit);
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
});
