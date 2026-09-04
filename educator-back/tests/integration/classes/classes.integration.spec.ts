import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ClassesController } from '../../../src/class/classes.controller';
import { ClassesService } from '../../../src/class/classes.service';
import { EducatorsService } from '../../../src/educators/educators.service';
import { Class } from '../../../src/class/entity/class.entity';
import { Student } from '../../../src/students/entity/students.entity';
import { Educator } from '../../../src/educators/entity/educator.entity';
import { EducatorSchool } from '../../../src/educators/entity/educator-school.entity';
import { User } from '../../../src/users/entity/user.entity';
import { Schools } from '../../../src/schools/entity/schools.entity';
import { Invite } from '../../../src/invites/entity/invite.entity';
import { ClassSimulation } from '../../../src/class-simulations/entity/class-simulation.entity';
import { ClassEducator } from '../../../src/class/entity/class-educator.entity';
import { ClassSimulationService } from '../../../src/class-simulations/class-simulation.service';
import { AzureBlobService } from '../../../src/config/azure-blob.config';
import { MailService } from '../../../src/mail/mail.service';
import { NotificationsGateway } from '../../../src/notifications/notifications.gateway';
import { TutorPatientService } from '../../../src/common/utils/tutor-patient.service';
import { CommonStatus } from '../../../src/common/enums/status.enum';
import { buildTestApp, TEST_USERS } from '../setup/test-app.factory';
import { LmsProvisionService } from '../../../src/lms/services/lms-provision.service';
import { LmsLookupService } from '../../../src/lms/services/lms-lookup.service';
import { LmsConfigService } from '../../../src/lms/services/lms-config.service';
import { LmsRosterService } from '../../../src/lms/services/lms-roster.service';

type TestResponseBody = {
  status?: string;
  data?: unknown;
};

const parseBody = (res: request.Response): TestResponseBody => {
  const body: unknown = res.body;
  if (typeof body === 'object' && body !== null) {
    return body;
  }
  throw new Error('Expected response body to be an object');
};

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value === 'object' && value !== null) {
    return value as Record<string, unknown>;
  }
  throw new Error('Expected value to be an object');
};

const expectStatus = (res: request.Response, expected: string): void => {
  const body = parseBody(res);
  expect(body.status).toBe(expected);
};

const makeEducator = (o: Partial<Educator> = {}): Educator =>
  ({ id: TEST_USERS.educator.sub, tokens: 10, status: CommonStatus.ACTIVE, ...o }) as Educator;

const makeClass = (o: Partial<Class> = {}): Class => ({
  id: '550e8400-e29b-41d4-a716-446655440401',
  class_name: 'Biology',
  term: 'i',
  year: '2025',
  status: CommonStatus.ACTIVE,
  total_no_of_students: 0,
  start_date: '2025-01-01',
  end_date: '2025-06-01',
  is_active: true,
  deleted_at: null,
  educator: makeEducator(),
  students: [],
  ...o,
});

const validCreateDto = {
  class_name: 'Biology',
  term: 'i',
  year: '2025',
  start_date: '2025-01-01',
  end_date: '2025-06-01',
};

