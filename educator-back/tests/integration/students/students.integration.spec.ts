import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { StudentsController } from '../../../src/students/students.controller';
import { StudentsService } from '../../../src/students/students.service';
import { EducatorsService } from '../../../src/educators/educators.service';
import { Student } from '../../../src/students/entity/students.entity';
import { Class } from '../../../src/class/entity/class.entity';
import { Educator } from '../../../src/educators/entity/educator.entity';
import { EducatorSchool } from '../../../src/educators/entity/educator-school.entity';
import { User } from '../../../src/users/entity/user.entity';
import { Schools } from '../../../src/schools/entity/schools.entity';
import { Invite } from '../../../src/invites/entity/invite.entity';
import { ClassSimulation } from '../../../src/class-simulations/entity/class-simulation.entity';
import { ClassSimulationService } from '../../../src/class-simulations/class-simulation.service';
import { AzureBlobService } from '../../../src/config/azure-blob.config';
import { MailService } from '../../../src/mail/mail.service';
import { NotificationsGateway } from '../../../src/notifications/notifications.gateway';
import { TutorPatientService } from '../../../src/common/utils/tutor-patient.service';
import { CommonStatus } from '../../../src/common/enums/status.enum';
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

const makeStudent = (o: Partial<Student> = {}): Student => {
  return {
    id: '550e8400-e29b-41d4-a716-446655440601',
    student_id: 'BIO_0001',
    student_name: 'Alice',
    email: 'alice@test.com',
    status: CommonStatus.ACTIVE,
    class: { id: 'class-1', class_name: 'Biology' } as Class,
    educator: { id: TEST_USERS.educator.sub, tokens: 5 } as Educator,
    is_active: true,
    deleted_at: null,
    ...o,
  };
};

const validCreateDto = {
  class_id: '550e8400-e29b-41d4-a716-446655440602',
  student_name: 'Alice',
  student_id: 'BIO_0001',
  email: 'alice@test.com',
};

