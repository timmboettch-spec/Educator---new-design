import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ClassSimulationController } from '../../../src/class-simulations/class-simulation.controller';
import { ClassSimulationService } from '../../../src/class-simulations/class-simulation.service';
import { EducatorsService } from '../../../src/educators/educators.service';
import { NotificationsGateway } from '../../../src/notifications/notifications.gateway';
import { GoogleCourseworkService } from '../../../src/google/google-coursework.service';
import { buildTestApp, TEST_USERS } from '../setup/test-app.factory';
import {
  expectErrorEnvelope,
  expectSuccessEnvelope,
  parseErrorBody,
} from '../setup/error-envelope.util';
import {
  CLASS_REPOSITORY,
  CLASS_SIMULATION_REPOSITORY,
  EDUCATOR_REPOSITORY,
  EDUCATOR_SCHOOL_REPOSITORY,
  SIMULATION_REPORT_REPOSITORY,
  SIMULATION_V2_REPOSITORY,
  STUDENT_REPOSITORY,
  UNIT_REPOSITORY,
} from 'src/database/tokens';
import { DatabaseService } from 'src/database/services/database.service';
import { IBulkAssignClassSimulationsInput } from 'src/common/interfaces';

const URL = '/api/class-simulations/bulk';
const SCHOOL_ID = '43637818-250a-4579-ad73-de15e51a92f8';
const CLASS_A = '550e8400-e29b-41d4-a716-446655440601';
const CLASS_B = '550e8400-e29b-41d4-a716-446655440602';
const AI_SIM = 'ai-sim';
const WS_SIM = 'workstation-sim';

const validBody = (o: Record<string, unknown> = {}): Record<string, unknown> => ({
  schoolId: SCHOOL_ID,
  classIds: [CLASS_A, CLASS_B],
  simulationIds: [AI_SIM, WS_SIM],
  startDate: '09-01-2030',
  dueDate: '10-16-2030',
  endDate: '12-15-2030',
  ...o,
});

