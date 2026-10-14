/// <reference types="jest" />
import { NotFoundException } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { ScenariosController } from '../../../../../src/student-backend/modules/scenarios/scenarios.controller';
import { ScenariosService } from '../../../../../src/student-backend/modules/scenarios/scenarios.service';
import { createTestApp, closeTestApp } from '../../common/setup/supertest.setup';
import { apiGet } from '../../common/utils/api.helper';
// import { studentToken } from '../../common/utils/auth-token.helper'; // only used by the disabled GET /scenarios/unit/:unitId test
import { ENDPOINTS } from '../../common/constants/endpoints';
import { STATUS } from '../../common/constants/status-codes';
import scenarioFixtures from '../../common/fixtures/scenario.requests.json';

describe('Scenarios API — controller routes', () => {
  let app: INestApplication;

  const mockScenariosService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    findByUnit: jest.fn(),
    getDefaultScenario: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ScenariosController],
      providers: [{ provide: ScenariosService, useValue: mockScenariosService }],
    })
      .compile();

    app = await createTestApp(moduleRef);
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── GET /scenarios ───────────────────────────────────────────────────────────

  describe('GET /scenarios', () => {
    it('returns 200 with all scenarios', async () => {
      const scenarios = [{ id: 's-001', title: 'Scenario 1' }];
      mockScenariosService.findAll.mockResolvedValue(scenarios);

      const res = await apiGet(app, ENDPOINTS.SCENARIOS.ROOT);

      expect(res.status).toBe(STATUS.OK);
      expect(res.body).toEqual(scenarios);
    });
  });

  // ─── GET /scenarios/default and GET /scenarios/unit/:unitId — disabled, routes commented out ──

  // describe('GET /scenarios/default', () => {
  //   it('returns 200 with default scenario', async () => {
  //     const defaultScenario = { id: 'default-001', title: 'Default' };
  //     mockScenariosService.getDefaultScenario.mockResolvedValue(defaultScenario);
  //
  //     const res = await apiGet(app, ENDPOINTS.SCENARIOS.DEFAULT);
  //
  //     expect(res.status).toBe(STATUS.OK);
  //     expect(mockScenariosService.getDefaultScenario).toHaveBeenCalledWith();
  //   });
  // });
  //
  // describe('GET /scenarios/unit/:unitId', () => {
  //   it('returns 200 with scenarios for the given unit', async () => {
  //     const scenarios = [{ id: 's-001', unitId: 'unit-001' }];
  //     mockScenariosService.findByUnit.mockResolvedValue(scenarios);
  //     const token = studentToken('user-42');
  //
  //     const res = await apiGet(app, ENDPOINTS.SCENARIOS.BY_UNIT('unit-001'), token);
  //
  //     expect(res.status).toBe(STATUS.OK);
  //     expect(mockScenariosService.findByUnit).toHaveBeenCalledWith('unit-001', 'user-42');
  //   });
  // });

  // ─── GET /scenarios/:id ───────────────────────────────────────────────────────

  describe('GET /scenarios/:id', () => {
    it('returns 200 with the matching scenario', async () => {
      const mockScenario = { id: 's-001', title: 'Scenario 1' };
      mockScenariosService.findOne.mockResolvedValue(mockScenario);

      const res = await apiGet(app, ENDPOINTS.SCENARIOS.BY_ID('s-001'));

      expect(res.status).toBe(STATUS.OK);
      expect(res.body).toEqual(mockScenario);
    });

    it('propagates NotFoundException when scenario does not exist', async () => {
      mockScenariosService.findOne.mockRejectedValue(new NotFoundException('Not found'));

      const res = await apiGet(app, ENDPOINTS.SCENARIOS.BY_ID('ghost-id'));

      expect(res.status).toBe(STATUS.NOT_FOUND);
    });
  });
});
