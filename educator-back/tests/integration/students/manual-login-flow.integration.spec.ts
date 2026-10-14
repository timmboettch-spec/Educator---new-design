import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ClassSimulationService } from 'src/class-simulations/class-simulation.service';
import { CommonStatus } from 'src/common/enums/status.enum';
import { AzureBlobService, TokenService } from 'src/common/services';
import type { JwtPayload } from 'src/common/interfaces';
import {
  CLASS_REPOSITORY,
  CLASS_SIMULATION_REPOSITORY,
  EDUCATOR_REPOSITORY,
  SIMULATION_REPORT_REPOSITORY,
  STUDENT_SIMULATION_PROGRESS_REPOSITORY,
  SIMULATION_V2_REPOSITORY,
  STUDENT_REPOSITORY,
  USER_REPOSITORY,
} from 'src/database/tokens';
import { Class, Educator, Student } from 'src/database/entities';
import { MailService } from 'src/mail/mail.service';
import { NotificationsGateway } from 'src/notifications/notifications.gateway';
import { StudentsController } from 'src/students/students.controller';
import { StudentsService } from 'src/students/students.service';
import { AutomationAccessService } from 'src/common/services/automation-access.service';
import { buildTestApp, TEST_USERS } from '../setup/test-app.factory';
import { expectLegacySuccessBody } from '../setup/error-envelope.util';

const STUDENT_CODE = 'BIO_0001';
const STUDENT_UUID = '550e8400-e29b-41d4-a716-446655440601';
const CLASS_ID = '550e8400-e29b-41d4-a716-446655440602';
const OTHER_STUDENT_CODE = 'BIO_0002';

const makeStudent = (overrides: Partial<Student> = {}): Student =>
  ({
    id: STUDENT_UUID,
    student_id: STUDENT_CODE,
    student_name: 'Alice',
    email: 'alice@test.com',
    status: CommonStatus.ACTIVE,
    is_active: true,
    deleted_at: null,
    class: {
      id: CLASS_ID,
      class_name: 'Biology',
      is_active: true,
      deleted_at: null,
      status: CommonStatus.ACTIVE,
    } as Class,
    educator: {
      id: TEST_USERS.educator.sub,
      tokens: 5,
      is_active: true,
      deleted_at: null,
    } as Educator,
    ...overrides,
  }) as Student;

