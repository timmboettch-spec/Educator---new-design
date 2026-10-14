/// <reference types="jest" />
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AdminModule } from '../../../../../src/student-backend/modules/admin/admin.module';
import { AdminService } from '../../../../../src/student-backend/modules/admin/admin.service';
import { createTestApp, closeTestApp } from '../../common/setup/supertest.setup';
import { apiGet, apiPost, apiPut, apiDelete } from '../../common/utils/api.helper';
import { ENDPOINTS } from '../../common/constants/endpoints';
import { STATUS } from '../../common/constants/status-codes';

describe('Admin API — Negative Tests', () => {
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

  // ─── 400 – Bad Request ────────────────────────────────────────────────────────

  describe('400 – Bad Request', () => {
    it('POST /admin/scenarios returns 400 when scenario ID is missing', async () => {
      const res = await apiPost(app, ENDPOINTS.ADMIN.SCENARIOS, {
        title: 'No ID Scenario',
      });
      expect(res.status).toBe(STATUS.BAD_REQUEST);
    });

    it('POST /admin/units returns 400 when required fields are missing', async () => {
      mockAdminService.createUnit.mockRejectedValue(
        new BadRequestException('Required fields are missing'),
      );

      const res = await apiPost(app, ENDPOINTS.ADMIN.UNITS, {});
      expect(res.status).toBe(STATUS.BAD_REQUEST);
    });
  });

  // ─── 401 – Unauthorized ───────────────────────────────────────────────────────

  describe('401 – Unauthorized', () => {
    it('GET /admin/scenarios returns 401 when no token is provided', async () => {
      mockAdminService.getAllScenarios.mockRejectedValue(
        new UnauthorizedException('Missing authentication token'),
      );

      const res = await apiGet(app, ENDPOINTS.ADMIN.SCENARIOS);

      expect(res.status).toBe(STATUS.UNAUTHORIZED);
    });
  });

  // ─── 403 – Forbidden ──────────────────────────────────────────────────────────

  describe('403 – Forbidden', () => {
    it('GET /admin/scenarios returns 403 when access is denied', async () => {
      mockAdminService.getAllScenarios.mockRejectedValue(
        new ForbiddenException('Insufficient permissions'),
      );

      const res = await apiGet(app, ENDPOINTS.ADMIN.SCENARIOS);

      expect(res.status).toBe(STATUS.FORBIDDEN);
    });
  });

  // ─── 404 – Not Found ──────────────────────────────────────────────────────────

  describe('404 – Not Found', () => {
    it('GET /admin/scenarios/:id returns 404 when scenario does not exist', async () => {
      mockAdminService.getScenarioById.mockRejectedValue(
        new NotFoundException('Scenario not found'),
      );

      const res = await apiGet(app, ENDPOINTS.ADMIN.SCENARIO('non-existent-id'));

      expect(res.status).toBe(STATUS.NOT_FOUND);
    });

    it('GET /admin/units/:id returns 404 when unit does not exist', async () => {
      mockAdminService.getUnitById.mockRejectedValue(new NotFoundException('Unit not found'));

      const res = await apiGet(app, ENDPOINTS.ADMIN.UNIT('no-such-unit'));

      expect(res.status).toBe(STATUS.NOT_FOUND);
    });
  });

  // ─── 405 – Method Not Allowed ─────────────────────────────────────────────────

  describe('405 – Method Not Allowed', () => {
    it('PATCH /admin/students returns 404 or 405 when method is not supported', async () => {
      const res = await request(app.getHttpServer())
        .patch(ENDPOINTS.ADMIN.STUDENTS)
        .send({ name: 'Test' });
      expect([STATUS.METHOD_NOT_ALLOWED, STATUS.NOT_FOUND]).toContain(res.status);
    });
  });

  // ─── 408 – Request Timeout ────────────────────────────────────────────────────

  describe('409 – Conflict', () => {
    it('POST /admin/scenarios returns 409 when scenario ID already exists', async () => {
      mockAdminService.createScenario.mockRejectedValue(
        new ConflictException('Scenario with this ID already exists'),
      );

      const res = await apiPost(app, ENDPOINTS.ADMIN.SCENARIOS, {
        id: 'existing-id',
        title: 'Duplicate Scenario',
        unitId: 'unit-001',
        estimatedDuration: '20 minutes',
      });

      expect(res.status).toBe(STATUS.CONFLICT);
    });
  });

  // ─── 415 – Unsupported Media Type ─────────────────────────────────────────────

  describe('415 – Unsupported Media Type', () => {
    it('POST /admin/scenarios returns 415 when service rejects the media type', async () => {
      mockAdminService.createScenario.mockRejectedValue(
        new HttpException('Unsupported Media Type', STATUS.UNSUPPORTED_MEDIA_TYPE),
      );

      const res = await apiPost(app, ENDPOINTS.ADMIN.SCENARIOS, {
        id: 's-001',
        title: 'Scenario',
        unitId: 'unit-001',
        estimatedDuration: '20 minutes',
      });

      expect(res.status).toBe(STATUS.UNSUPPORTED_MEDIA_TYPE);
    });
  });

  // ─── 422 – Unprocessable Entity ───────────────────────────────────────────────

  describe('422 – Unprocessable Entity', () => {
    it('PUT /admin/scenarios/:id returns 422 when update data is semantically invalid', async () => {
      mockAdminService.updateScenario.mockRejectedValue(
        new UnprocessableEntityException('Invalid scenario configuration'),
      );

      const res = await apiPut(app, ENDPOINTS.ADMIN.SCENARIO('s-001'), {
        title: 'Updated Title',
      });

      expect(res.status).toBe(STATUS.UNPROCESSABLE_ENTITY);
    });
  });

  // ─── 429 – Too Many Requests ──────────────────────────────────────────────────

  describe('500 – Internal Server Error', () => {
    it('POST /admin/scenarios returns 500 when creation fails unexpectedly', async () => {
      mockAdminService.createScenario.mockRejectedValue(new Error('Database write failed'));

      const res = await apiPost(app, ENDPOINTS.ADMIN.SCENARIOS, {
        id: 's-new',
        title: 'New Scenario',
        unitId: 'unit-001',
        estimatedDuration: '20 minutes',
      });

      expect(res.status).toBe(STATUS.INTERNAL_SERVER_ERROR);
    });
  });

  // ─── 502 – Bad Gateway ───────────────────────────────────────────────────────

  describe('502 – Bad Gateway', () => {
    it('GET /admin/scenarios returns 502 when upstream service returns invalid response', async () => {
      mockAdminService.getAllScenarios.mockRejectedValue(
        new HttpException('Bad Gateway', STATUS.BAD_GATEWAY),
      );

      const res = await apiGet(app, ENDPOINTS.ADMIN.SCENARIOS);

      expect(res.status).toBe(STATUS.BAD_GATEWAY);
    });
  });

  // ─── 503 – Service Unavailable ───────────────────────────────────────────────

  describe('503 – Service Unavailable', () => {
    it('GET /admin/units returns 503 when the service is under maintenance', async () => {
      mockAdminService.getAllUnits.mockRejectedValue(
        new HttpException('Service Unavailable', STATUS.SERVICE_UNAVAILABLE),
      );

      const res = await apiGet(app, ENDPOINTS.ADMIN.UNITS);

      expect(res.status).toBe(STATUS.SERVICE_UNAVAILABLE);
    });
  });

  // ─── 504 – Gateway Timeout ────────────────────────────────────────────────────
});
