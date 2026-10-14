/// <reference types="jest" />
import { NotFoundException } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { ReportsController } from '../../../../../src/student-backend/modules/reports/reports.controller';
import { ReportsService } from '../../../../../src/student-backend/modules/reports/reports.service';
import { createTestApp, closeTestApp } from '../../common/setup/supertest.setup';
import { apiGet, apiPost } from '../../common/utils/api.helper';
import { studentToken } from '../../common/utils/auth-token.helper';
import { ENDPOINTS } from '../../common/constants/endpoints';
import { STATUS } from '../../common/constants/status-codes';
import reportFixtures from '../../common/fixtures/report.requests.json';

describe('Reports API (controller)', () => {
  let app: INestApplication;

  const mockReportsService = {
    findOne: jest.fn(),
    findByTranscriptId: jest.fn(),
    sendReportEmail: jest.fn(),
    createReport: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
      controllers: [ReportsController],
      providers: [{ provide: ReportsService, useValue: mockReportsService }],
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

  // ─── GET /reports/:id ─────────────────────────────────────────────────────────

  describe('GET /reports/:id', () => {
    it('returns 200 with the matching report', async () => {
      const mockReport = { id: 'report-001', logId: 'log-001' };
      mockReportsService.findOne.mockResolvedValue(mockReport);

      const res = await apiGet(app, ENDPOINTS.REPORTS.BY_ID('report-001'), studentToken());

      expect(res.status).toBe(STATUS.OK);
      expect(res.body).toEqual(mockReport);
    });

    it('propagates NotFoundException for unknown report', async () => {
      mockReportsService.findOne.mockRejectedValue(new NotFoundException('Report not found'));

      const res = await apiGet(app, ENDPOINTS.REPORTS.BY_ID('ghost-id'), studentToken());

      expect(res.status).toBe(STATUS.NOT_FOUND);
    });
  });

  // ─── GET /reports/transcript/:transcriptId ────────────────────────────────────

  describe('GET /reports/transcript/:transcriptId', () => {
    it('returns 200 with report matching transcript ID', async () => {
      const mockReport = { id: 'report-001', transcriptId: 'transcript-001' };
      mockReportsService.findByTranscriptId.mockResolvedValue(mockReport);

      const res = await apiGet(
        app,
        ENDPOINTS.REPORTS.BY_TRANSCRIPT('transcript-001'),
        studentToken(),
      );

      expect(res.status).toBe(STATUS.OK);
      expect(mockReportsService.findByTranscriptId).toHaveBeenCalledWith(
        'transcript-001',
        expect.any(String),
      );
    });

    it('returns 404 when no report exists for that transcript', async () => {
      mockReportsService.findByTranscriptId.mockRejectedValue(
        new NotFoundException('Report not found'),
      );

      const res = await apiGet(
        app,
        ENDPOINTS.REPORTS.BY_TRANSCRIPT('ghost-transcript'),
        studentToken(),
      );

      expect(res.status).toBe(STATUS.NOT_FOUND);
    });
  });

  // ─── POST /reports/generate (REMOVED) ──────────────────────────────────────
  // The POST /reports/generate endpoint was removed from the controller.

  describe('POST /reports/generate', () => {
    it('returns 404 because the endpoint has been removed', async () => {
      const res = await apiPost(
        app,
        ENDPOINTS.REPORTS.GENERATE,
        reportFixtures.generate.valid,
        studentToken(),
      );

      expect(res.status).toBe(STATUS.NOT_FOUND);
    });
  });

  // ─── POST /reports/:id/email ──────────────────────────────────────────────────

  describe('POST /reports/:id/email', () => {
    it('returns 201 after sending email', async () => {
      mockReportsService.sendReportEmail.mockResolvedValue({ sent: true });

      const res = await apiPost(
        app,
        ENDPOINTS.REPORTS.EMAIL('report-001'),
        reportFixtures.email.valid,
        studentToken(),
      );

      expect(res.status).toBe(STATUS.CREATED);
      expect(mockReportsService.sendReportEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          reportId: 'report-001',
          recipient: reportFixtures.email.valid.to,
        }),
      );
    });
  });
});