describe('Manual Student Login Flow (Integration)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let tokenService: TokenService;

  const studentRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    saveMany: jest.fn(),
    update: jest.fn(),
    findAllNonEmptyStudentCodes: jest.fn(),
    findActiveByClassWithClassAndEducator: jest.fn(),
  };
  const classRepo = { findOne: jest.fn() };
  const userRepo = { findOne: jest.fn() };
  const educatorRepo = {
    findOne: jest.fn().mockImplementation(async (options: { where?: { id?: string } }) => {
      if (options?.where?.id) {
        return { id: options.where.id, tokens: 10, status: CommonStatus.ACTIVE, is_active: true };
      }
      return null;
    }),
  };
  const classSimulationRepo = { find: jest.fn() };
  const simulationReportRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    findAttemptRowsByStudentId: jest.fn(),
  };
  const simulationV2Repo = { find: jest.fn().mockResolvedValue([]) };
  const automationAccessService = {
    isAutomationStudentCode: jest.fn().mockReturnValue(false),
  };

  const httpServer = (): Parameters<typeof request>[0] => {
    const server: unknown = app.getHttpServer();
    return server as Parameters<typeof request>[0];
  };

  const signManualStudentToken = (): string =>
    jwtService.sign({
      sub: STUDENT_CODE,
      user_id: STUDENT_UUID,
      student_id: STUDENT_CODE,
      type: 'student',
      roles: ['Student'],
    });

  const armLoginMocks = (): void => {
    studentRepo.findOne.mockResolvedValue(makeStudent());
  };

  const armSimulationsMocks = (): void => {
    studentRepo.findOne.mockResolvedValue(makeStudent());
    classSimulationRepo.find.mockResolvedValue([
      {
        simulation_id: 'sim-001',
        class_id: CLASS_ID,
        is_active: true,
        start_date: null,
        due_date: null,
        end_date: null,
      },
      {
        simulation_id: 'sim-002',
        class_id: CLASS_ID,
        is_active: true,
        start_date: null,
        due_date: null,
        end_date: null,
      },
    ]);
    simulationV2Repo.find.mockResolvedValue([
      { id: 'sim-001', title: 'Simulation One', description: 'Desc', avatarEnabled: false },
      { id: 'sim-002', title: 'Simulation Two', description: 'Desc', avatarEnabled: false },
    ]);
    simulationReportRepo.find.mockResolvedValue([]);
    simulationReportRepo.findAttemptRowsByStudentId.mockResolvedValue([]);
  };

  beforeAll(async () => {
    ({ app } = await buildTestApp({
      controllers: [StudentsController],
      providers: [
        StudentsService,
        { provide: STUDENT_REPOSITORY, useValue: studentRepo },
        { provide: CLASS_REPOSITORY, useValue: classRepo },
        { provide: USER_REPOSITORY, useValue: userRepo },
        { provide: EDUCATOR_REPOSITORY, useValue: educatorRepo },
        { provide: CLASS_SIMULATION_REPOSITORY, useValue: classSimulationRepo },
        { provide: SIMULATION_REPORT_REPOSITORY, useValue: simulationReportRepo },
        {
          provide: STUDENT_SIMULATION_PROGRESS_REPOSITORY,
          useValue: {
            findByStudentAndScenarioId: jest.fn().mockResolvedValue(null),
            findByStudentAndScenarioIds: jest.fn().mockResolvedValue([]),
          },
        },
        { provide: SIMULATION_V2_REPOSITORY, useValue: simulationV2Repo },
        {
          provide: AzureBlobService,
          useValue: { uploadFile: jest.fn(), isConfigured: jest.fn().mockReturnValue(false) },
        },
        { provide: MailService, useValue: { sendMail: jest.fn().mockResolvedValue({}) } },
        { provide: DataSource, useValue: { query: jest.fn() } },
        { provide: AutomationAccessService, useValue: automationAccessService },
        { provide: NotificationsGateway, useValue: { notifyAccountDeleted: jest.fn() } },
        {
          provide: ClassSimulationService,
          useValue: {
            refundUnusedSeatsForStudent: jest.fn().mockResolvedValue(undefined),
            allocateSeatsForNewStudents: jest
              .fn()
              .mockResolvedValue({ success: true, data: { seatsAllocated: 0 } }),
          },
        },
      ],
    }));

    jwtService = app.get(JwtService);
    tokenService = app.get(TokenService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    educatorRepo.findOne.mockImplementation(async (options: { where?: { id?: string } }) => {
      if (options?.where?.id) {
        return { id: options.where.id, tokens: 10, status: CommonStatus.ACTIVE, is_active: true };
      }
      return null;
    });
    simulationReportRepo.find.mockResolvedValue([]);
    simulationReportRepo.findAttemptRowsByStudentId.mockResolvedValue([]);
  });

  describe('GET /api/students/login (manual code login)', () => {
    it('INTEGRATION: returns student token without ltiLaunch claim', async () => {
      armLoginMocks();

      const response = await request(httpServer())
        .get('/api/students/login')
        .query({ student_id: STUDENT_CODE })
        .expect(200);

      expect(response.body.data.access_token).toEqual(expect.any(String));

      const decoded = await tokenService.verifyToken<JwtPayload>(response.body.data.access_token);
      expect(decoded.type).toBe('student');
      expect(decoded.student_id).toBe(STUDENT_CODE);
      expect(decoded.ltiLaunch?.simulationId).toBeUndefined();
      expect(decoded.ltiLaunch?.resourceLinkId).toBeUndefined();
    });

    it('INTEGRATION: sets httpOnly accessToken cookie', async () => {
      armLoginMocks();

      const response = await request(httpServer())
        .get('/api/students/login')
        .query({ student_id: STUDENT_CODE })
        .expect(200);

      const cookies = response.headers['set-cookie'];
      const cookieList = Array.isArray(cookies) ? cookies : [cookies].filter(Boolean);
      expect(cookieList.some((cookie) => cookie.startsWith('accessToken='))).toBe(true);
    });

    it('INTEGRATION: rejects invalid student_id', async () => {
      studentRepo.findOne.mockResolvedValue(null);

      await request(httpServer())
        .get('/api/students/login')
        .query({ student_id: 'INVALID_CODE_XYZ' })
        .expect(404);
    });

    it('INTEGRATION: rejects missing student_id', async () => {
      await request(httpServer()).get('/api/students/login').expect(400);
    });
  });

  describe('GET /api/students/simulations/:studentCode (manual login session)', () => {
    it('INTEGRATION: returns assigned simulations without ltiLaunch lock', async () => {
      armSimulationsMocks();
      const accessToken = signManualStudentToken();

      const response = await request(httpServer())
        .get(`/api/students/simulations/${STUDENT_CODE}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expectLegacySuccessBody(response);
      expect(response.body.data.simulations).toHaveLength(2);
      expect(response.body.data.ltiLaunch?.simulationId).toBeUndefined();
    });

    it('INTEGRATION: requires authorization', async () => {
      await request(httpServer()).get(`/api/students/simulations/${STUDENT_CODE}`).expect(401);
    });

    it('INTEGRATION: prevents access to another student code', async () => {
      armSimulationsMocks();
      const accessToken = signManualStudentToken();

      await request(httpServer())
        .get(`/api/students/simulations/${OTHER_STUDENT_CODE}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    });

    it('INTEGRATION: keeps manual session unlocked across repeated requests', async () => {
      armSimulationsMocks();
      const accessToken = signManualStudentToken();

      for (let i = 0; i < 2; i++) {
        const response = await request(httpServer())
          .get(`/api/students/simulations/${STUDENT_CODE}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body.data.simulations).toHaveLength(2);
        expect(response.body.data.ltiLaunch?.simulationId).toBeUndefined();
      }
    });
  });
});
