import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ClassSimulationController } from '../../../src/class-simulations/class-simulation.controller';
import { ClassSimulationService } from '../../../src/class-simulations/class-simulation.service';
import { ClassSimulation } from '../../../src/class-simulations/entity/class-simulation.entity';
import { Simulation } from '../../../src/simulations/entity/simulation.entity';
import { Class } from '../../../src/class/entity/class.entity';
import { TutorPatientService } from '../../../src/common/utils/tutor-patient.service';
import { EducatorsService } from '../../../src/educators/educators.service';
import { Educator } from '../../../src/educators/entity/educator.entity';
import { User } from '../../../src/users/entity/user.entity';
import { Schools } from '../../../src/schools/entity/schools.entity';
import { Invite } from '../../../src/invites/entity/invite.entity';
import { Student } from '../../../src/students/entity/students.entity';
import { AzureBlobService } from '../../../src/config/azure-blob.config';
import { MailService } from '../../../src/mail/mail.service';
import { NotificationsGateway } from '../../../src/notifications/notifications.gateway';
import { buildTestApp, TEST_USERS } from '../setup/test-app.factory';

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

const CLASS_ID = '550e8400-e29b-41d4-a716-446655440501';
const SIM_ID = 'sim-001';
const RECORD_ID = '550e8400-e29b-41d4-a716-446655440502';

const mockRecord: ClassSimulation = {
  id: RECORD_ID,
  class_id: CLASS_ID,
  simulation_id: SIM_ID,
  start_date: '2025-01-01',
  due_date: '2025-06-01',
  end_date: '2025-06-30',
  is_active: true,
  is_ai: false,
  deleted_at: null,
  class: {} as Class,
  created_at: new Date(),
  updated_at: new Date(),
};

