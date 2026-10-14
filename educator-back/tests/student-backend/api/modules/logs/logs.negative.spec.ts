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
import { LogsModule } from '../../../../../src/student-backend/modules/logs/logs.module';
import { LogsService } from '../../../../../src/student-backend/modules/logs/logs.service';
import { createTestApp, closeTestApp } from '../../common/setup/supertest.setup';
import { apiGet, apiPost, apiPut } from '../../common/utils/api.helper';
import { ENDPOINTS } from '../../common/constants/endpoints';
import { STATUS } from '../../common/constants/status-codes';

describe('Logs API — Negative Tests', () => {
  let app: INestApplication;

  const mockLogsService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    findByScenario: jest.fn(),
    update: jest.fn(),
    endLog: jest.fn(),
    appendMessages: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [LogsModule],
    })
      .overrideProvider(LogsService)
      .useValue(mockLogsService)
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
    it('POST /logs returns 400 when body is empty (missing scenarioId)', async () => {
      mockLogsService.create.mockRejectedValue(new BadRequestException('scenarioId is required'));

      const res = await apiPost(app, ENDPOINTS.LOGS.ROOT, {});

      expect(res.status).toBe(STATUS.BAD_REQUEST);
    });

    it('PUT /logs/:id returns 400 when body contains invalid fields', async () => {
      const res = await apiPut(app, ENDPOINTS.LOGS.BY_ID('log-001'), {
        unknownField: 'invalid',
      });

      expect(res.status).toBe(STATUS.BAD_REQUEST);
    });
  });

  // ─── 401 – Unauthorized ───────────────────────────────────────────────────────

  describe('401 – Unauthorized', () => {
    it('GET /logs returns 401 when access requires authentication', async () => {
      mockLogsService.findAll.mockRejectedValue(
        new UnauthorizedException('Authentication required'),
      );

      const res = await apiGet(app, ENDPOINTS.LOGS.ROOT);

      expect(res.status).toBe(STATUS.UNAUTHORIZED);
    });
  });

  // ─── 403 – Forbidden ──────────────────────────────────────────────────────────

  describe('403 – Forbidden', () => {
    it('POST /logs returns 403 when role lacks permission to create logs', async () => {
      mockLogsService.create.mockRejectedValue(new ForbiddenException('Insufficient permissions'));

      const res = await apiPost(app, ENDPOINTS.LOGS.ROOT, {
        scenarioId: 'scenario-001',
        userId: 'student-001',
      });

      expect(res.status).toBe(STATUS.FORBIDDEN);
    });
  });

  // ─── 404 – Not Found ──────────────────────────────────────────────────────────

  describe('404 – Not Found', () => {
    it('GET /logs/:id returns 404 when log does not exist', async () => {
      mockLogsService.findOne.mockResolvedValue(null);

      const res = await apiGet(app, ENDPOINTS.LOGS.BY_ID('non-existent-log'));

      expect(res.status).toBe(STATUS.NOT_FOUND);
    });

    it('POST /logs/:id/end returns 404 when log to end does not exist', async () => {
      mockLogsService.endLog.mockRejectedValue(new NotFoundException('Log not found'));

      const res = await apiPost(app, ENDPOINTS.LOGS.END('missing-log'), {});

      expect(res.status).toBe(STATUS.NOT_FOUND);
    });
  });

  // ─── 405 – Method Not Allowed ─────────────────────────────────────────────────

  describe('405 – Method Not Allowed', () => {
    it('DELETE /logs/:id returns 404 or 405 when method is not supported', async () => {
      const res = await request(app.getHttpServer()).delete(ENDPOINTS.LOGS.BY_ID('log-001'));

      expect([STATUS.METHOD_NOT_ALLOWED, STATUS.NOT_FOUND]).toContain(res.status);
    });
  });

  // ─── 408 – Request Timeout ────────────────────────────────────────────────────

  describe('408 – Request Timeout', () => {
    it('GET /logs returns 408 when query times out', async () => {
      mockLogsService.findAll.mockRejectedValue(
        new HttpException('Request Timeout', STATUS.REQUEST_TIMEOUT),
      );

      const res = await apiGet(app, ENDPOINTS.LOGS.ROOT);

      expect(res.status).toBe(STATUS.REQUEST_TIMEOUT);
    });
  });

  // ─── 409 – Conflict ───────────────────────────────────────────────────────────

  describe('409 – Conflict', () => {
    it('POST /logs returns 409 when an active log for the scenario already exists', async () => {
      mockLogsService.create.mockRejectedValue(
        new ConflictException('Active log already exists for this scenario'),
      );

      const res = await apiPost(app, ENDPOINTS.LOGS.ROOT, {
        scenarioId: 'scenario-001',
        userId: 'user-001',
      });

      expect(res.status).toBe(STATUS.CONFLICT);
    });
  });

  // ─── 415 – Unsupported Media Type ─────────────────────────────────────────────

  describe('415 – Unsupported Media Type', () => {
    it('POST /logs returns 415 or 400 when Content-Type is not application/json', async () => {
      const res = await request(app.getHttpServer())
        .post(ENDPOINTS.LOGS.ROOT)
        .set('Content-Type', 'text/plain')
        .send('scenarioId=scenario-001');

      expect([STATUS.UNSUPPORTED_MEDIA_TYPE, STATUS.BAD_REQUEST]).toContain(res.status);
    });
  });

  // ─── 422 – Unprocessable Entity ───────────────────────────────────────────────

  describe('422 – Unprocessable Entity', () => {
    it('POST /logs returns 422 when log data fails business validation', async () => {
      mockLogsService.create.mockRejectedValue(
        new UnprocessableEntityException('Scenario is closed and cannot accept new logs'),
      );

      const res = await apiPost(app, ENDPOINTS.LOGS.ROOT, {
        scenarioId: 'closed-scenario',
        userId: 'user-001',
      });

      expect(res.status).toBe(STATUS.UNPROCESSABLE_ENTITY);
    });
  });

  // ─── 429 – Too Many Requests ──────────────────────────────────────────────────

  describe('429 – Too Many Requests', () => {
    it('POST /logs/:id/messages returns 429 when rate limit is exceeded', async () => {
      mockLogsService.appendMessages.mockRejectedValue(
        new HttpException('Too Many Requests', STATUS.TOO_MANY_REQUESTS),
      );

      const res = await apiPost(app, ENDPOINTS.LOGS.MESSAGES('log-001'), {
        messages: [{ speaker: 'AI', text: 'Hi' }],
      });

      expect(res.status).toBe(STATUS.TOO_MANY_REQUESTS);
    });
  });

  // ─── 500 – Internal Server Error ─────────────────────────────────────────────

  describe('500 – Internal Server Error', () => {
    it('GET /logs returns 500 when an unexpected error occurs', async () => {
      mockLogsService.findAll.mockRejectedValue(new Error('Unexpected database failure'));

      const res = await apiGet(app, ENDPOINTS.LOGS.ROOT);

      expect(res.status).toBe(STATUS.INTERNAL_SERVER_ERROR);
    });

    it('POST /logs returns 500 when log creation fails unexpectedly', async () => {
      mockLogsService.create.mockRejectedValue(new Error('Disk write failure'));

      const res = await apiPost(app, ENDPOINTS.LOGS.ROOT, {
        scenarioId: 'scenario-001',
        userId: 'user-001',
      });

      expect(res.status).toBe(STATUS.INTERNAL_SERVER_ERROR);
    });
  });

  // ─── 502 – Bad Gateway ───────────────────────────────────────────────────────

  describe('502 – Bad Gateway', () => {
    it('GET /logs returns 502 when upstream log store fails', async () => {
      mockLogsService.findAll.mockRejectedValue(
        new HttpException('Bad Gateway', STATUS.BAD_GATEWAY),
      );

      const res = await apiGet(app, ENDPOINTS.LOGS.ROOT);

      expect(res.status).toBe(STATUS.BAD_GATEWAY);
    });
  });

  // ─── 503 – Service Unavailable ───────────────────────────────────────────────

  describe('503 – Service Unavailable', () => {
    it('GET /logs returns 503 when logs service is unavailable', async () => {
      mockLogsService.findAll.mockRejectedValue(
        new HttpException('Service Unavailable', STATUS.SERVICE_UNAVAILABLE),
      );

      const res = await apiGet(app, ENDPOINTS.LOGS.ROOT);

      expect(res.status).toBe(STATUS.SERVICE_UNAVAILABLE);
    });
  });

  // ─── 504 – Gateway Timeout ───────────────────────────────────────────────────

  describe('504 – Gateway Timeout', () => {
    it('GET /logs returns 504 when upstream gateway times out', async () => {
      mockLogsService.findAll.mockRejectedValue(
        new HttpException('Gateway Timeout', STATUS.GATEWAY_TIMEOUT),
      );

      const res = await apiGet(app, ENDPOINTS.LOGS.ROOT);

      expect(res.status).toBe(STATUS.GATEWAY_TIMEOUT);
    });
  });
});
