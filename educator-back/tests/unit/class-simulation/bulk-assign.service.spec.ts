import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ClassSimulationController } from 'src/class-simulations/class-simulation.controller';
import { ClassSimulationService } from 'src/class-simulations/class-simulation.service';
import { BulkAssignClassSimulationsReqDto } from 'src/class-simulations/dto/bulk-assign-class-simulations.dto';
import { ResponseResult } from 'src/common/class/response.class';
import {
  ClassSimulationAssignmentConstants,
  ClassSimulationAssignmentFailureReason,
  ClassSimulationAssignmentStatus,
  RoleSlug,
} from 'src/common/constants';
import { ROLES_KEY } from 'src/common/decorators/required-roles.decorator';
import { BulkOperationException } from 'src/common/exceptions/bulk-operation.exception';
import {
  IBulkAssignClassSimulationsInput,
  IBulkAssignPairOutcome,
  ICurrentUser,
} from 'src/common/interfaces';
import { CLASS_SIMULATION_MSG } from 'src/common/messages/class-simulation.message';
import { ERROR_MSG } from 'src/common/messages/error.message';
import { ClassSimulation } from 'src/database/entities';

const EDUCATOR_ID = 'edu-1';
const SCHOOL_ID = '43637818-250a-4579-ad73-de15e51a92f8';
const OTHER_SCHOOL_ID = 'ceac34f2-f624-4207-93d9-bfe88fcd2749';
const CLASS_A = '4bfcf191-c608-4552-af95-a479209b5e72';
const CLASS_B = '9c1d2e3f-4a5b-4c6d-8e7f-a1b2c3d4e5f6';
const AI_SIM = 'ai-sim';
const WS_SIM = 'workstation-sim';
const WS_SIM_2 = 'workstation-sim-2';

const currentUser = { userId: 'user-1', educatorId: EDUCATOR_ID } as ICurrentUser;

const makeDto = (
  o: Partial<BulkAssignClassSimulationsReqDto> = {},
): BulkAssignClassSimulationsReqDto =>
  Object.assign(new BulkAssignClassSimulationsReqDto(), {
    schoolId: SCHOOL_ID,
    classIds: [CLASS_A, CLASS_B],
    simulationIds: [WS_SIM],
    // Far future: outside the reminder window unless a test says otherwise.
    startDate: '09-01-2030',
    dueDate: '10-16-2030',
    endDate: '12-15-2030',
    ...o,
  });

const sim = (id: string, avatarEnabled: boolean) => ({
  id,
  title: `Title ${id}`,
  unitId: 'unit-1',
  avatarEnabled,
  description: 'desc',
});

const existingRow = (o: Partial<ClassSimulation>): ClassSimulation =>
  ({ id: 'existing', is_active: true, ...o }) as ClassSimulation;

/** `MM-DD-YYYY` for `daysFromNow`, in local time — what the reminder window check uses. */
/** Lets the background post-commit side effects (bounded worker pool) run to completion. */
const flushBackground = async (): Promise<void> => {
  for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setImmediate(resolve));
};

