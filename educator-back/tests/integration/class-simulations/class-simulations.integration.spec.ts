import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ClassSimulationController } from '../../../src/class-simulations/class-simulation.controller';
import { ClassSimulationService } from '../../../src/class-simulations/class-simulation.service';

import { EducatorsService } from '../../../src/educators/educators.service';

import { AzureBlobService } from '../../../src/common/services';
import { MailService } from '../../../src/mail/mail.service';
import { NotificationsGateway } from '../../../src/notifications/notifications.gateway';
import { GoogleCourseworkService } from '../../../src/google/google-coursework.service';
import { buildTestApp, TEST_USERS } from '../setup/test-app.factory';
import { expectErrorEnvelope, expectLegacySuccessBody } from '../setup/error-envelope.util';
import { ClassSimulation, Class } from 'src/database/entities';
import { CommonStatus } from 'src/common/enums/status.enum';
import {
  CLASS_REPOSITORY,
  CLASS_SIMULATION_REPOSITORY,
  EDUCATOR_REPOSITORY,
  EDUCATOR_SCHOOL_REPOSITORY,
  SIMULATION_V2_REPOSITORY,
  SIMULATION_REPORT_REPOSITORY,
  STUDENT_REPOSITORY,
  UNIT_REPOSITORY,
} from 'src/database/tokens';
import { DatabaseService } from 'src/database/services/database.service';
import { ClassSimulationSortField } from 'src/common/constants';

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
  let districtAdminToken: string;

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
  const csRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(mockQb),
    manager: { count: jest.fn().mockResolvedValue(0) },
    deactivateIfActive: jest.fn().mockResolvedValue({ affected: 1 }),
    updateDatesIfActive: jest.fn().mockResolvedValue({ affected: 1 }),
    findForClassListing: jest.fn(),
  };
  const classRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    findActiveByIdWithSchoolForEducator: jest.fn(),
  };
  const educatorSchoolRepo = { findOne: jest.fn() };
  const simulationRepo = {
    findOne: jest.fn().mockResolvedValue({ id: SIM_ID }),
    findByBusinessId: jest
      .fn()
      .mockResolvedValue({ id: SIM_ID, unitId: 'u-1', title: 'Stroke Eval' }),
    find: jest.fn().mockResolvedValue([{ id: SIM_ID, unitId: 'u-1', title: 'Stroke Eval' }]),
    save: jest.fn(),
    manager: { query: jest.fn().mockResolvedValue([{ '1': 1 }]) },
  };
  const studentRepo = { findOne: jest.fn(), find: jest.fn() };
  const unitRepo = {
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    findByBusinessId: jest.fn().mockResolvedValue(null),
  };
  const databaseService = {
    pingCheck: jest.fn(),
    connection: { query: jest.fn().mockResolvedValue([]) },
  };
  const educatorService = {
    availableTokens: jest.fn().mockResolvedValue(10),
    findById: jest
      .fn()
      .mockResolvedValue({ data: { id: TEST_USERS.educator.educatorId, tokens: 10 } }),
    updateToken: jest.fn().mockResolvedValue(undefined),
    releaseTokens: jest.fn().mockResolvedValue(undefined),
  };
  const notificationsGateway = {
    notifySimulationAssigned: jest.fn(),
    notifyEducatorSimulationDueDateReminder: jest.fn(),
  };
  const googleCourseworkService = {
    ensureCourseWorkForAssignment: jest.fn().mockResolvedValue(undefined),
    deleteCourseWorkForAssignment: jest.fn().mockResolvedValue(undefined),
    syncCourseWorkForClass: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    ({ app, signToken } = await buildTestApp({
      controllers: [ClassSimulationController],
      providers: [
        ClassSimulationService,
        { provide: CLASS_SIMULATION_REPOSITORY, useValue: csRepo },
        { provide: CLASS_REPOSITORY, useValue: classRepo },
        { provide: EDUCATOR_SCHOOL_REPOSITORY, useValue: educatorSchoolRepo },
        { provide: EDUCATOR_REPOSITORY, useValue: { findActiveTokenBalance: jest.fn() } },
        { provide: SIMULATION_V2_REPOSITORY, useValue: simulationRepo },
        { provide: STUDENT_REPOSITORY, useValue: studentRepo },
        { provide: UNIT_REPOSITORY, useValue: unitRepo },
        { provide: DatabaseService, useValue: databaseService },
        {
          provide: SIMULATION_REPORT_REPOSITORY,
          useValue: {
            findScenarioIdsUsedByStudent: jest.fn().mockResolvedValue([]),
            findStudentIdsWhoUsedScenariosInClass: jest.fn().mockResolvedValue([]),
          },
        },
        { provide: EducatorsService, useValue: educatorService },
        { provide: GoogleCourseworkService, useValue: googleCourseworkService },
        {
          provide: AzureBlobService,
          useValue: { uploadFile: jest.fn(), isConfigured: jest.fn().mockReturnValue(false) },
        },
        { provide: MailService, useValue: { sendMail: jest.fn().mockResolvedValue(undefined) } },
        { provide: NotificationsGateway, useValue: notificationsGateway },
      ],
    }));
    educatorToken = signToken(TEST_USERS.educator);
    districtAdminToken = signToken(TEST_USERS.districtAdmin);
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
        .send({
          class_id: CLASS_ID,
          simulation_id: SIM_ID,
          start_date: '2025-01-01',
          due_date: '2025-06-01',
        })
        .expect(404)
        .expect((res) => {
          expectErrorEnvelope(res);
        });
    });

    it('INTEGRATION: returns 201 SUCCESS when simulation assigned to class', async () => {
      classRepo.findOne.mockResolvedValue({ id: CLASS_ID });
      simulationRepo.findByBusinessId.mockResolvedValue({
        id: SIM_ID,
        unitId: 'u-1',
        title: 'Stroke Eval',
      });
      csRepo.findOne.mockResolvedValue(null);
      csRepo.find.mockResolvedValue([]);
      csRepo.create.mockReturnValue(mockRecord);
      csRepo.save.mockResolvedValue(mockRecord);
      educatorService.availableTokens.mockResolvedValue(10);

      return request(httpServer())
        .post('/api/class-simulations')
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({
          class_id: CLASS_ID,
          simulation_id: SIM_ID,
          start_date: '2025-01-01',
          due_date: '2025-06-01',
        })
        .expect(201)
        .expect((res) => {
          expectLegacySuccessBody(res);
        });
    });
  });

  describe('GET /api/class-simulations/class/:class_id', () => {
    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      return request(httpServer()).get(`/api/class-simulations/class/${CLASS_ID}`).expect(401);
    });

    it('INTEGRATION: returns 200 with simulations for class', async () => {
      csRepo.find.mockResolvedValue([mockRecord]);
      simulationRepo.find.mockResolvedValue([{ id: SIM_ID, unitId: 'u-1', title: 'Stroke Eval' }]);
      unitRepo.find.mockResolvedValue([{ id: 'u-1', name: 'Emergency', category: 'Cardiology' }]);

      return request(httpServer())
        .get(`/api/class-simulations/class/${CLASS_ID}`)
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200)
        .expect((res) => {
          const body = parseBody(res);
          expectLegacySuccessBody(res);
          expect(Array.isArray(body.data)).toBe(true);
        });
    });
  });

  describe('PUT /api/class-simulations/:id', () => {
    type UpdateBody = {
      message?: string;
      data?: Record<string, unknown> | null;
      error?: unknown;
    };
    const url = `/api/class-simulations/${RECORD_ID}`;
    const toUpdateBody = (res: request.Response): UpdateBody => res.body as UpdateBody;
    // School-less class owned by the caller: findAccessibleClassForEducator accepts it as-is.
    const mockClass = {
      id: CLASS_ID,
      class_name: 'Nursing 101',
      educator_id: TEST_USERS.educator.educatorId,
      school_id: null,
    };
    const localMmDdYyyy = (date: Date): string => {
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      return `${mm}-${dd}-${date.getFullYear()}`;
    };

    beforeEach(() => {
      csRepo.findOne.mockResolvedValue({ ...mockRecord });
      csRepo.find.mockResolvedValue([]);
      classRepo.findActiveByIdWithSchoolForEducator.mockResolvedValue(mockClass);
      csRepo.updateDatesIfActive.mockResolvedValue({ affected: 1 });
    });

    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      return request(httpServer()).put(url).send({ dueDate: '2025-07-01' }).expect(401);
    });

    it('INTEGRATION: returns 403 when a non-educator role calls it', async () => {
      await request(httpServer())
        .put(url)
        .set('Authorization', `Bearer ${districtAdminToken}`)
        .send({ dueDate: '2025-07-01' })
        .expect(403);
      expect(csRepo.updateDatesIfActive).not.toHaveBeenCalled();
    });

    it('INTEGRATION: returns 200 with the new envelope and camelCase fields', async () => {
      await request(httpServer())
        .put(url)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ startDate: '2025-02-01', dueDate: '2025-07-01', endDate: '2025-08-01' })
        .expect(200)
        .expect((res) => {
          const body = toUpdateBody(res);
          expect(body.message).toBe('success.COMMON.UPDATED');
          expect(body.error).toBeNull();
          expect(body.data).toEqual({
            id: RECORD_ID,
            classId: CLASS_ID,
            simulationId: SIM_ID,
            startDate: '2025-02-01',
            dueDate: '2025-07-01',
            endDate: '2025-08-01',
          });
        });
    });

    it('INTEGRATION: partial update leaves the other dates untouched', async () => {
      await request(httpServer())
        .put(url)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ dueDate: '2025-07-01' })
        .expect(200)
        .expect((res) => {
          expect(toUpdateBody(res).data).toMatchObject({
            startDate: mockRecord.start_date,
            dueDate: '2025-07-01',
            endDate: mockRecord.end_date,
          });
        });
    });

    it('INTEGRATION: returns 400 for an invalid date format', async () => {
      await request(httpServer())
        .put(url)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ dueDate: 'next tuesday' })
        .expect(400);
      expect(csRepo.updateDatesIfActive).not.toHaveBeenCalled();
    });

    it.each(['2026-02-30', '02-30-2026', '2027-02-29', '2026-01-01Tgarbage', '2026-01-15T25:00'])(
      'INTEGRATION: returns 400 for the impossible or malformed date %s',
      async (value) => {
        await request(httpServer())
          .put(url)
          .set('Authorization', `Bearer ${educatorToken}`)
          .send({ startDate: value })
          .expect(400);
        expect(csRepo.updateDatesIfActive).not.toHaveBeenCalled();
      },
    );

    it('INTEGRATION: stores MM-DD-YYYY and ISO date-time input as YYYY-MM-DD', async () => {
      await request(httpServer())
        .put(url)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ startDate: '02-01-2025', dueDate: '2025-07-01T09:00:00Z', endDate: '08-01-2025' })
        .expect(200)
        .expect((res) => {
          expect(toUpdateBody(res).data).toMatchObject({
            startDate: '2025-02-01',
            dueDate: '2025-07-01',
            endDate: '2025-08-01',
          });
        });
      expect(csRepo.updateDatesIfActive).toHaveBeenCalledWith(RECORD_ID, {
        start_date: '2025-02-01',
        due_date: '2025-07-01',
        end_date: '2025-08-01',
      });
    });

    it('INTEGRATION: returns 404 when the caller neither owns nor co-instructs the class', async () => {
      classRepo.findActiveByIdWithSchoolForEducator.mockResolvedValue(null);

      await request(httpServer())
        .put(url)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ dueDate: '2025-07-01' })
        .expect(404)
        .expect((res) => {
          const body = toUpdateBody(res);
          expect(body.message).toBe('error.DB.NOT_FOUND');
          expect(body.data).toBeNull();
        });
      expect(classRepo.findActiveByIdWithSchoolForEducator).toHaveBeenCalledWith(
        CLASS_ID,
        TEST_USERS.educator.educatorId,
      );
      expect(csRepo.updateDatesIfActive).not.toHaveBeenCalled();
      expect(notificationsGateway.notifyEducatorSimulationDueDateReminder).not.toHaveBeenCalled();
    });

    it('INTEGRATION: returns 409 when the new range overlaps another assignment', async () => {
      csRepo.find.mockResolvedValue([
        { ...mockRecord, id: 'sibling-id', start_date: '2025-07-01', end_date: '2025-07-31' },
      ]);

      await request(httpServer())
        .put(url)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ endDate: '2025-07-10' })
        .expect(409)
        .expect((res) => {
          expect(toUpdateBody(res).message).toBe('error.CLASS_SIMULATION.OVERLAPPING_ASSIGNMENT');
        });
      expect(csRepo.updateDatesIfActive).not.toHaveBeenCalled();
    });

    it('INTEGRATION: does not re-send the reminder when only the start date changes', async () => {
      csRepo.findOne.mockResolvedValue({ ...mockRecord, due_date: localMmDdYyyy(new Date()) });

      await request(httpServer())
        .put(url)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ startDate: '2025-01-02' })
        .expect(200);

      expect(notificationsGateway.notifyEducatorSimulationDueDateReminder).not.toHaveBeenCalled();
    });

    it('INTEGRATION: returns 400 for the legacy snake_case field names', async () => {
      await request(httpServer())
        .put(url)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ due_date: '2025-07-01' })
        .expect(400);
      expect(csRepo.updateDatesIfActive).not.toHaveBeenCalled();
    });

    it('INTEGRATION: returns 400 when the id is not a UUID', async () => {
      return request(httpServer())
        .put('/api/class-simulations/not-a-uuid')
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ dueDate: '2025-07-01' })
        .expect(400);
    });

    it('INTEGRATION: returns 404 when the class simulation is not found', async () => {
      csRepo.findOne.mockResolvedValue(null);

      await request(httpServer())
        .put(url)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ dueDate: '2025-07-01' })
        .expect(404)
        .expect((res) => {
          expect(toUpdateBody(res).message).toBe('error.DB.NOT_FOUND');
        });
      expect(csRepo.updateDatesIfActive).not.toHaveBeenCalled();
    });

    it('INTEGRATION: returns 404 when the caller is no longer assigned to the class school', async () => {
      classRepo.findActiveByIdWithSchoolForEducator.mockResolvedValue({
        ...mockClass,
        school_id: 'school-1',
        school: { is_active: true },
      });
      educatorSchoolRepo.findOne.mockResolvedValue(null);

      await request(httpServer())
        .put(url)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ dueDate: '2025-07-01' })
        .expect(404);
      expect(csRepo.updateDatesIfActive).not.toHaveBeenCalled();
    });

    it('INTEGRATION: returns 404 when the assignment is removed before the write lands', async () => {
      csRepo.updateDatesIfActive.mockResolvedValue({ affected: 0 });

      await request(httpServer())
        .put(url)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ dueDate: localMmDdYyyy(new Date()) })
        .expect(404)
        .expect((res) => {
          expect(toUpdateBody(res).message).toBe('error.DB.NOT_FOUND');
        });
      expect(notificationsGateway.notifyEducatorSimulationDueDateReminder).not.toHaveBeenCalled();
    });

    it('INTEGRATION: lets a co-instructor update and reminds the class owner', async () => {
      classRepo.findActiveByIdWithSchoolForEducator.mockResolvedValue({
        ...mockClass,
        educator_id: 'owner-educator-id',
      });

      await request(httpServer())
        .put(url)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ dueDate: localMmDdYyyy(new Date()) })
        .expect(200);

      expect(csRepo.updateDatesIfActive).toHaveBeenCalledTimes(1);
      expect(notificationsGateway.notifyEducatorSimulationDueDateReminder).toHaveBeenCalledWith(
        'owner-educator-id',
        SIM_ID,
        expect.any(String),
        CLASS_ID,
        'Nursing 101',
        expect.any(String),
      );
    });

    it.each([CommonStatus.ARCHIEVED, CommonStatus.ARCHIVED])(
      'INTEGRATION: returns 409 with the archived message when the class status is %s',
      async (status) => {
        classRepo.findActiveByIdWithSchoolForEducator.mockResolvedValue({ ...mockClass, status });

        await request(httpServer())
          .put(url)
          .set('Authorization', `Bearer ${educatorToken}`)
          .send({ dueDate: '2025-07-01' })
          .expect(409)
          .expect((res) => {
            const body = toUpdateBody(res);
            expect(body.message).toBe('error.CLASS.ARCHIVED');
            expect(body.data).toBeNull();
          });
        expect(csRepo.updateDatesIfActive).not.toHaveBeenCalled();
      },
    );

    it('INTEGRATION: archived rejection sends no reminder even for an in-window due date', async () => {
      classRepo.findActiveByIdWithSchoolForEducator.mockResolvedValue({
        ...mockClass,
        status: CommonStatus.ARCHIEVED,
      });

      await request(httpServer())
        .put(url)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ dueDate: localMmDdYyyy(new Date()) })
        .expect(409);

      expect(notificationsGateway.notifyEducatorSimulationDueDateReminder).not.toHaveBeenCalled();
    });

    it.each([CommonStatus.ACTIVE, CommonStatus.INACTIVE, CommonStatus.DRAFT])(
      'INTEGRATION: still returns 200 when the class status is %s',
      async (status) => {
        classRepo.findActiveByIdWithSchoolForEducator.mockResolvedValue({ ...mockClass, status });

        await request(httpServer())
          .put(url)
          .set('Authorization', `Bearer ${educatorToken}`)
          .send({ dueDate: '2025-07-01' })
          .expect(200);
        expect(csRepo.updateDatesIfActive).toHaveBeenCalledTimes(1);
      },
    );

    it('INTEGRATION: sends the due-date reminder when the new due date is inside the window', async () => {
      await request(httpServer())
        .put(url)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ dueDate: localMmDdYyyy(new Date()) })
        .expect(200);

      expect(notificationsGateway.notifyEducatorSimulationDueDateReminder).toHaveBeenCalledTimes(1);
    });

    it('INTEGRATION: does not send the reminder when the due date is outside the window', async () => {
      await request(httpServer())
        .put(url)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send({ dueDate: '01-01-2000' })
        .expect(200);

      expect(notificationsGateway.notifyEducatorSimulationDueDateReminder).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/class-simulations/:id', () => {
    it('INTEGRATION: returns 401 when no JWT provided', async () => {
      return request(httpServer()).delete(`/api/class-simulations/${RECORD_ID}`).expect(401);
    });

    it('INTEGRATION: returns 404 when record not found', async () => {
      csRepo.findOne.mockResolvedValue(null);

      return request(httpServer())
        .delete(`/api/class-simulations/${RECORD_ID}`)
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(404)
        .expect((res) => {
          expectErrorEnvelope(res);
        });
    });

    it('INTEGRATION: returns 200 when simulation removed from class', async () => {
      csRepo.findOne.mockResolvedValue(mockRecord);
      classRepo.findOne.mockResolvedValue({
        id: CLASS_ID,
        educator_id: TEST_USERS.educator.educatorId,
        educator: { id: TEST_USERS.educator.educatorId },
      });
      csRepo.remove.mockResolvedValue(undefined);

      return request(httpServer())
        .delete(`/api/class-simulations/${RECORD_ID}`)
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200)
        .expect((res) => {
          expectLegacySuccessBody(res);
        });
    });
  });

  describe('GET /api/class-simulations', () => {
    const url = '/api/class-simulations';
    const MISSING_CLASS_ID = '550e8400-e29b-41d4-a716-446655440599';
    const listingRow = {
      classSimulationId: RECORD_ID,
      simId: SIM_ID,
      simName: 'Stroke Eval',
      isArchived: false,
      startDate: '2026-01-01',
      dueDate: '2026-12-31',
      closeDate: '2026-12-31',
      startedCount: 3,
      completedCount: 1,
      averageScore: 78,
      avatarEnabled: true,
      unitId: 'gastrointestinal-care',
      unitName: 'Gastrointestinal Care',
    };

    beforeEach(() => {
      // No school -> accessible without the school-assignment lookup.
      classRepo.findActiveByIdWithSchoolForEducator.mockResolvedValue({
        id: CLASS_ID,
        is_active: true,
      });
      csRepo.findForClassListing.mockResolvedValue({ rows: [listingRow], total: 1 });
    });

    it('INTEGRATION: returns 401 when no JWT provided', () => {
      return request(httpServer()).get(url).query({ classId: CLASS_ID }).expect(401);
    });

    it('INTEGRATION: returns 403 when a District Admin calls it', async () => {
      await request(httpServer())
        .get(url)
        .query({ classId: CLASS_ID })
        .set('Authorization', `Bearer ${signToken(TEST_USERS.districtAdmin)}`)
        .expect(403);
      expect(csRepo.findForClassListing).not.toHaveBeenCalled();
    });

    it.each([
      [{}],
      [{ classId: 'not-a-uuid' }],
      [{ classId: CLASS_ID, sortBy: 'assignmentStatus' }],
      [{ classId: CLASS_ID, sortDir: 'up' }],
      [{ classId: CLASS_ID, page: '0' }],
      [{ classId: CLASS_ID, page: 'abc' }],
      [{ classId: CLASS_ID, pageSize: '0' }],
      [{ classId: CLASS_ID, pageSize: '51' }],
      [{ classId: CLASS_ID, unknownParam: 'x' }],
    ])('INTEGRATION: returns 400 for invalid query %j', async (query) => {
      await request(httpServer())
        .get(url)
        .query(query)
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(400)
        .expect((res) => expectErrorEnvelope(res));
      expect(csRepo.findForClassListing).not.toHaveBeenCalled();
    });

    it('INTEGRATION: returns 404 when the class is unknown or not accessible', async () => {
      classRepo.findActiveByIdWithSchoolForEducator.mockResolvedValue(null);
      await request(httpServer())
        .get(url)
        .query({ classId: MISSING_CLASS_ID })
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(404)
        .expect((res) => expectErrorEnvelope(res));
      expect(classRepo.findActiveByIdWithSchoolForEducator).toHaveBeenCalledWith(
        MISSING_CLASS_ID,
        TEST_USERS.educator.educatorId,
      );
      expect(csRepo.findForClassListing).not.toHaveBeenCalled();
    });

    it('INTEGRATION: returns 404 when the educator is no longer assigned to the class school', async () => {
      classRepo.findActiveByIdWithSchoolForEducator.mockResolvedValue({
        id: CLASS_ID,
        school_id: 'school-1',
        school: { is_active: true },
      });
      educatorSchoolRepo.findOne.mockResolvedValue(null);
      await request(httpServer())
        .get(url)
        .query({ classId: CLASS_ID })
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(404);
    });

    it('INTEGRATION: returns 200 with the paginated envelope and exact row fields', async () => {
      const res = await request(httpServer())
        .get(url)
        .query({ classId: CLASS_ID })
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);

      const body = res.body as {
        message: string;
        data: Array<Record<string, unknown>>;
        meta: Record<string, unknown>;
      };
      expect(typeof body.message).toBe('string');
      expect(body.data).toEqual([listingRow]);
      expect(body.data[0]).not.toHaveProperty('assignmentStatus');
      expect(body.meta).toEqual({
        total: 1,
        page: 1,
        pageSize: 10,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      });
    });

    it('INTEGRATION: defaults to simName ASC, first page of 10', async () => {
      await request(httpServer())
        .get(url)
        .query({ classId: CLASS_ID })
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);
      expect(csRepo.findForClassListing).toHaveBeenCalledWith(
        CLASS_ID,
        { field: ClassSimulationSortField.SIM_NAME, direction: 'ASC' },
        { skip: 0, take: 10 },
      );
    });

    it.each(Object.values(ClassSimulationSortField))(
      'INTEGRATION: passes sortBy=%s&sortDir=desc through to the repository',
      async (sortBy) => {
        await request(httpServer())
          .get(url)
          .query({ classId: CLASS_ID, sortBy, sortDir: 'desc', page: 2, pageSize: 5 })
          .set('Authorization', `Bearer ${educatorToken}`)
          .expect(200);
        expect(csRepo.findForClassListing).toHaveBeenCalledWith(
          CLASS_ID,
          { field: sortBy, direction: 'DESC' },
          { skip: 5, take: 5 },
        );
      },
    );

    it('INTEGRATION: an archived class is still readable', async () => {
      classRepo.findActiveByIdWithSchoolForEducator.mockResolvedValue({
        id: CLASS_ID,
        is_active: true,
        status: CommonStatus.ARCHIEVED,
      });
      await request(httpServer())
        .get(url)
        .query({ classId: CLASS_ID })
        .set('Authorization', `Bearer ${educatorToken}`)
        .expect(200);
    });
  });
});
