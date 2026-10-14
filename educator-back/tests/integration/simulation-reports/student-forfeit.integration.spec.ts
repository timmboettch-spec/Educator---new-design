import { ConflictException, INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { SimulationReportsController } from '../../../src/simulation-reports/simulation-reports.controller';
import { SimulationReportsService } from '../../../src/simulation-reports/simulation-reports.service';
import { MailService } from '../../../src/mail/mail.service';
import { MailRetryService } from '../../../src/mail/mail-retry.service';
import { NotificationsGateway } from '../../../src/notifications/notifications.gateway';
import { NotificationsService } from '../../../src/notifications/notifications.service';
import { RedisService } from '../../../src/redis/redis.service';
import { ERROR_MSG } from '../../../src/common/messages/error.message';
import { SIMULATION_PROGRESS_MSG } from 'src/common/messages/simulation-progress.message';
import {
  NOTIFICATION_REPOSITORY,
  SIMULATION_REPORT_REPOSITORY,
  SIMULATION_V2_REPOSITORY,
  STUDENT_SIMULATION_PROGRESS_REPOSITORY,
  TRANSCRIPT_REPOSITORY,
} from 'src/database/tokens';
import { buildTestApp, lmsGradePassbackProviders } from '../setup/test-app.factory';

/**
 * Early completion (Forfeit) through the student report update route. Every repository is mocked:
 * the database rules live in the repository's own tests; this asserts the HTTP contract.
 */
const STUDENT_CODE = 'BIO_0001';
const STUDENT_UUID = '550e8400-e29b-41d4-a716-446655440601';

describe('POST /api/simulation-reports/student/:studentId/update — early completion (Integration, mocked)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const reportRepo = {
    create: jest.fn(),
    findOne: jest.fn(),
    findOwnedScoreRowByIdOrReportId: jest.fn(),
  };
  const progressRepo = { forfeit: jest.fn() };
  const studentRepo = {
    findOne: jest.fn(),
    update: jest.fn(),
  };
  const notificationsGateway = {
    notifyEducatorStudentReportAvailable: jest.fn(),
    notifyAdminStudentReportAvailable: jest.fn(),
    notifyStudentSimulationsUpdated: jest.fn(),
  };

  const httpServer = (): Parameters<typeof request>[0] =>
    app.getHttpServer() as Parameters<typeof request>[0];

  const earlyCompletion = (body: Record<string, unknown> = {}): request.Test =>
    request(httpServer())
      .post(`/api/simulation-reports/student/${STUDENT_CODE}/update`)
      .set(
        'Authorization',
        `Bearer ${jwtService.sign({
          sub: STUDENT_CODE,
          user_id: STUDENT_UUID,
          student_id: STUDENT_CODE,
          type: 'student',
          roles: ['Student'],
        })}`,
      )
      .send({ scenarioId: 'sim-1', isEarlyCompletion: true, ...body });

  beforeAll(async () => {
    ({ app } = await buildTestApp({
      controllers: [SimulationReportsController],
      providers: [
        SimulationReportsService,
        { provide: SIMULATION_REPORT_REPOSITORY, useValue: reportRepo },
        {
          provide: NOTIFICATION_REPOSITORY,
          useValue: { existsStudentReportNotification: jest.fn().mockResolvedValue(false) },
        },
        { provide: SIMULATION_V2_REPOSITORY, useValue: {} },
        { provide: TRANSCRIPT_REPOSITORY, useValue: {} },
        { provide: STUDENT_SIMULATION_PROGRESS_REPOSITORY, useValue: progressRepo },
        {
          provide: DataSource,
          useValue: { getRepository: jest.fn(() => studentRepo) },
        },
        { provide: MailService, useValue: { sendMail: jest.fn().mockResolvedValue(undefined) } },
        {
          provide: MailRetryService,
          useValue: { enqueue: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: NotificationsGateway, useValue: notificationsGateway },
        {
          provide: NotificationsService,
          useValue: {
            isPreferenceEnabled: jest.fn().mockResolvedValue(false),
            getEmailFrequency: jest.fn().mockResolvedValue('immediate'),
          },
        },
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
    jwtService = app.get(JwtService);
  });

  afterAll(async () => app.close());

  beforeEach(() => {
    jest.clearAllMocks();
    studentRepo.findOne.mockResolvedValue({
      id: STUDENT_UUID,
      student_id: STUDENT_CODE,
      student_name: 'Alice',
    });
    reportRepo.findOwnedScoreRowByIdOrReportId.mockResolvedValue(null);
  });

  it('forfeits through Simulation Progress, answers 201, and writes no Report or student stats', async () => {
    progressRepo.forfeit.mockResolvedValue({});

    const response = await earlyCompletion().expect(201);

    expect(response.body.data).toMatchObject({ scenarioId: 'sim-1' });
    expect(progressRepo.forfeit).toHaveBeenCalledWith(STUDENT_UUID, 'sim-1');
    expect(notificationsGateway.notifyStudentSimulationsUpdated).toHaveBeenCalledWith(
      STUDENT_CODE,
      'sim-1',
    );
    expect(reportRepo.create).not.toHaveBeenCalled();
    expect(studentRepo.update).not.toHaveBeenCalled();
  });

  it('answers 409 FORFEIT_NOT_ALLOWED when the Forfeit rule is not met, without notifying', async () => {
    progressRepo.forfeit.mockRejectedValue(
      new ConflictException(SIMULATION_PROGRESS_MSG.FORFEIT_NOT_ALLOWED),
    );

    const response = await earlyCompletion().expect(409);

    expect(response.body.message).toBe(SIMULATION_PROGRESS_MSG.FORFEIT_NOT_ALLOWED);
    expect(notificationsGateway.notifyStudentSimulationsUpdated).not.toHaveBeenCalled();
    expect(reportRepo.create).not.toHaveBeenCalled();
  });

  it('does not forfeit when the completion is not an early completion', async () => {
    await earlyCompletion({ isEarlyCompletion: false }).expect(201);

    expect(progressRepo.forfeit).not.toHaveBeenCalled();
  });
});