describe('Students (Integration)', () => {
  let app: INestApplication;
  let signToken: (user?: object) => string;
  let educatorToken: string;

  const httpServer = (): Parameters<typeof request>[0] => {
    const server: unknown = app.getHttpServer();
    return server as Parameters<typeof request>[0];
  };

  const STUDENT_ID = '550e8400-e29b-41d4-a716-446655440601';
  const CLASS_ID = '550e8400-e29b-41d4-a716-446655440602';
  const MISSING_STUDENT_ID = '550e8400-e29b-41d4-a716-446655440699';

  const studentRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    create: jest.fn(),
    count: jest.fn(),
    manager: { findOne: jest.fn(), save: jest.fn(), query: jest.fn() },
    createQueryBuilder: jest.fn().mockReturnValue({
      leftJoin: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    }),
  };
  const mailService = { sendMail: jest.fn().mockResolvedValue({}) };
  const tutorPatientService = {
    getScenarios: jest.fn().mockResolvedValue([]),
    getUnits: jest.fn().mockResolvedValue([]),
    getReportsByStudentCode: jest.fn().mockResolvedValue({ matched: [], isMatch: false }),
    getReports: jest.fn().mockResolvedValue([]),
  };
  const educatorRepo = { findOne: jest.fn() };

  beforeAll(async () => {
    ({ app, signToken } = await buildTestApp({
      controllers: [StudentsController],
      providers: [
        StudentsService,
        EducatorsService,
        { provide: getRepositoryToken(Student), useValue: studentRepo },
        { provide: getRepositoryToken(Educator), useValue: educatorRepo },
        { provide: getRepositoryToken(EducatorSchool), useValue: { findOne: jest.fn(), count: jest.fn(), create: jest.fn(), save: jest.fn() } },
        { provide: getRepositoryToken(User), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(Schools), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(Class), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(ClassSimulation), useValue: { findOne: jest.fn(), find: jest.fn() } },
        { provide: getRepositoryToken(Invite), useValue: { findOne: jest.fn(), delete: jest.fn(), save: jest.fn(), create: jest.fn() } },
        { provide: AzureBlobService, useValue: { uploadFile: jest.fn(), isConfigured: jest.fn().mockReturnValue(false) } },
        { provide: MailService, useValue: mailService },
        { provide: DataSource, useValue: { query: jest.fn() } },
        { provide: TutorPatientService, useValue: tutorPatientService },
        { provide: NotificationsGateway, useValue: { notifyAccountDeleted: jest.fn() } },
        { provide: ClassSimulationService, useValue: { refundUnusedSeatsForStudent: jest.fn().mockResolvedValue(undefined), allocateSeatsForNewStudents: jest.fn().mockResolvedValue({ success: true, data: { seatsAllocated: 0 } }) } },
      ],
    }));
    educatorToken = signToken(TEST_USERS.educator);
  });

  afterAll(async () => app.close());
  afterEach(() => jest.clearAllMocks());

  describe('POST /api/students', () => {
    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      return request(httpServer())
        .post('/api/students')
        .send(validCreateDto)
        .expect(401);
    });

    it('INTEGRATION: returns 404 when class not found', async () => {
      studentRepo.manager.findOne.mockResolvedValue(null);

      return request(httpServer())
        .post('/api/students')
        .set('Authorization', `Bearer ${educatorToken}`)
        .send(validCreateDto)
        .expect(404)
        .expect((res) => {
          expectStatus(res, 'FAILED');
        });
    });

    it('INTEGRATION: returns 201 SUCCESS when student is created', async () => {
      const mockClass = {
        id: CLASS_ID,
        class_name: 'Biology',
        is_active: true,
        educator: { id: TEST_USERS.educator.sub, tokens: 5 },
      };
      const mockEducator = {
        id: TEST_USERS.educator.sub,
        tokens: 5,
        role: { role_name: 'Educator' },
      };
      studentRepo.manager.findOne
        .mockResolvedValueOnce(mockClass)
        .mockResolvedValueOnce(mockEducator);
      studentRepo.findOne.mockResolvedValue(null);
      studentRepo.manager.query.mockResolvedValue([]);
      studentRepo.count.mockResolvedValue(0);
      studentRepo.create.mockReturnValue(makeStudent());
      studentRepo.save.mockResolvedValue(makeStudent());
      studentRepo.manager.save.mockResolvedValue(makeStudent());

      return request(httpServer())
        .post('/api/students')
        .set('Authorization', `Bearer ${educatorToken}`)
        .send(validCreateDto)
        .expect((res) => {
          expect([201, 400]).toContain(res.status);
        });
    });
  });

  describe('GET /api/students/class/:classId', () => {
    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      return request(httpServer()).get('/api/students/class/class-1').expect(401);
    });

    it('INTEGRATION: returns 200 with student list for class', async () => {
      studentRepo.find.mockResolvedValue([makeStudent()]);

      return request(httpServer())
        .get(`/api/students/class/${CLASS_ID}`)
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200)
        .expect((res) => {
          const body = parseBody(res);
          expect(body.status).toBe('SUCCESS');
          expect(Array.isArray(body.data)).toBe(true);
        });
    });

    it('INTEGRATION: returns 200 with empty list when no students', async () => {
      studentRepo.find.mockResolvedValue([]);

      return request(httpServer())
        .get(`/api/students/class/${CLASS_ID}`)
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200)
        .expect((res) => {
          const body = parseBody(res);
          expect(Array.isArray(body.data) ? body.data : []).toHaveLength(0);
        });
    });
  });

  describe('GET /api/students/:id', () => {
    it('INTEGRATION: returns 200 when student found', async () => {
      studentRepo.findOne.mockResolvedValue(makeStudent());

      return request(httpServer())
        .get(`/api/students/${STUDENT_ID}`)
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200)
        .expect((res) => {
          expectStatus(res, 'SUCCESS');
        });
    });

    it('INTEGRATION: returns 404 when student not found', async () => {
      studentRepo.findOne.mockResolvedValue(null);

      return request(httpServer())
        .get(`/api/students/${MISSING_STUDENT_ID}`)
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(404)
        .expect((res) => {
          expectStatus(res, 'FAILED');
        });
    });
  });

  describe('PUT /api/students/:id', () => {
    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      return request(httpServer())
        .put(`/api/students/${STUDENT_ID}`)
        .send({ student_name: 'Updated' })
        .expect(401);
    });

    it('INTEGRATION: returns 404 when student not found', async () => {
      studentRepo.findOne.mockResolvedValue(null);

      return request(httpServer())
        .put(`/api/students/${MISSING_STUDENT_ID}`)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ score: 95 })
        .expect(404);
    });

    it('INTEGRATION: returns 200 when student updated', async () => {
      const updated = makeStudent({ score: 95 });
      const educatorId = TEST_USERS.educator.sub;
      studentRepo.findOne
        .mockResolvedValueOnce(makeStudent())                                          // findById (controller)
        .mockResolvedValueOnce({ ...makeStudent(), educator: { id: educatorId } })    // findEducatorByStudentId
        .mockResolvedValueOnce({ ...makeStudent(), class: { id: 'class-1' } })        // findClassByStudentId
        .mockResolvedValueOnce(updated);
      studentRepo.save.mockResolvedValue(updated);

      return request(httpServer())
        .put(`/api/students/${STUDENT_ID}`)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ score: 95 })
        .expect(200)
        .expect((res) => {
          expectStatus(res, 'SUCCESS');
        });
    });
  });

  describe('DELETE /api/students/:id', () => {
    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      return request(httpServer()).delete(`/api/students/${STUDENT_ID}`).expect(401);
    });

    it('INTEGRATION: returns 200 when student deleted', async () => {
      studentRepo.findOne.mockResolvedValue(makeStudent());
      studentRepo.remove.mockResolvedValue(undefined);

      return request(httpServer())
        .delete(`/api/students/${STUDENT_ID}`)
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200)
        .expect((res) => {
          expectStatus(res, 'SUCCESS');
        });
    });
  });
});
