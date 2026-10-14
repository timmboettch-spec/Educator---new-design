import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ClassesController } from '../../../src/class/classes.controller';
import { ClassesService } from '../../../src/class/classes.service';
import { EducatorsService } from '../../../src/educators/educators.service';
import { InviteTokenService } from '../../../src/invites/invite-token.service';

import { ClassSimulationService } from '../../../src/class-simulations/class-simulation.service';
import { AzureBlobService } from '../../../src/common/services';
import { MailService } from '../../../src/mail/mail.service';
import { NotificationsGateway } from '../../../src/notifications/notifications.gateway';
import { NotificationsService } from '../../../src/notifications/notifications.service';
import { EducatorSessionService } from '../../../src/session/educator-session.service';
import { CommonStatus } from '../../../src/common/enums/status.enum';
import { buildTestApp, TEST_USERS } from '../setup/test-app.factory';
import { expectErrorEnvelope, expectLegacySuccessBody } from '../setup/error-envelope.util';
import { LmsProvisionService } from '../../../src/lms/services/lms-provision.service';
import { LmsLookupService } from '../../../src/lms/services/lms-lookup.service';
import { LmsConfigService } from '../../../src/lms/services/lms-config.service';
import { LmsAssignmentService } from '../../../src/lms/services/lms-assignment.service';
import { LmsRosterService } from '../../../src/lms/services/lms-roster.service';
import {
  Class,
  Educator,
  GoogleCourseMapping,
  GoogleCourseworkMapping,
} from 'src/database/entities';
import {
  CLASS_EDUCATOR_REPOSITORY,
  CLASS_REPOSITORY,
  CLASS_SIMULATION_REPOSITORY,
  DISTRICT_ADMIN_REPOSITORY,
  EDUCATOR_REPOSITORY,
  EDUCATOR_SCHOOL_REPOSITORY,
  EDUCATOR_SEAT_REQUEST_REPOSITORY,
  GOOGLE_COURSE_MAPPING_REPOSITORY,
  GOOGLE_STUDENT_MAPPING_REPOSITORY,
  INVITE_REPOSITORY,
  LMS_CLASS_MAPPING_REPOSITORY,
  LMS_STUDENT_MAPPING_REPOSITORY,
  SCHOOLS_REPOSITORY,
  SIMULATION_REPORT_REPOSITORY,
  STUDENT_REPOSITORY,
} from 'src/database/tokens';
import { ClassStudentCodesExportConstants } from 'src/common/constants';

