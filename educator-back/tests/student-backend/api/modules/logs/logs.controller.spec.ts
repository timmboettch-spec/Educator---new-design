/// <reference types="jest" />
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { LogsModule } from '../../../../../src/student-backend/modules/logs/logs.module';
import { LogsService } from '../../../../../src/student-backend/modules/logs/logs.service';
import { createTestApp, closeTestApp } from '../../common/setup/supertest.setup';
import { apiGet, apiPost, apiPut } from '../../common/utils/api.helper';
import { ENDPOINTS } from '../../common/constants/endpoints';
import { STATUS } from '../../common/constants/status-codes';

describe('Logs API — Positive Tests', () => {
  let app: INestApplication;

  const mockLogsService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
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

  // ─── POST /logs ───────────────────────────────────────────────────────────────

  it('POST /logs creates a new log entry and returns 201', async () => {
    const payload = {
      scenarioId: 'scenario-001',
      userId: 'user-001',
      studentName: 'John Doe',
    };
    const created = {
      id: 'log-001',
      ...payload,
      createdAt: new Date().toISOString(),
    };
    mockLogsService.create.mockResolvedValue(created);

    const res = await apiPost(app, ENDPOINTS.LOGS.ROOT, payload);

    expect(res.status).toBe(STATUS.CREATED);
    expect(mockLogsService.create).toHaveBeenCalledTimes(1);
  });

  // ─── GET /logs ────────────────────────────────────────────────────────────────

  it('GET /logs returns all logs with status 200', async () => {
    mockLogsService.findAll.mockResolvedValue([
      { id: 'log-001', scenarioId: 'scenario-001' },
      { id: 'log-002', scenarioId: 'scenario-002' },
    ]);

    const res = await apiGet(app, ENDPOINTS.LOGS.ROOT);

    expect(res.status).toBe(STATUS.OK);
    expect(mockLogsService.findAll).toHaveBeenCalledTimes(1);
  });

  // ─── GET /logs/:id ────────────────────────────────────────────────────────────

  it('GET /logs/:id returns a single log with status 200', async () => {
    mockLogsService.findOne.mockResolvedValue({
      id: 'log-001',
      scenarioId: 'scenario-001',
    });

    const res = await apiGet(app, ENDPOINTS.LOGS.BY_ID('log-001'));

    expect(res.status).toBe(STATUS.OK);
    expect(mockLogsService.findOne).toHaveBeenCalledWith('log-001');
  });

  // ─── PUT /logs/:id ────────────────────────────────────────────────────────────

  it('PUT /logs/:id updates a log and returns 200', async () => {
    const messages = [{ speaker: 'Student', text: 'Hi', timestamp: '2026-05-21T10:00:00Z' }];
    const updated = { id: 'log-001', scenarioId: 'scenario-001', messages };
    mockLogsService.update.mockResolvedValue(updated);

    const res = await apiPut(app, ENDPOINTS.LOGS.BY_ID('log-001'), {
      messages,
    });

    expect(res.status).toBe(STATUS.OK);
    expect(mockLogsService.update).toHaveBeenCalledWith('log-001', {
      messages,
    });
  });

  // ─── POST /logs/:id/end ───────────────────────────────────────────────────────

  it('POST /logs/:id/end ends a log session and returns 201', async () => {
    mockLogsService.endLog.mockResolvedValue({ id: 'log-001', ended: true });

    const res = await apiPost(app, ENDPOINTS.LOGS.END('log-001'), {});

    expect(res.status).toBe(STATUS.CREATED);
    expect(mockLogsService.endLog).toHaveBeenCalledWith('log-001');
  });

  // ─── POST /logs/:id/messages ──────────────────────────────────────────────────

  it('POST /logs/:id/messages appends messages and returns 201', async () => {
    const messages = [{ speaker: 'AI', text: 'Hello', timestamp: '2026-05-21T10:00:00Z' }];
    mockLogsService.appendMessages.mockResolvedValue({
      id: 'log-001',
      messages,
    });

    const res = await apiPost(app, ENDPOINTS.LOGS.MESSAGES('log-001'), {
      messages,
    });

    expect(res.status).toBe(STATUS.CREATED);
    expect(mockLogsService.appendMessages).toHaveBeenCalledWith('log-001', messages);
  });
});
