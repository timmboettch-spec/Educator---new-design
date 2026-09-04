import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SimulationReportsController } from '../../../src/simulation-reports/simulation-reports.controller';
import { SimulationReportsService } from '../../../src/simulation-reports/simulation-reports.service';
import { SimulationReport } from '../../../src/simulation-reports/entity/simulation-report.entity';
import { TutorPatientService } from '../../../src/common/utils/tutor-patient.service';
import { MailService } from '../../../src/mail/mail.service';
import { NotificationsGateway } from '../../../src/notifications/notifications.gateway';
import { buildTestApp, TEST_USERS } from '../setup/test-app.factory';
import { Notification } from '../../../src/notifications/entity/notification.entity';
import { Student } from '../../../src/students/entity/students.entity';
import { Simulation } from '../../../src/simulations/entity/simulation.entity';
import { ClassSimulation } from '../../../src/class-simulations/entity/class-simulation.entity';
import { Educator } from '../../../src/educators/entity/educator.entity';
import { RedisService } from '../../../src/redis/redis.service';

type TestBody = {
  status?: string;
  data?: unknown;
};

const parseBody = (res: request.Response): TestBody => {
  const body: unknown = res.body;
  if (typeof body === 'object' && body !== null) {
    return body;
  }
  throw new Error('Expected response body to be an object');
};

const expectStatus = (res: request.Response, expected: string): void => {
  const body = parseBody(res);
  expect(body.status).toBe(expected);
};

const mockReport: SimulationReport = {
  id: 'report-1',
  student_id: '550e8400-e29b-41d4-a716-446655440000',
  student_name: 'Alice',
  scenario_id: 'sim-1',
  report_data: { score: 90, totalTimeSeconds: 300 },
  viewed_at: null,
  viewed_by: null,
  created_at: new Date(),
};

describe('SimulationReports (Integration)', () => {
  let app: INestApplication;
  let signToken: (user?: object) => string;
  let educatorToken: string;

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
  };
  const notificationRepo = {
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
    })),
  };
  const studentQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue([]),
  };
  const studentRepo = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue({ affected: 0 }),
    createQueryBuilder: jest.fn(() => studentQueryBuilder),
  };
  const simulationRepo = {
    findOne: jest.fn().mockResolvedValue(null),
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
      if (target === Simulation || target?.name === 'Simulation') return simulationRepo;
      if (target === ClassSimulation || target?.name === 'ClassSimulation') return classSimulationRepo;
      if (target === Educator || target?.name === 'Educator') return educatorRepo;
      return {};
    }),
  };
  const tutorPatientService = {
    getScenarios: jest.fn().mockResolvedValue([]),
    getUnits: jest.fn().mockResolvedValue([]),
    getReports: jest.fn().mockResolvedValue([]),
    getReportsByStudentCode: jest.fn().mockResolvedValue({ matched: [], isMatch: false }),
    getReportSourceLabel: jest.fn().mockReturnValue('cache'),
  };
  const mailService = { sendMail: jest.fn().mockResolvedValue(undefined) };
  const notificationsGateway = {
    notifyEducatorStudentReportAvailable: jest.fn(),
    notifyAdminStudentReportAvailable: jest.fn(),
    notifyStudentSimulationsUpdated: jest.fn(),
  };

  beforeAll(async () => {
    ({ app, signToken } = await buildTestApp({
      controllers: [SimulationReportsController],
      providers: [
        SimulationReportsService,
        { provide: getRepositoryToken(SimulationReport), useValue: reportRepo },
        { provide: getRepositoryToken(Notification), useValue: notificationRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: TutorPatientService, useValue: tutorPatientService },
        { provide: MailService, useValue: mailService },
        { provide: NotificationsGateway, useValue: notificationsGateway },
        { provide: RedisService, useValue: { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(undefined), del: jest.fn().mockResolvedValue(undefined) } },
      ],
    }));
    educatorToken = signToken(TEST_USERS.educator);
  });

  afterAll(async () => app.close());
  afterEach(() => jest.clearAllMocks());

  describe('GET /api/simulation-reports', () => {
    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      return request(httpServer()).get('/api/simulation-reports').expect(401);
    });

    it('INTEGRATION: returns 200 with all reports', async () => {
      reportRepo.find.mockResolvedValue([mockReport]);

      return request(httpServer())
        .get('/api/simulation-reports')
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200)
        .expect((res) => {
          const body = parseBody(res);
          expect(body.status).toBe('SUCCESS');
          expect(Array.isArray(body.data)).toBe(true);
        });
    });

    it('INTEGRATION: returns 200 with empty list', async () => {
      reportRepo.find.mockResolvedValue([]);

      return request(httpServer())
        .get('/api/simulation-reports')
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200)
        .expect((res) => {
          const body = parseBody(res);
          expect(Array.isArray(body.data) ? body.data : []).toHaveLength(0);
        });
    });
  });

  describe('GET /api/simulation-reports/student/:studentId', () => {
    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      return request(httpServer())
        .get('/api/simulation-reports/student/stu-uuid')
        .expect(401);
    });

    it('INTEGRATION: returns 200 with reports for student', async () => {
      reportRepo.find.mockResolvedValue([mockReport]);

      return request(httpServer())
        .get('/api/simulation-reports/student/stu-uuid')
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200)
        .expect((res) => {
          expectStatus(res, 'SUCCESS');
        });
    });
  });
});
