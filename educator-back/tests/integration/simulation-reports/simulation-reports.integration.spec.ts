import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { SimulationReportsController } from '../../../src/simulation-reports/simulation-reports.controller';
import { SimulationReportsService } from '../../../src/simulation-reports/simulation-reports.service';

import { MailService } from '../../../src/mail/mail.service';
import { MailRetryService } from '../../../src/mail/mail-retry.service';
import { NotificationsGateway } from '../../../src/notifications/notifications.gateway';
import { NotificationsService } from '../../../src/notifications/notifications.service';
import { buildTestApp, TEST_USERS, lmsGradePassbackProviders } from '../setup/test-app.factory';
import { expectLegacySuccessBody } from '../setup/error-envelope.util';

import { RedisService } from '../../../src/redis/redis.service';
import { SimulationReport, Student, ClassSimulation, Educator } from 'src/database/entities';
import {
  NOTIFICATION_REPOSITORY,
  SIMULATION_REPORT_REPOSITORY,
  SIMULATION_V2_REPOSITORY,
  STUDENT_SIMULATION_PROGRESS_REPOSITORY,
  TRANSCRIPT_REPOSITORY,
} from 'src/database/tokens';
import { emptyReportEntryColumns } from '../../test-data/simulation-report.fixture';

type TestBody = {
  status?: string;
  data?: unknown;
  meta?: unknown;
};

const parseBody = (res: request.Response): TestBody => {
  const body: unknown = res.body;
  if (typeof body === 'object' && body !== null) {
    return body;
  }
  throw new Error('Expected response body to be an object');
};

const mockReport: SimulationReport = {
  id: 'report-1',
  studentId: '550e8400-e29b-41d4-a716-446655440000',
  studentName: 'Alice',
  scenarioId: 'sim-1',
  viewedAt: null,
  viewedBy: null,
  createdAt: new Date(),
  ...emptyReportEntryColumns(),
};