const localMmDdYyyy = (daysFromNow: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${d.getFullYear()}`;
};

describe('ClassSimulationService.bulkAssign', () => {
  let service: ClassSimulationService;

  const educatorService = { notifyIfSeatsBelowThreshold: jest.fn(), updateToken: jest.fn() };
  const classSimulationRepo = {
    find: jest.fn(),
    findActiveByClassIdsAndSimulationIds: jest.fn(),
    createManyAndChargeSeats: jest.fn(),
    create: jest.fn(),
  };
  /** Per-id stub behind the batched lookup; return null for an inaccessible class. */
  const classById = jest.fn();
  const classRepo = {
    findOne: jest.fn(),
    findActiveByIdsWithSchoolForEducator: jest.fn((ids: string[]) =>
      Promise.resolve(ids.map((id) => classById(id) as unknown).filter(Boolean)),
    ),
  };
  const simulationRepo = { findByBusinessIds: jest.fn() };
  const studentRepo = { count: jest.fn() };
  const unitRepository = { findByBusinessId: jest.fn() };
  const dataSource = { connection: { query: jest.fn() } };
  const simulationReportRepo = { findStudentIdsWhoUsedScenariosInClass: jest.fn() };
  const notificationsGateway = {
    notifyEducatorSimulationDueDateReminder: jest.fn(),
    notifyEducatorSimulationStartDateReminder: jest.fn(),
    notifyEducatorSimulationEndDateReminder: jest.fn(),
  };
  const configService = { get: jest.fn() };
  const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const googleCourseworkService = { ensureCourseWorkForAssignment: jest.fn() };
  const educatorSchoolRepo = { findOne: jest.fn(), isEducatorAssignedToSchool: jest.fn() };
  const educatorRepo = { findActiveTokenBalance: jest.fn() };

  const studentsByClass: Record<string, number> = { [CLASS_A]: 10, [CLASS_B]: 14 };

  beforeEach(() => {
    service = new ClassSimulationService(
      educatorService as never,
      classSimulationRepo as never,
      classRepo as never,
      simulationRepo as never,
      studentRepo as never,
      unitRepository as never,
      simulationReportRepo as never,
      dataSource as never,
      notificationsGateway as never,
      configService as never,
      logger as never,
      googleCourseworkService as never,
      educatorSchoolRepo as never,
      educatorRepo as never,
    );

    educatorRepo.findActiveTokenBalance.mockResolvedValue(100);
    educatorSchoolRepo.isEducatorAssignedToSchool.mockResolvedValue(true);
    educatorSchoolRepo.findOne.mockResolvedValue({ id: 'es-1' });
    // Postgres returns uuids lowercase, whatever case the query used.
    classById.mockImplementation((id: string) => ({
      id: id.toLowerCase(),
      class_name: `Class ${id.slice(0, 4)}`,
      school_id: SCHOOL_ID,
      school: { is_active: true },
    }));
    simulationRepo.findByBusinessIds.mockImplementation((ids: string[]) =>
      Promise.resolve(
        [sim(AI_SIM, true), sim(WS_SIM, false), sim(WS_SIM_2, false)].filter((s) =>
          ids.includes(s.id),
        ),
      ),
    );
    classSimulationRepo.findActiveByClassIdsAndSimulationIds.mockResolvedValue([]);
    // countStudentsWhoHaveNotUsedAiInClass: no AI sims in the class yet → every active student.
    classSimulationRepo.find.mockResolvedValue([]);
    studentRepo.count.mockImplementation(({ where }: { where: { class: { id: string } } }) =>
      Promise.resolve(studentsByClass[where.class.id] ?? 0),
    );
    dataSource.connection.query.mockResolvedValue([]);
    simulationReportRepo.findStudentIdsWhoUsedScenariosInClass.mockResolvedValue([]);
    unitRepository.findByBusinessId.mockResolvedValue(null);
    configService.get.mockReturnValue('3');
    educatorService.notifyIfSeatsBelowThreshold.mockResolvedValue(undefined);
    googleCourseworkService.ensureCourseWorkForAssignment.mockResolvedValue(undefined);
    classSimulationRepo.createManyAndChargeSeats.mockImplementation(
      (input: IBulkAssignClassSimulationsInput) =>
        Promise.resolve({
          saved: input.rows.map((row, i) => ({ id: `cs-${i}`, class_id: row.classId })),
          conflicts: [],
          previousTokens: 100,
          newTokens: 100 - input.seatsToCharge,
        }),
    );
  });

  afterEach(() => jest.clearAllMocks());

  const expectBulkFailure = async (
    dto: BulkAssignClassSimulationsReqDto,
  ): Promise<BulkOperationException<IBulkAssignPairOutcome>> => {
    const error = await service.bulkAssign(currentUser, dto).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BulkOperationException);
    expect(classSimulationRepo.createManyAndChargeSeats).not.toHaveBeenCalled();
    return error as BulkOperationException<IBulkAssignPairOutcome>;
  };

  describe('success', () => {
    it('creates every class × simulation pair in one repository call and reports each', async () => {
      const dto = makeDto({ simulationIds: [WS_SIM, WS_SIM_2] });

      const result = await service.bulkAssign(currentUser, dto);

      expect(result).toBeInstanceOf(ResponseResult);
      expect(result.message).toBe(CLASS_SIMULATION_MSG.BULK_ASSIGN.CREATED(4));
      expect(classSimulationRepo.createManyAndChargeSeats).toHaveBeenCalledTimes(1);
      expect(classSimulationRepo.createManyAndChargeSeats).toHaveBeenCalledWith({
        educatorId: EDUCATOR_ID,
        seatsToCharge: 0,
        rows: [
          [CLASS_A, WS_SIM],
          [CLASS_A, WS_SIM_2],
          [CLASS_B, WS_SIM],
          [CLASS_B, WS_SIM_2],
        ].map(([classId, simulationId]) => ({
          classId,
          simulationId,
          startDate: '2030-09-01',
          dueDate: '2030-10-16',
          endDate: '2030-12-15',
          isAi: false,
        })),
      });
      expect(result.data).toEqual({
        total: 4,
        created: 4,
        seatsCharged: 0,
        remainingSeats: 100,
        results: expect.any(Array) as unknown,
      });
      expect(result.data!.results[0]).toEqual({
        classId: CLASS_A,
        simulationId: WS_SIM,
        status: ClassSimulationAssignmentStatus.CREATED,
        classSimulationId: 'cs-0',
        isAi: false,
        seatsCharged: 0,
        startDate: '2030-09-01',
        dueDate: '2030-10-16',
        endDate: '2030-12-15',
      });
    });

    it('accepts ISO dates and stores them as YYYY-MM-DD', async () => {
      await service.bulkAssign(
        currentUser,
        makeDto({
          classIds: [CLASS_A],
          startDate: '2030-09-01T00:00:00.000Z',
          dueDate: '2030-09-01',
          endDate: '2030-09-01',
        }),
      );
      const [input] = classSimulationRepo.createManyAndChargeSeats.mock.calls[0] as [
        IBulkAssignClassSimulationsInput,
      ];
      expect(input.rows[0]).toMatchObject({
        startDate: '2030-09-01',
        dueDate: '2030-09-01',
        endDate: '2030-09-01',
      });
    });

    it('charges seats only for AI pairs, counting each class once', async () => {
      const result = await service.bulkAssign(
        currentUser,
        makeDto({ simulationIds: [AI_SIM, WS_SIM] }),
      );

      // AI pairs: A (10 students) + B (14 students); workstation pairs are free.
      expect(classSimulationRepo.createManyAndChargeSeats).toHaveBeenCalledWith(
        expect.objectContaining({ seatsToCharge: 24 }),
      );
      expect(studentRepo.count).toHaveBeenCalledTimes(2);
      expect(result.data!.seatsCharged).toBe(24);
      expect(result.data!.remainingSeats).toBe(76);
      expect(
        result.data!.results.map((r) => [r.classId, r.simulationId, r.isAi, r.seatsCharged]),
      ).toEqual([
        [CLASS_A, AI_SIM, true, 10],
        [CLASS_A, WS_SIM, false, 0],
        [CLASS_B, AI_SIM, true, 14],
        [CLASS_B, WS_SIM, false, 0],
      ]);
    });

    it('does not count students when no simulation needs AI seats', async () => {
      await service.bulkAssign(currentUser, makeDto());
      expect(studentRepo.count).not.toHaveBeenCalled();
      expect(educatorService.notifyIfSeatsBelowThreshold).not.toHaveBeenCalled();
    });

    it('triggers the low-seat check with the before/after balance when seats were charged', async () => {
      await service.bulkAssign(currentUser, makeDto({ simulationIds: [AI_SIM] }));
      expect(educatorService.notifyIfSeatsBelowThreshold).toHaveBeenCalledWith(
        EDUCATOR_ID,
        100,
        76,
      );
    });

    it('accepts start = due = end', async () => {
      await expect(
        service.bulkAssign(
          currentUser,
          makeDto({ startDate: '10-16-2030', dueDate: '10-16-2030', endDate: '10-16-2030' }),
        ),
      ).resolves.toBeInstanceOf(ResponseResult);
    });

    it('allows a pair whose existing assignment does not overlap', async () => {
      classSimulationRepo.findActiveByClassIdsAndSimulationIds.mockResolvedValue([
        existingRow({
          class_id: CLASS_A,
          simulation_id: WS_SIM,
          start_date: '2030-01-01',
          end_date: '2030-08-31',
        }),
      ]);
      await expect(service.bulkAssign(currentUser, makeDto())).resolves.toBeInstanceOf(
        ResponseResult,
      );
    });
  });

  describe('post-commit side effects', () => {
    it('syncs Google coursework once per created row', async () => {
      await service.bulkAssign(currentUser, makeDto({ simulationIds: [WS_SIM, AI_SIM] }));
      await flushBackground();
      expect(googleCourseworkService.ensureCourseWorkForAssignment).toHaveBeenCalledTimes(4);
      expect(googleCourseworkService.ensureCourseWorkForAssignment).toHaveBeenCalledWith({
        classId: CLASS_A,
        schoolId: SCHOOL_ID,
        classSimulationId: 'cs-0',
        simulationId: WS_SIM,
        title: `Title ${WS_SIM}`,
        description: 'desc',
        dueDate: '2030-10-16',
      });
    });

    it('sends due-date reminders per row when the due date is inside the window', async () => {
      await service.bulkAssign(
        currentUser,
        makeDto({ startDate: localMmDdYyyy(1), dueDate: localMmDdYyyy(1), endDate: '12-31-2099' }),
      );
      await flushBackground();
      expect(notificationsGateway.notifyEducatorSimulationDueDateReminder).toHaveBeenCalledTimes(2);
      expect(notificationsGateway.notifyEducatorSimulationEndDateReminder).not.toHaveBeenCalled();
    });

    it('does not fail the request when a side effect rejects', async () => {
      googleCourseworkService.ensureCourseWorkForAssignment.mockRejectedValue(
        new Error('google down'),
      );
      educatorService.notifyIfSeatsBelowThreshold.mockRejectedValue(new Error('socket down'));

      await expect(
        service.bulkAssign(currentUser, makeDto({ simulationIds: [AI_SIM] })),
      ).resolves.toBeInstanceOf(ResponseResult);
      await flushBackground();
      expect(logger.warn).toHaveBeenCalled();
    });

    it('returns before the side effects finish, and runs at most 5 at a time', async () => {
      const ids = Array.from({ length: 10 }, (_, i) => `ws-${i}`);
      simulationRepo.findByBusinessIds.mockResolvedValue(ids.map((id) => sim(id, false)));
      let inFlight = 0;
      let maxInFlight = 0;
      const releases: Array<() => void> = [];
      googleCourseworkService.ensureCourseWorkForAssignment.mockImplementation(() => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        return new Promise<void>((resolve) =>
          releases.push(() => {
            inFlight -= 1;
            resolve();
          }),
        );
      });

      const result = await service.bulkAssign(currentUser, makeDto({ simulationIds: ids }));
      expect(result.data!.created).toBe(20); // responded while all coursework calls are pending

      // Release each wave as the pool picks it up (20 rows / 5 at a time = 4 waves).
      for (let wave = 0; wave < 10; wave += 1) {
        await flushBackground();
        releases.splice(0).forEach((release) => release());
      }
      await flushBackground();

      expect(googleCourseworkService.ensureCourseWorkForAssignment).toHaveBeenCalledTimes(20);
      expect(maxInFlight).toBe(ClassSimulationAssignmentConstants.BULK.SIDE_EFFECT_CONCURRENCY);
    });
  });

  describe('batching (review F2)', () => {
    it('looks all classes up in one query', async () => {
      await service.bulkAssign(currentUser, makeDto());
      expect(classRepo.findActiveByIdsWithSchoolForEducator).toHaveBeenCalledTimes(1);
      expect(classRepo.findActiveByIdsWithSchoolForEducator).toHaveBeenCalledWith(
        [CLASS_A, CLASS_B],
        EDUCATOR_ID,
      );
      expect(educatorSchoolRepo.findOne).not.toHaveBeenCalled();
    });

    it('counts used AI seats per class from the database', async () => {
      // An AI sim already in each class, so each per-class count reaches the reports.
      classSimulationRepo.find.mockResolvedValue([
        existingRow({ simulation_id: AI_SIM, is_ai: true }),
      ]);

      await service.bulkAssign(currentUser, makeDto({ simulationIds: [AI_SIM] }));

      expect(simulationReportRepo.findStudentIdsWhoUsedScenariosInClass).toHaveBeenCalledTimes(2);
      expect(studentRepo.count).toHaveBeenCalledTimes(2);
    });
  });

  describe('legacy assign() is unaffected by the bulk changes', () => {
    it('still reads reports itself and fires reminders + coursework without waiting', async () => {
      classRepo.findOne.mockResolvedValue({
        id: CLASS_A,
        class_name: 'Class A',
        school_id: SCHOOL_ID,
      });
      (simulationRepo as unknown as { findByBusinessId: jest.Mock }).findByBusinessId = jest
        .fn()
        .mockResolvedValue(sim(AI_SIM, true));
      classSimulationRepo.find.mockResolvedValue([]);
      classSimulationRepo.create.mockResolvedValue({ id: 'cs-legacy' });
      educatorService.updateToken.mockResolvedValue(undefined);
      // Existing AI assignment → the count reaches the reports.
      classSimulationRepo.find
        .mockResolvedValueOnce([]) // overlap check
        .mockResolvedValueOnce([existingRow({ simulation_id: AI_SIM, is_ai: true })]);

      const result = await service.assign(
        {
          class_id: CLASS_A,
          simulation_id: AI_SIM,
          start_date: localMmDdYyyy(1),
          due_date: localMmDdYyyy(1),
          end_date: localMmDdYyyy(1),
        },
        { id: EDUCATOR_ID, tokens: 100 } as never,
      );

      expect(result.success).toBe(true);
      expect(simulationReportRepo.findStudentIdsWhoUsedScenariosInClass).toHaveBeenCalledTimes(1);
      // Same as before the split: reminders and the coursework call happen during assign().
      expect(notificationsGateway.notifyEducatorSimulationDueDateReminder).toHaveBeenCalledTimes(1);
      expect(notificationsGateway.notifyEducatorSimulationStartDateReminder).toHaveBeenCalledTimes(
        1,
      );
      expect(notificationsGateway.notifyEducatorSimulationEndDateReminder).toHaveBeenCalledTimes(1);
      expect(googleCourseworkService.ensureCourseWorkForAssignment).toHaveBeenCalledWith(
        expect.objectContaining({
          classId: CLASS_A,
          classSimulationId: 'cs-legacy',
          simulationId: AI_SIM,
        }),
      );
    });
  });

  describe('id case (review F1)', () => {
    it('matches an uppercase class id against a stored lowercase assignment (422, nothing written)', async () => {
      classSimulationRepo.findActiveByClassIdsAndSimulationIds.mockResolvedValue([
        existingRow({
          class_id: CLASS_A,
          simulation_id: WS_SIM,
          start_date: '2030-09-01',
          end_date: '2030-12-15',
        }),
      ]);

      const error = await expectBulkFailure(makeDto({ classIds: [CLASS_A.toUpperCase()] }));

      expect(error.detail.results[0].reason).toBe(
        ClassSimulationAssignmentFailureReason.ALREADY_ASSIGNED_SAME_DATES,
      );
    });

    it('resolves an uppercase class id to its (lowercase) class', async () => {
      await expect(
        service.bulkAssign(currentUser, makeDto({ classIds: [CLASS_A.toUpperCase()] })),
      ).resolves.toBeInstanceOf(ResponseResult);
    });
  });

  describe('request-level refusals', () => {
    it('403s when the caller has no educator id', async () => {
      await expect(
        service.bulkAssign({ userId: 'admin-1' } as ICurrentUser, makeDto()),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('404s when the educator is missing or inactive', async () => {
      educatorRepo.findActiveTokenBalance.mockResolvedValue(null);
      await expect(service.bulkAssign(currentUser, makeDto())).rejects.toThrow(
        new NotFoundException(ERROR_MSG.DB.NOT_FOUND('Educator')),
      );
    });

    it('403s when the educator is not assigned to the school', async () => {
      educatorSchoolRepo.isEducatorAssignedToSchool.mockResolvedValue(false);
      await expect(service.bulkAssign(currentUser, makeDto())).rejects.toThrow(
        new ForbiddenException(ERROR_MSG.COMMON.FORBIDDEN),
      );
      expect(educatorSchoolRepo.isEducatorAssignedToSchool).toHaveBeenCalledWith(
        EDUCATOR_ID,
        SCHOOL_ID,
      );
    });

    it.each([
      ['due before start', { startDate: '10-17-2030' }, ['startDate', 'dueDate']],
      ['end before due', { endDate: '10-15-2030' }, ['dueDate', 'endDate']],
    ])('400s when %s', async (_label, dates, keys) => {
      await expect(service.bulkAssign(currentUser, makeDto(dates))).rejects.toThrow(
        new BadRequestException(ERROR_MSG.COMMON.INVALID_DATE_RANGE(keys[0], keys[1])),
      );
      expect(simulationRepo.findByBusinessIds).not.toHaveBeenCalled();
    });

    it('400s with required/available seats when the balance is short, writing nothing', async () => {
      educatorRepo.findActiveTokenBalance.mockResolvedValue(20);

      await expect(
        service.bulkAssign(currentUser, makeDto({ simulationIds: [AI_SIM] })),
      ).rejects.toThrow(
        new BadRequestException(CLASS_SIMULATION_MSG.BULK_ASSIGN.INSUFFICIENT_SEATS(24, 20)),
      );
      expect(classSimulationRepo.createManyAndChargeSeats).not.toHaveBeenCalled();
      expect(googleCourseworkService.ensureCourseWorkForAssignment).not.toHaveBeenCalled();
    });

    it("propagates the transaction's insufficient-seats refusal (concurrent spend)", async () => {
      const raced = new BadRequestException(
        CLASS_SIMULATION_MSG.BULK_ASSIGN.INSUFFICIENT_SEATS(24, 5),
      );
      classSimulationRepo.createManyAndChargeSeats.mockRejectedValue(raced);

      await expect(
        service.bulkAssign(currentUser, makeDto({ simulationIds: [AI_SIM] })),
      ).rejects.toBe(raced);
      expect(googleCourseworkService.ensureCourseWorkForAssignment).not.toHaveBeenCalled();
    });

    it('wraps an unexpected error in InternalServerErrorException', async () => {
      simulationRepo.findByBusinessIds.mockRejectedValue(new Error('connection reset'));
      await expect(service.bulkAssign(currentUser, makeDto())).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });
  });

  describe('per-pair failures (422, nothing written)', () => {
    it('refuses a class the educator cannot access, marking the other pairs VALID', async () => {
      classById.mockImplementation((id: string) =>
        id === CLASS_B ? null : { id, school_id: SCHOOL_ID, school: { is_active: true } },
      );

      const error = await expectBulkFailure(makeDto());

      expect(error.message).toBe(CLASS_SIMULATION_MSG.BULK_ASSIGN.FAILED(1, 2));
      expect(error.detail).toEqual({
        total: 2,
        failed: 1,
        results: [
          { classId: CLASS_A, simulationId: WS_SIM, status: ClassSimulationAssignmentStatus.VALID },
          {
            classId: CLASS_B,
            simulationId: WS_SIM,
            status: ClassSimulationAssignmentStatus.FAILED,
            reason: ClassSimulationAssignmentFailureReason.CLASS_NOT_ACCESSIBLE,
            message: CLASS_SIMULATION_MSG.BULK_ASSIGN.CLASS_NOT_ACCESSIBLE,
          },
        ],
      });
    });

    it.each([
      ['in another school', { school_id: OTHER_SCHOOL_ID, school: { is_active: true } }],
      ['with no school', { school_id: null, school: null }],
    ])('refuses a class %s', async (_label, classFields) => {
      classById.mockImplementation((id: string) =>
        id === CLASS_B
          ? { id, ...classFields }
          : { id, school_id: SCHOOL_ID, school: { is_active: true } },
      );

      const error = await expectBulkFailure(makeDto());
      expect(error.detail.results[1].reason).toBe(
        ClassSimulationAssignmentFailureReason.CLASS_NOT_ACCESSIBLE,
      );
    });

    it('refuses a class whose school is inactive', async () => {
      classById.mockReturnValue({
        id: CLASS_A,
        school_id: SCHOOL_ID,
        school: { is_active: false },
      });
      const error = await expectBulkFailure(makeDto({ classIds: [CLASS_A] }));
      expect(error.detail.results[0].reason).toBe(
        ClassSimulationAssignmentFailureReason.CLASS_NOT_ACCESSIBLE,
      );
    });

    it('refuses an unknown simulation', async () => {
      const error = await expectBulkFailure(
        makeDto({ classIds: [CLASS_A], simulationIds: [WS_SIM, 'missing-sim'] }),
      );
      expect(error.detail.results.map((r) => [r.simulationId, r.status, r.reason])).toEqual([
        [WS_SIM, ClassSimulationAssignmentStatus.VALID, undefined],
        [
          'missing-sim',
          ClassSimulationAssignmentStatus.FAILED,
          ClassSimulationAssignmentFailureReason.SIMULATION_NOT_FOUND,
        ],
      ]);
    });

    it('distinguishes same-dates from overlapping existing assignments', async () => {
      classSimulationRepo.findActiveByClassIdsAndSimulationIds.mockResolvedValue([
        existingRow({
          class_id: CLASS_A,
          simulation_id: WS_SIM,
          start_date: '09-01-2030', // legacy MM-DD-YYYY row
          end_date: '2030-12-15',
        }),
        existingRow({
          class_id: CLASS_B,
          simulation_id: WS_SIM,
          start_date: '2030-12-15',
          end_date: '2031-01-31',
        }),
      ]);

      const error = await expectBulkFailure(makeDto());

      expect(error.detail.results.map((r) => r.reason)).toEqual([
        ClassSimulationAssignmentFailureReason.ALREADY_ASSIGNED_SAME_DATES,
        ClassSimulationAssignmentFailureReason.ALREADY_ASSIGNED_OVERLAP,
      ]);
      expect(error.detail.results.map((r) => r.message)).toEqual([
        CLASS_SIMULATION_MSG.BULK_ASSIGN.ALREADY_ASSIGNED_SAME_DATES,
        CLASS_SIMULATION_MSG.BULK_ASSIGN.ALREADY_ASSIGNED_OVERLAP,
      ]);
    });

    it('turns a duplicate found inside the transaction (concurrent request) into a 422', async () => {
      // Pre-check saw nothing; a double-click/retry committed the same assignment before our lock.
      classSimulationRepo.createManyAndChargeSeats.mockResolvedValue({
        saved: [],
        conflicts: [
          existingRow({
            class_id: CLASS_B,
            simulation_id: AI_SIM,
            start_date: '2030-09-01',
            end_date: '2030-12-15',
          }),
        ],
        previousTokens: 0,
        newTokens: 0,
      });

      const error = await service
        .bulkAssign(currentUser, makeDto({ simulationIds: [AI_SIM] }))
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BulkOperationException);
      expect((error as BulkOperationException<IBulkAssignPairOutcome>).detail).toEqual({
        total: 2,
        failed: 1,
        results: [
          { classId: CLASS_A, simulationId: AI_SIM, status: ClassSimulationAssignmentStatus.VALID },
          {
            classId: CLASS_B,
            simulationId: AI_SIM,
            status: ClassSimulationAssignmentStatus.FAILED,
            reason: ClassSimulationAssignmentFailureReason.ALREADY_ASSIGNED_SAME_DATES,
            message: CLASS_SIMULATION_MSG.BULK_ASSIGN.ALREADY_ASSIGNED_SAME_DATES,
          },
        ],
      });
      expect(educatorService.notifyIfSeatsBelowThreshold).not.toHaveBeenCalled();
      expect(googleCourseworkService.ensureCourseWorkForAssignment).not.toHaveBeenCalled();
    });

    it('reports every failure, with the class check taking precedence', async () => {
      classById.mockImplementation((id: string) =>
        id === CLASS_B ? null : { id, school_id: SCHOOL_ID, school: { is_active: true } },
      );

      const error = await expectBulkFailure(makeDto({ simulationIds: [WS_SIM, 'missing-sim'] }));

      expect(error.detail.total).toBe(4);
      expect(error.detail.failed).toBe(3);
      expect(error.detail.results.map((r) => [r.classId, r.simulationId, r.reason])).toEqual([
        [CLASS_A, WS_SIM, undefined],
        [CLASS_A, 'missing-sim', ClassSimulationAssignmentFailureReason.SIMULATION_NOT_FOUND],
        [CLASS_B, WS_SIM, ClassSimulationAssignmentFailureReason.CLASS_NOT_ACCESSIBLE],
        [CLASS_B, 'missing-sim', ClassSimulationAssignmentFailureReason.CLASS_NOT_ACCESSIBLE],
      ]);
      expect(educatorService.notifyIfSeatsBelowThreshold).not.toHaveBeenCalled();
    });
  });
});

describe('ClassSimulationController.bulkAssign', () => {
  it('declares @RequiredRoles(Educator) only', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, ClassSimulationController.prototype.bulkAssign) as
      RoleSlug[] | undefined;
    expect(roles).toEqual([RoleSlug.EDUCATOR]);
  });

  it('delegates to the service and returns its result untouched', async () => {
    const expected = new ResponseResult({ message: 'ok', data: undefined });
    const bulkAssign = jest.fn().mockResolvedValue(expected);
    const controller = new ClassSimulationController(
      { bulkAssign } as unknown as ClassSimulationService,
      {} as never,
    );
    const dto = makeDto();

    const result = await controller.bulkAssign(currentUser, dto);

    expect(bulkAssign).toHaveBeenCalledWith(currentUser, dto);
    expect(result).toBe(expected);
  });
});