describe('POST /api/class-simulations/bulk (Integration)', () => {
  let app: INestApplication;
  let signToken: (user?: object) => string;
  let educatorToken: string;

  const httpServer = (): Parameters<typeof request>[0] => {
    const server: unknown = app.getHttpServer();
    return server as Parameters<typeof request>[0];
  };

  const csRepo = {
    find: jest.fn(),
    findActiveByClassIdsAndSimulationIds: jest.fn(),
    createManyAndChargeSeats: jest.fn(),
  };
  const classRepo = { findActiveByIdsWithSchoolForEducator: jest.fn() };
  const educatorSchoolRepo = { findOne: jest.fn(), isEducatorAssignedToSchool: jest.fn() };
  const educatorRepo = { findActiveTokenBalance: jest.fn() };
  const simulationReportRepo = {};
  const simulationRepo = { findByBusinessIds: jest.fn() };
  const studentRepo = { count: jest.fn() };
  const unitRepo = { findByBusinessId: jest.fn() };
  const databaseService = { connection: { query: jest.fn() } };
  const educatorService = { notifyIfSeatsBelowThreshold: jest.fn() };
  const googleCourseworkService = { ensureCourseWorkForAssignment: jest.fn() };
  const notificationsGateway = {
    notifyEducatorSimulationDueDateReminder: jest.fn(),
    notifyEducatorSimulationStartDateReminder: jest.fn(),
    notifyEducatorSimulationEndDateReminder: jest.fn(),
  };

  beforeAll(async () => {
    ({ app, signToken } = await buildTestApp({
      controllers: [ClassSimulationController],
      providers: [
        ClassSimulationService,
        { provide: CLASS_SIMULATION_REPOSITORY, useValue: csRepo },
        { provide: CLASS_REPOSITORY, useValue: classRepo },
        { provide: EDUCATOR_SCHOOL_REPOSITORY, useValue: educatorSchoolRepo },
        { provide: EDUCATOR_REPOSITORY, useValue: educatorRepo },
        { provide: SIMULATION_V2_REPOSITORY, useValue: simulationRepo },
        { provide: SIMULATION_REPORT_REPOSITORY, useValue: simulationReportRepo },
        { provide: STUDENT_REPOSITORY, useValue: studentRepo },
        { provide: UNIT_REPOSITORY, useValue: unitRepo },
        { provide: DatabaseService, useValue: databaseService },
        { provide: EducatorsService, useValue: educatorService },
        { provide: GoogleCourseworkService, useValue: googleCourseworkService },
        { provide: NotificationsGateway, useValue: notificationsGateway },
      ],
    }));
    educatorToken = signToken(TEST_USERS.educator);
  });

  beforeEach(() => {
    educatorRepo.findActiveTokenBalance.mockResolvedValue(100);
    educatorSchoolRepo.isEducatorAssignedToSchool.mockResolvedValue(true);
    educatorSchoolRepo.findOne.mockResolvedValue({ id: 'es-1' });
    // Postgres returns uuids lowercase.
    classRepo.findActiveByIdsWithSchoolForEducator.mockImplementation((ids: string[]) =>
      Promise.resolve(
        ids.map((id) => ({
          id: id.toLowerCase(),
          class_name: 'Class',
          school_id: SCHOOL_ID,
          school: { is_active: true },
        })),
      ),
    );
    simulationRepo.findByBusinessIds.mockResolvedValue([
      { id: AI_SIM, title: 'AI', avatarEnabled: true },
      { id: WS_SIM, title: 'Workstation', avatarEnabled: false },
    ]);
    csRepo.findActiveByClassIdsAndSimulationIds.mockResolvedValue([]);
    csRepo.find.mockResolvedValue([]);
    studentRepo.count.mockResolvedValue(5);
    databaseService.connection.query.mockResolvedValue([]);
    educatorService.notifyIfSeatsBelowThreshold.mockResolvedValue(undefined);
    googleCourseworkService.ensureCourseWorkForAssignment.mockResolvedValue(undefined);
    csRepo.createManyAndChargeSeats.mockImplementation((input: IBulkAssignClassSimulationsInput) =>
      Promise.resolve({
        saved: input.rows.map((_, i) => ({ id: `cs-${i}` })),
        conflicts: [],
        previousTokens: 100,
        newTokens: 100 - input.seatsToCharge,
      }),
    );
  });

  afterAll(async () => app.close());
  afterEach(() => jest.clearAllMocks());

  describe('refusals', () => {
    it('401s without a JWT', async () => {
      await request(httpServer()).post(URL).send(validBody()).expect(401);
      expect(csRepo.createManyAndChargeSeats).not.toHaveBeenCalled();
    });

    it('403s for a district admin (educator-only route)', async () => {
      await request(httpServer())
        .post(URL)
        .set('Authorization', `Bearer ${signToken(TEST_USERS.districtAdmin)}`)
        .send(validBody())
        .expect(403)
        .expect((res) => expectErrorEnvelope(res));
      expect(csRepo.createManyAndChargeSeats).not.toHaveBeenCalled();
    });

    it('403s when the educator is not assigned to the school', async () => {
      educatorSchoolRepo.isEducatorAssignedToSchool.mockResolvedValue(false);
      await request(httpServer())
        .post(URL)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send(validBody())
        .expect(403)
        .expect((res) => expectErrorEnvelope(res));
    });

    it('400s with a field-keyed error for an invalid body', async () => {
      const res = await request(httpServer())
        .post(URL)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send(validBody({ schoolId: 'nope', classIds: [], dueDate: '02-31-2030' }))
        .expect(400);

      expectErrorEnvelope(res);
      expect(Object.keys(parseErrorBody(res).error as object).sort()).toEqual(
        ['classIds', 'dueDate', 'schoolId'].sort(),
      );
    });

    it('400s when the legacy reduceToken field is sent', async () => {
      await request(httpServer())
        .post(URL)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send(validBody({ reduceToken: 0 }))
        .expect(400)
        .expect((res) => expectErrorEnvelope(res));
    });

    it('400s when the dates are out of order', async () => {
      await request(httpServer())
        .post(URL)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send(validBody({ endDate: '10-15-2030' }))
        .expect(400)
        .expect((res) => expectErrorEnvelope(res));
      expect(csRepo.createManyAndChargeSeats).not.toHaveBeenCalled();
    });

    it('400s when the educator lacks the seats', async () => {
      educatorRepo.findActiveTokenBalance.mockResolvedValue(3);
      await request(httpServer())
        .post(URL)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send(validBody())
        .expect(400)
        .expect((res) => expectErrorEnvelope(res));
      expect(csRepo.createManyAndChargeSeats).not.toHaveBeenCalled();
    });

    it('422s with every pair outcome when one pair fails, writing nothing', async () => {
      csRepo.findActiveByClassIdsAndSimulationIds.mockResolvedValue([
        {
          class_id: CLASS_B,
          simulation_id: WS_SIM,
          start_date: '2030-09-01',
          end_date: '2030-12-15',
          is_active: true,
        },
      ]);

      const res = await request(httpServer())
        .post(URL)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send(validBody())
        .expect(422);

      expectErrorEnvelope(res);
      expect(parseErrorBody(res).error).toEqual({
        total: 4,
        failed: 1,
        results: [
          { classId: CLASS_A, simulationId: AI_SIM, status: 'VALID' },
          { classId: CLASS_A, simulationId: WS_SIM, status: 'VALID' },
          { classId: CLASS_B, simulationId: AI_SIM, status: 'VALID' },
          {
            classId: CLASS_B,
            simulationId: WS_SIM,
            status: 'FAILED',
            reason: 'ALREADY_ASSIGNED_SAME_DATES',
            message: 'class-simulation.BULK_ASSIGN.ALREADY_ASSIGNED_SAME_DATES',
          },
        ],
      });
      expect(csRepo.createManyAndChargeSeats).not.toHaveBeenCalled();
    });
  });

  describe('concurrent duplicate', () => {
    it('422s (not 201) when a duplicate committed after the pre-check, charging nothing', async () => {
      csRepo.createManyAndChargeSeats.mockResolvedValue({
        saved: [],
        conflicts: [
          {
            class_id: CLASS_A,
            simulation_id: AI_SIM,
            start_date: '2030-09-01',
            end_date: '2030-12-15',
            is_active: true,
          },
        ],
        previousTokens: 0,
        newTokens: 0,
      });

      const res = await request(httpServer())
        .post(URL)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send(validBody())
        .expect(422);

      expectErrorEnvelope(res);
      expect((parseErrorBody(res).error as { failed: number }).failed).toBe(1);
      expect(googleCourseworkService.ensureCourseWorkForAssignment).not.toHaveBeenCalled();
      expect(educatorService.notifyIfSeatsBelowThreshold).not.toHaveBeenCalled();
    });
  });

  describe('id case (review F1)', () => {
    it('422s when an uppercase class id targets an already-assigned pair', async () => {
      csRepo.findActiveByClassIdsAndSimulationIds.mockResolvedValue([
        {
          class_id: CLASS_A,
          simulation_id: WS_SIM,
          start_date: '2030-09-01',
          end_date: '2030-12-15',
          is_active: true,
        },
      ]);

      const res = await request(httpServer())
        .post(URL)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send(validBody({ classIds: [CLASS_A.toUpperCase()], simulationIds: [WS_SIM] }))
        .expect(422);

      expect((parseErrorBody(res).error as { results: { reason?: string }[] }).results[0]).toEqual(
        expect.objectContaining({ classId: CLASS_A, reason: 'ALREADY_ASSIGNED_SAME_DATES' }),
      );
      expect(csRepo.createManyAndChargeSeats).not.toHaveBeenCalled();
    });

    it('400s for the same class sent in two letter cases', async () => {
      const res = await request(httpServer())
        .post(URL)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send(validBody({ classIds: [CLASS_A, CLASS_A.toUpperCase()] }))
        .expect(400);
      expect(Object.keys(parseErrorBody(res).error as object)).toEqual(['classIds']);
    });

    it('201s for an uppercase schoolId and echoes lowercase ids', async () => {
      const res = await request(httpServer())
        .post(URL)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send(
          validBody({
            schoolId: SCHOOL_ID.toUpperCase(),
            classIds: [CLASS_A.toUpperCase()],
            simulationIds: [WS_SIM],
          }),
        )
        .expect(201);

      expect(educatorSchoolRepo.isEducatorAssignedToSchool).toHaveBeenCalledWith(
        TEST_USERS.educator.educatorId,
        SCHOOL_ID,
      );
      expect(
        (res.body as { data: { results: { classId: string }[] } }).data.results[0].classId,
      ).toBe(CLASS_A);
    });
  });

  describe('success', () => {
    it('201s with the documented envelope and per-pair results', async () => {
      const res = await request(httpServer())
        .post(URL)
        .set('Authorization', `Bearer ${educatorToken}`)
        .send(validBody())
        .expect(201);

      expectSuccessEnvelope(res);
      const body = res.body as {
        data: {
          total: number;
          created: number;
          seatsCharged: number;
          remainingSeats: number;
          results: Record<string, unknown>[];
        };
        meta: unknown;
      };
      expect(body.meta).toBeNull();
      expect(body.data).toMatchObject({
        total: 4,
        created: 4,
        seatsCharged: 10,
        remainingSeats: 90,
      });
      expect(Object.keys(body.data.results[0]).sort()).toEqual(
        [
          'classId',
          'classSimulationId',
          'dueDate',
          'endDate',
          'isAi',
          'seatsCharged',
          'simulationId',
          'startDate',
          'status',
        ].sort(),
      );
      expect(body.data.results[0]).toEqual({
        classId: CLASS_A,
        simulationId: AI_SIM,
        status: 'CREATED',
        classSimulationId: 'cs-0',
        isAi: true,
        seatsCharged: 5,
        startDate: '2030-09-01',
        dueDate: '2030-10-16',
        endDate: '2030-12-15',
      });
      expect(csRepo.createManyAndChargeSeats).toHaveBeenCalledWith(
        expect.objectContaining({
          educatorId: TEST_USERS.educator.educatorId,
          seatsToCharge: 10,
        }),
      );
    });
  });
});
