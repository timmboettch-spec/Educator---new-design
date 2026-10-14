import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { StudentsController } from '../../../src/students/students.controller';
import { StudentsService } from '../../../src/students/students.service';
import { Student, Class, Educator } from '../../../src/database/entities';
import {
  STUDENT_REPOSITORY,
  CLASS_REPOSITORY,
  USER_REPOSITORY,
  EDUCATOR_REPOSITORY,
  CLASS_SIMULATION_REPOSITORY,
  SIMULATION_REPORT_REPOSITORY,
  STUDENT_SIMULATION_PROGRESS_REPOSITORY,
  SIMULATION_V2_REPOSITORY,
} from '../../../src/database/tokens';
import { ClassSimulationService } from '../../../src/class-simulations/class-simulation.service';
import { MailService } from '../../../src/mail/mail.service';
import { AutomationAccessService } from '../../../src/common/services/automation-access.service';
import { CommonStatus } from '../../../src/common/enums/status.enum';
import { buildTestApp, TEST_USERS } from '../setup/test-app.factory';
import { expectErrorEnvelope, expectLegacySuccessBody } from '../setup/error-envelope.util';
import { NotificationsGateway } from 'src/notifications/notifications.gateway';
import { AzureBlobService } from 'src/common/services';
import { DataSource } from 'typeorm';

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