type TestResponseBody = {
  status?: string;
  message?: string;
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

const makeEducator = (o: Partial<Educator> = {}): Educator =>
  ({
    id: TEST_USERS.educator.sub,
    tokens: 10,
    status: CommonStatus.ACTIVE,
    is_active: true,
    ...o,
  }) as Educator;

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
  className: 'Biology',
  term: 'i',
  year: '2025',
  startDate: '2025-01-01',
  endDate: '2025-06-01',
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
  const classRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    count: jest.fn(),
    findActiveByIdWithSchoolForEducator: jest.fn(),
    findActiveByIdWithEducatorAndStudentsForEducator: jest.fn(),
    findAllActiveForEducator: jest.fn(),
    findActiveDuplicateForUpdate: jest.fn(),
    findActiveClassByName: jest.fn(),
    findLmsLinkedActiveForSchool: jest.fn(),
    findActiveByLmsCourseReferenceForSchool: jest.fn(),
    findActiveByEducatorWithSchool: jest.fn(),
    countActiveWithNoStudentsForEducator: jest.fn().mockResolvedValue(0),
    countActiveWithNoAssignedSimsForEducator: jest.fn().mockResolvedValue(0),
    countActiveForEducator: jest.fn().mockResolvedValue(0),
    countActiveNeedingAttentionForEducator: jest.fn().mockResolvedValue(0),
    getActivityOverviewCounts: jest.fn(),
    findSchoolGroupsForEducator: jest.fn(),
    findClasses: jest.fn(),
  };
  const studentRepo = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    count: jest.fn(),
    saveMany: jest.fn().mockResolvedValue([]),
    findAllNonEmptyStudentCodes: jest.fn().mockResolvedValue([]),
    iterateStudentCodesByClass: jest.fn(),
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
  const classSimulationRepo = { findOne: jest.fn(), find: jest.fn(), update: jest.fn() };
  const simulationReportRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    getAttentionCountsByClassIds: jest.fn().mockResolvedValue([]),
    getSimulationsCompletedGraph: jest.fn().mockResolvedValue({ byMonth: [], bySchool: [] }),
    getAttentionCountsByEducator: jest.fn().mockResolvedValue([]),
  };
  const classSimulationService = {
    findByClass: jest.fn().mockResolvedValue({ data: [] }),
    findByClassIdsBatch: jest.fn().mockResolvedValue(new Map()),
    refundUnusedSeatsForClass: jest.fn().mockResolvedValue(undefined),
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
  const educatorSchoolRepo = {
    findOne: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const lmsClassMappingRepo = { findOne: jest.fn(), create: jest.fn(), delete: jest.fn() };
  const lmsConfigService = {
    getOptionalBySchoolId: jest.fn().mockResolvedValue(null),
    getActiveOptionalBySchoolId: jest.fn().mockResolvedValue(null),
  };
  const lmsAssignmentService = { findByClass: jest.fn().mockResolvedValue([]) };
  const entityManager = { findOne: jest.fn(), find: jest.fn() };
  const dataSource = {
    manager: entityManager,
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
        {
          provide: InviteTokenService,
          useValue: {
            issue: jest.fn().mockReturnValue('mock-invite-token'),
            buildInviteUrl: jest
              .fn()
              .mockReturnValue('http://localhost:5173/signup/mock-invite-token'),
            resolve: jest.fn(),
          },
        },
        { provide: CLASS_REPOSITORY, useValue: classRepo },
        {
          provide: CLASS_EDUCATOR_REPOSITORY,
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
          },
        },
        { provide: STUDENT_REPOSITORY, useValue: studentRepo },
        { provide: EDUCATOR_REPOSITORY, useValue: educatorRepo },
        { provide: EDUCATOR_SCHOOL_REPOSITORY, useValue: educatorSchoolRepo },
        {
          provide: EDUCATOR_SEAT_REQUEST_REPOSITORY,
          useValue: { createWithinCooldown: jest.fn(), hardDeleteById: jest.fn() },
        },
        { provide: SCHOOLS_REPOSITORY, useValue: { findOne: jest.fn() } },
        {
          provide: DISTRICT_ADMIN_REPOSITORY,
          useValue: { findByUserRoleId: jest.fn(), updateByUserRoleId: jest.fn() },
        },
        {
          provide: INVITE_REPOSITORY,
          useValue: { findOne: jest.fn(), delete: jest.fn(), save: jest.fn(), create: jest.fn() },
        },
        { provide: CLASS_SIMULATION_REPOSITORY, useValue: classSimulationRepo },
        {
          provide: GOOGLE_COURSE_MAPPING_REPOSITORY,
          useValue: { deleteByClassId: jest.fn().mockResolvedValue(0) },
        },
        {
          provide: GOOGLE_STUDENT_MAPPING_REPOSITORY,
          useValue: { deleteByClassId: jest.fn().mockResolvedValue(0) },
        },
        { provide: LMS_CLASS_MAPPING_REPOSITORY, useValue: lmsClassMappingRepo },
        {
          provide: LMS_STUDENT_MAPPING_REPOSITORY,
          useValue: { findOne: jest.fn(), create: jest.fn(), delete: jest.fn() },
        },
        { provide: SIMULATION_REPORT_REPOSITORY, useValue: simulationReportRepo },
        { provide: ClassSimulationService, useValue: classSimulationService },
        { provide: AzureBlobService, useValue: azureBlobService },
        { provide: DataSource, useValue: dataSource },
        { provide: MailService, useValue: mailService },
        { provide: NotificationsGateway, useValue: notificationsGateway },
        {
          provide: NotificationsService,
          useValue: {
            isPreferenceEnabled: jest.fn().mockResolvedValue(false),
            getEmailFrequency: jest.fn().mockResolvedValue('immediate'),
          },
        },
        {
          provide: EducatorSessionService,
          useValue: {
            invalidateEducator: jest.fn().mockResolvedValue(undefined),
            isTokenInvalidated: jest.fn().mockResolvedValue(false),
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
        { provide: LmsConfigService, useValue: lmsConfigService },
        { provide: LmsAssignmentService, useValue: lmsAssignmentService },
        {
          provide: LmsRosterService,
          useValue: { fetchRosterWithWsFallback: jest.fn().mockResolvedValue({ members: [] }) },
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
  });

  describe('POST /api/classes', () => {
    beforeEach(() => {
      educatorRepo.findOne.mockResolvedValue(makeEducator());
      classRepo.findActiveClassByName.mockResolvedValue(null);
    });

    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      return request(httpServer()).post('/api/classes').send(validCreateDto).expect(401);
    });

    it('INTEGRATION: returns 403 when District Admin tries to create a class', async () => {
      const adminToken = signToken(TEST_USERS.districtAdmin);

      return request(httpServer())
        .post('/api/classes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validCreateDto)
        .expect(403);
    });

    it('INTEGRATION: returns 400 when className is missing', async () => {
      return request(httpServer())
        .post('/api/classes')
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ startDate: '2025-01-01', endDate: '2025-06-01' })
        .expect(400);
    });

    it('INTEGRATION: returns 400 when start date is after end date', async () => {
      return request(httpServer())
        .post('/api/classes')
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ ...validCreateDto, startDate: '2025-12-01', endDate: '2025-01-01' })
        .expect(400);
    });

    it('INTEGRATION: returns 400 when the class name already exists', async () => {
      classRepo.findActiveClassByName.mockResolvedValue(makeClass());

      return request(httpServer())
        .post('/api/classes')
        .set('Authorization', `Bearer ${educatorToken}`)
        .send(validCreateDto)
        .expect(400);
    });

    it('INTEGRATION: returns 400 for an invalid status value', async () => {
      return request(httpServer())
        .post('/api/classes')
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ ...validCreateDto, status: 'NOT_A_STATUS' })
        .expect(400);
    });

    it('INTEGRATION: returns 400 when both students and totalNoOfStudents are provided', async () => {
      return request(httpServer())
        .post('/api/classes')
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({
          ...validCreateDto,
          students: [{ student_name: 'A' }],
          totalNoOfStudents: 5,
        })
        .expect(400);
    });

    it('INTEGRATION: returns 201 with the new-module {message, data, meta, error} envelope when created', async () => {
      classRepo.findOne
        .mockResolvedValueOnce(makeClass()) // reload-with-school after insert
        .mockResolvedValueOnce(makeClass()); // final reload with relations
      classRepo.create.mockResolvedValue(makeClass());
      studentRepo.findAllNonEmptyStudentCodes.mockResolvedValue([]);

      return request(httpServer())
        .post('/api/classes')
        .set('Authorization', `Bearer ${educatorToken}`)
        .send(validCreateDto)
        .expect(201)
        .expect((res) => {
          const body = res.body as {
            message?: string;
            data?: { className?: string };
            meta?: unknown;
            error?: unknown;
          };
          expect(body).toHaveProperty('message');
          expect(body).toHaveProperty('meta');
          expect(body.error).toBeNull();
          expect(body.data?.className).toBe('Biology');
        });
    });
  });

  describe('GET /api/classes/user', () => {
    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      return request(httpServer()).get('/api/classes/user').expect(401);
    });

    it('INTEGRATION: returns 200 with class list for educator', async () => {
      classRepo.findAllActiveForEducator.mockResolvedValue([makeClass()]);

      return request(httpServer())
        .get('/api/classes/user')
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200)
        .expect((res) => {
          expectLegacySuccessBody(res);
          const body = parseBody(res);
          const data = asRecord(body.data);
          expect(Array.isArray(data.classes)).toBe(true);
        });
    });
  });

  describe('GET /api/classes/user LMS linkage summary', () => {
    const linkageOf = (res: request.Response) => {
      const classes = asRecord(parseBody(res).data)['classes'] as Record<string, unknown>[];
      return classes[0]?.['lms_linkage'];
    };

    beforeEach(() => {
      classRepo.findAllActiveForEducator.mockResolvedValue([makeClass({ school_id: 'school-1' })]);
    });

    afterEach(() => {
      dataSource.query.mockReset();
      classRepo.findAllActiveForEducator.mockReset();
    });

    it('INTEGRATION: reports the linked course on each class', async () => {
      dataSource.query.mockImplementation(async (sql: string) =>
        sql.includes('lms_class_mapping')
          ? [
              {
                class_id: makeClass().id,
                lms_course_id: 'course-9',
                lms_type: 'canvas',
                google_course_id: null,
                google_course_name: null,
              },
            ]
          : [],
      );

      const res = await request(httpServer())
        .get('/api/classes/user')
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);

      expect(linkageOf(res)).toEqual({
        provider: 'canvas',
        courseId: 'course-9',
        courseName: null,
      });
    });

    it('INTEGRATION: reports a null linkage for a manual class', async () => {
      dataSource.query.mockResolvedValue([]);

      const res = await request(httpServer())
        .get('/api/classes/user')
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);

      expect(linkageOf(res)).toBeNull();
    });

    it('INTEGRATION: keeps the field present as null when the linkage query fails', async () => {
      dataSource.query.mockRejectedValue(new Error('relation does not exist'));

      const res = await request(httpServer())
        .get('/api/classes/user')
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);

      const classes = asRecord(parseBody(res).data)['classes'] as Record<string, unknown>[];
      expect(classes[0]).toHaveProperty('lms_linkage');
      expect(classes[0]?.['lms_linkage']).toBeNull();
    });
  });

  describe('GET /api/classes/user/attention-summary', () => {
    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      return request(httpServer()).get('/api/classes/user/attention-summary').expect(401);
    });

    it('INTEGRATION: returns per-signal counts for the educator', async () => {
      classRepo.countActiveForEducator.mockResolvedValue(12);
      classRepo.countActiveNeedingAttentionForEducator.mockResolvedValue(2);
      simulationReportRepo.getAttentionCountsByEducator.mockResolvedValue([
        { class_id: CLASS_ID, report_count: '3', unread_count: '2' },
      ]);
      classRepo.countActiveWithNoStudentsForEducator.mockResolvedValue(1);
      classRepo.countActiveWithNoAssignedSimsForEducator.mockResolvedValue(0);

      return request(httpServer())
        .get('/api/classes/user/attention-summary')
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200)
        .expect((res) => {
          const body = parseBody(res);
          expect(body.data).toEqual({
            totalClasses: 12,
            classesNeedingAttention: 2,
            unreadReports: 1,
            noStudents: 1,
            noAssignedSims: 0,
          });
        });
    });

    it('INTEGRATION: threads school_id through to the underlying signal queries', async () => {
      classRepo.countActiveForEducator.mockResolvedValue(0);
      simulationReportRepo.getAttentionCountsByEducator.mockResolvedValue([]);
      classRepo.countActiveWithNoStudentsForEducator.mockResolvedValue(0);
      classRepo.countActiveWithNoAssignedSimsForEducator.mockResolvedValue(0);
      const schoolId = '550e8400-e29b-41d4-a716-446655440500';

      await request(httpServer())
        .get(`/api/classes/user/attention-summary?school_id=${schoolId}`)
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);

      expect(classRepo.countActiveForEducator).toHaveBeenCalledWith(expect.any(String), schoolId);
      expect(simulationReportRepo.getAttentionCountsByEducator).toHaveBeenCalledWith(
        expect.any(String),
        schoolId,
      );
      expect(classRepo.countActiveWithNoStudentsForEducator).toHaveBeenCalledWith(
        expect.any(String),
        schoolId,
      );
      expect(classRepo.countActiveWithNoAssignedSimsForEducator).toHaveBeenCalledWith(
        expect.any(String),
        schoolId,
      );
    });

    it('INTEGRATION: returns 400 (not a raw DB error) when school_id is not a UUID', async () => {
      await request(httpServer())
        .get('/api/classes/user/attention-summary')
        .query({ school_id: 'not-a-uuid' })
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(400);

      expect(classRepo.countActiveWithNoStudentsForEducator).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/classes/user/simulations-completed-graph (compareBy)', () => {
    const graphUrl = '/api/classes/user/simulations-completed-graph';
    const uuid = (n: number): string => `550e8400-e29b-41d4-a716-${String(n).padStart(12, '0')}`;
    const classIds = (count: number): string[] =>
      Array.from({ length: count }, (_, index) => uuid(index + 1));
    const series = [
      {
        year: 2026,
        month: 8,
        total: 3,
        series: [
          { seriesId: uuid(1), seriesName: 'Sec A', count: 2 },
          { seriesId: uuid(2), seriesName: 'Sec B', count: 1 },
        ],
      },
    ];

    beforeEach(() => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
      jest.setSystemTime(new Date('2026-08-15T00:00:00.000Z'));
      simulationReportRepo.getSimulationsCompletedGraph.mockResolvedValue({
        byMonth: [{ year: 2026, month: 8, count: 3 }],
        byMonthSeries: series,
        bySchool: [],
      });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      await request(httpServer()).get(graphUrl).expect(401);
    });

    it('INTEGRATION: returns 403 for a District Admin', async () => {
      await request(httpServer())
        .get(graphUrl)
        .query({ compareBy: 'class', classIds: classIds(2) })
        .set('Authorization', `Bearer ${signToken(TEST_USERS.districtAdmin)}`)
        .expect(403);

      expect(simulationReportRepo.getSimulationsCompletedGraph).not.toHaveBeenCalled();
    });

    it('INTEGRATION: returns byMonthSeries next to byMonth and threads compareBy to the repository', async () => {
      const ids = classIds(2);

      const res = await request(httpServer())
        .get(graphUrl)
        .query({ compareBy: 'class', classIds: ids })
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);

      const data = asRecord(parseBody(res).data);
      expect(data.byMonthSeries).toEqual(series);
      expect(data.byMonth).toEqual([{ year: 2026, month: 8, count: 3 }]);
      expect(simulationReportRepo.getSimulationsCompletedGraph).toHaveBeenCalledWith(
        TEST_USERS.educator.educatorId,
        expect.objectContaining({ compareBy: 'class', classIds: ids }),
      );
    });

    it('INTEGRATION: maps months to the since window for Compare', async () => {
      await request(httpServer())
        .get(graphUrl)
        .query({ compareBy: 'class', classIds: classIds(2), months: 6 })
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);

      expect(simulationReportRepo.getSimulationsCompletedGraph).toHaveBeenCalledWith(
        TEST_USERS.educator.educatorId,
        expect.objectContaining({ since: new Date('2026-03-01T00:00:00.000Z') }),
      );
    });

    it('INTEGRATION: maps allTime to no since window for Compare', async () => {
      await request(httpServer())
        .get(graphUrl)
        .query({ compareBy: 'student', studentIds: [uuid(1)], allTime: true })
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);

      expect(simulationReportRepo.getSimulationsCompletedGraph).toHaveBeenCalledWith(
        TEST_USERS.educator.educatorId,
        expect.objectContaining({ compareBy: 'student', since: null }),
      );
    });

    it('INTEGRATION: compareBy without its matching list is a 200 default response with no byMonthSeries key', async () => {
      simulationReportRepo.getSimulationsCompletedGraph.mockResolvedValueOnce({
        byMonth: [{ year: 2026, month: 8, count: 3 }],
        bySchool: [{ schoolId: uuid(9), count: 3 }],
      });

      const res = await request(httpServer())
        .get(graphUrl)
        .query({ compareBy: 'school' })
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);

      const data = asRecord(parseBody(res).data);
      expect(Object.keys(data)).not.toContain('byMonthSeries');
      expect(data.byMonth).toEqual([{ year: 2026, month: 8, count: 3 }]);
      expect(data.bySchool).toEqual([{ schoolId: uuid(9), count: 3 }]);
      expect(simulationReportRepo.getSimulationsCompletedGraph).toHaveBeenCalledWith(
        TEST_USERS.educator.educatorId,
        expect.objectContaining({ compareBy: 'school', schoolIds: undefined }),
      );
    });

    it('INTEGRATION: compareBy=class with only studentIds is a 200 default response, both filters forwarded', async () => {
      simulationReportRepo.getSimulationsCompletedGraph.mockResolvedValueOnce({
        byMonth: [{ year: 2026, month: 8, count: 1 }],
        bySchool: [],
      });

      const res = await request(httpServer())
        .get(graphUrl)
        .query({ compareBy: 'class', studentIds: [uuid(5)] })
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);

      expect(Object.keys(asRecord(parseBody(res).data))).not.toContain('byMonthSeries');
      expect(simulationReportRepo.getSimulationsCompletedGraph).toHaveBeenCalledWith(
        TEST_USERS.educator.educatorId,
        expect.objectContaining({
          compareBy: 'class',
          studentIds: [uuid(5)],
          classIds: undefined,
        }),
      );
    });

    it('INTEGRATION: compareBy=class with classIds and studentIds forwards both and returns byMonthSeries', async () => {
      const res = await request(httpServer())
        .get(graphUrl)
        .query({ compareBy: 'class', classIds: [uuid(1), uuid(2)], studentIds: [uuid(5)] })
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);

      expect(asRecord(parseBody(res).data).byMonthSeries).toEqual(series);
      expect(simulationReportRepo.getSimulationsCompletedGraph).toHaveBeenCalledWith(
        TEST_USERS.educator.educatorId,
        expect.objectContaining({
          compareBy: 'class',
          classIds: [uuid(1), uuid(2)],
          studentIds: [uuid(5)],
        }),
      );
    });

    it('INTEGRATION: accepts exactly 15 ids in the list matching compareBy', async () => {
      await request(httpServer())
        .get(graphUrl)
        .query({ compareBy: 'class', classIds: classIds(15) })
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);
    });

    it.each([
      ['an invalid compareBy value', { compareBy: 'teacher', classIds: classIds(2) }],
      ['compareBy together with forSchool', { compareBy: 'school', forSchool: uuid(1) }],
      ['compareBy together with forClass', { compareBy: 'class', forClass: uuid(1) }],
      [
        'more than 15 ids in the list matching compareBy',
        { compareBy: 'class', classIds: classIds(16) },
      ],
    ])('INTEGRATION: returns 400 for %s', async (_label, query) => {
      await request(httpServer())
        .get(graphUrl)
        .query(query)
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(400);

      expect(simulationReportRepo.getSimulationsCompletedGraph).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/classes/user/activity-overview', () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      return request(httpServer()).get('/api/classes/user/activity-overview').expect(401);
    });

    it('INTEGRATION: returns the new-module {message, data, meta, error} envelope, not the legacy {status} shape', async () => {
      classRepo.getActivityOverviewCounts.mockResolvedValue({
        activeClasses: 1,
        classesWithUnreadReports: 0,
        totalUnreadReports: 0,
        classesClosingSoon: 0,
        studentsInActiveClasses: 0,
        classesWithStudentsNearAvatarLimit: 0,
      });

      const res = await request(httpServer())
        .get('/api/classes/user/activity-overview')
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);

      const body = parseBody(res);
      expect(body).toHaveProperty('message');
      expect(body).toHaveProperty('data');
      expect(body).toHaveProperty('meta');
      expect(body).toHaveProperty('error');
      expect(body).not.toHaveProperty('status');
    });

    it('INTEGRATION: returns 400 (not a raw DB error) when school_id is not a UUID', async () => {
      await request(httpServer())
        .get('/api/classes/user/activity-overview')
        .query({ school_id: '1' })
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(400);

      expect(classRepo.getActivityOverviewCounts).not.toHaveBeenCalled();
    });

    it('INTEGRATION: returns 200 with all counts for educator', async () => {
      classRepo.getActivityOverviewCounts.mockResolvedValue({
        activeClasses: 4,
        classesWithUnreadReports: 1,
        totalUnreadReports: 3,
        classesClosingSoon: 2,
        studentsInActiveClasses: 42,
        classesWithStudentsNearAvatarLimit: 1,
      });

      return request(httpServer())
        .get('/api/classes/user/activity-overview')
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200)
        .expect((res) => {
          const body = parseBody(res);
          const data = asRecord(body.data);
          expect(body.message).toBeDefined();
          expect(data.activeClasses).toBe(4);
          expect(data.classesWithUnreadReports).toBe(1);
          expect(data.totalUnreadReports).toBe(3);
          expect(data.classesClosingSoon).toBe(2);
          expect(data.studentsInActiveClasses).toBe(42);
          expect(data.classesWithStudentsNearAvatarLimit).toBe(1);
        });
    });

    it('INTEGRATION: applies school_id filter when provided, via one repository call', async () => {
      classRepo.getActivityOverviewCounts.mockResolvedValue({
        activeClasses: 0,
        classesWithUnreadReports: 0,
        totalUnreadReports: 0,
        classesClosingSoon: 0,
        studentsInActiveClasses: 0,
        classesWithStudentsNearAvatarLimit: 0,
      });

      await request(httpServer())
        .get('/api/classes/user/activity-overview')
        .query({ school_id: '550e8400-e29b-41d4-a716-446655440500' })
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);

      expect(classRepo.getActivityOverviewCounts).toHaveBeenCalledWith(
        TEST_USERS.educator.educatorId,
        '2026-01-01',
        '2026-01-15',
        2400,
        '550e8400-e29b-41d4-a716-446655440500',
      );
      expect(classRepo.getActivityOverviewCounts).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /api/classes/:id/export-student-codes', () => {
    const exportUrl = `/api/classes/${CLASS_ID}/export-student-codes`;
    const exportClass = {
      id: CLASS_ID,
      class_name: 'Biology 101',
      start_date: '2026-09-01',
      end_date: '2026-12-15',
      school: { school_name: 'Lincoln High School' },
    };
    async function* batches(...b: { id: string; studentId: string; name: string | null }[][]) {
      for (const batch of b) yield batch;
    }

    it('INTEGRATION: returns 401 when no JWT provided', () => {
      return request(httpServer()).get(exportUrl).expect(401);
    });

    it('INTEGRATION: returns 400 for a non-UUID class id', () => {
      return request(httpServer())
        .get('/api/classes/not-a-uuid/export-student-codes')
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(400);
    });

    it('INTEGRATION: returns a JSON 404 when the class is not accessible to the educator', () => {
      classRepo.findActiveByIdWithSchoolForEducator.mockResolvedValue(null);
      return request(httpServer())
        .get(exportUrl)
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(404)
        .expect('Content-Type', /application\/json/)
        .expect(() => expect(studentRepo.iterateStudentCodesByClass).not.toHaveBeenCalled());
    });

    it('INTEGRATION: returns 400 for an unsupported format', () => {
      return request(httpServer())
        .get(exportUrl)
        .query({ format: 'xml' })
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(400)
        .expect(() => expect(studentRepo.iterateStudentCodesByClass).not.toHaveBeenCalled());
    });

    it('INTEGRATION: the old -csv path no longer exists', () => {
      return request(httpServer())
        .get(`/api/classes/${CLASS_ID}/export-student-codes-csv`)
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(404);
    });

    it('INTEGRATION: streams the CSV (default format) as a no-store attachment, not wrapped in the JSON envelope', () => {
      classRepo.findActiveByIdWithSchoolForEducator.mockResolvedValue(exportClass);
      studentRepo.iterateStudentCodesByClass.mockReturnValue(
        batches(
          [{ id: '1', studentId: 'BIO-4ZPT', name: null }],
          [{ id: '2', studentId: 'BIO-JW6C', name: 'Ava Thompson' }],
        ),
      );

      return request(httpServer())
        .get(exportUrl)
        .set('Authorization', `Bearer ${educatorToken}`)
        .buffer(true)
        .parse((res, cb) => {
          let data = '';
          res.setEncoding('utf8');
          res.on('data', (chunk: string) => (data += chunk));
          res.on('end', () => cb(null, data));
        })
        .expect(200)
        .expect('Content-Type', 'text/csv; charset=utf-8')
        .expect('Cache-Control', 'no-store')
        .expect(
          'Content-Disposition',
          `attachment; filename="student-codes-Biology_101.csv"; filename*=UTF-8''student-codes-Biology%20101.csv`,
        )
        .expect((res) => {
          expect(res.body).toBe(
            '\uFEFF' +
              [
                'Class Name,Biology 101',
                'School,Lincoln High School',
                'Start Date,2026-09-01',
                'End Date,2026-12-15',
                '',
                'Student Code,Student Name',
                'BIO-4ZPT,',
                'BIO-JW6C,Ava Thompson',
              ].join('\r\n') +
              '\r\n',
          );
          expect(studentRepo.iterateStudentCodesByClass).toHaveBeenCalledWith(
            TEST_USERS.educator.educatorId,
            CLASS_ID,
            ClassStudentCodesExportConstants.FORMATS.CSV.BATCH_SIZE,
          );
        });
    });

    it('INTEGRATION: format=pdf streams a PDF attachment', () => {
      classRepo.findActiveByIdWithSchoolForEducator.mockResolvedValue(exportClass);
      studentRepo.iterateStudentCodesByClass.mockReturnValue(
        batches([{ id: '1', studentId: 'BIO-4ZPT', name: 'Ava Thompson' }]),
      );

      return request(httpServer())
        .get(exportUrl)
        .query({ format: 'pdf' })
        .set('Authorization', `Bearer ${educatorToken}`)
        .buffer(true)
        .parse((res, cb) => {
          const parts: Buffer[] = [];
          res.on('data', (chunk: Buffer) => parts.push(chunk));
          res.on('end', () => cb(null, Buffer.concat(parts)));
        })
        .expect(200)
        .expect('Content-Type', 'application/pdf')
        .expect('Cache-Control', 'no-store')
        .expect(
          'Content-Disposition',
          `attachment; filename="student-codes-Biology_101.pdf"; filename*=UTF-8''student-codes-Biology%20101.pdf`,
        )
        .expect((res) => {
          const body = (res.body as Buffer).toString('latin1');
          expect(body.startsWith('%PDF-')).toBe(true);
          expect(body.trimEnd().endsWith('%%EOF')).toBe(true);
          expect(studentRepo.iterateStudentCodesByClass).toHaveBeenCalledWith(
            TEST_USERS.educator.educatorId,
            CLASS_ID,
            ClassStudentCodesExportConstants.FORMATS.PDF.BATCH_SIZE,
          );
        });
    });
  });

  describe('GET /api/classes/:id', () => {
    it('INTEGRATION: returns 200 when class found', async () => {
      classRepo.findActiveByIdWithEducatorAndStudentsForEducator.mockResolvedValue(makeClass());
      classSimulationService.findByClass.mockResolvedValue({ data: [] });

      return request(httpServer())
        .get(`/api/classes/${CLASS_ID}`)
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200)
        .expect((res) => {
          expectLegacySuccessBody(res);
          const body = parseBody(res);
          const data = asRecord(body.data);
          expect(data.id).toBe(CLASS_ID);
        });
    });

    it('INTEGRATION: students no longer carry an isEarlyCompletion flag', async () => {
      classRepo.findActiveByIdWithEducatorAndStudentsForEducator.mockResolvedValue(
        makeClass({
          students: [
            { id: 'stu-1', student_id: 'STD-1', is_active: true, time_remaining: '00:00:00' },
          ] as never,
        }),
      );

      const response = await request(httpServer())
        .get(`/api/classes/${CLASS_ID}`)
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);

      const [student] = asRecord(parseBody(response).data).students as Array<
        Record<string, unknown>
      >;
      expect(student).not.toHaveProperty('isEarlyCompletion');
      expect(student).toEqual(expect.objectContaining({ id: 'stu-1', student_id: 'STD-1' }));
      expect(simulationReportRepo.find).not.toHaveBeenCalled();
    });

    it('INTEGRATION: returns 404 when class not found', async () => {
      classRepo.findActiveByIdWithEducatorAndStudentsForEducator.mockResolvedValue(null);

      return request(httpServer())
        .get(`/api/classes/${MISSING_CLASS_ID}`)
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(404)
        .expect((res) => {
          expectErrorEnvelope(res);
        });
    });
  });

  describe('PUT /api/classes/:id', () => {
    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      return request(httpServer())
        .put(`/api/classes/${CLASS_ID}`)
        .send({ className: 'Updated' })
        .expect(401);
    });

    it('INTEGRATION: returns 403 when District Admin tries to update a class', async () => {
      const adminToken = signToken(TEST_USERS.districtAdmin);

      return request(httpServer())
        .put(`/api/classes/${CLASS_ID}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ className: 'Updated' })
        .expect(403);
    });

    it('INTEGRATION: returns 404 when the class is not owned/co-taught by the requester', async () => {
      classRepo.findActiveByIdWithSchoolForEducator.mockResolvedValue(null);

      return request(httpServer())
        .put(`/api/classes/${MISSING_CLASS_ID}`)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ className: 'Updated' })
        .expect(404);
    });

    it('INTEGRATION: returns 400 when start date is after end date', async () => {
      classRepo.findActiveByIdWithSchoolForEducator.mockResolvedValue(makeClass());

      return request(httpServer())
        .put(`/api/classes/${CLASS_ID}`)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ startDate: '2025-12-01', endDate: '2025-01-01' })
        .expect(400);
    });

    it('INTEGRATION: returns 400 when the new name already exists on another class', async () => {
      classRepo.findActiveByIdWithSchoolForEducator.mockResolvedValue(makeClass());
      classRepo.findActiveClassByName.mockResolvedValue(makeClass({ id: 'other-class' }));

      return request(httpServer())
        .put(`/api/classes/${CLASS_ID}`)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ className: 'Updated Biology' })
        .expect(400);
    });

    it('INTEGRATION: returns 400 for an invalid status value', async () => {
      classRepo.findActiveByIdWithSchoolForEducator.mockResolvedValue(makeClass());

      return request(httpServer())
        .put(`/api/classes/${CLASS_ID}`)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ status: 'NOT_A_STATUS' })
        .expect(400);
    });

    it('INTEGRATION: returns 200 with the new-module {message, data, meta, error} envelope when updated', async () => {
      const updated = makeClass({ class_name: 'Updated Biology' });
      classRepo.findActiveByIdWithSchoolForEducator.mockResolvedValue(makeClass());
      classRepo.findActiveClassByName.mockResolvedValue(null);
      classRepo.create.mockResolvedValue(updated);
      classRepo.findOne.mockResolvedValue(updated);

      return request(httpServer())
        .put(`/api/classes/${CLASS_ID}`)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ className: 'Updated Biology' })
        .expect(200)
        .expect((res) => {
          const body = res.body as {
            message?: string;
            data?: { className?: string };
            error?: unknown;
          };
          expect(body.error).toBeNull();
          expect(body.data?.className).toBe('Updated Biology');
        });
    });
  });

  describe('DELETE /api/classes/:id', () => {
    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      return request(httpServer()).delete(`/api/classes/${CLASS_ID}`).expect(401);
    });

    it('INTEGRATION: returns 403 when District Admin tries to delete a class', async () => {
      const adminToken = signToken(TEST_USERS.districtAdmin);

      return request(httpServer())
        .delete(`/api/classes/${CLASS_ID}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);
    });

    it('INTEGRATION: returns 404 when the class is not owned/co-taught by the requester', async () => {
      classRepo.findActiveByIdWithSchoolForEducator.mockResolvedValue(null);

      return request(httpServer())
        .delete(`/api/classes/${MISSING_CLASS_ID}`)
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(404);
    });

    it('INTEGRATION: returns 200 with the new-module {message, data, meta, error} envelope when deleted', async () => {
      classRepo.findActiveByIdWithSchoolForEducator.mockResolvedValue(makeClass());

      return request(httpServer())
        .delete(`/api/classes/${CLASS_ID}`)
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200)
        .expect((res) => {
          const body = res.body as { message?: string; data?: unknown; error?: unknown };
          expect(body).toHaveProperty('message');
          expect(body.data).toBeNull();
          expect(body.error).toBeNull();
        });
    });
  });

  // School-groups read model (GET /classes/schools, GET /classes) —
  // the findSchoolGroups/findClasses routes on this same ClassesController.
  describe('GET /api/classes/schools', () => {
    it('INTEGRATION: returns 401 when no JWT provided', () => {
      return request(httpServer()).get('/api/classes/schools').expect(401);
    });

    it('INTEGRATION: returns 200 with an empty group list', () => {
      classRepo.findSchoolGroupsForEducator.mockResolvedValue({ rows: [], total: 0 });
      return request(httpServer())
        .get('/api/classes/schools')
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200)
        .expect((res) => {
          const body = res.body as { data?: unknown; meta?: { total: number } };
          expect(body.data).toEqual([]);
          expect(body.meta?.total).toBe(0);
        });
    });

    it('INTEGRATION: maps a school group and the unassigned bucket', () => {
      classRepo.findSchoolGroupsForEducator.mockResolvedValue({
        rows: [
          { schoolId: 'school-1', schoolName: 'Lincoln High', classCount: 2 },
          { schoolId: null, schoolName: null, classCount: 1 },
        ],
        total: 2,
      });
      return request(httpServer())
        .get('/api/classes/schools')
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200)
        .expect((res) => {
          const body = res.body as { data: Array<{ schoolId: string | null; schoolName: string }> };
          expect(body.data).toHaveLength(2);
          expect(body.data[0]).toMatchObject({ schoolId: 'school-1', schoolName: 'Lincoln High' });
          expect(body.data[1].schoolId).toBeNull();
        });
    });

    it('INTEGRATION: returns 400 for an invalid schoolId value', () => {
      return request(httpServer())
        .get('/api/classes/schools')
        .query({ schoolId: 'not-a-uuid' })
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(400);
    });

    it('INTEGRATION: passes schoolName and className query params through to the repository', async () => {
      classRepo.findSchoolGroupsForEducator.mockResolvedValue({ rows: [], total: 0 });
      await request(httpServer())
        .get('/api/classes/schools')
        .query({ schoolName: 'Cedar Hollow', className: 'Nursing' })
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);

      expect(classRepo.findSchoolGroupsForEducator).toHaveBeenCalledWith(
        TEST_USERS.educator.educatorId,
        expect.objectContaining({ schoolName: 'Cedar Hollow', className: 'Nursing' }),
        expect.any(Object),
      );
    });

    it('INTEGRATION: passes the classId query param through to the repository as classIds', async () => {
      classRepo.findSchoolGroupsForEducator.mockResolvedValue({ rows: [], total: 0 });
      const classId = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
      await request(httpServer())
        .get('/api/classes/schools')
        .query({ classId: [classId] })
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);

      expect(classRepo.findSchoolGroupsForEducator).toHaveBeenCalledWith(
        TEST_USERS.educator.educatorId,
        expect.objectContaining({ classIds: [classId] }),
        expect.any(Object),
      );
    });

    it('INTEGRATION: returns 400 for an invalid classId value', () => {
      return request(httpServer())
        .get('/api/classes/schools')
        .query({ classId: 'not-a-uuid' })
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(400);
    });

    it('INTEGRATION: passes class status and start/end date query params through to the repository', async () => {
      classRepo.findSchoolGroupsForEducator.mockResolvedValue({ rows: [], total: 0 });
      await request(httpServer())
        .get('/api/classes/schools')
        .query({
          classStatus: [CommonStatus.ACTIVE],
          classStartDateFrom: '2026-01-01',
          classEndDateTo: '2026-12-31',
        })
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);

      expect(classRepo.findSchoolGroupsForEducator).toHaveBeenCalledWith(
        TEST_USERS.educator.educatorId,
        expect.objectContaining({
          classStatuses: [CommonStatus.ACTIVE],
          classStartDateFrom: '2026-01-01',
          classEndDateTo: '2026-12-31',
        }),
        expect.any(Object),
      );
    });

    it('INTEGRATION: returns 400 for an inverted class date range', () => {
      return request(httpServer())
        .get('/api/classes/schools')
        .query({ classStartDateFrom: '2026-12-31', classEndDateTo: '2026-01-01' })
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(400);
    });

    it('INTEGRATION: returns 400 for an invalid classStatus value', () => {
      return request(httpServer())
        .get('/api/classes/schools')
        .query({ classStatus: 'NOT_A_STATUS' })
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(400);
    });

    it('INTEGRATION: returns 400 for a non-date classStartDateFrom value', () => {
      return request(httpServer())
        .get('/api/classes/schools')
        .query({ classStartDateFrom: 'not-a-date' })
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(400);
    });
  });

  describe('GET /api/classes', () => {
    it('INTEGRATION: returns 401 when no JWT provided', () => {
      return request(httpServer()).get('/api/classes').expect(401);
    });

    it('INTEGRATION: returns 400 for an invalid schoolIds value', () => {
      return request(httpServer())
        .get('/api/classes')
        .query({ schoolIds: 'not-a-uuid' })
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(400);
    });

    it('INTEGRATION: returns the lean class shape when no schoolIds filter is provided', () => {
      classRepo.findClasses.mockResolvedValue({
        rows: [
          {
            id: 'class-1',
            className: 'Community Health',
            startDate: '2026-01-01',
            endDate: '2026-12-31',
            status: CommonStatus.ACTIVE,
            studentsCount: 5,
            simsCount: 1,
            reportsCount: 0,
            unreadReportsCount: 0,
          },
        ],
        total: 1,
      });
      return request(httpServer())
        .get('/api/classes')
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200)
        .expect((res) => {
          const body = res.body as { data: Array<Record<string, unknown>> };
          expect(body.data).toHaveLength(1);
          expect(body.data[0]).not.toHaveProperty('students');
          expect(body.data[0]).not.toHaveProperty('sims');
          expect(body.data[0].classId).toBe('class-1');
        });
    });

    it('INTEGRATION: returns classId, className, startDate, endDate and status when lite=true is passed', async () => {
      classRepo.findClasses.mockResolvedValue({
        rows: [
          {
            id: 'class-1',
            className: 'Community Health',
            startDate: '2025-01-01',
            endDate: '2025-06-01',
            status: CommonStatus.ACTIVE,
          },
        ],
        total: 1,
      });
      const res = await request(httpServer())
        .get('/api/classes')
        .query({ lite: 'true' })
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);

      const body = res.body as { data: Array<Record<string, unknown>> };
      expect(body.data).toEqual([
        {
          classId: 'class-1',
          className: 'Community Health',
          startDate: '2025-01-01',
          endDate: '2025-06-01',
          status: CommonStatus.ACTIVE,
        },
      ]);
      expect(classRepo.findClasses).toHaveBeenCalledWith(
        TEST_USERS.educator.educatorId,
        expect.objectContaining({ lite: true }),
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('INTEGRATION: returns 400 for a non-boolean lite value', () => {
      return request(httpServer())
        .get('/api/classes')
        .query({ lite: 'not-a-boolean' })
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(400);
    });

    it('INTEGRATION: passes the unassigned sentinel and school UUIDs through as schoolIds/includeUnassigned', async () => {
      classRepo.findClasses.mockResolvedValue({ rows: [], total: 0 });
      const schoolId = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
      await request(httpServer())
        .get('/api/classes')
        .query({ schoolIds: [schoolId, 'unassigned'] })
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);

      expect(classRepo.findClasses).toHaveBeenCalledWith(
        TEST_USERS.educator.educatorId,
        expect.objectContaining({ schoolIds: [schoolId], includeUnassigned: true }),
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('INTEGRATION: returns 400 for an inverted date range', () => {
      return request(httpServer())
        .get('/api/classes')
        .query({ startDateFrom: '2026-12-31', endDateTo: '2026-01-01' })
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(400);
    });

    it('INTEGRATION: passes search/status/sort query params through to the repository', async () => {
      classRepo.findClasses.mockResolvedValue({ rows: [], total: 0 });
      await request(httpServer())
        .get('/api/classes')
        .query({
          search: 'onco',
          status: CommonStatus.ACTIVE,
          sortBy: 'class_name',
          sortDir: 'desc',
        })
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);

      expect(classRepo.findClasses).toHaveBeenCalledWith(
        TEST_USERS.educator.educatorId,
        expect.objectContaining({ search: 'onco', statuses: [CommonStatus.ACTIVE] }),
        { field: 'class_name', dir: 'DESC' },
        expect.any(Object),
      );
    });

    it('INTEGRATION: returns 200 (not 500) for an invalid sortDir when sortBy is omitted', async () => {
      classRepo.findClasses.mockResolvedValue({ rows: [], total: 0 });
      await request(httpServer())
        .get('/api/classes')
        .query({ sortDir: 'garbage' })
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);

      expect(classRepo.findClasses).toHaveBeenCalledWith(
        TEST_USERS.educator.educatorId,
        expect.any(Object),
        { field: undefined, dir: 'ASC' },
        expect.any(Object),
      );
    });
  });

  describe('GET /api/classes/user/simulations-completed-graph', () => {
    it('INTEGRATION: returns 401 when no JWT provided', () => {
      return request(httpServer()).get('/api/classes/user/simulations-completed-graph').expect(401);
    });

    it('INTEGRATION: returns 403 when District Admin calls it', () => {
      const adminToken = signToken(TEST_USERS.districtAdmin);
      return request(httpServer())
        .get('/api/classes/user/simulations-completed-graph')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);
    });

    it('INTEGRATION: returns 400 for a months value outside the fixed presets', () => {
      return request(httpServer())
        .get('/api/classes/user/simulations-completed-graph')
        .query({ months: 4 })
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(400);
    });

    it('INTEGRATION: returns 400 for an invalid studentIds value', () => {
      return request(httpServer())
        .get('/api/classes/user/simulations-completed-graph')
        .query({ studentIds: 'not-a-uuid' })
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(400);
    });

    it('INTEGRATION: returns an empty byMonth/bySchool result when nothing matches', () => {
      simulationReportRepo.getSimulationsCompletedGraph.mockResolvedValue({
        byMonth: [],
        bySchool: [],
      });
      return request(httpServer())
        .get('/api/classes/user/simulations-completed-graph')
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200)
        .expect((res) => {
          const body = res.body as { data: { byMonth: unknown[]; bySchool: unknown[] } };
          expect(body.data.byMonth).toEqual([]);
          expect(body.data.bySchool).toEqual([]);
        });
    });

    it('INTEGRATION: maps byMonth/bySchool rows from the repository', () => {
      simulationReportRepo.getSimulationsCompletedGraph.mockResolvedValue({
        byMonth: [{ year: 2026, month: 3, count: 5 }],
        bySchool: [{ schoolId: 'school-1', count: 3 }],
      });
      return request(httpServer())
        .get('/api/classes/user/simulations-completed-graph')
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200)
        .expect((res) => {
          const body = res.body as {
            data: {
              byMonth: Array<{ year: number; month: number; count: number }>;
              bySchool: Array<{ schoolId: string | null; count: number }>;
            };
          };
          expect(body.data.byMonth).toEqual([{ year: 2026, month: 3, count: 5 }]);
          expect(body.data.bySchool).toEqual([{ schoolId: 'school-1', count: 3 }]);
        });
    });

    it('INTEGRATION: passes studentIds/classIds/schoolIds filters through to the repository, defaulting timeframe to 3 months', async () => {
      simulationReportRepo.getSimulationsCompletedGraph.mockResolvedValue({
        byMonth: [],
        bySchool: [],
      });
      const studentId = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
      const classId = '3fa85f64-5717-4562-b3fc-2c963f66afa7';
      const schoolId = '3fa85f64-5717-4562-b3fc-2c963f66afa8';

      await request(httpServer())
        .get('/api/classes/user/simulations-completed-graph')
        .query({ studentIds: [studentId], classIds: [classId], schoolIds: [schoolId] })
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);

      expect(simulationReportRepo.getSimulationsCompletedGraph).toHaveBeenCalledWith(
        TEST_USERS.educator.educatorId,
        expect.objectContaining({
          studentIds: [studentId],
          classIds: [classId],
          schoolIds: [schoolId],
          since: expect.any(Date),
        }),
      );
    });

    it('INTEGRATION: allTime=true passes since=null, ignoring months', async () => {
      simulationReportRepo.getSimulationsCompletedGraph.mockResolvedValue({
        byMonth: [],
        bySchool: [],
      });

      await request(httpServer())
        .get('/api/classes/user/simulations-completed-graph')
        .query({ allTime: 'true', months: 12 })
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);

      expect(simulationReportRepo.getSimulationsCompletedGraph).toHaveBeenCalledWith(
        TEST_USERS.educator.educatorId,
        expect.objectContaining({ since: null }),
      );
    });

    describe('forSchool drill-down', () => {
      const schoolId = '3fa85f64-5717-4562-b3fc-2c963f66afa8';

      it('INTEGRATION: returns 400 when forSchool is not a UUID', () => {
        return request(httpServer())
          .get('/api/classes/user/simulations-completed-graph')
          .query({ forSchool: 'not-a-uuid' })
          .set('Authorization', `Bearer ${educatorToken}`)
          .expect(400);
      });

      it('INTEGRATION: returns 400 when forSchool and forClass are both set', () => {
        return request(httpServer())
          .get('/api/classes/user/simulations-completed-graph')
          .query({ forSchool: schoolId, forClass: schoolId })
          .set('Authorization', `Bearer ${educatorToken}`)
          .expect(400);
      });

      it.each(['schoolIds', 'classIds', 'studentIds'])(
        'INTEGRATION: returns 400 when forSchool is combined with %s',
        (pluralFilter) => {
          return request(httpServer())
            .get('/api/classes/user/simulations-completed-graph')
            .query({ forSchool: schoolId, [pluralFilter]: [schoolId] })
            .set('Authorization', `Bearer ${educatorToken}`)
            .expect(400);
        },
      );

      it('INTEGRATION: returns byMonth + byClass only, omitting bySchool and byStudent', async () => {
        simulationReportRepo.getSimulationsCompletedGraph.mockResolvedValue({
          byMonth: [{ year: 2026, month: 3, count: 5 }],
          byClass: [{ classId: 'class-1', className: 'Period 3', count: 5 }],
        });

        await request(httpServer())
          .get('/api/classes/user/simulations-completed-graph')
          .query({ forSchool: schoolId })
          .set('Authorization', `Bearer ${educatorToken}`)
          .expect(200)
          .expect((res) => {
            const body = res.body as { data: Record<string, unknown> };
            expect(body.data.byMonth).toEqual([{ year: 2026, month: 3, count: 5 }]);
            expect(body.data.byClass).toEqual([
              { classId: 'class-1', className: 'Period 3', count: 5 },
            ]);
            expect(body.data.bySchool).toBeUndefined();
            expect(Object.prototype.hasOwnProperty.call(body.data, 'bySchool')).toBe(false);
            expect(Object.prototype.hasOwnProperty.call(body.data, 'byStudent')).toBe(false);
          });
      });

      it('INTEGRATION: passes forSchool through to the repository', async () => {
        simulationReportRepo.getSimulationsCompletedGraph.mockResolvedValue({
          byMonth: [],
          byClass: [],
        });

        await request(httpServer())
          .get('/api/classes/user/simulations-completed-graph')
          .query({ forSchool: schoolId })
          .set('Authorization', `Bearer ${educatorToken}`)
          .expect(200);

        expect(simulationReportRepo.getSimulationsCompletedGraph).toHaveBeenCalledWith(
          TEST_USERS.educator.educatorId,
          expect.objectContaining({ forSchool: schoolId }),
        );
      });

      it('INTEGRATION: returns 403 when District Admin calls it with forSchool', () => {
        const adminToken = signToken(TEST_USERS.districtAdmin);
        return request(httpServer())
          .get('/api/classes/user/simulations-completed-graph')
          .query({ forSchool: schoolId })
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(403);
      });
    });

    describe('forClass drill-down', () => {
      const classId = '3fa85f64-5717-4562-b3fc-2c963f66afa7';

      it('INTEGRATION: returns 400 when forClass is not a UUID', () => {
        return request(httpServer())
          .get('/api/classes/user/simulations-completed-graph')
          .query({ forClass: 'not-a-uuid' })
          .set('Authorization', `Bearer ${educatorToken}`)
          .expect(400);
      });

      it('INTEGRATION: returns 400 when forClass and forSchool are both set', () => {
        return request(httpServer())
          .get('/api/classes/user/simulations-completed-graph')
          .query({ forClass: classId, forSchool: classId })
          .set('Authorization', `Bearer ${educatorToken}`)
          .expect(400);
      });

      it.each(['schoolIds', 'classIds', 'studentIds'])(
        'INTEGRATION: returns 400 when forClass is combined with %s',
        (pluralFilter) => {
          return request(httpServer())
            .get('/api/classes/user/simulations-completed-graph')
            .query({ forClass: classId, [pluralFilter]: [classId] })
            .set('Authorization', `Bearer ${educatorToken}`)
            .expect(400);
        },
      );

      it('INTEGRATION: returns byMonth + byStudent only, omitting bySchool and byClass', async () => {
        simulationReportRepo.getSimulationsCompletedGraph.mockResolvedValue({
          byMonth: [{ year: 2026, month: 3, count: 4 }],
          byStudent: [{ studentId: 'student-1', studentCode: 'ABC-1234', count: 4 }],
        });

        await request(httpServer())
          .get('/api/classes/user/simulations-completed-graph')
          .query({ forClass: classId })
          .set('Authorization', `Bearer ${educatorToken}`)
          .expect(200)
          .expect((res) => {
            const body = res.body as { data: Record<string, unknown> };
            expect(body.data.byMonth).toEqual([{ year: 2026, month: 3, count: 4 }]);
            expect(body.data.byStudent).toEqual([
              { studentId: 'student-1', studentCode: 'ABC-1234', count: 4 },
            ]);
            expect(Object.prototype.hasOwnProperty.call(body.data, 'bySchool')).toBe(false);
            expect(Object.prototype.hasOwnProperty.call(body.data, 'byClass')).toBe(false);
          });
      });

      it('INTEGRATION: passes forClass through to the repository', async () => {
        simulationReportRepo.getSimulationsCompletedGraph.mockResolvedValue({
          byMonth: [],
          byStudent: [],
        });

        await request(httpServer())
          .get('/api/classes/user/simulations-completed-graph')
          .query({ forClass: classId })
          .set('Authorization', `Bearer ${educatorToken}`)
          .expect(200);

        expect(simulationReportRepo.getSimulationsCompletedGraph).toHaveBeenCalledWith(
          TEST_USERS.educator.educatorId,
          expect.objectContaining({ forClass: classId }),
        );
      });

      it('INTEGRATION: returns 403 when District Admin calls it with forClass', () => {
        const adminToken = signToken(TEST_USERS.districtAdmin);
        return request(httpServer())
          .get('/api/classes/user/simulations-completed-graph')
          .query({ forClass: classId })
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(403);
      });
    });
  });

  describe('GET /api/classes/:id/lms-linkage', () => {
    const CLASS_ID = '550e8400-e29b-41d4-a716-446655440401';
    const route = `/api/classes/${CLASS_ID}/lms-linkage`;
    const UNLINKED = { provider: null, course: null, assignments: [] };

    beforeEach(() => {
      classRepo.findActiveByIdWithSchoolForEducator.mockResolvedValue(
        makeClass({ school_id: 'school-1' }),
      );
      educatorSchoolRepo.findOne.mockResolvedValue({ id: 'assignment-1' });
      lmsClassMappingRepo.findOne.mockResolvedValue(null);
      lmsConfigService.getOptionalBySchoolId.mockResolvedValue(null);
      lmsAssignmentService.findByClass.mockResolvedValue([]);
      entityManager.findOne.mockResolvedValue(null);
      entityManager.find.mockResolvedValue([]);
    });

    it('INTEGRATION: returns 401 when no JWT provided', () => {
      return request(httpServer()).get(route).expect(401);
    });

    it('INTEGRATION: returns 403 when District Admin calls it', () => {
      const adminToken = signToken(TEST_USERS.districtAdmin);
      return request(httpServer())
        .get(route)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);
    });

    it('INTEGRATION: returns 400 when the class id is not a uuid', () => {
      return request(httpServer())
        .get('/api/classes/not-a-uuid/lms-linkage')
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(400);
    });

    it('INTEGRATION: returns an unlinked payload, not 403, for a class the educator cannot access', async () => {
      classRepo.findActiveByIdWithSchoolForEducator.mockResolvedValue(null);

      const res = await request(httpServer())
        .get(route)
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);

      expect(parseBody(res).data).toEqual(UNLINKED);
      expect(lmsClassMappingRepo.findOne).not.toHaveBeenCalled();
    });

    it('INTEGRATION: returns an unlinked payload when the educator left the class school', async () => {
      educatorSchoolRepo.findOne.mockResolvedValue(null);

      const res = await request(httpServer())
        .get(route)
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);

      expect(parseBody(res).data).toEqual(UNLINKED);
    });

    it('INTEGRATION: returns an unlinked payload for a manual class with no mapping rows', async () => {
      const res = await request(httpServer())
        .get(route)
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);

      expect(parseBody(res).data).toEqual(UNLINKED);
    });

    it('INTEGRATION: returns the LTI course and its per-simulation assignments', async () => {
      lmsClassMappingRepo.findOne.mockResolvedValue({ classId: CLASS_ID, lmsCourseId: 'course-9' });
      lmsConfigService.getOptionalBySchoolId.mockResolvedValue({ lmsType: 'canvas' });
      lmsAssignmentService.findByClass.mockResolvedValue([
        { simulationId: 'sim-1', lmsLineItemLabel: 'Chest Pain' },
        { simulationId: null, lmsLineItemLabel: 'Course total' },
        { simulationId: 'sim-2', lmsLineItemLabel: null },
      ]);

      const res = await request(httpServer())
        .get(route)
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);

      expect(parseBody(res).data).toEqual({
        provider: 'canvas',
        course: { id: 'course-9', name: null, url: null },
        assignments: [
          { simulationId: 'sim-1', label: 'Chest Pain', url: null },
          { simulationId: 'sim-2', label: null, url: null },
        ],
      });
    });

    it('INTEGRATION: falls back to a generic provider when the school has no LMS config', async () => {
      lmsClassMappingRepo.findOne.mockResolvedValue({ classId: CLASS_ID, lmsCourseId: 'course-9' });

      const res = await request(httpServer())
        .get(route)
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);

      expect(asRecord(parseBody(res).data)['provider']).toBe('lms');
    });

    it('INTEGRATION: returns the Google Classroom course and its coursework links', async () => {
      entityManager.findOne.mockImplementation(async (entity: unknown) =>
        entity === GoogleCourseMapping
          ? {
              classId: CLASS_ID,
              googleCourseId: 'gc-1',
              googleCourseName: 'Nursing 101',
            }
          : null,
      );
      entityManager.find.mockImplementation(async (entity: unknown) =>
        entity === GoogleCourseworkMapping
          ? [
              {
                simulationId: 'sim-1',
                title: 'Chest Pain',
                alternateLink: 'https://classroom.google.com/c/gc-1/a/cw-1',
              },
            ]
          : [],
      );

      const res = await request(httpServer())
        .get(route)
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);

      expect(parseBody(res).data).toEqual({
        provider: 'google_classroom',
        course: { id: 'gc-1', name: 'Nursing 101', url: null },
        assignments: [
          {
            simulationId: 'sim-1',
            label: 'Chest Pain',
            url: 'https://classroom.google.com/c/gc-1/a/cw-1',
          },
        ],
      });
    });
  });
});