describe('ClassSimulations (Integration)', () => {
  let app: INestApplication;
  let signToken: (user?: object) => string;
  let educatorToken: string;

  const httpServer = (): Parameters<typeof request>[0] => {
    const server: unknown = app.getHttpServer();
    return server as Parameters<typeof request>[0];
  };

  const mockQb = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const csRepo = { findOne: jest.fn(), find: jest.fn(), create: jest.fn(), save: jest.fn(), remove: jest.fn(), createQueryBuilder: jest.fn().mockReturnValue(mockQb), manager: { count: jest.fn().mockResolvedValue(0) } };
  const classRepo = { findOne: jest.fn(), find: jest.fn() };
  const simulationRepo = {
    findOne: jest.fn().mockResolvedValue({ id: SIM_ID }),
    save: jest.fn(),
    manager: { query: jest.fn().mockResolvedValue([{ '1': 1 }]) },
  };
  const tutorPatientService = {
    getScenarios: jest.fn().mockResolvedValue([{ id: SIM_ID, unitId: 'u-1', title: 'Stroke Eval' }]),
    getFreshScenarios: jest
      .fn()
      .mockResolvedValue([{ id: SIM_ID, unitId: 'u-1', title: 'Stroke Eval' }]),
    getAllScenariosDirect: jest
      .fn()
      .mockResolvedValue([{ id: SIM_ID, unitId: 'u-1', title: 'Stroke Eval' }]),
    getUnits: jest.fn().mockResolvedValue([{ id: 'u-1', name: 'Emergency', category: 'Cardiology' }]),
  };
  const educatorService = {
    availableTokens: jest.fn().mockResolvedValue(10),
    findById: jest.fn().mockResolvedValue({ data: { id: TEST_USERS.educator.sub, tokens: 10 } }),
    updateToken: jest.fn().mockResolvedValue(undefined),
    releaseTokens: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    ({ app, signToken } = await buildTestApp({
      controllers: [ClassSimulationController],
      providers: [
        ClassSimulationService,
        { provide: getRepositoryToken(ClassSimulation), useValue: csRepo },
        { provide: getRepositoryToken(Class), useValue: classRepo },
        { provide: getRepositoryToken(Simulation), useValue: simulationRepo },
        { provide: DataSource, useValue: { query: jest.fn() } },
        { provide: TutorPatientService, useValue: tutorPatientService },
        { provide: EducatorsService, useValue: educatorService },
        { provide: getRepositoryToken(Educator), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(User), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(Schools), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(Invite), useValue: { findOne: jest.fn(), delete: jest.fn(), save: jest.fn(), create: jest.fn() } },
        { provide: getRepositoryToken(Student), useValue: { findOne: jest.fn(), find: jest.fn() } },
        { provide: AzureBlobService, useValue: { uploadFile: jest.fn(), isConfigured: jest.fn().mockReturnValue(false) } },
        { provide: MailService, useValue: { sendMail: jest.fn().mockResolvedValue(undefined) } },
        {
          provide: NotificationsGateway,
          useValue: {
            notifySimulationAssigned: jest.fn(),
            notifyEducatorSimulationDueDateReminder: jest.fn(),
          },
        },
      ],
    }));
    educatorToken = signToken(TEST_USERS.educator);
  });

  afterAll(async () => app.close());
  afterEach(() => jest.clearAllMocks());

  describe('POST /api/class-simulations', () => {
    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      return request(httpServer())
        .post('/api/class-simulations')
        .send({ class_id: CLASS_ID, simulation_id: SIM_ID })
        .expect(401);
    });

    it('INTEGRATION: returns 404 when class not found', async () => {
      classRepo.findOne.mockResolvedValue(null);

      return request(httpServer())
        .post('/api/class-simulations')
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ class_id: CLASS_ID, simulation_id: SIM_ID, start_date: '2025-01-01', due_date: '2025-06-01' })
        .expect(404)
        .expect((res) => {
          expectStatus(res, 'FAILED');
        });
    });

    it('INTEGRATION: returns 201 SUCCESS when simulation assigned to class', async () => {
      classRepo.findOne.mockResolvedValue({ id: CLASS_ID });
      tutorPatientService.getScenarios.mockResolvedValue([{ id: SIM_ID, unitId: 'u-1', title: 'Stroke Eval' }]);
      csRepo.findOne.mockResolvedValue(null);
      csRepo.create.mockReturnValue(mockRecord);
      csRepo.save.mockResolvedValue(mockRecord);
      educatorService.availableTokens.mockResolvedValue(10);

      return request(httpServer())
        .post('/api/class-simulations')
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ class_id: CLASS_ID, simulation_id: SIM_ID, start_date: '2025-01-01', due_date: '2025-06-01' })
        .expect(201)
        .expect((res) => {
          expectStatus(res, 'SUCCESS');
        });
    });
  });

  describe('GET /api/class-simulations/class/:class_id', () => {
    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      return request(httpServer())
        .get(`/api/class-simulations/class/${CLASS_ID}`)
        .expect(401);
    });

    it('INTEGRATION: returns 200 with simulations for class', async () => {
      csRepo.find.mockResolvedValue([mockRecord]);
      tutorPatientService.getScenarios.mockResolvedValue([{ id: SIM_ID, unitId: 'u-1', title: 'Stroke Eval' }]);
      tutorPatientService.getAllScenariosDirect.mockResolvedValue([{ id: SIM_ID, unitId: 'u-1', title: 'Stroke Eval' }]);
      tutorPatientService.getUnits.mockResolvedValue([{ id: 'u-1', name: 'Emergency', category: 'Cardiology' }]);

      return request(httpServer())
        .get(`/api/class-simulations/class/${CLASS_ID}`)
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200)
        .expect((res) => {
          const body = parseBody(res);
          expect(body.status).toBe('SUCCESS');
          expect(Array.isArray(body.data)).toBe(true);
        });
    });
  });

  describe('DELETE /api/class-simulations/:id', () => {
    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      return request(httpServer())
        .delete(`/api/class-simulations/${RECORD_ID}`)
        .expect(401);
    });

    it('INTEGRATION: returns 404 when record not found', async () => {
      csRepo.findOne.mockResolvedValue(null);

      return request(httpServer())
        .delete(`/api/class-simulations/${RECORD_ID}`)
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(404)
        .expect((res) => {
          expectStatus(res, 'FAILED');
        });
    });

    it('INTEGRATION: returns 200 when simulation removed from class', async () => {
      csRepo.findOne.mockResolvedValue(mockRecord);
      classRepo.findOne.mockResolvedValue({
        id: CLASS_ID,
        educator_id: TEST_USERS.educator.sub,
        educator: { id: TEST_USERS.educator.sub },
      });
      csRepo.remove.mockResolvedValue(undefined);

      return request(httpServer())
        .delete(`/api/class-simulations/${RECORD_ID}`)
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200)
        .expect((res) => {
          expectStatus(res, 'SUCCESS');
        });
    });
  });
});