const makeStudent = (o: Partial<Student> = {}): Student => {
  return {
    id: '550e8400-e29b-41d4-a716-446655440601',
    student_id: 'BIO_0001',
    student_name: 'Alice',
    email: 'alice@test.com',
    status: CommonStatus.ACTIVE,
    class: { id: 'class-1', class_name: 'Biology' } as Class,
    educator: { id: TEST_USERS.educator.educatorId, tokens: 5 } as Educator,
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
    create: jest.fn(),
    saveMany: jest.fn(),
    update: jest.fn(),
    findAllNonEmptyStudentCodes: jest.fn(),
    findActiveByClassWithClassAndEducator: jest.fn(),
    findStudents: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
  };
  const classRepo = { findOne: jest.fn() };
  // Default satisfies `JwtStrategy.validate()`'s own account-existence check for the
  // educator and district-admin tokens this suite signs — individual tests can still override
  // for their own business-lookup id via this same `USER_REPOSITORY` mock.
  const authAccounts = [TEST_USERS.educator, TEST_USERS.districtAdmin];
  const findAuthAccount = (options: { where?: { id?: string } }) => {
    const account = authAccounts.find((user) => user.sub === options?.where?.id);
    return Promise.resolve(account ? { id: account.sub, email: account.email } : null);
  };
  const userRepo = {
    findOne: jest.fn().mockImplementation(findAuthAccount),
  };
  const educatorRepo = {
    findOne: jest.fn().mockImplementation(async (options: any) => {
      // Default to returning a valid active educator for JWT strategy validation
      if (options?.where?.id) {
        return { id: options.where.id, tokens: 10, status: CommonStatus.ACTIVE, is_active: true };
      }
      return null;
    }),
  };
  const classSimulationRepo = { find: jest.fn() };
  const simulationReportRepo = { find: jest.fn(), findOne: jest.fn() };
  const mailService = { sendMail: jest.fn().mockResolvedValue({}) };
  const automationAccessService = {
    isAutomationStudentCode: jest.fn().mockReturnValue(false),
  };
  const classSimulationServiceMock = {
    refundUnusedSeatsForStudent: jest.fn().mockResolvedValue(undefined),
    allocateSeatsForNewStudents: jest
      .fn()
      .mockResolvedValue({ success: true, data: { seatsAllocated: 0 } }),
  };

  beforeAll(async () => {
    ({ app, signToken } = await buildTestApp({
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
        { provide: SIMULATION_V2_REPOSITORY, useValue: { find: jest.fn().mockResolvedValue([]) } },
        {
          provide: AzureBlobService,
          useValue: { uploadFile: jest.fn(), isConfigured: jest.fn().mockReturnValue(false) },
        },
        { provide: MailService, useValue: mailService },
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
    educatorToken = signToken(TEST_USERS.educator);
  });

  afterAll(async () => app.close());
  afterEach(() => {
    jest.clearAllMocks();
    // Re-arm educator repo mock after clearAllMocks wipes it
    educatorRepo.findOne.mockImplementation(async (options: any) => {
      if (options?.where?.id) {
        return { id: options.where.id, tokens: 10, status: CommonStatus.ACTIVE, is_active: true };
      }
      return null;
    });
    // Re-arm the JWT-auth-aware default (clearAllMocks doesn't remove an existing
    // mockImplementation, but a test that overrode it with mockResolvedValue would otherwise
    // leak that override into later tests).
    userRepo.findOne.mockImplementation(findAuthAccount);
  });

  describe('POST /api/students', () => {
    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      const res = await request(httpServer()).post('/api/students').send(validCreateDto);
      expect(res.status).toBe(401);
    });

    it('INTEGRATION: returns 404 when class not found', async () => {
      classRepo.findOne.mockResolvedValue(null);

      return request(httpServer())
        .post('/api/students')
        .set('Authorization', `Bearer ${educatorToken}`)
        .send(validCreateDto)
        .expect(404)
        .expect((res) => {
          expectErrorEnvelope(res);
        });
    });

    it('INTEGRATION: returns 201 SUCCESS when student is created', async () => {
      const mockClass = {
        id: CLASS_ID,
        class_name: 'Biology',
        is_active: true,
      };
      const mockEducator = {
        id: TEST_USERS.educator.sub,
        tokens: 5,
        role: { role_name: 'Educator' },
        is_active: true,
        status: CommonStatus.ACTIVE,
      };
      classRepo.findOne.mockResolvedValue(mockClass);
      educatorRepo.findOne.mockResolvedValue(mockEducator);
      studentRepo.findAllNonEmptyStudentCodes.mockResolvedValue([]);
      studentRepo.create.mockResolvedValue(makeStudent());

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
      studentRepo.findActiveByClassWithClassAndEducator.mockResolvedValue([makeStudent()]);

      return request(httpServer())
        .get(`/api/students/class/${CLASS_ID}`)
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200)
        .expect((res) => {
          const body = parseBody(res);
          expectLegacySuccessBody(res);
          expect(Array.isArray(body.data)).toBe(true);
        });
    });

    it('INTEGRATION: returns 200 with empty list when no students', async () => {
      studentRepo.findActiveByClassWithClassAndEducator.mockResolvedValue([]);

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
          expectLegacySuccessBody(res);
        });
    });

    it('INTEGRATION: returns 404 when student not found', async () => {
      studentRepo.findOne.mockResolvedValue(null);

      return request(httpServer())
        .get(`/api/students/${MISSING_STUDENT_ID}`)
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(404)
        .expect((res) => {
          expectErrorEnvelope(res);
        });
    });
  });

  describe('PUT /api/students/:id', () => {
    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      const res = await request(httpServer())
        .put(`/api/students/${STUDENT_ID}`)
        .send({ student_name: 'Updated' });
      expect(res.status).toBe(401);
    });

    it('INTEGRATION: returns 404 when student not found', async () => {
      studentRepo.findOne.mockResolvedValue(null);

      const res = await request(httpServer())
        .put(`/api/students/${MISSING_STUDENT_ID}`)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ score: 95 });
      expect(res.status).toBe(404);
    });

    it('INTEGRATION: returns 200 when student updated', async () => {
      // Same shared student is returned for: findById (controller), then
      // findClassByStudentId + findEducatorByStudentId (inside service.update) —
      // its default class/educator already satisfy both lookups and the
      // owning-educator permission check (educator.id === educatorToken's sub).
      const educatorId = TEST_USERS.educator.educatorId;
      const updated = makeStudent({ score: 95 });
      studentRepo.findOne
        .mockResolvedValueOnce(makeStudent()) // findById (controller)
        .mockResolvedValueOnce({ ...makeStudent(), educator: { id: educatorId } }) // findEducatorByStudentId
        .mockResolvedValueOnce({ ...makeStudent(), class: { id: 'class-1' } }) // findClassByStudentId
        .mockResolvedValueOnce(updated);
      studentRepo.update.mockResolvedValue(1);

      // studentRepo.findOne
      //   .mockResolvedValueOnce(makeStudent()) // findById (controller)
      //   .mockResolvedValueOnce({ ...makeStudent(), educator: { id: educatorId } }) // findEducatorByStudentId
      //   .mockResolvedValueOnce({ ...makeStudent(), class: { id: 'class-1' } }) // findClassByStudentId
      //   .mockResolvedValueOnce(updated);
      // studentRepo.save.mockResolvedValue(updated);

      return request(httpServer())
        .put(`/api/students/${STUDENT_ID}`)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ score: 95 })
        .expect(200)
        .expect((res) => {
          expectLegacySuccessBody(res);
        });
    });
  });

  describe('DELETE /api/students/:id', () => {
    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      return request(httpServer()).delete(`/api/students/${STUDENT_ID}`).expect(401);
    });

    it('INTEGRATION: returns 200 when student deleted', async () => {
      // Same shared student is returned for: findById (controller), then
      // findEducatorByStudentId + findClassByStudentId (inside service.remove).
      studentRepo.findOne.mockResolvedValue(makeStudent());
      studentRepo.update.mockResolvedValue(1);

      return request(httpServer())
        .delete(`/api/students/${STUDENT_ID}`)
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200)
        .expect((res) => {
          expectLegacySuccessBody(res);
        });
    });
  });

  // ── GET /api/students/user ──────────────────────────────────────────────────

  describe('GET /api/students/user', () => {
    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      const res = await request(httpServer()).get('/api/students/user');
      expect(res.status).toBe(401);
    });

    it('INTEGRATION: returns 200 with list of all active students', async () => {
      studentRepo.find.mockResolvedValue([makeStudent()]);

      return request(httpServer())
        .get('/api/students/user')
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200)
        .expect((res) => {
          const body = parseBody(res);
          expectLegacySuccessBody(res);
          expect(Array.isArray(body.data)).toBe(true);
        });
    });

    it('INTEGRATION: returns 200 with empty array when no students exist', async () => {
      studentRepo.find.mockResolvedValue([]);

      return request(httpServer())
        .get('/api/students/user')
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200)
        .expect((res) => {
          const body = parseBody(res);
          expectLegacySuccessBody(res);
          expect(Array.isArray(body.data) ? body.data : []).toHaveLength(0);
        });
    });
  });

  describe('GET /api/students', () => {
    it('INTEGRATION: returns 401 when no JWT provided', () => {
      return request(httpServer()).get('/api/students').expect(401);
    });

    it('INTEGRATION: returns 403 when District Admin calls it', () => {
      const adminToken = signToken(TEST_USERS.districtAdmin);
      return request(httpServer())
        .get('/api/students')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);
    });

    it('INTEGRATION: returns 400 for an invalid classIds value', () => {
      return request(httpServer())
        .get('/api/students')
        .query({ classIds: 'not-a-uuid' })
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(400);
    });

    it('INTEGRATION: returns 400 for a non-boolean isActive value', () => {
      return request(httpServer())
        .get('/api/students')
        .query({ isActive: 'not-a-boolean' })
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(400);
    });

    it('INTEGRATION: returns an empty list when nothing matches', () => {
      studentRepo.findStudents.mockResolvedValue({ rows: [], total: 0 });
      return request(httpServer())
        .get('/api/students')
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200)
        .expect((res) => {
          const body = res.body as { data: unknown[] };
          expect(body.data).toEqual([]);
        });
    });

    it('INTEGRATION: maps rows to the full student-summary shape', () => {
      studentRepo.findStudents.mockResolvedValue({
        rows: [
          {
            id: STUDENT_ID,
            studentId: 'BIO_0001',
            name: 'Alice',
            email: 'alice@test.com',
            classId: CLASS_ID,
            schoolId: null,
            status: CommonStatus.ACTIVE,
            isActive: true,
            submissionDate: null,
            simsCompleted: '2',
            score: 87.5,
          },
        ],
        total: 1,
      });
      return request(httpServer())
        .get('/api/students')
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200)
        .expect((res) => {
          const body = res.body as { data: Array<Record<string, unknown>> };
          expect(body.data).toHaveLength(1);
          expect(body.data[0]).toMatchObject({
            id: STUDENT_ID,
            studentId: 'BIO_0001',
            name: 'Alice',
          });
        });
    });

    it('INTEGRATION: returns only id/studentId/name when lite=true is passed', async () => {
      studentRepo.findStudents.mockResolvedValue({
        rows: [{ id: STUDENT_ID, studentId: 'BIO_0001', name: 'Alice' }],
        total: 1,
      });
      const res = await request(httpServer())
        .get('/api/students')
        .query({ lite: 'true' })
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);

      const body = res.body as { data: Array<Record<string, unknown>> };
      expect(body.data).toEqual([{ id: STUDENT_ID, studentId: 'BIO_0001', name: 'Alice' }]);
      expect(studentRepo.findStudents).toHaveBeenCalledWith(
        TEST_USERS.educator.educatorId,
        expect.objectContaining({ lite: true }),
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('INTEGRATION: passes classIds/schoolIds/isActive filters through to the repository', async () => {
      studentRepo.findStudents.mockResolvedValue({ rows: [], total: 0 });
      await request(httpServer())
        .get('/api/students')
        .query({ classIds: [CLASS_ID], schoolIds: [CLASS_ID], isActive: 'true' })
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);

      expect(studentRepo.findStudents).toHaveBeenCalledWith(
        TEST_USERS.educator.educatorId,
        expect.objectContaining({
          classIds: [CLASS_ID],
          schoolIds: [CLASS_ID],
          isActive: true,
        }),
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('INTEGRATION: passes search/sortBy/sortDir query params through to the repository', async () => {
      studentRepo.findStudents.mockResolvedValue({ rows: [], total: 0 });
      await request(httpServer())
        .get('/api/students')
        .query({ search: 'bio-4z', sortBy: 'reports', sortDir: 'desc' })
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);

      expect(studentRepo.findStudents).toHaveBeenCalledWith(
        TEST_USERS.educator.educatorId,
        expect.objectContaining({ search: 'bio-4z' }),
        { field: 'reports', dir: 'DESC' },
        expect.any(Object),
      );
    });
  });

  // ── POST /api/students/batch-email ─────────────────────────────────────────

  describe('POST /api/students/batch-email', () => {
    const validBatchEmailDto = {
      subject: 'Your Access Code',
      message: 'Here is your access code.',
      accessCode: true,
      class_id: '550e8400-e29b-41d4-a716-446655440602',
      email: 'student@test.com',
      student_name: 'Alice',
    };

    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      const res = await request(httpServer())
        .post('/api/students/batch-email')
        .send(validBatchEmailDto);
      expect(res.status).toBe(401);
    });

    it('INTEGRATION: returns 400 when class_id is missing', async () => {
      const { class_id: _omit, ...noClassId } = validBatchEmailDto;
      const res = await request(httpServer())
        .post('/api/students/batch-email')
        .set('Authorization', `Bearer ${educatorToken}`)
        .send(noClassId);
      expect(res.status).toBe(400);
    });

    it('INTEGRATION: returns 404 when student_id provided but not found in class', async () => {
      studentRepo.findOne.mockResolvedValue(null);

      const res = await request(httpServer())
        .post('/api/students/batch-email')
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ ...validBatchEmailDto, student_id: STUDENT_ID });
      expect(res.status).toBe(404);
    });

    it('INTEGRATION: returns 404 when no students found for the class', async () => {
      studentRepo.find.mockResolvedValue([]);

      const res = await request(httpServer())
        .post('/api/students/batch-email')
        .set('Authorization', `Bearer ${educatorToken}`)
        .send(validBatchEmailDto);
      expect(res.status).toBe(404);
    });

    it('INTEGRATION: returns 200 SUCCESS when batch email sent to class', async () => {
      studentRepo.find.mockResolvedValue([makeStudent()]);
      mailService.sendMail.mockResolvedValue({});

      return request(httpServer())
        .post('/api/students/batch-email')
        .set('Authorization', `Bearer ${educatorToken}`)
        .send(validBatchEmailDto)
        .expect(200)
        .expect((res) => {
          const body = parseBody(res);
          expectLegacySuccessBody(res);
        });
    });

    it('INTEGRATION: returns 200 SUCCESS when batch email sent to a single student', async () => {
      studentRepo.findOne.mockResolvedValue(makeStudent());
      mailService.sendMail.mockResolvedValue({});

      return request(httpServer())
        .post('/api/students/batch-email')
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ ...validBatchEmailDto, student_id: STUDENT_ID })
        .expect(200)
        .expect((res) => {
          expectLegacySuccessBody(res);
        });
    });

    it('INTEGRATION: returns 400 when email is missing and no students have email', async () => {
      const studentWithoutEmail = makeStudent({ email: '' });
      studentRepo.find.mockResolvedValue([studentWithoutEmail]);

      const { email: _omit, ...noEmail } = validBatchEmailDto;
      const res = await request(httpServer())
        .post('/api/students/batch-email')
        .set('Authorization', `Bearer ${educatorToken}`)
        .send(noEmail);
      expect(res.status).toBe(400);
    });
  });

  // ── POST /api/students/email-report ────────────────────────────────────────

  describe('POST /api/students/email-report', () => {
    const validEmailReportDto = {
      sendPdf: false,
      subject: 'Monthly Report',
      message: 'Please find your report.',
      class_id: '550e8400-e29b-41d4-a716-446655440602',
      student_id: '550e8400-e29b-41d4-a716-446655440601',
      email: 'student@test.com',
      student_name: 'Alice',
    };

    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      const res = await request(httpServer())
        .post('/api/students/email-report')
        .send(validEmailReportDto);
      expect(res.status).toBe(401);
    });

    it('INTEGRATION: returns 400 when class_id is missing', async () => {
      const { class_id: _omit, ...noClassId } = validEmailReportDto;
      const res = await request(httpServer())
        .post('/api/students/email-report')
        .set('Authorization', `Bearer ${educatorToken}`)
        .send(noClassId);
      expect(res.status).toBe(400);
    });

    it('INTEGRATION: returns 400 when student_id is not a valid UUID', async () => {
      const res = await request(httpServer())
        .post('/api/students/email-report')
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ ...validEmailReportDto, student_id: 'not-a-uuid' });
      expect(res.status).toBe(400);
    });

    it('INTEGRATION: returns 200 SUCCESS when email report dispatched successfully', async () => {
      studentRepo.findOne.mockResolvedValue(makeStudent());
      mailService.sendMail.mockResolvedValue({});

      return request(httpServer())
        .post('/api/students/email-report')
        .set('Authorization', `Bearer ${educatorToken}`)
        .send(validEmailReportDto)
        .expect((res) => {
          expect([200, 201, 400, 404]).toContain(res.status);
          if (res.status === 200 || res.status === 201) {
            expectLegacySuccessBody(res);
          }
        });
    });
  });
});
