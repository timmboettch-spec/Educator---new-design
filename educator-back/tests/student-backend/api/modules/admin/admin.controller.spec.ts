/// <reference types="jest" />
import { NotFoundException } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { AdminModule } from '../../../../../src/student-backend/modules/admin/admin.module';
import { AdminService } from '../../../../../src/student-backend/modules/admin/admin.service';
import { createTestApp, closeTestApp } from '../../common/setup/supertest.setup';
import { apiGet, apiPost, apiPut, apiDelete } from '../../common/utils/api.helper';
import { ENDPOINTS } from '../../common/constants/endpoints';
import { STATUS } from '../../common/constants/status-codes';
import adminFixtures from '../../common/fixtures/admin.requests.json';

describe('Admin API (controller)', () => {
  let app: INestApplication;

  const mockAdminService = {
    getAllScenarios: jest.fn(),
    getScenarioById: jest.fn(),
    createScenario: jest.fn(),
    updateScenario: jest.fn(),
    deleteScenario: jest.fn(),
    getAllUnits: jest.fn(),
    getUnitById: jest.fn(),
    createUnit: jest.fn(),
    updateUnit: jest.fn(),
    deleteUnit: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AdminModule],
    })
      .overrideProvider(AdminService)
      .useValue(mockAdminService)
      .compile();

    app = await createTestApp(moduleRef);
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── Scenarios ───────────────────────────────────────────────────────────────

  describe('GET /admin/scenarios', () => {
    it('returns 200 with scenario list', async () => {
      mockAdminService.getAllScenarios.mockResolvedValue([{ id: 's-001', title: 'Scenario 1' }]);

      const res = await apiGet(app, ENDPOINTS.ADMIN.SCENARIOS);

      expect(res.status).toBe(STATUS.OK);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /admin/scenarios/:id', () => {
    it('returns 200 when scenario is found', async () => {
      mockAdminService.getScenarioById.mockResolvedValue({
        id: 's-001',
        title: 'Scenario 1',
      });

      const res = await apiGet(app, ENDPOINTS.ADMIN.SCENARIO('s-001'));

      expect(res.status).toBe(STATUS.OK);
      expect(res.body).toHaveProperty('id', 's-001');
    });

    it('returns 404 when scenario is not found', async () => {
      mockAdminService.getScenarioById.mockRejectedValue(
        new NotFoundException('Scenario not found'),
      );

      const res = await apiGet(app, ENDPOINTS.ADMIN.SCENARIO('ghost-id'));

      expect(res.status).toBe(STATUS.NOT_FOUND);
    });
  });

  describe('POST /admin/scenarios', () => {
    it('returns 201 on successful scenario creation', async () => {
      mockAdminService.createScenario.mockResolvedValue({
        id: 'scenario-api-001',
      });

      const res = await apiPost(app, ENDPOINTS.ADMIN.SCENARIOS, adminFixtures.createScenario.valid);

      expect(res.status).toBe(STATUS.CREATED);
      expect(mockAdminService.createScenario).toHaveBeenCalledTimes(1);
    });

    it('returns 400 when scenario ID is missing', async () => {
      const res = await apiPost(
        app,
        ENDPOINTS.ADMIN.SCENARIOS,
        adminFixtures.createScenario.missingId,
      );

      expect(res.status).toBe(STATUS.BAD_REQUEST);
      expect(mockAdminService.createScenario).not.toHaveBeenCalled();
    });
  });

  describe('PUT /admin/scenarios/:id', () => {
    it('returns 200 on successful scenario update', async () => {
      mockAdminService.updateScenario.mockResolvedValue({
        id: 's-001',
        title: 'Updated',
      });

      const res = await apiPut(app, ENDPOINTS.ADMIN.SCENARIO('s-001'), {
        title: 'Updated',
      });

      expect(res.status).toBe(STATUS.OK);
      expect(mockAdminService.updateScenario).toHaveBeenCalledWith('s-001', expect.any(Object));
    });
  });

  describe('DELETE /admin/scenarios/:id', () => {
    it('returns 200 on successful scenario deletion', async () => {
      mockAdminService.deleteScenario.mockResolvedValue({ deleted: true });

      const res = await apiDelete(app, ENDPOINTS.ADMIN.SCENARIO('s-001'));

      expect(res.status).toBe(STATUS.OK);
      expect(mockAdminService.deleteScenario).toHaveBeenCalledWith('s-001');
    });
  });

  // ─── Units ───────────────────────────────────────────────────────────────────

  describe('GET /admin/units', () => {
    it('returns 200 with units list', async () => {
      mockAdminService.getAllUnits.mockResolvedValue([{ id: 'unit-001', name: 'Nursing' }]);

      const res = await apiGet(app, ENDPOINTS.ADMIN.UNITS);

      expect(res.status).toBe(STATUS.OK);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('POST /admin/units', () => {
    it('returns 201 on successful unit creation', async () => {
      mockAdminService.createUnit.mockResolvedValue({
        id: 'unit-api-001',
        name: 'API Test Unit',
      });

      const res = await apiPost(app, ENDPOINTS.ADMIN.UNITS, adminFixtures.createUnit.valid);

      expect(res.status).toBe(STATUS.CREATED);
      expect(mockAdminService.createUnit).toHaveBeenCalledTimes(1);
    });
  });
});