describe('SimulationReports (Integration)', () => {
  let app: INestApplication;
  let signToken: (user?: object) => string;
  let educatorToken: string;
  let adminToken: string;

  const httpServer = (): Parameters<typeof request>[0] => {
    const server: unknown = app.getHttpServer();
    return server as Parameters<typeof request>[0];
  };

  const reportRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findReportsForListing: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
    findReportRowsPage: jest.fn().mockResolvedValue([]),
    findReportRowsByStudentIds: jest.fn().mockResolvedValue([]),
  };
  const notificationRepo = {
    existsStudentReportNotification: jest.fn().mockResolvedValue(false),
  };
  const studentQueryBuilder = {
    innerJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue([]),
  };
  const studentRepo = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue({ affected: 0 }),
    createQueryBuilder: jest.fn(() => studentQueryBuilder),
  };
  const simulationV2Repo = {
    findByBusinessId: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
  };
  const transcriptRepo = {
    findByBusinessId: jest.fn().mockResolvedValue(null),
  };
  const classSimulationRepo = {
    exists: jest.fn().mockResolvedValue(false),
  };
  const educatorRepo = {
    findOne: jest.fn().mockResolvedValue(null),
  };
  const dataSource = {
    getRepository: jest.fn((target: { name?: string }) => {
      if (target === Student || target?.name === 'Student') return studentRepo;
      if (target === ClassSimulation || target?.name === 'ClassSimulation')
        return classSimulationRepo;
      if (target === Educator || target?.name === 'Educator') return educatorRepo;
      return {};
    }),
  };
  const mailService = { sendMail: jest.fn().mockResolvedValue(undefined) };
  const notificationsGateway = {
    notifyEducatorStudentReportAvailable: jest.fn(),
    notifyAdminStudentReportAvailable: jest.fn(),
    notifyStudentSimulationsUpdated: jest.fn(),
  };
  const notificationsService = {
    isPreferenceEnabled: jest.fn().mockResolvedValue(false),
    getEmailFrequency: jest.fn().mockResolvedValue('immediate'),
  };

  beforeAll(async () => {
    ({ app, signToken } = await buildTestApp({
      controllers: [SimulationReportsController],
      providers: [
        SimulationReportsService,
        { provide: SIMULATION_REPORT_REPOSITORY, useValue: reportRepo },
        { provide: NOTIFICATION_REPOSITORY, useValue: notificationRepo },
        { provide: SIMULATION_V2_REPOSITORY, useValue: simulationV2Repo },
        { provide: TRANSCRIPT_REPOSITORY, useValue: transcriptRepo },
        { provide: STUDENT_SIMULATION_PROGRESS_REPOSITORY, useValue: {} },
        { provide: DataSource, useValue: dataSource },
        { provide: MailService, useValue: mailService },
        {
          provide: MailRetryService,
          useValue: { enqueue: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: NotificationsGateway, useValue: notificationsGateway },
        { provide: NotificationsService, useValue: notificationsService },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue(undefined),
            del: jest.fn().mockResolvedValue(undefined),
          },
        },
        ...lmsGradePassbackProviders,
      ],
    }));
    educatorToken = signToken(TEST_USERS.educator);
    adminToken = signToken(TEST_USERS.districtAdmin);
  });

  afterAll(async () => app.close());
  afterEach(() => jest.clearAllMocks());

  describe('GET /api/simulation-reports', () => {
    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      return request(httpServer()).get('/api/simulation-reports').expect(401);
    });

    it('INTEGRATION: returns 200 with all reports', async () => {
      reportRepo.findReportRowsPage.mockResolvedValue([mockReport]);

      return (
        request(httpServer())
          .get('/api/simulation-reports')
          // The unfiltered listing is @RequiredRoles(DISTRICT_ADMIN); educators use /list.
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200)
          .expect((res) => {
            const body = parseBody(res);
            expectLegacySuccessBody(res);
            expect(Array.isArray(body.data)).toBe(true);
          })
      );
    });

    it('INTEGRATION: returns 200 with empty list', async () => {
      reportRepo.findReportRowsPage.mockResolvedValue([]);

      return (
        request(httpServer())
          .get('/api/simulation-reports')
          // The unfiltered listing is @RequiredRoles(DISTRICT_ADMIN); educators use /list.
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200)
          .expect((res) => {
            const body = parseBody(res);
            expect(Array.isArray(body.data) ? body.data : []).toHaveLength(0);
          })
      );
    });
  });

  describe('GET /api/simulation-reports/list (database only)', () => {
    const dbRow = {
      reportId: 'db-report-1',
      studentCode: 'STU-001',
      studentName: null,
      scenarioId: 'sim-1',
      simulationName: 'Cardiac Care',
      mode: 'Assessment',
      score: 90,
      scoreJson: null,
      performanceLabel: null,
      totalTimeSeconds: 754,
      transcriptId: 'transcript-1',
      completedAt: new Date('2026-01-14T09:00:00.000Z'),
      viewedAt: null,
      viewedBy: null,
    };

    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      return request(httpServer()).get('/api/simulation-reports/list').expect(401);
    });

    it('INTEGRATION: returns the database rows mapped from the typed columns, with no Blob store read', async () => {
      reportRepo.findReportsForListing.mockResolvedValue({ rows: [dbRow], total: 1 });

      return request(httpServer())
        .get('/api/simulation-reports/list')
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200)
        .expect((res) => {
          const body = parseBody(res);
          const rows = Array.isArray(body.data) ? body.data : [];
          expect(rows).toHaveLength(1);
          expect(rows[0]).toMatchObject({
            reportId: 'db-report-1',
            studentCode: 'STU-001',
            simulationName: 'Cardiac Care',
            mode: 'Assessment',
            score: 90,
            timeSpent: '00:12:34',
            viewedAt: null,
          });
        });
    });

    it('INTEGRATION: meta.total is the exact database total, independent of the page size', async () => {
      reportRepo.findReportsForListing.mockResolvedValue({ rows: [dbRow], total: 25 });

      return request(httpServer())
        .get('/api/simulation-reports/list')
        .query({ page: 2, pageSize: 10 })
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200)
        .expect((res) => {
          const body = parseBody(res);
          expect((body.meta as { total?: number } | undefined)?.total).toBe(25);
        });
    });
  });

  describe('GET /api/simulation-reports/student/:studentId', () => {
    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      return request(httpServer()).get('/api/simulation-reports/student/stu-uuid').expect(401);
    });

    it('INTEGRATION: returns 200 with reports for student', async () => {
      studentRepo.findOne.mockResolvedValueOnce({ id: 'stu-uuid' });
      reportRepo.findReportRowsByStudentIds.mockResolvedValue([mockReport]);

      return request(httpServer())
        .get('/api/simulation-reports/student/stu-uuid')
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200)
        .expect((res) => {
          expectLegacySuccessBody(res);
        });
    });
  });
});
