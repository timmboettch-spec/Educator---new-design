/// <reference types="jest" />
import { HttpException, NotFoundException } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { ScenariosController } from '../../../../../src/student-backend/modules/scenarios/scenarios.controller';
import { ScenariosService } from '../../../../../src/student-backend/modules/scenarios/scenarios.service';
import { ScenarioAuthGuard } from '../../../../../src/student-backend/guards/scenario-auth.guard';
import { ScenarioAssignmentGuard } from '../../../../../src/student-backend/modules/scenarios/guards/scenario-assignment.guard';
import { createTestApp, closeTestApp } from '../../common/setup/supertest.setup';
import { apiGet } from '../../common/utils/api.helper';
import { ENDPOINTS } from '../../common/constants/endpoints';
import { STATUS } from '../../common/constants/status-codes';

describe('Scenarios API — Negative Tests', () => {
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
  });

  // ─── 400 – Bad Request ────────────────────────────────────────────────────────

  describe('404 – Not Found', () => {
    it('GET /scenarios/:id returns 404 when scenario does not exist', async () => {
      mockScenariosService.findOne.mockRejectedValue(new NotFoundException('Scenario not found'));

      const res = await apiGet(app, ENDPOINTS.SCENARIOS.BY_ID('non-existent-id'));

      expect(res.status).toBe(STATUS.NOT_FOUND);
    });

    it('GET /scenarios/unit/:unitId returns 404 when unit does not exist', async () => {
      mockScenariosService.findByUnit.mockRejectedValue(new NotFoundException('Unit not found'));

      const res = await apiGet(app, ENDPOINTS.SCENARIOS.BY_UNIT('no-such-unit'));

      expect(res.status).toBe(STATUS.NOT_FOUND);
    });
  });

  // ─── 405 – Method Not Allowed ─────────────────────────────────────────────────

  describe('405 – Method Not Allowed', () => {
    it('DELETE /scenarios returns 404 or 405 when method is not supported on collection', async () => {
      const res = await request(app.getHttpServer()).delete(ENDPOINTS.SCENARIOS.ROOT);
      expect([STATUS.METHOD_NOT_ALLOWED, STATUS.NOT_FOUND]).toContain(res.status);
    });

    it('PUT /scenarios/:id returns 404 or 405 when wrong HTTP method is used instead of PATCH', async () => {
      const res = await request(app.getHttpServer())
        .put(ENDPOINTS.SCENARIOS.BY_ID('s-001'))
        .send({ title: 'Updated' });
      expect([STATUS.METHOD_NOT_ALLOWED, STATUS.NOT_FOUND]).toContain(res.status);
    });
  });

  // ─── 408 – Request Timeout ────────────────────────────────────────────────────

  describe('408 – Request Timeout', () => {
    it('GET /scenarios returns 408 when service times out', async () => {
      mockScenariosService.findAll.mockRejectedValue(
        new HttpException('Request Timeout', STATUS.REQUEST_TIMEOUT),
      );

      const res = await apiGet(app, ENDPOINTS.SCENARIOS.ROOT);

      expect(res.status).toBe(STATUS.REQUEST_TIMEOUT);
    });
  });

  // ─── 409 – Conflict ───────────────────────────────────────────────────────────

  describe('429 – Too Many Requests', () => {
    it('GET /scenarios returns 429 when rate limit is exceeded', async () => {
      mockScenariosService.findAll.mockRejectedValue(
        new HttpException('Too Many Requests', STATUS.TOO_MANY_REQUESTS),
      );

      const res = await apiGet(app, ENDPOINTS.SCENARIOS.ROOT);

      expect(res.status).toBe(STATUS.TOO_MANY_REQUESTS);
    });
  });

  // ─── 500 – Internal Server Error ─────────────────────────────────────────────

  describe('500 – Internal Server Error', () => {
    it('GET /scenarios returns 500 when an unexpected error occurs', async () => {
      mockScenariosService.findAll.mockRejectedValue(new Error('Unexpected storage failure'));

      const res = await apiGet(app, ENDPOINTS.SCENARIOS.ROOT);

      expect(res.status).toBe(STATUS.INTERNAL_SERVER_ERROR);
    });
  });

  // ─── 502 – Bad Gateway ───────────────────────────────────────────────────────

  describe('502 – Bad Gateway', () => {
    it('GET /scenarios returns 502 when upstream service returns invalid response', async () => {
      mockScenariosService.findAll.mockRejectedValue(
        new HttpException('Bad Gateway', STATUS.BAD_GATEWAY),
      );

      const res = await apiGet(app, ENDPOINTS.SCENARIOS.ROOT);

      expect(res.status).toBe(STATUS.BAD_GATEWAY);
    });
  });

  // ─── 503 – Service Unavailable ───────────────────────────────────────────────

  describe('503 – Service Unavailable', () => {
    it('GET /scenarios returns 503 when the service is under maintenance', async () => {
      mockScenariosService.findAll.mockRejectedValue(
        new HttpException('Service Unavailable', STATUS.SERVICE_UNAVAILABLE),
      );

      const res = await apiGet(app, ENDPOINTS.SCENARIOS.ROOT);

      expect(res.status).toBe(STATUS.SERVICE_UNAVAILABLE);
    });
  });

  // ─── 504 – Gateway Timeout ────────────────────────────────────────────────────

  describe('504 – Gateway Timeout', () => {
    it('GET /scenarios returns 504 when upstream service does not respond in time', async () => {
      mockScenariosService.findAll.mockRejectedValue(
        new HttpException('Gateway Timeout', STATUS.GATEWAY_TIMEOUT),
      );

      const res = await apiGet(app, ENDPOINTS.SCENARIOS.ROOT);

      expect(res.status).toBe(STATUS.GATEWAY_TIMEOUT);
    });
  });
});
