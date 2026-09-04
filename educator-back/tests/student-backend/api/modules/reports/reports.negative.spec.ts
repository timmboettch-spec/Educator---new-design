/// <reference types="jest" />
import { BadRequestException, ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { ScenarioAuthGuard } from '../../../../../src/student-backend/guards/scenario-auth.guard';
import { ReportsModule } from '../../../../../src/student-backend/modules/reports/reports.module';
import { ReportsService } from '../../../../../src/student-backend/modules/reports/reports.service';
import { AUTH_GUARD_MOCK } from '../../../mocks/auth.mock';
import { ActionsInterventionsService } from '../../../../../src/student-backend/modules/reports/actions-interventions.service';
import { JsonDataService } from '../../../../../src/student-backend/data/json-data.service';
import { createTestApp, closeTestApp } from '../../common/setup/supertest.setup';
import { apiGet, apiPost } from '../../common/utils/api.helper';
import { studentToken } from '../../common/utils/auth-token.helper';
import { ENDPOINTS } from '../../common/constants/endpoints';
import { STATUS } from '../../common/constants/status-codes';

describe('Reports API — Negative Tests', () => {
  let app: INestApplication;

  const mockReportsService = {
    findOne: jest.fn(),
    findByTranscriptId: jest.fn(),
    sendReportEmail: jest.fn(),
    createReport: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), ReportsModule],
    })
      .overrideGuard(ScenarioAuthGuard)
      .useValue(AUTH_GUARD_MOCK)
      .overrideProvider(ReportsService)
      .useValue(mockReportsService)
      .overrideProvider(JsonDataService)
      .useValue({})
      .overrideProvider(ActionsInterventionsService)
      .useValue({})
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
    it('POST /reports/generate returns 404 — endpoint removed (was: 400 bad request)', async () => {
      const res = await apiPost(app, ENDPOINTS.REPORTS.GENERATE, {}, studentToken());
      expect(res.status).toBe(STATUS.NOT_FOUND);
    });

    it('POST /reports/:id/email returns 400 when required email fields are missing', async () => {
      mockReportsService.sendReportEmail.mockRejectedValue(
        new BadRequestException('Required email fields are missing'),
      );

      const res = await apiPost(app, ENDPOINTS.REPORTS.EMAIL('report-001'), {}, studentToken());
      expect(res.status).toBe(STATUS.BAD_REQUEST);
    });
  });

  // ─── 401 – Unauthorized ───────────────────────────────────────────────────────

  describe('401 – Unauthorized', () => {
    it('POST /reports/generate returns 404 — endpoint removed (was: 401 unauthorized)', async () => {
      const res = await apiPost(app, ENDPOINTS.REPORTS.GENERATE, {
        logId: 'log-001',
      });

      expect(res.status).toBe(STATUS.NOT_FOUND);
    });
  });

  // ─── 403 – Forbidden ──────────────────────────────────────────────────────────

  describe('403 – Forbidden', () => {
    it('GET /reports/:id returns 403 when user does not own the report', async () => {
      mockReportsService.findOne.mockRejectedValue(
        new ForbiddenException('You do not have permission to access this report'),
      );

      const res = await apiGet(app, ENDPOINTS.REPORTS.BY_ID('report-002'), studentToken());

      expect(res.status).toBe(STATUS.FORBIDDEN);
    });

    it('POST /reports/:id/email returns 403 when user cannot email this report', async () => {
      mockReportsService.sendReportEmail.mockRejectedValue(
        new ForbiddenException('Insufficient permissions to send report email'),
      );

      const res = await apiPost(
        app,
        ENDPOINTS.REPORTS.EMAIL('report-001'),
        {
          to: 'instructor@example.com',
          message: 'Please review this report.',
          studentName: 'Jane Doe',
          studentClass: 'Nursing 101',
          key: 'JANE-001',
        },
        studentToken(),
      );

      expect(res.status).toBe(STATUS.FORBIDDEN);
    });
  });

  // ─── 404 – Not Found ──────────────────────────────────────────────────────────

  describe('404 – Not Found', () => {
    it('GET /reports/:id returns 404 when report does not exist', async () => {
      mockReportsService.findOne.mockRejectedValue(new NotFoundException('Report not found'));

      const res = await apiGet(app, ENDPOINTS.REPORTS.BY_ID('ghost-report'), studentToken());

      expect(res.status).toBe(STATUS.NOT_FOUND);
    });

    it('GET /reports/transcript/:transcriptId returns 404 when no report matches transcript', async () => {
      mockReportsService.findByTranscriptId.mockRejectedValue(
        new NotFoundException('No report found for this transcript'),
      );

      const res = await apiGet(
        app,
        ENDPOINTS.REPORTS.BY_TRANSCRIPT('nonexistent-transcript'),
        studentToken(),
      );

      expect(res.status).toBe(STATUS.NOT_FOUND);
    });
  });

  // ─── 405 – Method Not Allowed ─────────────────────────────────────────────────

  describe('405 – Method Not Allowed', () => {
    it('DELETE /reports returns 404 or 405 when method is not supported on collection', async () => {
      const res = await request(app.getHttpServer()).delete(ENDPOINTS.REPORTS.ROOT);
      expect([STATUS.METHOD_NOT_ALLOWED, STATUS.NOT_FOUND]).toContain(res.status);
    });

    it('PUT /reports/generate returns 404 or 405 when wrong HTTP method is used', async () => {
      const res = await request(app.getHttpServer())
        .put(ENDPOINTS.REPORTS.GENERATE)
        .send({ logId: 'log-001' });
      expect([STATUS.METHOD_NOT_ALLOWED, STATUS.NOT_FOUND]).toContain(res.status);
    });
  });

  // ─── 408 – Request Timeout ────────────────────────────────────────────────────

  describe('408 – Request Timeout', () => {
    it('POST /reports/generate returns 404 — endpoint removed (was: 408 request timeout)', async () => {
      const res = await apiPost(
        app,
        ENDPOINTS.REPORTS.GENERATE,
        { logId: 'log-001' },
        studentToken(),
      );

      expect(res.status).toBe(STATUS.NOT_FOUND);
    });
  });

  // ─── 409 – Conflict ───────────────────────────────────────────────────────────

  describe('409 – Conflict', () => {
    it('POST /reports/generate returns 404 — endpoint removed (was: 409 conflict)', async () => {
      const res = await apiPost(
        app,
        ENDPOINTS.REPORTS.GENERATE,
        { logId: 'log-existing' },
        studentToken(),
      );

      expect(res.status).toBe(STATUS.NOT_FOUND);
    });
  });

  // ─── 415 – Unsupported Media Type ─────────────────────────────────────────────

  describe('415 – Unsupported Media Type', () => {
    it('POST /reports/generate returns 404 — endpoint removed (was: 415/400 unsupported media type)', async () => {
      const res = await request(app.getHttpServer())
        .post(ENDPOINTS.REPORTS.GENERATE)
        .set('Content-Type', 'text/plain')
        .send('logId=log-001');

      expect(res.status).toBe(STATUS.NOT_FOUND);
    });

    it('POST /reports/generate returns 404 — endpoint removed (was: 415 service rejects media type)', async () => {
      const res = await apiPost(
        app,
        ENDPOINTS.REPORTS.GENERATE,
        { logId: 'log-001' },
        studentToken(),
      );

      expect(res.status).toBe(STATUS.NOT_FOUND);
    });
  });

  // ─── 422 – Unprocessable Entity ───────────────────────────────────────────────

  describe('422 – Unprocessable Entity', () => {
    it('POST /reports/generate returns 404 — endpoint removed (was: 422 unprocessable entity)', async () => {
      const res = await apiPost(
        app,
        ENDPOINTS.REPORTS.GENERATE,
        { logId: 'empty-log' },
        studentToken(),
      );

      expect(res.status).toBe(STATUS.NOT_FOUND);
    });
  });

  // ─── 429 – Too Many Requests ──────────────────────────────────────────────────

  describe('429 – Too Many Requests', () => {
    it('POST /reports/generate returns 404 — endpoint removed (was: 429 too many requests)', async () => {
      const res = await apiPost(
        app,
        ENDPOINTS.REPORTS.GENERATE,
        { logId: 'log-001' },
        studentToken(),
      );

      expect(res.status).toBe(STATUS.NOT_FOUND);
    });
  });

  // ─── 500 – Internal Server Error ─────────────────────────────────────────────

  describe('500 – Internal Server Error', () => {
    it('POST /reports/generate returns 404 — endpoint removed (was: 500 internal server error)', async () => {
      const res = await apiPost(
        app,
        ENDPOINTS.REPORTS.GENERATE,
        { logId: 'log-001' },
        studentToken(),
      );

      expect(res.status).toBe(STATUS.NOT_FOUND);
    });
  });

  // ─── 502 – Bad Gateway ───────────────────────────────────────────────────────

  describe('502 – Bad Gateway', () => {
    it('POST /reports/generate returns 404 — endpoint removed (was: 502 bad gateway)', async () => {
      const res = await apiPost(
        app,
        ENDPOINTS.REPORTS.GENERATE,
        { logId: 'log-001' },
        studentToken(),
      );

      expect(res.status).toBe(STATUS.NOT_FOUND);
    });
  });

  // ─── 503 – Service Unavailable ───────────────────────────────────────────────

  describe('503 – Service Unavailable', () => {
    it('POST /reports/generate returns 404 — endpoint removed (was: 503 service unavailable)', async () => {
      const res = await apiPost(
        app,
        ENDPOINTS.REPORTS.GENERATE,
        { logId: 'log-001' },
        studentToken(),
      );

      expect(res.status).toBe(STATUS.NOT_FOUND);
    });
  });

  // ─── 504 – Gateway Timeout ────────────────────────────────────────────────────

  describe('504 – Gateway Timeout', () => {
    it('POST /reports/generate returns 404 — endpoint removed (was: 504 gateway timeout)', async () => {
      const res = await apiPost(
        app,
        ENDPOINTS.REPORTS.GENERATE,
        { logId: 'log-001' },
        studentToken(),
      );

      expect(res.status).toBe(STATUS.NOT_FOUND);
    });
  });
});