describe('Classes (Integration)', () => {
  let app: INestApplication;
  let signToken: (user?: object) => string;
  let educatorToken: string;
  const httpServer = (): Parameters<typeof request>[0] => {
    const server: unknown = app.getHttpServer();
    return server as Parameters<typeof request>[0];
  };
  const CLASS_ID = '550e8400-e29b-41d4-a716-446655440401';
  const MISSING_CLASS_ID = '550e8400-e29b-41d4-a716-446655440499';
  const classQb = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([makeClass()]),
    getOne: jest.fn(),
  };
  const classRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(classQb),
  };
  const studentRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    manager: { query: jest.fn() },
    createQueryBuilder: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    }),
  };
  const educatorRepo = { findOne: jest.fn() };
  const classSimulationRepo = { findOne: jest.fn(), find: jest.fn(), update: jest.fn() };
  const classSimulationService = {
    findByClass: jest.fn().mockResolvedValue({ data: [] }),
    findByClassIdsBatch: jest.fn().mockResolvedValue(new Map()),
  };
  const mockTransactionManager = {
    delete: jest.fn().mockResolvedValue({}),
    find: jest.fn().mockResolvedValue([]),
    save: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    createQueryBuilder: jest.fn().mockReturnValue({
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({}),
    }),
  };
  const dataSource = {
    query: jest.fn(),
    transaction: jest.fn(async (cb: (manager: typeof mockTransactionManager) => Promise<void>) => {
      await cb(mockTransactionManager);
    }),
  };
  const azureBlobService = {
    uploadFile: jest.fn(),
    isConfigured: jest.fn().mockReturnValue(false),
  };
  const mailService = { sendMail: jest.fn().mockResolvedValue(undefined) };
  const notificationsGateway = { notifyAccountDeleted: jest.fn() };
  beforeAll(async () => {
    ({ app, signToken } = await buildTestApp({
      controllers: [ClassesController],
      providers: [
        ClassesService,
        EducatorsService,
        { provide: getRepositoryToken(Class), useValue: classRepo },
        {
          provide: getRepositoryToken(ClassEducator),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            save: jest.fn(),
            create: jest.fn(),
            delete: jest.fn(),
          },
        },
        { provide: getRepositoryToken(Student), useValue: studentRepo },
        { provide: getRepositoryToken(Educator), useValue: educatorRepo },
        {
          provide: getRepositoryToken(EducatorSchool),
          useValue: { findOne: jest.fn(), count: jest.fn(), create: jest.fn(), save: jest.fn() },
        },
        { provide: getRepositoryToken(User), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(Schools), useValue: { findOne: jest.fn() } },
        {
          provide: getRepositoryToken(Invite),
          useValue: { findOne: jest.fn(), delete: jest.fn(), save: jest.fn(), create: jest.fn() },
        },
        { provide: getRepositoryToken(ClassSimulation), useValue: classSimulationRepo },
        { provide: ClassSimulationService, useValue: classSimulationService },
        { provide: AzureBlobService, useValue: azureBlobService },
        { provide: DataSource, useValue: dataSource },
        { provide: MailService, useValue: mailService },
        { provide: NotificationsGateway, useValue: notificationsGateway },
        {
          provide: TutorPatientService,
          useValue: {
            getReportsByStudentIds: jest.fn().mockResolvedValue({ matched: [], isMatch: false }),
          },
        },
        {
          provide: LmsProvisionService,
          useValue: { getMappedClasses: jest.fn().mockResolvedValue({ classes: [], total: 0 }) },
        },
        {
          provide: LmsLookupService,
          useValue: { findStudentCodeByLmsUserIdGlobally: jest.fn().mockResolvedValue(null) },
        },
        {
          provide: LmsConfigService,
          useValue: { getOptionalBySchoolId: jest.fn().mockResolvedValue(null) },
        },
        {
          provide: LmsRosterService,
          useValue: { fetchRosterWithWsFallback: jest.fn().mockResolvedValue({ members: [] }) },
        },
      ],
    }));
    educatorToken = signToken(TEST_USERS.educator);
  });

  afterAll(async () => app.close());
  afterEach(() => jest.clearAllMocks());

  describe('POST /api/classes', () => {
    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      return request(httpServer()).post('/api/classes').send(validCreateDto).expect(401);
    });

    it('INTEGRATION: returns 403 when District Admin tries to create class', async () => {
      const adminToken = signToken(TEST_USERS.districtAdmin);

      return request(httpServer())
        .post('/api/classes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validCreateDto)
        .expect(403)
        .expect((res) => {
          expectStatus(res, 'FAILED');
        });
    });

    it('INTEGRATION: returns 400 when educator has no tokens', async () => {
      educatorRepo.findOne.mockResolvedValue(makeEducator({ tokens: 0 }));

      return request(httpServer())
        .post('/api/classes')
        .set('Authorization', `Bearer ${educatorToken}`)
        .send(validCreateDto)
        .expect(400)
        .expect((res) => {
          expectStatus(res, 'FAILED');
        });
    });

    it('INTEGRATION: returns 201 SUCCESS when class is created', async () => {
      educatorRepo.findOne.mockResolvedValue(makeEducator());
      classRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(makeClass())
        .mockResolvedValueOnce(makeClass());
      classRepo.create.mockReturnValue(makeClass());
      classRepo.save.mockResolvedValue(makeClass());
      studentRepo.find.mockResolvedValue([]);

      return request(httpServer())
        .post('/api/classes')
        .set('Authorization', `Bearer ${educatorToken}`)
        .send(validCreateDto)
        .expect(201)
        .expect((res) => {
          const body = parseBody(res);
          expect(body.status).toBe('SUCCESS');
          expect(body.data).toBeDefined();
        });
    });

    it('INTEGRATION: returns 400 when required fields are missing', async () => {
      return request(httpServer())
        .post('/api/classes')
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ class_name: 'Only Name' })
        .expect(400);
    });
  });

  describe('GET /api/classes/user', () => {
    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      return request(httpServer()).get('/api/classes/user').expect(401);
    });

    it('INTEGRATION: returns 200 with class list for educator', async () => {
      classRepo.find.mockResolvedValue([makeClass()]);

      return request(httpServer())
        .get('/api/classes/user')
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200)
        .expect((res) => {
          const body = parseBody(res);
          const data = asRecord(body.data);
          expect(body.status).toBe('SUCCESS');
          expect(Array.isArray(data.classes)).toBe(true);
        });
    });
  });

  describe('GET /api/classes/:id', () => {
    it('INTEGRATION: returns 200 when class found', async () => {
      classQb.getOne.mockResolvedValue(makeClass());
      classSimulationService.findByClass.mockResolvedValue({ data: [] });

      return request(httpServer())
        .get(`/api/classes/${CLASS_ID}`)
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200)
        .expect((res) => {
          const body = parseBody(res);
          const data = asRecord(body.data);
          expect(body.status).toBe('SUCCESS');
          expect(data.id).toBe(CLASS_ID);
        });
    });

    it('INTEGRATION: returns 404 when class not found', async () => {
      classQb.getOne.mockResolvedValue(null);

      return request(httpServer())
        .get(`/api/classes/${MISSING_CLASS_ID}`)
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(404)
        .expect((res) => {
          expectStatus(res, 'FAILED');
        });
    });
  });

  describe('PUT /api/classes/:id', () => {
    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      return request(httpServer())
        .put(`/api/classes/${CLASS_ID}`)
        .send({ class_name: 'Updated' })
        .expect(401);
    });

    it('INTEGRATION: returns 404 when class not found', async () => {
      classQb.getOne.mockResolvedValue(null);

      return request(httpServer())
        .put(`/api/classes/${MISSING_CLASS_ID}`)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ class_name: 'Updated' })
        .expect(404);
    });

    it('INTEGRATION: returns 200 when class updated', async () => {
      const updated = makeClass({ class_name: 'Updated Biology' });
      classQb.getOne.mockResolvedValue(makeClass());
      classRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValue(updated);
      classRepo.save.mockResolvedValue(updated);
      studentRepo.find.mockResolvedValue([]);

      return request(httpServer())
        .put(`/api/classes/${CLASS_ID}`)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ class_name: 'Updated Biology' })
        .expect(200)
        .expect((res) => {
          expectStatus(res, 'SUCCESS');
        });
    });
  });

  describe('DELETE /api/classes/:id', () => {
    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      return request(httpServer()).delete(`/api/classes/${CLASS_ID}`).expect(401);
    });

    it('INTEGRATION: returns 200 when class deleted', async () => {
      classQb.getOne.mockResolvedValue(makeClass());
      classRepo.findOne.mockResolvedValue(makeClass());

      return request(httpServer())
        .delete(`/api/classes/${CLASS_ID}`)
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200)
        .expect((res) => {
          expectStatus(res, 'SUCCESS');
        });
    });
  });
});
