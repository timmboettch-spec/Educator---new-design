import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { I18nService } from 'nestjs-i18n';
import { ClassSimulationController } from '../../../src/class-simulations/class-simulation.controller';
import { ClassSimulationService } from '../../../src/class-simulations/class-simulation.service';
import { ClassSimulation, Class } from 'src/database/entities';
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
import { EducatorsService } from 'src/educators/educators.service';
import { ClassSimulationConstants } from '../../../src/class-simulations/class-simulation.constant';
import { ClassConstants } from 'src/class/constants';
import { ErrorTypes } from 'src/common/utils/messages';
import { NotificationsGateway } from 'src/notifications/notifications.gateway';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from 'src/common/services';
import { GoogleCourseworkService } from 'src/google/google-coursework.service';

import { JwtRequest, MappedSimulation } from 'src/common/types';
import { ResponseResult } from 'src/common/class/response.class';
import { SUCCESS_MSG } from 'src/common/messages/success.message';
import { ERROR_MSG } from 'src/common/messages/error.message';
import { CommonStatus } from 'src/common/enums/status.enum';
import { Not } from 'typeorm';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  UpdateClassSimulationReqDto,
  UpdateClassSimulationResDto,
} from '../../../src/class-simulations/dto/update-class-simulation.dto';
import type { ICurrentUser } from 'src/common/interfaces';
import { QueryConstants, RoleSlug } from 'src/common/constants';

const CLASS_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SIM_ID = 'sim-001';
const RECORD_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

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

const mockMapped: MappedSimulation = {
  id: RECORD_ID,
  class_id: CLASS_ID,
  simulation_id: SIM_ID,
  start_date: '2025-01-01',
  due_date: '2025-06-01',
  end_date: '2025-06-30',
  created_at: mockRecord.created_at,
  updated_at: mockRecord.updated_at,
  simulation_title: 'Stroke Evaluation',
  unit_name: 'Emergency',
  unit_id: 'u-1',
  scenario_status: null,
  avatarEnabled: null,
  estimated_duration: null,
  difficulty: null,
  learner_level: null,
  purpose: null,
};

describe('ClassSimulations (Controller + Service)', () => {
  let controller: ClassSimulationController;
  let service: ClassSimulationService;

  const repo = {
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn(),
    deactivateIfActive: jest.fn().mockResolvedValue({ affected: 1 }),
    updateDatesIfActive: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const classRepo = { findOne: jest.fn(), findActiveByIdWithSchoolForEducator: jest.fn() };
  const educatorSchoolRepo = { findOne: jest.fn() };
  const simulationRepo = {
    findOne: jest.fn().mockResolvedValue({ id: SIM_ID }),
    findByBusinessId: jest
      .fn()
      .mockResolvedValue({ id: SIM_ID, unitId: 'u-1', title: 'Stroke Evaluation' }),
    find: jest.fn().mockResolvedValue([{ id: SIM_ID, unitId: 'u-1', title: 'Stroke Evaluation' }]),
    create: jest.fn(),
  };
  const studentRepo = { count: jest.fn().mockResolvedValue(0) };
  const simulationReportRepo = {
    findScenarioIdsUsedByStudent: jest.fn().mockResolvedValue([]),
    findStudentIdsWhoUsedScenariosInClass: jest.fn().mockResolvedValue([]),
  };

  // Units are read via UnitRepository (src/database/repositories/unit.repository.ts).
  const unitRepository = {
    find: jest.fn().mockResolvedValue([{ id: 'u-1', name: 'Emergency', category: 'Cardiology' }]),
    findByBusinessId: jest
      .fn()
      .mockResolvedValue({ id: 'u-1', name: 'Emergency', category: 'Cardiology' }),
  };

  /**
   * Default raw-SQL behaviour for `DatabaseService#connection.query`, branched by SQL
   * content so call order (sync-simulation checks vs. AI-category lookups) never matters.
   * Tests that need AI-category rows pass them in; everything else resolves to "not found".
   */
  function setupDataSourceQuery(categoryRows: Array<{ category: string }> = []): void {
    dataSource.connection.query.mockImplementation((sql: string) => {
      if (sql.includes('SELECT category FROM simulation_library')) {
        return Promise.resolve(categoryRows);
      }
      if (sql.includes('SELECT 1 FROM simulation_library')) {
        return Promise.resolve([{ '1': 1 }]);
      }
      // Handle new countStudentsWhoHaveNotUsedAiInClass queries
      if (sql.includes('SELECT DISTINCT sr.student_id')) {
        return Promise.resolve([]);
      }
      if (sql.includes('SELECT id FROM students WHERE student_id = ANY')) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });
  }

  const dataSource = {
    connection: {
      query: jest.fn(),
    },
  };
  const notificationsGateway = {
    notifySimulationAssigned: jest.fn(),
    notifyAdminSimulationAssigned: jest.fn(),
    notifyEducatorSimulationDueDateReminder: jest.fn(),
  };
  const configService = { get: jest.fn().mockReturnValue('3') };
  const mockReq = {
    user: { userId: 'educator-1', educatorId: 'educator-1', roles: [RoleSlug.EDUCATOR] },
  } as JwtRequest;
  const mockEducator = { id: 'educator-1', tokens: 10, role: { role_name: 'Educator' } } as never;
  const educatorService = {
    availableTokens: jest.fn().mockResolvedValue(10),
    findById: jest.fn().mockResolvedValue({ data: { id: 'educator-1', tokens: 10 } }),
    updateToken: jest.fn().mockResolvedValue(undefined),
    releaseTokens: jest.fn().mockResolvedValue(undefined),
  };
  const googleCourseworkService = {
    ensureCourseWorkForAssignment: jest.fn().mockResolvedValue(undefined),
    deleteCourseWorkForAssignment: jest.fn().mockResolvedValue(undefined),
    syncCourseWorkForClass: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    setupDataSourceQuery();
    simulationReportRepo.findScenarioIdsUsedByStudent.mockResolvedValue([]);
    simulationReportRepo.findStudentIdsWhoUsedScenariosInClass.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClassSimulationController],
      providers: [
        ClassSimulationService,
        { provide: CLASS_SIMULATION_REPOSITORY, useValue: repo },
        { provide: CLASS_REPOSITORY, useValue: classRepo },
        { provide: EDUCATOR_SCHOOL_REPOSITORY, useValue: educatorSchoolRepo },
        { provide: EDUCATOR_REPOSITORY, useValue: { findActiveTokenBalance: jest.fn() } },
        { provide: SIMULATION_V2_REPOSITORY, useValue: simulationRepo },
        { provide: STUDENT_REPOSITORY, useValue: studentRepo },
        { provide: UNIT_REPOSITORY, useValue: unitRepository },
        { provide: DatabaseService, useValue: dataSource },
        { provide: SIMULATION_REPORT_REPOSITORY, useValue: simulationReportRepo },
        { provide: EducatorsService, useValue: educatorService },
        { provide: NotificationsGateway, useValue: notificationsGateway },
        { provide: ConfigService, useValue: configService },
        { provide: GoogleCourseworkService, useValue: googleCourseworkService },
        { provide: I18nService, useValue: { t: jest.fn((key: string) => key) } },
        {
          provide: LoggerService,
          useValue: {
            log: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
            verbose: jest.fn(),
            fatal: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(ClassSimulationController);
    service = module.get(ClassSimulationService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('assign', () => {
    const dto = {
      class_id: CLASS_ID,
      simulation_id: SIM_ID,
      start_date: '2025-01-01',
      due_date: '2025-06-01',
      end_date: '2025-06-30',
    };

    it('UNIT: assigns simulation to class successfully', async () => {
      classRepo.findOne.mockResolvedValue({ id: CLASS_ID, is_active: true });
      repo.findOne.mockResolvedValue(null);
      repo.create.mockResolvedValue(mockRecord);

      const result = await service.assign(dto, mockEducator);
      expect(result.success).toBe(true);
      expect(result.message).toBe(ClassSimulationConstants.MESSAGES.ASSIGNED);
    });

    it('UNIT: fails when class not found', async () => {
      classRepo.findOne.mockResolvedValue(null);
      const result = await service.assign(dto, mockEducator);
      expect(result.success).toBe(false);
      expect(result.message).toBe(ClassSimulationConstants.MESSAGES.CLASS_NOT_FOUND);
    });

    it('UNIT: fails when simulation not found', async () => {
      classRepo.findOne.mockResolvedValue({ id: CLASS_ID, is_active: true });
      simulationRepo.findByBusinessId.mockResolvedValueOnce(null);
      repo.findOne.mockResolvedValue(null);
      repo.create.mockResolvedValue(mockRecord);
      const result = await service.assign(dto, mockEducator);
      expect(result.success).toBe(false);
      expect(result.message).toBe(
        'Simulation could not be synced to the database for this assignment. Check unit mapping in simulation_library.',
      );
    });

    it('UNIT: fails when already assigned', async () => {
      classRepo.findOne.mockResolvedValue({ id: CLASS_ID, is_active: true });
      repo.find.mockResolvedValue([mockRecord]);
      const result = await service.assign(dto, mockEducator);
      expect(result.success).toBe(false);
      expect(result.message).toBe(ClassSimulationConstants.MESSAGES.ALREADY_ASSIGNED_SAME_DATES);
    });

    it('UNIT: blocks an assignment whose dates overlap an existing assignment', async () => {
      classRepo.findOne.mockResolvedValue({ id: CLASS_ID, is_active: true });
      repo.find.mockResolvedValue([mockRecord]);

      const result = await service.assign(
        { ...dto, start_date: '2025-06-15', due_date: '2025-06-16', end_date: '2025-06-20' },
        mockEducator,
      );

      expect(result).toMatchObject({ success: false, type: ErrorTypes.CONFLICT });
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('UNIT: allows the same simulation when its date range does not overlap', async () => {
      classRepo.findOne.mockResolvedValue({ id: CLASS_ID, is_active: true });
      repo.find.mockResolvedValue([mockRecord]);
      repo.create.mockResolvedValue(mockRecord);

      const result = await service.assign(
        { ...dto, start_date: '2025-07-01', due_date: '2025-07-10', end_date: '2025-07-30' },
        mockEducator,
      );

      expect(result.success).toBe(true);
    });

    it('UNIT: returns a conflict when the database rejects an overlapping assignment', async () => {
      classRepo.findOne.mockResolvedValue({ id: CLASS_ID, is_active: true });
      repo.find.mockResolvedValue([]);
      repo.create.mockRejectedValue({ code: '23P01' });

      const result = await service.assign({ ...dto, end_date: '2025-06-30' }, mockEducator);

      expect(result).toMatchObject({ success: false, type: ErrorTypes.CONFLICT });
    });

    it('UNIT: validates AI seats using simulation_library category rows', async () => {
      classRepo.findOne.mockResolvedValue({ id: CLASS_ID, is_active: true });
      repo.findOne.mockResolvedValue(null);
      repo.find.mockResolvedValue([]);
      setupDataSourceQuery([{ category: 'Cardiology' }, { category: 'AI Simulations' }]);
      studentRepo.count.mockResolvedValueOnce(3);

      const result = await service.assign(dto, {
        id: 'educator-1',
        tokens: 2,
        role: { role_name: 'Educator' },
      } as never);

      expect(result.success).toBe(false);
      expect(result.message).toBe(ClassConstants.VALIDATION.INSUFFICIENT_TOKENS);
      expect(educatorService.updateToken).not.toHaveBeenCalled();
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('UNIT: reduces tokens by active students for AI simulation assignment', async () => {
      classRepo.findOne.mockResolvedValue({ id: CLASS_ID, is_active: true });
      repo.findOne.mockResolvedValue(null);
      repo.find.mockResolvedValue([]);
      repo.create.mockResolvedValue(mockRecord);
      setupDataSourceQuery([{ category: 'AI Simulations' }]);
      studentRepo.count.mockResolvedValueOnce(4);

      const result = await service.assign(dto, {
        id: 'educator-1',
        tokens: 10,
        role: { role_name: 'Educator' },
      } as never);

      expect(result.success).toBe(true);
      expect(educatorService.updateToken).toHaveBeenCalledWith('educator-1', 4);
    });

    it('FIX: does not double-charge students who already consumed AI seat from previous assignment', async () => {
      classRepo.findOne.mockResolvedValue({ id: CLASS_ID, is_active: true });
      repo.findOne.mockResolvedValue(null);
      repo.create.mockResolvedValue(mockRecord);
      setupDataSourceQuery([{ category: 'AI Simulations' }]);

      // Scenario: 5 total students, but 1 has already used an AI sim from a previous assignment
      studentRepo.count.mockResolvedValueOnce(5);
      repo.find
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ simulation_id: 'old-sim-id', is_ai: true }]);
      // 1 student has an Attempt at the old AI sim
      simulationReportRepo.findStudentIdsWhoUsedScenariosInClass.mockResolvedValue([
        'student-uuid-1',
      ]);

      const result = await service.assign(dto, {
        id: 'educator-1',
        tokens: 10,
        role: { role_name: 'Educator' },
      } as never);

      // Should only charge 4 seats (5 total - 1 who already consumed a seat)
      expect(result.success).toBe(true);
      expect(educatorService.updateToken).toHaveBeenCalledWith('educator-1', 4);
    });

    it('INTEGRATION: POST /class-simulations — assigns successfully', async () => {
      jest.spyOn(service, 'assign').mockResolvedValue({
        success: true,
        message: ClassSimulationConstants.MESSAGES.ASSIGNED,
        data: mockRecord,
      });
      const result = await controller.assign(dto, mockReq);
      expect(result.status).toBe('SUCCESS');
    });

    it('INTEGRATION: throws when class not found', async () => {
      jest.spyOn(service, 'assign').mockResolvedValue({
        success: false,
        message: ClassSimulationConstants.MESSAGES.CLASS_NOT_FOUND,
        type: 'notfound',
      });
      await expect(controller.assign(dto, mockReq)).rejects.toThrow();
    });

    it('INTEGRATION: throws when already assigned', async () => {
      jest.spyOn(service, 'assign').mockResolvedValue({
        success: false,
        message: ClassSimulationConstants.MESSAGES.ALREADY_ASSIGNED,
        type: 'bad_request',
      });
      await expect(controller.assign(dto, mockReq)).rejects.toThrow();
    });
  });

  describe('findByClass', () => {
    it('UNIT: returns simulations for a class', async () => {
      repo.find.mockResolvedValue([mockRecord]);
      const result = await service.findByClass(CLASS_ID);
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data![0].simulation_title).toBe('Stroke Evaluation');
    });

    it('UNIT: returns empty array when no simulations', async () => {
      repo.find.mockResolvedValue([]);
      const result = await service.findByClass(CLASS_ID);
      expect(result.data).toHaveLength(0);
    });

    it('INTEGRATION: GET /class-simulations/class/:class_id', async () => {
      jest.spyOn(service, 'findByClass').mockResolvedValue({
        success: true,
        message: ClassSimulationConstants.MESSAGES.BY_CLASS_FETCHED,
        data: [mockMapped],
      });
      const result = await controller.findByClass(CLASS_ID);
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('REGRESSION: maps simulation_title and unit_name correctly', async () => {
      repo.find.mockResolvedValue([mockRecord]);
      const result = await service.findByClass(CLASS_ID);
      expect(result.data![0].unit_name).toBe('Emergency');
    });

    it('UNIT: maps picker metadata and nulls blank values', async () => {
      repo.find.mockResolvedValue([mockRecord]);
      simulationRepo.find.mockResolvedValueOnce([
        {
          id: SIM_ID,
          unitId: 'u-1',
          title: 'Stroke Evaluation',
          estimatedDuration: '12 min',
          difficulty: 'Medium',
          learnerLevel: '  ',
          studentBriefing: { purpose: 'Assess stroke onset' },
        },
      ]);
      const result = await service.findByClass(CLASS_ID);
      expect(result.data![0]).toMatchObject({
        estimated_duration: '12 min',
        difficulty: 'Medium',
        learner_level: null,
        purpose: 'Assess stroke onset',
      });
    });
  });

  describe('findByClassActive', () => {
    it('UNIT: returns only active simulations within 7-day window', async () => {
      const now = new Date();
      const start = new Date(now);
      start.setDate(now.getDate() - 1);
      const due = new Date(now);
      due.setDate(now.getDate() + 3);

      const activeRecord = {
        ...mockRecord,
        start_date: start.toISOString(),
        due_date: due.toISOString(),
      };
      repo.find.mockResolvedValue([activeRecord]);

      const result = await service.findByClassActive(CLASS_ID);
      expect(result.success).toBe(true);
      expect(result.data!.length).toBeGreaterThan(0);
    });

    it('UNIT: excludes simulations outside the 7-day window', async () => {
      const past = { ...mockRecord, start_date: '2020-01-01', due_date: '2020-01-10' };
      repo.find.mockResolvedValue([past]);

      const result = await service.findByClassActive(CLASS_ID);
      expect(result.data).toHaveLength(0);
    });

    it('UNIT: excludes simulations with null dates', async () => {
      const noDate = { ...mockRecord, start_date: undefined, due_date: undefined };
      repo.find.mockResolvedValue([noDate]);

      const result = await service.findByClassActive(CLASS_ID);
      expect(result.data).toHaveLength(0);
    });
  });

  describe('findBySimulation', () => {
    it('UNIT: returns classes for a simulation', async () => {
      repo.find.mockResolvedValue([mockRecord]);
      const result = await service.findBySimulation(SIM_ID);
      expect(result.success).toBe(true);
      expect(result.data![0].simulation_id).toBe(SIM_ID);
    });

    it('INTEGRATION: GET /class-simulations/simulation/:simulation_id', async () => {
      jest.spyOn(service, 'findBySimulation').mockResolvedValue({
        success: true,
        message: ClassSimulationConstants.MESSAGES.BY_SIMULATION_FETCHED,
        data: [mockMapped],
      });
      const result = await controller.findBySimulation(SIM_ID);
      expect(result.status).toBe('SUCCESS');
    });
  });

  describe('update', () => {
    const currentUser = {
      userId: 'user-1',
      educatorId: 'educator-1',
      roles: [RoleSlug.EDUCATOR],
    } as ICurrentUser;
    // School-less class: findAccessibleClassForEducator accepts it without the school lookup.
    const mockClass = {
      id: CLASS_ID,
      class_name: 'Nursing 101',
      educator_id: 'educator-1',
      school_id: null,
    };
    const localMmDdYyyy = (date: Date): string => {
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      return `${mm}-${dd}-${date.getFullYear()}`;
    };

    beforeEach(() => {
      repo.findOne.mockResolvedValue({ ...mockRecord });
      repo.find.mockResolvedValue([]);
      repo.updateDatesIfActive.mockResolvedValue({ affected: 1 });
      classRepo.findActiveByIdWithSchoolForEducator.mockResolvedValue(mockClass);
      educatorSchoolRepo.findOne.mockResolvedValue({ id: 'assignment-1' });
    });

    it('UNIT: applies only the provided dates and returns a ResponseResult', async () => {
      const result = await service.update(currentUser, RECORD_ID, { dueDate: '2025-07-01' });

      expect(repo.updateDatesIfActive).toHaveBeenCalledWith(RECORD_ID, {
        start_date: mockRecord.start_date,
        due_date: '2025-07-01',
        end_date: mockRecord.end_date,
      });
      expect(result.message).toBe(SUCCESS_MSG.COMMON.UPDATED('Class simulation'));
      expect(result.data).toEqual({
        id: RECORD_ID,
        classId: CLASS_ID,
        simulationId: SIM_ID,
        startDate: mockRecord.start_date,
        dueDate: '2025-07-01',
        endDate: mockRecord.end_date,
      });
    });

    it('UNIT: applies all three dates when provided', async () => {
      const result = await service.update(currentUser, RECORD_ID, {
        startDate: '2025-02-01',
        dueDate: '2025-07-01',
        endDate: '2025-08-01',
      });

      expect(result.data).toMatchObject({
        startDate: '2025-02-01',
        dueDate: '2025-07-01',
        endDate: '2025-08-01',
      });
    });

    it('UNIT: writes only the date columns and never saves the full entity', async () => {
      await service.update(currentUser, RECORD_ID, { dueDate: '2025-07-01' });

      const [, dates] = repo.updateDatesIfActive.mock.calls[0] as [string, object];
      expect(Object.keys(dates).sort()).toEqual(['due_date', 'end_date', 'start_date']);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('UNIT: looks the record up by id restricted to active rows', async () => {
      await service.update(currentUser, RECORD_ID, { dueDate: '2025-07-01' });

      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: RECORD_ID, is_active: true } });
    });

    it('UNIT: throws NotFound and writes nothing when the record does not exist', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.update(currentUser, RECORD_ID, { dueDate: '2025-07-01' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.updateDatesIfActive).not.toHaveBeenCalled();
    });

    it('UNIT: throws NotFound and sends no reminder when the row is removed before the write', async () => {
      repo.updateDatesIfActive.mockResolvedValue({ affected: 0 });

      const attempt = service.update(currentUser, RECORD_ID, {
        dueDate: localMmDdYyyy(new Date()),
      });

      await expect(attempt).rejects.toBeInstanceOf(NotFoundException);
      await expect(attempt).rejects.toMatchObject({
        response: { message: ERROR_MSG.DB.NOT_FOUND('Class simulation') },
      });
      expect(notificationsGateway.notifyEducatorSimulationDueDateReminder).not.toHaveBeenCalled();
    });

    it('UNIT: checks access through the class, as owner or co-instructor', async () => {
      await service.update(currentUser, RECORD_ID, { dueDate: '2025-07-01' });

      expect(classRepo.findActiveByIdWithSchoolForEducator).toHaveBeenCalledWith(
        CLASS_ID,
        'educator-1',
      );
    });

    it('UNIT: lets a co-instructor update a class someone else owns', async () => {
      classRepo.findActiveByIdWithSchoolForEducator.mockResolvedValue({
        ...mockClass,
        educator_id: 'owner-educator',
      });

      const result = await service.update(currentUser, RECORD_ID, { dueDate: '2025-07-01' });

      expect(repo.updateDatesIfActive).toHaveBeenCalledTimes(1);
      expect(result.data).toMatchObject({ dueDate: '2025-07-01' });
    });

    it.each([
      ['the caller neither owns nor co-instructs the class', null, { id: 'assignment-1' }],
      [
        "the class's school is inactive",
        { ...mockClass, school_id: 'school-1', school: { is_active: false } },
        { id: 'assignment-1' },
      ],
      [
        "the caller is no longer assigned to the class's school",
        { ...mockClass, school_id: 'school-1', school: { is_active: true } },
        null,
      ],
    ])(
      'UNIT: throws NotFound and writes nothing when %s',
      async (_label, accessibleClass, schoolAssignment) => {
        classRepo.findActiveByIdWithSchoolForEducator.mockResolvedValue(accessibleClass);
        educatorSchoolRepo.findOne.mockResolvedValue(schoolAssignment);

        const attempt = service.update(currentUser, RECORD_ID, { dueDate: '2025-07-01' });

        await expect(attempt).rejects.toBeInstanceOf(NotFoundException);
        await expect(attempt).rejects.toMatchObject({
          response: { message: ERROR_MSG.DB.NOT_FOUND('Class') },
        });
        expect(repo.updateDatesIfActive).not.toHaveBeenCalled();
      },
    );

    it('UNIT: throws Forbidden before any lookup when the token carries no educatorId', async () => {
      const adminUser = { userId: 'user-2', roles: [RoleSlug.DISTRICT_ADMIN] } as ICurrentUser;

      await expect(
        service.update(adminUser, RECORD_ID, { dueDate: '2025-07-01' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.findOne).not.toHaveBeenCalled();
      expect(repo.updateDatesIfActive).not.toHaveBeenCalled();
    });

    it.each([
      ['MM-DD-YYYY', '07-15-2025', '2025-07-15'],
      ['ISO date-time', '2025-07-15T10:30:00.000Z', '2025-07-15'],
      ['YYYY-MM-DD', '2025-07-15', '2025-07-15'],
    ])('UNIT: stores a %s date as YYYY-MM-DD', async (_label, input, stored) => {
      const result = await service.update(currentUser, RECORD_ID, {
        startDate: input,
        dueDate: input,
        endDate: input,
      });

      expect(repo.updateDatesIfActive).toHaveBeenCalledWith(RECORD_ID, {
        start_date: stored,
        due_date: stored,
        end_date: stored,
      });
      expect(result.data).toMatchObject({ startDate: stored, dueDate: stored, endDate: stored });
    });

    it('UNIT: normalises legacy stored dates that the request did not send', async () => {
      repo.findOne.mockResolvedValue({
        ...mockRecord,
        start_date: '01-15-2025',
        end_date: '2025-06-30T00:00:00.000Z',
      });

      const result = await service.update(currentUser, RECORD_ID, { dueDate: '2025-06-01' });

      expect(repo.updateDatesIfActive).toHaveBeenCalledWith(RECORD_ID, {
        start_date: '2025-01-15',
        due_date: '2025-06-01',
        end_date: '2025-06-30',
      });
      expect(result.data).toMatchObject({ startDate: '2025-01-15', endDate: '2025-06-30' });
    });

    it('UNIT: keeps a stored date that cannot be parsed as-is', async () => {
      repo.findOne.mockResolvedValue({ ...mockRecord, start_date: 'not-a-date' });

      await service.update(currentUser, RECORD_ID, { dueDate: '2025-06-01' });

      expect(repo.updateDatesIfActive).toHaveBeenCalledWith(
        RECORD_ID,
        expect.objectContaining({ start_date: 'not-a-date' }),
      );
    });

    it('UNIT: checks overlap only against other active assignments of the same class+simulation', async () => {
      await service.update(currentUser, RECORD_ID, { endDate: '2025-07-15' });

      expect(repo.find).toHaveBeenCalledWith({
        where: {
          id: Not(RECORD_ID),
          class_id: CLASS_ID,
          simulation_id: SIM_ID,
          is_active: true,
        },
      });
    });

    it.each([
      ['overlaps the start', { start_date: '2024-12-01', end_date: '2025-01-05' }],
      ['overlaps the end', { start_date: '2025-06-30', end_date: '2025-07-31' }],
      ['sits inside the range', { start_date: '2025-03-01', end_date: '2025-03-10' }],
      ['is stored as MM-DD-YYYY', { start_date: '03-01-2025', end_date: '03-10-2025' }],
    ])(
      'UNIT: throws Conflict and writes nothing when a sibling assignment %s',
      async (_label, siblingDates) => {
        repo.find.mockResolvedValue([{ ...mockRecord, id: 'sibling-1', ...siblingDates }]);

        const attempt = service.update(currentUser, RECORD_ID, { dueDate: '2025-06-15' });

        await expect(attempt).rejects.toBeInstanceOf(ConflictException);
        await expect(attempt).rejects.toMatchObject({
          response: { message: ERROR_MSG.CLASS_SIMULATION.OVERLAPPING_ASSIGNMENT },
        });
        expect(repo.updateDatesIfActive).not.toHaveBeenCalled();
      },
    );

    it('UNIT: allows the update when sibling assignments do not overlap', async () => {
      repo.find.mockResolvedValue([
        { ...mockRecord, id: 'sibling-1', start_date: '2025-07-01', end_date: '2025-07-31' },
        { ...mockRecord, id: 'sibling-2', start_date: undefined, end_date: undefined },
      ]);

      await service.update(currentUser, RECORD_ID, { endDate: '2025-06-30' });

      expect(repo.updateDatesIfActive).toHaveBeenCalledTimes(1);
    });

    it('UNIT: skips the overlap lookup when the merged range is open-ended', async () => {
      repo.findOne.mockResolvedValue({ ...mockRecord, end_date: undefined });

      await service.update(currentUser, RECORD_ID, { dueDate: '2025-07-01' });

      expect(repo.find).not.toHaveBeenCalled();
      expect(repo.updateDatesIfActive).toHaveBeenCalledTimes(1);
    });

    it.each([CommonStatus.ARCHIEVED, CommonStatus.ARCHIVED])(
      'UNIT: throws Conflict with the archived message when the class status is %s',
      async (status) => {
        classRepo.findActiveByIdWithSchoolForEducator.mockResolvedValue({ ...mockClass, status });

        const attempt = service.update(currentUser, RECORD_ID, { dueDate: '2025-07-01' });

        await expect(attempt).rejects.toBeInstanceOf(ConflictException);
        await expect(attempt).rejects.toMatchObject({
          response: { message: ERROR_MSG.CLASS.ARCHIVED },
        });
      },
    );

    it('UNIT: writes nothing and sends no reminder when the class is archived', async () => {
      classRepo.findActiveByIdWithSchoolForEducator.mockResolvedValue({
        ...mockClass,
        status: CommonStatus.ARCHIEVED,
      });

      await expect(
        service.update(currentUser, RECORD_ID, { dueDate: localMmDdYyyy(new Date()) }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(repo.updateDatesIfActive).not.toHaveBeenCalled();
      expect(notificationsGateway.notifyEducatorSimulationDueDateReminder).not.toHaveBeenCalled();
    });

    it.each([CommonStatus.ACTIVE, CommonStatus.INACTIVE, CommonStatus.DRAFT])(
      'UNIT: still updates when the class status is %s',
      async (status) => {
        classRepo.findActiveByIdWithSchoolForEducator.mockResolvedValue({ ...mockClass, status });

        const result = await service.update(currentUser, RECORD_ID, { dueDate: '2025-07-01' });

        expect(repo.updateDatesIfActive).toHaveBeenCalledTimes(1);
        expect(result.message).toBe(SUCCESS_MSG.COMMON.UPDATED('Class simulation'));
      },
    );

    it('UNIT: wraps an unexpected repository error as a 500', async () => {
      repo.updateDatesIfActive.mockRejectedValue(new Error('db down'));

      await expect(
        service.update(currentUser, RECORD_ID, { dueDate: '2025-07-01' }),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    it('UNIT: sends the due-date reminder when the saved due date is inside the window', async () => {
      await service.update(currentUser, RECORD_ID, { dueDate: localMmDdYyyy(new Date()) });

      expect(notificationsGateway.notifyEducatorSimulationDueDateReminder).toHaveBeenCalledTimes(1);
      expect(notificationsGateway.notifyEducatorSimulationDueDateReminder).toHaveBeenCalledWith(
        'educator-1',
        SIM_ID,
        expect.any(String),
        CLASS_ID,
        'Nursing 101',
        expect.any(String),
      );
    });

    it("UNIT: sends a co-instructor's due-date change reminder to the class owner", async () => {
      classRepo.findActiveByIdWithSchoolForEducator.mockResolvedValue({
        ...mockClass,
        educator_id: 'owner-educator',
      });

      await service.update(currentUser, RECORD_ID, { dueDate: localMmDdYyyy(new Date()) });

      expect(notificationsGateway.notifyEducatorSimulationDueDateReminder).toHaveBeenCalledWith(
        'owner-educator',
        SIM_ID,
        expect.any(String),
        CLASS_ID,
        'Nursing 101',
        expect.any(String),
      );
    });

    it('UNIT: sends no reminder when the class has no owner educator', async () => {
      classRepo.findActiveByIdWithSchoolForEducator.mockResolvedValue({
        ...mockClass,
        educator_id: null,
      });

      await service.update(currentUser, RECORD_ID, { dueDate: localMmDdYyyy(new Date()) });

      expect(repo.updateDatesIfActive).toHaveBeenCalledTimes(1);
      expect(notificationsGateway.notifyEducatorSimulationDueDateReminder).not.toHaveBeenCalled();
    });

    it('UNIT: does not send the reminder when the due date is outside the window', async () => {
      await service.update(currentUser, RECORD_ID, { dueDate: '01-01-2000' });

      expect(notificationsGateway.notifyEducatorSimulationDueDateReminder).not.toHaveBeenCalled();
    });

    it('UNIT: does not re-send the reminder when only the start date changes', async () => {
      const inWindowDue = localMmDdYyyy(new Date());
      repo.findOne.mockResolvedValue({ ...mockRecord, due_date: inWindowDue });

      await service.update(currentUser, RECORD_ID, { startDate: '2025-01-02' });

      expect(repo.updateDatesIfActive).toHaveBeenCalledTimes(1);
      expect(notificationsGateway.notifyEducatorSimulationDueDateReminder).not.toHaveBeenCalled();
    });

    it('UNIT: does not re-send the reminder when the due date is resent unchanged', async () => {
      const inWindowDue = localMmDdYyyy(new Date());
      repo.findOne.mockResolvedValue({ ...mockRecord, due_date: inWindowDue });

      await service.update(currentUser, RECORD_ID, { dueDate: inWindowDue });

      expect(notificationsGateway.notifyEducatorSimulationDueDateReminder).not.toHaveBeenCalled();
    });

    it('UNIT: does not send the reminder when the update is rejected for overlap', async () => {
      repo.find.mockResolvedValue([{ ...mockRecord, id: 'sibling-1' }]);

      await expect(
        service.update(currentUser, RECORD_ID, { dueDate: localMmDdYyyy(new Date()) }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(notificationsGateway.notifyEducatorSimulationDueDateReminder).not.toHaveBeenCalled();
    });

    it('UNIT: controller passes currentUser, id and the whole dto straight to the service', async () => {
      const serviceResult = new ResponseResult<UpdateClassSimulationResDto>({ message: 'ok' });
      const spy = jest.spyOn(service, 'update').mockResolvedValue(serviceResult);
      const dto = { dueDate: '2025-07-01' };

      const result = await controller.update(currentUser, RECORD_ID, dto);

      expect(spy).toHaveBeenCalledWith(currentUser, RECORD_ID, dto);
      expect(result).toBe(serviceResult);
    });
  });

  describe('UpdateClassSimulationReqDto validation', () => {
    const errorsFor = async (body: Record<string, unknown>): Promise<string[]> => {
      const errors = await validate(plainToInstance(UpdateClassSimulationReqDto, body));
      return errors.map((error) => error.property);
    };

    it.each([
      '2026-01-15',
      '01-15-2026',
      '2026-02-28T10:30',
      '2026-01-15T10:30:00Z',
      '2026-01-15T10:30:00.123+05:30',
      '2028-02-29',
    ])('UNIT: accepts %s', async (value) => {
      expect(await errorsFor({ startDate: value, dueDate: value, endDate: value })).toEqual([]);
    });

    it.each([
      '2026-02-30',
      '02-30-2026',
      '2026-13-01',
      '13-01-2026',
      '2027-02-29',
      '2026-01-01Tgarbage',
      '2026-01-15T25:00',
      '2026/01/15',
      'tomorrow',
    ])('UNIT: rejects %s', async (value) => {
      expect(await errorsFor({ dueDate: value })).toEqual(['dueDate']);
    });

    it('UNIT: rejects a non-string value', async () => {
      expect(await errorsFor({ endDate: 20260115 })).toEqual(['endDate']);
    });

    it('UNIT: allows every date to be omitted', async () => {
      expect(await errorsFor({})).toEqual([]);
    });
  });

  describe('remove', () => {
    function setupAiRemove(totalStudents: number, dbUsed: number): void {
      repo.findOne.mockResolvedValue({ ...mockRecord, is_ai: true });
      // Return the single AI sim so calculateRefundableSeats sees it as the last one
      repo.find.mockResolvedValue([{ ...mockRecord, is_ai: true }]);
      repo.deactivateIfActive.mockResolvedValue({ affected: 1 });
      classRepo.findOne.mockResolvedValue({
        id: 'class-1',
        educator_id: 'educator-1',
        educator: { id: 'educator-1' },
      });
      studentRepo.count.mockResolvedValue(totalStudents);
      simulationReportRepo.findStudentIdsWhoUsedScenariosInClass.mockResolvedValue(
        Array.from({ length: dbUsed }, (_, i) => `student-uuid-${i}`),
      );
    }

    function setupNonAiRemove(): void {
      repo.findOne.mockResolvedValue({ ...mockRecord, is_ai: false });
      repo.deactivateIfActive.mockResolvedValue({ affected: 1 });
      classRepo.findOne.mockResolvedValue({
        id: 'class-1',
        educator_id: 'educator-1',
        educator: { id: 'educator-1' },
      });
    }

    it('UNIT: removes record successfully (non-AI simulation)', async () => {
      setupNonAiRemove();
      const result = await service.remove(RECORD_ID, 'educator-1');
      expect(result.success).toBe(true);
      expect(result.message).toBe(ClassSimulationConstants.MESSAGES.REMOVED);
    });

    it('UNIT: fails when record not found', async () => {
      repo.findOne.mockResolvedValue(null);
      const result = await service.remove('bad-id', 'educator-1');
      expect(result.success).toBe(false);
    });

    it('REGRESSION: remove marks simulation inactive via deactivateIfActive', async () => {
      setupNonAiRemove();
      await service.remove(RECORD_ID, 'educator-1');
      expect(repo.deactivateIfActive).toHaveBeenCalledWith(RECORD_ID);
    });

    it('UNIT: non-AI simulation removal does not refund any seats', async () => {
      setupNonAiRemove();
      await service.remove(RECORD_ID, 'educator-1');
      expect(educatorService.releaseTokens).not.toHaveBeenCalled();
    });

    it('INTEGRATION: DELETE /class-simulations/:id — removes successfully', async () => {
      jest.spyOn(service, 'remove').mockResolvedValue({
        success: true,
        message: ClassSimulationConstants.MESSAGES.REMOVED,
        data: null,
      });
      const result = await controller.remove(RECORD_ID, mockReq);
      expect(result.data).toBeNull();
    });

    it('INTEGRATION: throws when record not found', async () => {
      jest.spyOn(service, 'remove').mockResolvedValue({
        success: false,
        message: ClassSimulationConstants.MESSAGES.NOT_FOUND,
        type: 'notfound',
      });
      await expect(controller.remove('bad-id', mockReq)).rejects.toThrow();
    });

    it.each([
      [20, 0, 20],
      [20, 1, 19],
      [20, 5, 15],
      [20, 10, 10],
      [20, 19, 1],
      [20, 20, 0],
    ])(
      'UNIT: AI simulation — %i students / %i used → %i seats refunded',
      async (total, used, expected) => {
        setupAiRemove(total, used);
        await service.remove(RECORD_ID, 'educator-1');
        if (expected > 0) {
          expect(educatorService.releaseTokens).toHaveBeenCalledWith('educator-1', expected);
        } else {
          expect(educatorService.releaseTokens).not.toHaveBeenCalled();
        }
      },
    );

    it('UNIT: student with report → seat consumed, no refund', async () => {
      setupAiRemove(1, 1);
      await service.remove(RECORD_ID, 'educator-1');
      expect(educatorService.releaseTokens).not.toHaveBeenCalled();
    });

    it('UNIT: student with 0 reports → seat refundable', async () => {
      setupAiRemove(1, 0);
      await service.remove(RECORD_ID, 'educator-1');
      expect(educatorService.releaseTokens).toHaveBeenCalledWith('educator-1', 1);
    });

    it('UNIT: one used student does not prevent unused students from being refunded', async () => {
      setupAiRemove(5, 1);
      await service.remove(RECORD_ID, 'educator-1');
      expect(educatorService.releaseTokens).toHaveBeenCalledWith('educator-1', 4);
    });

    it('UNIT: retry (already inactive) does not cause duplicate refund', async () => {
      repo.findOne.mockResolvedValue(null);
      const result = await service.remove(RECORD_ID, 'educator-1');
      expect(result.success).toBe(false);
      expect(educatorService.releaseTokens).not.toHaveBeenCalled();
    });

    it('UNIT: concurrent deactivation (affected=0) does not trigger duplicate refund', async () => {
      repo.findOne.mockResolvedValue({ ...mockRecord, is_ai: true });
      repo.find.mockResolvedValue([{ ...mockRecord, is_ai: true }]);
      repo.deactivateIfActive.mockResolvedValue({ affected: 0 });
      classRepo.findOne.mockResolvedValue({
        id: 'class-1',
        educator_id: 'educator-1',
        educator: { id: 'educator-1' },
      });
      studentRepo.count.mockResolvedValue(20);
      simulationReportRepo.findStudentIdsWhoUsedScenariosInClass.mockResolvedValue(
        Array.from({ length: 5 }, (_, i) => `s-${i}`),
      );
      await service.remove(RECORD_ID, 'educator-1');
      expect(educatorService.releaseTokens).not.toHaveBeenCalled();
    });

    it('UNIT: throws when educator does not own the class simulation', async () => {
      setupNonAiRemove();
      classRepo.findOne.mockResolvedValue({
        id: 'class-1',
        educator_id: 'educator-2',
        educator: { id: 'educator-2' },
      });
      await expect(service.remove(RECORD_ID, 'educator-1')).rejects.toThrow(BadRequestException);
      expect(educatorService.releaseTokens).not.toHaveBeenCalled();
    });

    it('UNIT: missing educator ID suppresses refund gracefully', async () => {
      setupAiRemove(5, 2);
      classRepo.findOne.mockResolvedValue({ id: 'class-1', educator_id: null, educator: null });
      await expect(service.remove(RECORD_ID, 'educator-1')).rejects.toThrow(BadRequestException);
      expect(educatorService.releaseTokens).not.toHaveBeenCalled();
    });

    it('UNIT: assign stamps is_ai=true on record when AI seats are consumed', async () => {
      classRepo.findOne.mockResolvedValue({ id: CLASS_ID, is_active: true });
      repo.findOne.mockResolvedValue(null);
      repo.find.mockResolvedValue([]);
      repo.create.mockResolvedValue({ ...mockRecord, is_ai: true });
      setupDataSourceQuery([{ category: 'AI Simulations' }]);
      studentRepo.count.mockResolvedValueOnce(2);
      await service.assign({ class_id: CLASS_ID, simulation_id: SIM_ID }, {
        id: 'educator-1',
        tokens: 10,
        role: { role_name: 'Educator' },
      } as never);
      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ is_ai: true }));
    });
  });

  describe('recalculateSeatsForUnitCategoryChange', () => {
    const CATEGORY_UNIT_ID = 'u-1';

    beforeEach(() => {
      classRepo.findOne.mockResolvedValue({
        id: CLASS_ID,
        educator_id: 'educator-1',
        educator: { id: 'educator-1' },
      });
    });

    it('Manikin→AI: deducts seats then flips is_ai when the educator has enough tokens', async () => {
      simulationRepo.find.mockResolvedValue([
        {
          id: SIM_ID,
          unitId: CATEGORY_UNIT_ID,
          title: 'Stroke Evaluation',
          class: 'AI Only',
          department: null,
          avatarEnabled: true,
        },
      ]);
      const affectedRows = [
        { id: RECORD_ID, class_id: CLASS_ID, simulation_id: SIM_ID, is_ai: false },
      ];
      repo.find.mockResolvedValue([]); // no AI sims active before the change
      studentRepo.count.mockResolvedValue(3);
      educatorService.availableTokens.mockResolvedValue(5);

      const updateCalls: unknown[][] = [];
      dataSource.connection.query.mockImplementation((sql: string, params?: unknown[]) => {
        if (sql.includes('FROM class_simulations cs')) return Promise.resolve(affectedRows);
        if (sql.includes('UPDATE class_simulations SET is_ai')) {
          updateCalls.push(params ?? []);
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      });

      await service.recalculateSeatsForUnitCategoryChange(CATEGORY_UNIT_ID);

      expect(educatorService.updateToken).toHaveBeenCalledWith('educator-1', 3);
      expect(updateCalls).toEqual([[true, RECORD_ID]]);
      // Regression guard: recalculation must read simulations_v2 directly (via
      // SimulationV2Repository), not stale/cached blob data.
      expect(simulationRepo.find).toHaveBeenCalled();
    });

    it('AI→Manikin: refunds seats after flipping is_ai when this was the last AI sim in the class', async () => {
      simulationRepo.find.mockResolvedValue([
        {
          id: SIM_ID,
          unitId: CATEGORY_UNIT_ID,
          title: 'Stroke Evaluation',
          class: null,
          department: null,
          avatarEnabled: false,
        },
      ]);
      const affectedRows = [
        { id: RECORD_ID, class_id: CLASS_ID, simulation_id: SIM_ID, is_ai: true },
      ];
      repo.find.mockResolvedValue([{ id: RECORD_ID, simulation_id: SIM_ID }]);
      studentRepo.count.mockResolvedValue(2);

      dataSource.connection.query.mockImplementation((sql: string) => {
        if (sql.includes('FROM class_simulations cs')) return Promise.resolve(affectedRows);
        if (sql.includes('UPDATE class_simulations SET is_ai')) return Promise.resolve([]);
        return Promise.resolve([]);
      });

      await service.recalculateSeatsForUnitCategoryChange(CATEGORY_UNIT_ID);

      expect(educatorService.releaseTokens).toHaveBeenCalledWith('educator-1', 2);
    });

    it('skips the transition and logs when the educator lacks enough tokens for a new AI requirement', async () => {
      simulationRepo.find.mockResolvedValue([
        {
          id: SIM_ID,
          unitId: CATEGORY_UNIT_ID,
          title: 'Stroke Evaluation',
          class: 'AI Only',
          department: null,
          avatarEnabled: true,
        },
      ]);
      const affectedRows = [
        { id: RECORD_ID, class_id: CLASS_ID, simulation_id: SIM_ID, is_ai: false },
      ];
      repo.find.mockResolvedValue([]);
      studentRepo.count.mockResolvedValue(5);
      educatorService.availableTokens.mockResolvedValue(1);

      let updateCalled = false;
      dataSource.connection.query.mockImplementation((sql: string) => {
        if (sql.includes('FROM class_simulations cs')) return Promise.resolve(affectedRows);
        if (sql.includes('UPDATE class_simulations SET is_ai')) {
          updateCalled = true;
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      });

      await service.recalculateSeatsForUnitCategoryChange(CATEGORY_UNIT_ID);

      expect(educatorService.updateToken).not.toHaveBeenCalled();
      expect(updateCalled).toBe(false);
    });

    it('is a no-op when no active class_simulations use the unit', async () => {
      dataSource.connection.query.mockImplementation((sql: string) => {
        if (sql.includes('FROM class_simulations cs')) return Promise.resolve([]);
        return Promise.resolve([]);
      });

      await service.recalculateSeatsForUnitCategoryChange(CATEGORY_UNIT_ID);

      expect(educatorService.updateToken).not.toHaveBeenCalled();
      expect(educatorService.releaseTokens).not.toHaveBeenCalled();
    });
  });

  describe('recalculateSeatsForSimulationChange', () => {
    beforeEach(() => {
      classRepo.findOne.mockResolvedValue({
        id: CLASS_ID,
        educator_id: 'educator-1',
        educator: { id: 'educator-1' },
      });
    });

    it('Manikin→AI: deducts one seat per student needing it, via the same student-count logic as assign()', async () => {
      simulationRepo.find.mockResolvedValue([
        {
          id: SIM_ID,
          unitId: 'u-1',
          title: 'Stroke Evaluation',
          class: null,
          department: null,
          avatarEnabled: true,
        },
      ]);
      const affectedRows = [
        { id: RECORD_ID, class_id: CLASS_ID, simulation_id: SIM_ID, is_ai: false },
      ];
      repo.find.mockResolvedValue([]);
      studentRepo.count.mockResolvedValue(4);
      educatorService.availableTokens.mockResolvedValue(10);

      const updateCalls: unknown[][] = [];
      dataSource.connection.query.mockImplementation((sql: string, params?: unknown[]) => {
        if (sql.includes('FROM class_simulations cs')) return Promise.resolve(affectedRows);
        if (sql.includes('UPDATE class_simulations SET is_ai')) {
          updateCalls.push(params ?? []);
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      });

      await service.recalculateSeatsForSimulationChange(SIM_ID);

      expect(educatorService.updateToken).toHaveBeenCalledWith('educator-1', 4);
      expect(updateCalls).toEqual([[true, RECORD_ID]]);
    });

    it('is a no-op when no active class_simulations reference this simulation', async () => {
      dataSource.connection.query.mockImplementation((sql: string) => {
        if (sql.includes('FROM class_simulations cs')) return Promise.resolve([]);
        return Promise.resolve([]);
      });

      await service.recalculateSeatsForSimulationChange(SIM_ID);

      expect(educatorService.updateToken).not.toHaveBeenCalled();
      expect(educatorService.releaseTokens).not.toHaveBeenCalled();
    });

    it('AI Only→Manikin: releases seats back to the educator when avatarEnabled flips to false', async () => {
      simulationRepo.find.mockResolvedValue([
        {
          id: SIM_ID,
          unitId: 'u-1',
          title: 'Stroke Evaluation',
          class: null,
          department: null,
          avatarEnabled: false,
        },
      ]);
      const affectedRows = [
        { id: RECORD_ID, class_id: CLASS_ID, simulation_id: SIM_ID, is_ai: true },
      ];
      repo.find.mockResolvedValue([{ id: RECORD_ID, simulation_id: SIM_ID }]);
      studentRepo.count.mockResolvedValue(6);

      dataSource.connection.query.mockImplementation((sql: string) => {
        if (sql.includes('FROM class_simulations cs')) return Promise.resolve(affectedRows);
        if (sql.includes('UPDATE class_simulations SET is_ai')) return Promise.resolve([]);
        return Promise.resolve([]);
      });

      await service.recalculateSeatsForSimulationChange(SIM_ID);

      expect(educatorService.releaseTokens).toHaveBeenCalledWith('educator-1', 6);
      expect(educatorService.updateToken).not.toHaveBeenCalled();
    });

    it('REGRESSION: explicit avatarEnabled=false wins over a stale "AI Only" class/category label', async () => {
      simulationRepo.find.mockResolvedValue([
        {
          id: SIM_ID,
          unitId: 'u-1',
          title: 'Stroke Evaluation',
          class: 'AI Only',
          department: null,
          avatarEnabled: false,
        },
      ]);
      const affectedRows = [
        { id: RECORD_ID, class_id: CLASS_ID, simulation_id: SIM_ID, is_ai: true },
      ];
      repo.find.mockResolvedValue([{ id: RECORD_ID, simulation_id: SIM_ID }]);
      studentRepo.count.mockResolvedValue(7);

      dataSource.connection.query.mockImplementation((sql: string) => {
        if (sql.includes('FROM class_simulations cs')) return Promise.resolve(affectedRows);
        if (sql.includes('UPDATE class_simulations SET is_ai')) return Promise.resolve([]);
        return Promise.resolve([]);
      });

      await service.recalculateSeatsForSimulationChange(SIM_ID);

      expect(educatorService.releaseTokens).toHaveBeenCalledWith('educator-1', 7);
      expect(educatorService.updateToken).not.toHaveBeenCalled();
    });
  });

  describe('refundUnusedSeatsForStudent', () => {
    const student = { id: 'stu-uuid', class_id: 'class-1', student_id: 'CODE-1' };
    const aiSims = (n: number): Array<{ simulation_id: string }> =>
      Array.from({ length: n }, (_, i) => ({ simulation_id: `sim-${i}` }));

    beforeEach(() => {
      classRepo.findOne.mockResolvedValue({ id: 'class-1', educator_id: 'educator-1' });
    });

    it.each([1, 5, 50])('issues a single Attempt query for %i AI sims', async (n) => {
      repo.find.mockResolvedValueOnce(aiSims(n));

      await service.refundUnusedSeatsForStudent(student);

      expect(simulationReportRepo.findScenarioIdsUsedByStudent).toHaveBeenCalledTimes(1);
      expect(educatorService.releaseTokens).toHaveBeenCalledWith('educator-1', 1);
    });

    it('does not refund when the student has used a sim', async () => {
      repo.find.mockResolvedValueOnce(aiSims(3));
      simulationReportRepo.findScenarioIdsUsedByStudent.mockResolvedValueOnce(['sim-2']);

      await service.refundUnusedSeatsForStudent(student);

      expect(simulationReportRepo.findScenarioIdsUsedByStudent).toHaveBeenCalledWith(
        'stu-uuid',
        'CODE-1',
        ['sim-0', 'sim-1', 'sim-2'],
      );
      expect(educatorService.releaseTokens).not.toHaveBeenCalled();
    });

    it('returns without querying when the class has no AI sims', async () => {
      repo.find.mockResolvedValueOnce([]);

      await service.refundUnusedSeatsForStudent(student);

      expect(simulationReportRepo.findScenarioIdsUsedByStudent).not.toHaveBeenCalled();
      expect(educatorService.releaseTokens).not.toHaveBeenCalled();
    });
  });
});
