import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { IncomingMessage, ServerResponse } from 'http';
import { Socket } from 'net';
import { Readable } from 'stream';
import { I18nService } from 'nestjs-i18n';
import { DataSource } from 'typeorm';
import { ClassesController } from '../../../src/class/classes.controller';
import { ClassesService, isValidStudentCodeFormat } from '../../../src/class/classes.service';
import { EducatorsService } from '../../../src/educators/educators.service';
import { InviteTokenService } from '../../../src/invites/invite-token.service';

import { ResponseResult } from 'src/common/class/response.class';
import {
  ClassDto,
  ListSchoolGroupsReqDto,
  ListClassesReqDto,
} from '../../../src/class/dto/classes.dto';
import { CreateClassReqDto } from '../../../src/class/dto/create-class.dto';
import { UpdateClassReqDto } from '../../../src/class/dto/update-class.dto';
import {
  ClassAttentionMeasure,
  ClassConstants,
  ClassSortField,
} from '../../../src/class/constants';
import { ClassRepository } from '../../../src/database/repositories';
import { ICurrentUser } from 'src/common/interfaces';
import { toStringArray } from 'src/common/utils/query-array.util';
import { ROLES_KEY } from 'src/common/decorators/required-roles.decorator';

import { ClassSimulationService } from '../../../src/class-simulations/class-simulation.service';
import { AzureBlobService, LoggerService } from '../../../src/common/services';
import { MailService } from '../../../src/mail/mail.service';
import { ConfigService } from '@nestjs/config';
import { NotificationsGateway } from '../../../src/notifications/notifications.gateway';
import { NotificationsService } from '../../../src/notifications/notifications.service';
import { EducatorSessionService } from '../../../src/session/educator-session.service';
import { CommonStatus } from 'src/common/enums/status.enum';
import { ERROR_MSG } from 'src/common/messages/error.message';
import { JwtRequest } from 'src/common/types';
import { AppStatus } from 'src/common/utils/messages';
import { CreateStudentDto } from '../../../src/students/dto/students.dto';
import { LmsProvisionService } from '../../../src/lms/services/lms-provision.service';
import { LmsLookupService } from '../../../src/lms/services/lms-lookup.service';
import { LmsConfigService } from '../../../src/lms/services/lms-config.service';
import { LmsAssignmentService } from '../../../src/lms/services/lms-assignment.service';
import { LmsRosterService } from '../../../src/lms/services/lms-roster.service';
import { Class, Student, Educator } from 'src/database/entities';
import {
  CLASS_EDUCATOR_REPOSITORY,
  CLASS_REPOSITORY,
  CLASS_SIMULATION_REPOSITORY,
  DISTRICT_ADMIN_REPOSITORY,
  EDUCATOR_REPOSITORY,
  EDUCATOR_SEAT_REQUEST_REPOSITORY,
  EDUCATOR_SCHOOL_REPOSITORY,
  GOOGLE_COURSE_MAPPING_REPOSITORY,
  GOOGLE_STUDENT_MAPPING_REPOSITORY,
  INVITE_REPOSITORY,
  LMS_CLASS_MAPPING_REPOSITORY,
  LMS_STUDENT_MAPPING_REPOSITORY,
  SCHOOLS_REPOSITORY,
  SIMULATION_REPORT_REPOSITORY,
  STUDENT_REPOSITORY,
  USER_REPOSITORY,
  USER_ROLE_REPOSITORY,
} from 'src/database/tokens';
import {
  ClassStudentCodesExportConstants,
  RoleSlug,
  StudentCodesExportFormat,
} from 'src/common/constants';

const makeReq = (userId: string, roles: RoleSlug[]): JwtRequest => {
  // These routes are educator-scoped: the controller resolves `educatorId` (via
  // `resolveActingEducatorId`), not `userId`, which since the v2 auth change is the account's
  // `users.id` for every role except Student.
  const req = Object.assign(new Request('http://localhost'), {
    user: { userId, educatorId: userId, roles },
  });
  return req;
};

const makeEducator = (o: Partial<Educator> = {}): Educator =>
  ({ id: 'edu-1', tokens: 10, status: CommonStatus.ACTIVE, ...o }) as Educator;

const makeClass = (o: Partial<Class> = {}): Class => ({
  id: 'class-1',
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

const educatorReq = makeReq('edu-1', [RoleSlug.EDUCATOR]);

const validDto: ClassDto = {
  class_name: 'Biology',
  term: 'i',
  year: '2025',
  start_date: '2025-01-01',
  end_date: '2025-06-01',
};

const validCreateDto: CreateClassReqDto = {
  className: 'Biology',
  term: 'i',
  year: '2025',
  startDate: '2025-01-01',
  endDate: '2025-06-01',
};

describe('Classes (Controller + Service)', () => {
  let controller: ClassesController;
  let service: ClassesService;

  const classRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    findAllActiveForEducator: jest.fn().mockResolvedValue([]),
    findActiveByIdWithSchoolForEducator: jest.fn(),
    findActiveByIdWithEducatorAndStudentsForEducator: jest.fn(),
    findActiveDuplicateForUpdate: jest.fn(),
    countActiveWithNoStudentsForEducator: jest.fn().mockResolvedValue(0),
    countActiveWithNoAssignedSimsForEducator: jest.fn().mockResolvedValue(0),
    findActiveClassByName: jest.fn(),
    getActivityOverviewCounts: jest.fn(),
    countActiveForEducator: jest.fn(),
    countActiveNeedingAttentionForEducator: jest.fn().mockResolvedValue(0),
  };
  const studentRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    saveMany: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    findAllNonEmptyStudentCodes: jest.fn().mockResolvedValue([]),
    findExistingStudentCodes: jest.fn().mockResolvedValue([]),
    iterateStudentCodesByClass: jest.fn(),
  };
  const simulationReportRepo = {
    getAttentionCountsByClassIds: jest.fn().mockResolvedValue([]),
    getAttentionCountsByEducator: jest.fn().mockResolvedValue([]),
  };
  const classSimulationRepo = { findOne: jest.fn(), find: jest.fn(), update: jest.fn() };
  const classSimulationService = {
    findByClass: jest.fn().mockResolvedValue({ data: [] }),
    findByClassIdsBatch: jest.fn().mockResolvedValue(new Map()),
  };
  const educatorRepo = { findOne: jest.fn() };
  const classEducatorRepo = { findOne: jest.fn(), create: jest.fn() };
  const educatorSchoolRepo = {
    findOne: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    save: jest.fn().mockResolvedValue({}),
    remove: jest.fn().mockResolvedValue({}),
    update: jest.fn(),
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
    manager: {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((_entity: unknown, data: unknown) => data),
      save: jest.fn().mockResolvedValue({}),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
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
        { provide: CLASS_EDUCATOR_REPOSITORY, useValue: classEducatorRepo },
        { provide: STUDENT_REPOSITORY, useValue: studentRepo },
        { provide: SIMULATION_REPORT_REPOSITORY, useValue: simulationReportRepo },
        { provide: EDUCATOR_REPOSITORY, useValue: educatorRepo },
        { provide: EDUCATOR_SEAT_REQUEST_REPOSITORY, useValue: {} },
        { provide: EDUCATOR_SCHOOL_REPOSITORY, useValue: educatorSchoolRepo },
        { provide: USER_REPOSITORY, useValue: { findOne: jest.fn(), save: jest.fn() } },
        { provide: USER_ROLE_REPOSITORY, useValue: { update: jest.fn(), findById: jest.fn() } },
        {
          provide: DISTRICT_ADMIN_REPOSITORY,
          useValue: { findByUserRoleId: jest.fn(), updateByUserRoleId: jest.fn() },
        },
        { provide: SCHOOLS_REPOSITORY, useValue: { findOne: jest.fn() } },
        {
          provide: INVITE_REPOSITORY,
          useValue: { findOne: jest.fn(), delete: jest.fn(), save: jest.fn() },
        },
        {
          provide: GOOGLE_COURSE_MAPPING_REPOSITORY,
          useValue: { deleteByClassId: jest.fn().mockResolvedValue(0) },
        },
        {
          provide: GOOGLE_STUDENT_MAPPING_REPOSITORY,
          useValue: { deleteByClassId: jest.fn().mockResolvedValue(0) },
        },
        {
          provide: LMS_CLASS_MAPPING_REPOSITORY,
          useValue: { findOne: jest.fn(), create: jest.fn(), delete: jest.fn() },
        },
        {
          provide: LMS_STUDENT_MAPPING_REPOSITORY,
          useValue: { findOne: jest.fn(), create: jest.fn(), delete: jest.fn() },
        },
        { provide: CLASS_SIMULATION_REPOSITORY, useValue: classSimulationRepo },
        { provide: ClassSimulationService, useValue: classSimulationService },
        {
          provide: AzureBlobService,
          useValue: { uploadFile: jest.fn(), isConfigured: jest.fn().mockReturnValue(false) },
        },
        { provide: DataSource, useValue: dataSource },
        { provide: I18nService, useValue: { t: jest.fn((key: string) => key) } },
        { provide: MailService, useValue: { sendMail: jest.fn().mockResolvedValue(undefined) } },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('http://localhost:5173') },
        },
        {
          provide: NotificationsGateway,
          useValue: {
            notifyAccountDeleted: jest.fn(),
            notifyAccountDeactivated: jest.fn(),
            notifyAdminEducatorLowSeatWarning: jest.fn(),
            notifyAdminSchoolLowSeatWarning: jest.fn(),
          },
        },
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
            invalidateBySchool: jest.fn().mockResolvedValue([]),
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
          useValue: { getActiveOptionalBySchoolId: jest.fn().mockResolvedValue(null) },
        },
        {
          provide: LmsAssignmentService,
          useValue: { findByClass: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: LmsRosterService,
          useValue: { fetchRosterWithWsFallback: jest.fn().mockResolvedValue({ members: [] }) },
        },
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
        {
          // Needed by ResponseInterceptor/HttpExceptionFilter.
          provide: I18nService,
          useValue: { t: jest.fn((key: string) => key) },
        },
      ],
    }).compile();
    controller = module.get(ClassesController);
    service = module.get(ClassesService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    beforeEach(() => {
      educatorRepo.findOne.mockResolvedValue(makeEducator());
      classRepo.findActiveClassByName.mockResolvedValue(null);
    });

    it('declares @RequiredRoles(Educator) on POST /classes', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, ClassesController.prototype.create) as
        RoleSlug[] | undefined;
      expect(roles).toEqual([RoleSlug.EDUCATOR]);
    });

    it('UNIT (legacy create()): returns failure when required fields missing — still relied on by createBulk', async () => {
      const result = await service.create(
        { class_name: '', term: undefined, year: undefined },
        makeEducator(),
        [],
      );
      expect(result.success).toBe(false);
    });

    it('UNIT: createClass throws BadRequestException when start date is after end date', async () => {
      await expect(
        service.createClass(educatorReq.user, {
          ...validCreateDto,
          startDate: '2025-12-01',
          endDate: '2025-01-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('UNIT: createClass throws NotFoundException when the educator is not found', async () => {
      educatorRepo.findOne.mockResolvedValueOnce(null);
      await expect(service.createClass(educatorReq.user, validCreateDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('UNIT: createClass throws BadRequestException when both students and totalNoOfStudents are provided', async () => {
      await expect(
        service.createClass(educatorReq.user, {
          ...validCreateDto,
          students: [{ student_name: 'A' }] as CreateStudentDto[],
          totalNoOfStudents: 5,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('UNIT: createClass throws BadRequestException when the class name already exists', async () => {
      classRepo.findActiveClassByName.mockResolvedValueOnce(makeClass());
      await expect(service.createClass(educatorReq.user, validCreateDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('UNIT: createClass throws ForbiddenException when the educator is not assigned to the given school', async () => {
      educatorSchoolRepo.findOne.mockResolvedValueOnce(null);
      await expect(
        service.createClass(educatorReq.user, { ...validCreateDto, schoolId: 'school-1' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('UNIT: createClass delegates to the untouched legacy create() and maps the result', async () => {
      jest
        .spyOn(service, 'create')
        .mockResolvedValue({ success: true, message: 'Created', data: makeClass() });
      const result = await service.createClass(educatorReq.user, validCreateDto);
      expect(service.create).toHaveBeenCalled();
      expect(result.data?.className).toBe('Biology');
    });

    it('UNIT: createClass surfaces a legacy create() failure as BadRequestException', async () => {
      jest
        .spyOn(service, 'create')
        .mockResolvedValue({ success: false, message: 'Failed', type: 'badrequest' });
      await expect(service.createClass(educatorReq.user, validCreateDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('INTEGRATION: controller.create is a thin pass-through to classesService.createClass', async () => {
      const spyResult = new ResponseResult({
        message: 'Class created successfully',
        data: { classId: 'class-1', className: 'Biology' },
      });
      jest.spyOn(service, 'createClass').mockResolvedValue(spyResult as never);
      const result = await controller.create(educatorReq.user, validCreateDto);
      expect(result).toBe(spyResult);
    });
  });

  describe('findAll', () => {
    const stubClassFindAllQb = (rows: unknown[]): void => {
      classRepo.findAllActiveForEducator.mockResolvedValue(rows);
    };

    it('UNIT: returns classes with student count', async () => {
      stubClassFindAllQb([
        { ...makeClass(), students: [{ is_active: true }, { is_active: true }] },
      ]);
      const result = await service.findAll('edu-1');
      expect(result.data![0].total_no_of_students).toBe(2);
    });

    it('INTEGRATION: GET /classes/user — returns list', async () => {
      jest
        .spyOn(service, 'findAll')
        .mockResolvedValue({ success: true, message: 'Fetched', data: [makeClass()] });
      const result = await controller.findAll(educatorReq);
      expect(result.status).toBe(AppStatus.SUCCESS);
    });
  });

  describe('getAttentionSummary', () => {
    it('UNIT: aggregates all five signals for the educator', async () => {
      classRepo.countActiveForEducator.mockResolvedValueOnce(12);
      classRepo.countActiveNeedingAttentionForEducator.mockResolvedValueOnce(5);
      simulationReportRepo.getAttentionCountsByEducator.mockResolvedValueOnce([
        { class_id: 'class-1', report_count: '3', unread_count: '2' },
      ]);
      classRepo.countActiveWithNoStudentsForEducator.mockResolvedValueOnce(1);
      classRepo.countActiveWithNoAssignedSimsForEducator.mockResolvedValueOnce(4);

      const result = await service.getAttentionSummary({ userId: 'edu-1', educatorId: 'edu-1' });

      expect(result.data).toEqual({
        totalClasses: 12,
        classesNeedingAttention: 5,
        unreadReports: 1,
        noStudents: 1,
        noAssignedSims: 4,
      });
      expect(classRepo.countActiveForEducator).toHaveBeenCalledWith('edu-1', undefined);
      expect(classRepo.countActiveNeedingAttentionForEducator).toHaveBeenCalledWith(
        'edu-1',
        undefined,
      );
      expect(simulationReportRepo.getAttentionCountsByEducator).toHaveBeenCalledWith(
        'edu-1',
        undefined,
      );
      expect(classRepo.countActiveWithNoStudentsForEducator).toHaveBeenCalledWith(
        'edu-1',
        undefined,
      );
      expect(classRepo.countActiveWithNoAssignedSimsForEducator).toHaveBeenCalledWith(
        'edu-1',
        undefined,
      );
    });

    it('UNIT: threads schoolId through to all five signal queries', async () => {
      classRepo.countActiveForEducator.mockResolvedValueOnce(0);
      classRepo.countActiveNeedingAttentionForEducator.mockResolvedValueOnce(0);
      simulationReportRepo.getAttentionCountsByEducator.mockResolvedValueOnce([]);
      classRepo.countActiveWithNoStudentsForEducator.mockResolvedValueOnce(0);
      classRepo.countActiveWithNoAssignedSimsForEducator.mockResolvedValueOnce(0);

      await service.getAttentionSummary({ userId: 'edu-1', educatorId: 'edu-1' }, 'school-1');

      expect(classRepo.countActiveForEducator).toHaveBeenCalledWith('edu-1', 'school-1');
      expect(classRepo.countActiveNeedingAttentionForEducator).toHaveBeenCalledWith(
        'edu-1',
        'school-1',
      );
      expect(simulationReportRepo.getAttentionCountsByEducator).toHaveBeenCalledWith(
        'edu-1',
        'school-1',
      );
      expect(classRepo.countActiveWithNoStudentsForEducator).toHaveBeenCalledWith(
        'edu-1',
        'school-1',
      );
      expect(classRepo.countActiveWithNoAssignedSimsForEducator).toHaveBeenCalledWith(
        'edu-1',
        'school-1',
      );
    });

    it('UNIT: returns all-zero counts when nothing is outstanding', async () => {
      classRepo.countActiveForEducator.mockResolvedValueOnce(0);
      classRepo.countActiveNeedingAttentionForEducator.mockResolvedValueOnce(0);
      simulationReportRepo.getAttentionCountsByEducator.mockResolvedValueOnce([]);
      classRepo.countActiveWithNoStudentsForEducator.mockResolvedValueOnce(0);
      classRepo.countActiveWithNoAssignedSimsForEducator.mockResolvedValueOnce(0);

      const result = await service.getAttentionSummary({ userId: 'edu-1', educatorId: 'edu-1' });

      expect(result.data).toEqual({
        totalClasses: 0,
        classesNeedingAttention: 0,
        unreadReports: 0,
        noStudents: 0,
        noAssignedSims: 0,
      });
    });

    it('INTEGRATION: GET /classes/user/attention-summary — returns counts for the caller', async () => {
      jest.spyOn(service, 'getAttentionSummary').mockResolvedValue(
        new ResponseResult({
          data: { classesNeedingAttention: 3, unreadReports: 1, noStudents: 0, noAssignedSims: 2 },
        }),
      );
      const result = await controller.getAttentionSummary(educatorReq.user, {});
      expect(result.data).toEqual({
        classesNeedingAttention: 3,
        unreadReports: 1,
        noStudents: 0,
        noAssignedSims: 2,
      });
      expect(service.getAttentionSummary).toHaveBeenCalledWith(educatorReq.user, undefined);
    });

    it('UNIT: threads school_id from the query DTO through to the service', async () => {
      jest.spyOn(service, 'getAttentionSummary').mockResolvedValue(
        new ResponseResult({
          data: { classesNeedingAttention: 0, unreadReports: 0, noStudents: 0, noAssignedSims: 0 },
        }),
      );
      await controller.getAttentionSummary(educatorReq.user, { school_id: 'school-1' });
      expect(service.getAttentionSummary).toHaveBeenCalledWith(educatorReq.user, 'school-1');
    });
  });

  describe('getActivityOverview', () => {
    const fullCounts = {
      activeClasses: 5,
      classesClosingSoon: 3,
      studentsInActiveClasses: 42,
      classesWithStudentsNearAvatarLimit: 1,
      classesWithUnreadReports: 2,
      totalUnreadReports: 4,
    };

    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
      classRepo.getActivityOverviewCounts.mockResolvedValue(fullCounts);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('UNIT: returns the counts from the repository as-is', async () => {
      const result = await service.getActivityOverview(educatorReq.user, {});
      expect(result.data).toEqual(fullCounts);
      expect(result.message).toBeDefined();
    });

    it('UNIT: passes UTC-safe today/window-end date strings (14-day window) and the near-limit threshold constant', async () => {
      await service.getActivityOverview(educatorReq.user, {});
      expect(classRepo.getActivityOverviewCounts).toHaveBeenCalledWith(
        educatorReq.user.userId,
        '2026-01-01',
        '2026-01-15',
        2400,
        undefined,
      );
    });

    it('UNIT: passes school_id through to the repository', async () => {
      await service.getActivityOverview(educatorReq.user, { school_id: 'school-1' });
      expect(classRepo.getActivityOverviewCounts).toHaveBeenCalledWith(
        educatorReq.user.userId,
        '2026-01-01',
        '2026-01-15',
        2400,
        'school-1',
      );
    });

    it('UNIT: only calls the repository once — one round trip for all six counts', async () => {
      await service.getActivityOverview(educatorReq.user, {});
      expect(classRepo.getActivityOverviewCounts).toHaveBeenCalledTimes(1);
    });

    it('UNIT: wraps a repository failure via handleError instead of throwing raw', async () => {
      classRepo.getActivityOverviewCounts.mockRejectedValueOnce(new Error('db down'));
      await expect(service.getActivityOverview(educatorReq.user, {})).rejects.toThrow();
    });

    it('INTEGRATION: GET /classes/user/activity-overview — returns counts via controller', async () => {
      const spyResult = new ResponseResult({
        message: 'Activity Overview fetched successfully',
        data: fullCounts,
      });
      jest.spyOn(service, 'getActivityOverview').mockResolvedValue(spyResult);
      const result = await controller.getActivityOverview(educatorReq.user, {});
      expect(result).toBe(spyResult);
      expect(result.data).toEqual(fullCounts);
    });
  });

  describe('findOne', () => {
    const stubClassFindOneQb = (row: Class | null): void => {
      classRepo.findActiveByIdWithEducatorAndStudentsForEducator.mockResolvedValue(row);
    };

    it('UNIT: returns class when found', async () => {
      stubClassFindOneQb(makeClass());
      const result = await service.findOne('class-1', 'edu-1');
      expect(result.success).toBe(true);
    });

    it('UNIT: returns failure when not found', async () => {
      stubClassFindOneQb(null);
      const result = await service.findOne('bad', 'edu-1');
      expect(result.success).toBe(false);
    });

    it('INTEGRATION: throws when not found', async () => {
      jest
        .spyOn(service, 'findOne')
        .mockResolvedValue({ success: false, message: 'Not found', type: 'notfound' });
      await expect(controller.findOne({ id: 'bad' }, educatorReq)).rejects.toThrow();
    });
  });

  describe('update', () => {
    const validUpdateDto: UpdateClassReqDto = { className: 'Chemistry' };

    beforeEach(() => {
      classRepo.findActiveClassByName.mockResolvedValue(null);
    });

    it('declares @RequiredRoles(Educator) on PUT /classes/:id', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, ClassesController.prototype.update) as
        RoleSlug[] | undefined;
      expect(roles).toEqual([RoleSlug.EDUCATOR]);
    });

    it('UNIT: updates class name', async () => {
      jest.spyOn(service, 'findClassByIdWithEducator').mockResolvedValue(makeClass());
      classRepo.create.mockResolvedValue(makeClass({ class_name: 'Chemistry' }));
      classRepo.findOne.mockResolvedValue(makeClass({ class_name: 'Chemistry' }));
      const result = await service.update(educatorReq.user, 'class-1', validUpdateDto);
      expect(result.data?.className).toBe('Chemistry');
    });

    it('UNIT: throws NotFoundException when the class is not owned/co-taught by the requester', async () => {
      jest.spyOn(service, 'findClassByIdWithEducator').mockResolvedValue(null);
      await expect(service.update(educatorReq.user, 'bad', validUpdateDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('UNIT: throws BadRequestException when start date is after end date', async () => {
      jest.spyOn(service, 'findClassByIdWithEducator').mockResolvedValue(makeClass());
      await expect(
        service.update(educatorReq.user, 'class-1', {
          startDate: '2025-12-01',
          endDate: '2025-01-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('UNIT: throws BadRequestException when the new name already exists on another class', async () => {
      jest.spyOn(service, 'findClassByIdWithEducator').mockResolvedValue(makeClass());
      classRepo.findActiveClassByName.mockResolvedValueOnce(makeClass({ id: 'class-2' }));
      await expect(service.update(educatorReq.user, 'class-1', validUpdateDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('UNIT: a whitespace-only className edit is treated as a no-op, not a rename', async () => {
      jest
        .spyOn(service, 'findClassByIdWithEducator')
        .mockResolvedValue(makeClass({ class_name: 'Biology' }));
      classRepo.create.mockResolvedValue(makeClass({ class_name: 'Biology' }));
      classRepo.findOne.mockResolvedValue(makeClass({ class_name: 'Biology' }));

      const result = await service.update(educatorReq.user, 'class-1', { className: 'Biology  ' });

      expect(classRepo.findActiveClassByName).not.toHaveBeenCalled();
      expect(result.data?.className).toBe('Biology');
    });

    it('UNIT: throws ForbiddenException when the educator is not assigned to the new school', async () => {
      jest.spyOn(service, 'findClassByIdWithEducator').mockResolvedValue(makeClass());
      educatorSchoolRepo.findOne.mockResolvedValueOnce(null);
      await expect(
        service.update(educatorReq.user, 'class-1', { schoolId: 'school-2' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('INTEGRATION: controller.update is a thin pass-through to classesService.update', async () => {
      const spyResult = new ResponseResult({
        message: 'Class updated successfully',
        data: { classId: 'class-1', className: 'Chemistry' },
      });
      jest.spyOn(service, 'update').mockResolvedValue(spyResult as never);
      const result = await controller.update(educatorReq.user, 'class-1', validUpdateDto);
      expect(result).toBe(spyResult);
    });
  });

  describe('exportStudentCodes', () => {
    const currentUser = { userId: 'edu-uuid', educatorId: 'edu-uuid' } as ICurrentUser;
    const classId = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
    const exportClass = {
      id: classId,
      class_name: 'Biology 101',
      start_date: '2026-09-01',
      end_date: '2026-12-15',
      school: { school_name: 'Lincoln High School' },
    };
    async function* batches(...b: { id: string; studentId: string; name: string | null }[][]) {
      for (const batch of b) yield batch;
    }
    const readAll = async (file: StreamableFile): Promise<string> => {
      const chunks: Buffer[] = [];
      for await (const chunk of file.getStream() as Readable) {
        chunks.push(Buffer.from(chunk as Buffer));
      }
      return Buffer.concat(chunks).toString('utf8');
    };

    it('declares @RequiredRoles(Educator) on GET /classes/:id/export-student-codes', () => {
      const roles = Reflect.getMetadata(
        ROLES_KEY,
        ClassesController.prototype.exportStudentCodes,
      ) as RoleSlug[] | undefined;
      expect(roles).toEqual([RoleSlug.EDUCATOR]);
    });

    it('UNIT: 403s a caller with no educatorId (e.g. a multi-role user acting as another role) before any lookup', async () => {
      await expect(
        service.exportStudentCodes({ userId: 'admin-1' } as ICurrentUser, classId, {}),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(classRepo.findActiveByIdWithSchoolForEducator).not.toHaveBeenCalled();
    });

    it('UNIT: 404s (without touching students) when the class is not accessible to the educator', async () => {
      classRepo.findActiveByIdWithSchoolForEducator.mockResolvedValue(null);

      await expect(service.exportStudentCodes(currentUser, classId, {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(classRepo.findActiveByIdWithSchoolForEducator).toHaveBeenCalledWith(
        classId,
        'edu-uuid',
      );
      expect(studentRepo.iterateStudentCodesByClass).not.toHaveBeenCalled();
    });

    it('UNIT: 404s when the class belongs to an inactive school', async () => {
      classRepo.findActiveByIdWithSchoolForEducator.mockResolvedValue({
        ...exportClass,
        school_id: 'school-1',
        school: { ...exportClass.school, is_active: false },
      });

      await expect(service.exportStudentCodes(currentUser, classId, {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(studentRepo.iterateStudentCodesByClass).not.toHaveBeenCalled();
    });

    it('UNIT: 404s when the educator is no longer assigned to the class school', async () => {
      classRepo.findActiveByIdWithSchoolForEducator.mockResolvedValue({
        ...exportClass,
        school_id: 'school-1',
        school: { ...exportClass.school, is_active: true },
      });
      educatorSchoolRepo.findOne.mockResolvedValueOnce(null);

      await expect(service.exportStudentCodes(currentUser, classId, {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(studentRepo.iterateStudentCodesByClass).not.toHaveBeenCalled();
    });

    it('UNIT: defaults to a CSV StreamableFile with the class header block and student rows', async () => {
      classRepo.findActiveByIdWithSchoolForEducator.mockResolvedValue(exportClass);
      studentRepo.iterateStudentCodesByClass.mockReturnValue(
        batches(
          [
            { id: '1', studentId: 'BIO-4ZPT', name: null },
            { id: '2', studentId: 'BIO-JW6C', name: 'Ava Thompson' },
          ],
          [{ id: '3', studentId: 'BIO-H6XJ', name: null }],
        ),
      );

      const file = await service.exportStudentCodes(currentUser, classId, {});

      expect(studentRepo.iterateStudentCodesByClass).toHaveBeenCalledWith(
        'edu-uuid',
        classId,
        ClassStudentCodesExportConstants.FORMATS.CSV.BATCH_SIZE,
      );
      expect(file.getHeaders()).toEqual(
        expect.objectContaining({
          type: 'text/csv; charset=utf-8',
          disposition: `attachment; filename="student-codes-Biology_101.csv"; filename*=UTF-8''student-codes-Biology%20101.csv`,
        }),
      );
      expect(await readAll(file)).toBe(
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
            'BIO-H6XJ,',
          ].join('\r\n') +
          '\r\n',
      );
    });

    it('UNIT: format=pdf streams a PDF attachment in the smaller PDF batch size', async () => {
      classRepo.findActiveByIdWithSchoolForEducator.mockResolvedValue(exportClass);
      studentRepo.iterateStudentCodesByClass.mockReturnValue(
        batches([{ id: '1', studentId: 'BIO-4ZPT', name: 'Ava Thompson' }]),
      );

      const file = await service.exportStudentCodes(currentUser, classId, {
        format: StudentCodesExportFormat.PDF,
      });

      expect(studentRepo.iterateStudentCodesByClass).toHaveBeenCalledWith(
        'edu-uuid',
        classId,
        ClassStudentCodesExportConstants.FORMATS.PDF.BATCH_SIZE,
      );
      expect(file.getHeaders()).toEqual(
        expect.objectContaining({
          type: 'application/pdf',
          disposition: `attachment; filename="student-codes-Biology_101.pdf"; filename*=UTF-8''student-codes-Biology%20101.pdf`,
        }),
      );
      const body = await readAll(file);
      expect(body.startsWith('%PDF-')).toBe(true);
      expect(body.trimEnd().endsWith('%%EOF')).toBe(true);
    });

    it('UNIT: mid-stream failure destroys the response instead of ending a truncated file cleanly', async () => {
      classRepo.findActiveByIdWithSchoolForEducator.mockResolvedValue(exportClass);
      studentRepo.iterateStudentCodesByClass.mockReturnValue(batches());

      const file = await service.exportStudentCodes(currentUser, classId, {});
      const res = new ServerResponse(new IncomingMessage(new Socket()));
      const destroy = jest.spyOn(res, 'destroy').mockImplementation(() => res);
      const end = jest.spyOn(res, 'end');
      const err = new Error('db down');

      file.errorHandler(err, res);

      expect(destroy).toHaveBeenCalledWith(err);
      expect(end).not.toHaveBeenCalled();
    });

    it('UNIT: controller delegates straight to the service', async () => {
      const file = new StreamableFile(Buffer.from(''));
      const spy = jest.spyOn(service, 'exportStudentCodes').mockResolvedValue(file);
      const dto = { format: StudentCodesExportFormat.PDF };

      await expect(controller.exportStudentCodes(currentUser, classId, dto)).resolves.toBe(file);
      expect(spy).toHaveBeenCalledWith(currentUser, classId, dto);
    });
  });

  describe('remove', () => {
    it('declares @RequiredRoles(Educator) on DELETE /classes/:id', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, ClassesController.prototype.remove) as
        RoleSlug[] | undefined;
      expect(roles).toEqual([RoleSlug.EDUCATOR]);
    });

    it('UNIT: removes class and students', async () => {
      jest.spyOn(service, 'findClassByIdWithEducator').mockResolvedValue(makeClass());
      mockTransactionManager.find.mockResolvedValue([
        { id: 'student-1', is_active: true, status: CommonStatus.ACTIVE },
      ]);
      const result = await service.remove(educatorReq.user, 'class-1');
      expect(result.data).toBeNull();
      expect(dataSource.transaction).toHaveBeenCalled();
      expect(mockTransactionManager.delete).toHaveBeenCalled();
      expect(mockTransactionManager.update).toHaveBeenCalled();
      expect(mockTransactionManager.save).toHaveBeenCalled();
    });

    it('UNIT: throws NotFoundException when the class is not owned/co-taught by the requester', async () => {
      jest.spyOn(service, 'findClassByIdWithEducator').mockResolvedValue(null);
      await expect(service.remove(educatorReq.user, 'bad')).rejects.toThrow(NotFoundException);
    });

    it('INTEGRATION: controller.remove is a thin pass-through to classesService.remove', async () => {
      const spyResult = new ResponseResult({ message: 'Class deleted successfully', data: null });
      jest.spyOn(service, 'remove').mockResolvedValue(spyResult as never);
      const result = await controller.remove(educatorReq.user, 'class-1');
      expect(result).toBe(spyResult);
    });
  });

  describe('service helpers', () => {
    it('findByCriteria returns null when not found', async () => {
      classRepo.findOne.mockResolvedValue(null);
      expect(await service.findByCriteria('X', 'i', '2025', 'edu-1')).toBeNull();
    });

    it('findEducatorById returns educator', async () => {
      educatorRepo.findOne.mockResolvedValue(makeEducator());
      expect((await service.findEducatorById('edu-1'))?.id).toBe('edu-1');
    });

    it('countStudentsByClassId returns count', async () => {
      studentRepo.count.mockResolvedValue(5);
      expect(await service.countStudentsByClassId('class-1')).toBe(5);
    });
  });

  describe('regression', () => {
    it('REGRESSION: findAll: student count reflects actual students array', async () => {
      classRepo.findAllActiveForEducator.mockResolvedValue([
        { ...makeClass(), students: new Array(7).fill({ is_active: true }) },
      ]);
      const result = await service.findAll('edu-1');
      expect(result.data![0].total_no_of_students).toBe(7);
    });

    it('create: tokens check uses availableTokens from educatorService', async () => {
      jest.spyOn(service, 'findEducatorById').mockResolvedValue(makeEducator());
      classRepo.findActiveClassByName.mockResolvedValue(null);
      jest
        .spyOn(service, 'create')
        .mockResolvedValue({ success: true, message: 'Created', data: makeClass() });
      await controller.create(educatorReq.user, validCreateDto);
    });
  });

  describe('student code generation (CCC-XXXX format)', () => {
    const FORMAT_REGEX = /^[A-Z0-9]{3}-[A-Z0-9]{4}$/;
    const capturedStudents: Partial<Student>[] = [];

    beforeEach(() => {
      capturedStudents.length = 0;
      studentRepo.findAllNonEmptyStudentCodes.mockResolvedValue([]);
      classRepo.create
        .mockImplementationOnce((c: Partial<Class>) => ({ id: 'class-1', ...c }) as Class)
        .mockResolvedValueOnce({ ...makeClass(), id: 'class-1', class_name: validDto.class_name })
        .mockResolvedValue({ ...makeClass(), id: 'class-1' });
      classRepo.findOne.mockResolvedValue({ ...makeClass(), students: [] });
      studentRepo.saveMany.mockImplementation((students: Partial<Student>[]) => {
        capturedStudents.push(...students);
        return Promise.resolve(students);
      });
    });

    it('UNIT: generated codes match strict CCC-XXXX format when creating class with count', async () => {
      const result = await service.create(
        { ...validDto, total_no_of_students: 3 },
        makeEducator(),
        [],
      );
      expect(result.success).toBe(true);
      expect(capturedStudents.length).toBe(3);
      for (const s of capturedStudents) {
        expect(FORMAT_REGEX.test(s.student_id ?? '')).toBe(true);
      }
    });

    it('UNIT: all generated codes are exactly 8 characters total', async () => {
      await service.create({ ...validDto, total_no_of_students: 5 }, makeEducator(), []);
      for (const s of capturedStudents) {
        expect((s.student_id ?? '').length).toBe(8);
      }
    });

    it('UNIT: generated code suffix is always exactly 4 characters (never 3)', async () => {
      await service.create({ ...validDto, total_no_of_students: 5 }, makeEducator(), []);
      for (const s of capturedStudents) {
        const suffix = (s.student_id ?? '').split('-')[1] ?? '';
        expect(suffix).toHaveLength(4);
      }
    });

    it('UNIT: generated code prefix is always exactly 3 characters', async () => {
      await service.create({ ...validDto, total_no_of_students: 5 }, makeEducator(), []);
      for (const s of capturedStudents) {
        const prefix = (s.student_id ?? '').split('-')[0] ?? '';
        expect(prefix).toHaveLength(3);
      }
    });

    it('UNIT: all generated codes are unique within a session', async () => {
      await service.create({ ...validDto, total_no_of_students: 10 }, makeEducator(), []);
      const ids = capturedStudents.map((s) => s.student_id);
      const unique = new Set(ids);
      expect(unique.size).toBe(ids.length);
    });

    it('UNIT: prefix matches first 3 alphanumeric chars of class name uppercased', async () => {
      classRepo.create.mockReset();
      classRepo.create
        .mockImplementationOnce((c: Partial<Class>) => ({ id: 'class-1', ...c }) as Class)
        .mockResolvedValueOnce({ ...makeClass(), id: 'class-1', class_name: 'Nursing Care' })
        .mockResolvedValue({ ...makeClass(), id: 'class-1' });
      await service.create(
        { ...validDto, class_name: 'Nursing Care', total_no_of_students: 1 },
        makeEducator(),
        [],
      );
      const prefix = (capturedStudents[0]?.student_id ?? '').split('-')[0] ?? '';
      expect(prefix).toBe('NUR');
    });

    it('UNIT: special-char-only class name pads prefix to XXX producing valid CCC-XXXX code', async () => {
      classRepo.create.mockReset();
      classRepo.create
        .mockImplementationOnce((c: Partial<Class>) => ({ id: 'class-1', ...c }) as Class)
        .mockResolvedValueOnce({ ...makeClass(), id: 'class-1', class_name: '!!!---###' })
        .mockResolvedValue({ ...makeClass(), id: 'class-1' });
      await service.create(
        { ...validDto, class_name: '!!!---###', total_no_of_students: 1 },
        makeEducator(),
        [],
      );
      const code = capturedStudents[0]?.student_id ?? '';
      expect(code).toHaveLength(8);
      expect(FORMAT_REGEX.test(code)).toBe(true);
      expect(code.split('-')[0]).toBe('XXX');
    });

    it('UNIT: validateRosterCodes returns success for unique valid codes', async () => {
      studentRepo.findExistingStudentCodes.mockResolvedValueOnce([]);
      const result = await service.validateRosterCodes(['ABC-1234', 'EFG-5678']);
      expect(result.success).toBe(true);
      expect(result.data?.valid).toBe(true);
      expect(result.data?.count).toBe(2);
    });

    it('UNIT: validateRosterCodes detects duplicates within input list', async () => {
      studentRepo.findExistingStudentCodes.mockResolvedValueOnce([]);
      const result = await service.validateRosterCodes(['ABC-1234', 'ABC-1234']);
      expect(result.success).toBe(false);
      expect(result.message).toContain(
        'The following Student Codes have already been used: ABC-1234.',
      );
      expect(result.data?.duplicateCodes).toContain('ABC-1234');
    });

    it('UNIT: validateRosterCodes detects duplicates existing in database', async () => {
      studentRepo.findExistingStudentCodes.mockResolvedValueOnce(['STU-0001', 'STU-0005']);
      const result = await service.validateRosterCodes(['STU-0001', 'STU-0005', 'STU-0010']);
      expect(result.success).toBe(false);
      expect(result.message).toContain(
        'The following Student Codes have already been used: STU-0001, STU-0005.',
      );
    });

    it('INTEGRATION: controller.validateRoster returns AppStatus.SUCCESS when codes are valid', async () => {
      studentRepo.findExistingStudentCodes.mockResolvedValueOnce([]);
      const res = await controller.validateRoster(
        { studentCodes: ['NEW-0001', 'NEW-0002'] },
        educatorReq,
      );
      expect(res.status).toBe(AppStatus.SUCCESS);
      expect((res.data as { valid: boolean })?.valid).toBe(true);
    });

    it('INTEGRATION: controller.validateRoster throws BadRequestException when duplicates exist', async () => {
      studentRepo.findExistingStudentCodes.mockResolvedValueOnce(['STU-0001']);
      await expect(
        controller.validateRoster({ studentCodes: ['STU-0001', 'STU-0002'] }, educatorReq),
      ).rejects.toThrow(BadRequestException);
    });

    it('UNIT: creating class with uploaded student codes (STD-1234) saves the exact same student code', async () => {
      studentRepo.findExistingStudentCodes.mockResolvedValueOnce([]);
      const result = await service.create(
        { ...validDto, class_name: 'Science 101' },
        makeEducator(),
        [{ student_id: 'STD-1234' }, { student_id: 'STD-5678' }],
      );
      expect(result.success).toBe(true);
      const savedCodes = capturedStudents.map((s) => s.student_id);
      expect(savedCodes).toContain('STD-1234');
      expect(savedCodes).toContain('STD-5678');
    });

    it('UNIT: creating class with uploaded student codes fails when code already exists in DB', async () => {
      studentRepo.findExistingStudentCodes.mockResolvedValueOnce(['STD-1234']);
      const result = await service.create(
        { ...validDto, class_name: 'Science 101' },
        makeEducator(),
        [{ student_id: 'STD-1234' }],
      );
      expect(result.success).toBe(false);
      expect(result.message).toContain(
        'The following Student Codes have already been used: STD-1234.',
      );
    });

    it('UNIT: isValidStudentCodeFormat validates 8-char codes with only alphabet and number combination (e.g., SSS-R12C, STD-1234)', () => {
      expect(isValidStudentCodeFormat('SSS-R12C')).toBe(true);
      expect(isValidStudentCodeFormat('STD-1234')).toBe(true);
      expect(isValidStudentCodeFormat('ABC-1234')).toBe(true);
      expect(isValidStudentCodeFormat('NUR-7K4P')).toBe(true);
      expect(isValidStudentCodeFormat('ABB-2345')).toBe(true);
      expect(isValidStudentCodeFormat('sss-r12c')).toBe(true);

      // Rejects letters-only (must contain numbers)
      expect(isValidStudentCodeFormat('SSS-RBSC')).toBe(false);
      expect(isValidStudentCodeFormat('ABC-DEFG')).toBe(false);

      // Rejects numbers-only (must contain letters)
      expect(isValidStudentCodeFormat('123-4567')).toBe(false);

      // Rejects invalid segment lengths (must have 3 before and 4 after hyphen)
      expect(isValidStudentCodeFormat('abcd-123')).toBe(false);
      expect(isValidStudentCodeFormat('STD-123')).toBe(false);
      expect(isValidStudentCodeFormat('ABCD-1234')).toBe(false);
      expect(isValidStudentCodeFormat('AB-1234')).toBe(false);
      expect(isValidStudentCodeFormat('ABC-12345')).toBe(false);

      // Rejects missing hyphen
      expect(isValidStudentCodeFormat('12345678')).toBe(false);
      expect(isValidStudentCodeFormat('SSSR12C1')).toBe(false);
      expect(isValidStudentCodeFormat('12345')).toBe(false);
      expect(isValidStudentCodeFormat('abcd')).toBe(false);
      expect(isValidStudentCodeFormat('SSS_R12C')).toBe(false);

      // Rejects empty / invalid symbols (only hyphen '-' is allowed)
      expect(isValidStudentCodeFormat('')).toBe(false);
      expect(isValidStudentCodeFormat('   ')).toBe(false);
      expect(isValidStudentCodeFormat('SSS@R12C')).toBe(false);
      expect(isValidStudentCodeFormat('SSS.R12C')).toBe(false);
      expect(isValidStudentCodeFormat('SSS/R12C')).toBe(false);
      expect(isValidStudentCodeFormat('SSS+R12C')).toBe(false);
      expect(isValidStudentCodeFormat('SSS#1234')).toBe(false);
      expect(isValidStudentCodeFormat('SS!-1234')).toBe(false);
      expect(isValidStudentCodeFormat('SSS-12#4')).toBe(false);
      expect(isValidStudentCodeFormat('S_S-1234')).toBe(false);
      expect(isValidStudentCodeFormat('SSS--123')).toBe(false);
      expect(isValidStudentCodeFormat('SSS-123-')).toBe(false);
      expect(isValidStudentCodeFormat('-SS-1234')).toBe(false);
      expect(isValidStudentCodeFormat('SSS 1234')).toBe(false);
      expect(isValidStudentCodeFormat('SSS-12 4')).toBe(false);
    });

    it('UNIT: validateRosterCodes rejects codes with invalid format or segment length', async () => {
      const result = await service.validateRosterCodes(['abcd-123', 'STD-123']);
      expect(result.success).toBe(false);
      expect(result.message).toContain(
        'The following Student Codes are invalid: abcd-123, STD-123.',
      );
      expect(result.message).toContain(
        'Student Codes must be 8 characters with 3 characters before and 4 characters after a hyphen, with only an alphabet and number combination (e.g., SSS-R12C).',
      );
    });

    it('UNIT: validateRosterCodes rejects numbers-only student codes', async () => {
      const result = await service.validateRosterCodes(['123-4567', '678-9012']);
      expect(result.success).toBe(false);
      expect(result.message).toContain(
        'The following Student Codes are invalid: 123-4567, 678-9012.',
      );
      expect(result.message).toContain(
        'Student Codes must be 8 characters with 3 characters before and 4 characters after a hyphen, with only an alphabet and number combination (e.g., SSS-R12C).',
      );
    });

    it('UNIT: validateRosterCodes rejects letters-only student codes', async () => {
      const result = await service.validateRosterCodes(['SSS-RBSC', 'ABC-DEFG']);
      expect(result.success).toBe(false);
      expect(result.message).toContain(
        'The following Student Codes are invalid: SSS-RBSC, ABC-DEFG.',
      );
      expect(result.message).toContain(
        'Student Codes must be 8 characters with 3 characters before and 4 characters after a hyphen, with only an alphabet and number combination (e.g., SSS-R12C).',
      );
    });

    it('UNIT: validateRosterCodes accepts valid 8-character student codes (SSS-R12C)', async () => {
      studentRepo.findExistingStudentCodes.mockResolvedValueOnce([]);
      const result = await service.validateRosterCodes(['SSS-R12C']);
      expect(result.success).toBe(true);
      expect(result.data?.valid).toBe(true);
      expect(result.data?.count).toBe(1);
    });

    it('INTEGRATION: controller.validateRoster throws BadRequestException when codes are invalid format', async () => {
      await expect(
        controller.validateRoster({ studentCodes: ['lettersOnly'] }, educatorReq),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.validateRoster({ studentCodes: ['123-4567'] }, educatorReq),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.validateRoster({ studentCodes: ['SSS-RBSC'] }, educatorReq),
      ).rejects.toThrow(BadRequestException);
    });

    it('UNIT: creating class with invalid format student codes fails with format error', async () => {
      const result = await service.create(
        { ...validDto, class_name: 'Science 101' },
        makeEducator(),
        [{ student_id: 'invalid-len' }],
      );
      expect(result.success).toBe(false);
      expect(result.message).toContain('The following Student Codes are invalid: invalid-len.');
      expect(result.message).toContain(
        'Student Codes must be 8 characters with 3 characters before and 4 characters after a hyphen, with only an alphabet and number combination (e.g., SSS-R12C).',
      );
    });
  });
});

// School-groups read model (GET /classes/schools, GET /classes) — the
// findSchoolGroups/findClasses methods on ClassesController/ClassesService.
describe('toStringArray', () => {
  it('returns undefined for empty/undefined input', () => {
    expect(toStringArray(undefined)).toBeUndefined();
    expect(toStringArray('')).toBeUndefined();
  });

  it('splits a comma-separated string', () => {
    expect(toStringArray('a,b, c')).toEqual(['a', 'b', 'c']);
  });

  it('passes through a repeated-param array', () => {
    expect(toStringArray(['a', 'b'])).toEqual(['a', 'b']);
  });

  it('flattens comma-separated entries within an array', () => {
    expect(toStringArray(['a,b', 'c'])).toEqual(['a', 'b', 'c']);
  });
});

describe('ClassGroups (Controller + Service, merged into Classes)', () => {
  const groupsCurrentUser: ICurrentUser = {
    userId: 'edu-1',
    educatorId: 'edu-1',
    roles: [RoleSlug.EDUCATOR],
  };
  let groupsController: ClassesController;
  let groupsService: ClassesService;

  const groupsClassRepo = {
    findSchoolGroupsForEducator: jest.fn(),
    findClasses: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    groupsService = new ClassesService(
      {} as any, // classSimulationService
      groupsClassRepo as unknown as ClassRepository,
      {} as any, // classEducatorRepo
      {} as any, // studentRepo
      {} as any, // educatorRepo
      {} as any, // educatorSchoolRepo
      {} as any, // googleCourseMappingRepo
      {} as any, // googleStudentMappingRepo
      {} as any, // lmsClassMappingRepo
      { insertManyIgnoreConflicts: jest.fn(), delete: jest.fn() } as any, // lmsStudentMappingRepo
      {} as any, // simulationReportRepo
      {} as any, // dataSource
      {} as any, // lmsProvisionService
      {} as any,
      {} as any,
      { log: jest.fn(), warn: jest.fn(), error: jest.fn() } as any, // logger
    );
    groupsController = new ClassesController(
      groupsService,
      {} as any, // lmsLookupService
      {} as any, // lmsConfigService
      {} as any, // lmsRosterService
    );
  });

  describe('findSchoolGroups', () => {
    it('UNIT: splits the unassigned sentinel out of schoolId before querying the repository', async () => {
      groupsClassRepo.findSchoolGroupsForEducator.mockResolvedValue({ rows: [], total: 0 });
      const dto: ListSchoolGroupsReqDto = {
        page: 1,
        pageSize: 10,
        schoolId: ['3fa85f64-5717-4562-b3fc-2c963f66afa6', 'unassigned'],
      };

      await groupsService.findSchoolGroups(groupsCurrentUser, dto);

      expect(groupsClassRepo.findSchoolGroupsForEducator).toHaveBeenCalledWith(
        'edu-1',
        expect.objectContaining({
          schoolIds: ['3fa85f64-5717-4562-b3fc-2c963f66afa6'],
          includeUnassigned: true,
        }),
        expect.objectContaining({ skip: 0, take: 10 }),
      );
    });

    it('UNIT: passes schoolName and className filters through to the repository', async () => {
      groupsClassRepo.findSchoolGroupsForEducator.mockResolvedValue({ rows: [], total: 0 });
      const dto: ListSchoolGroupsReqDto = {
        page: 1,
        pageSize: 10,
        schoolName: 'Cedar Hollow',
        className: 'Nursing',
      };

      await groupsService.findSchoolGroups(groupsCurrentUser, dto);

      expect(groupsClassRepo.findSchoolGroupsForEducator).toHaveBeenCalledWith(
        'edu-1',
        expect.objectContaining({ schoolName: 'Cedar Hollow', className: 'Nursing' }),
        expect.objectContaining({ skip: 0, take: 10 }),
      );
    });

    it('UNIT: passes the classId filter through to the repository as classIds', async () => {
      groupsClassRepo.findSchoolGroupsForEducator.mockResolvedValue({ rows: [], total: 0 });
      const dto: ListSchoolGroupsReqDto = {
        page: 1,
        pageSize: 10,
        classId: ['3fa85f64-5717-4562-b3fc-2c963f66afa6'],
      };

      await groupsService.findSchoolGroups(groupsCurrentUser, dto);

      expect(groupsClassRepo.findSchoolGroupsForEducator).toHaveBeenCalledWith(
        'edu-1',
        expect.objectContaining({ classIds: ['3fa85f64-5717-4562-b3fc-2c963f66afa6'] }),
        expect.objectContaining({ skip: 0, take: 10 }),
      );
    });

    it('UNIT: passes endDateFrom through to the repository filters', async () => {
      groupsClassRepo.findClasses.mockResolvedValue({ rows: [], total: 0 });
      await groupsService.findClasses(groupsCurrentUser, {
        page: 1,
        pageSize: 10,
        endDateFrom: '2026-06-15',
      });

      expect(groupsClassRepo.findClasses).toHaveBeenCalledWith(
        'edu-1',
        expect.objectContaining({ endDateFrom: '2026-06-15' }),
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('UNIT: leaves endDateFrom unset when it is omitted', async () => {
      groupsClassRepo.findClasses.mockResolvedValue({ rows: [], total: 0 });
      await groupsService.findClasses(groupsCurrentUser, { page: 1, pageSize: 10 });

      const filters = groupsClassRepo.findClasses.mock.calls[0][1] as { endDateFrom?: string };
      expect(filters.endDateFrom).toBeUndefined();
    });

    it.each([
      ['equal to endDateTo', '2026-06-15', '2026-06-15'],
      ['earlier than endDateTo', '2026-06-01', '2026-06-15'],
    ])('UNIT: accepts endDateFrom %s', async (_label, endDateFrom, endDateTo) => {
      groupsClassRepo.findClasses.mockResolvedValue({ rows: [], total: 0 });

      await groupsService.findClasses(groupsCurrentUser, {
        page: 1,
        pageSize: 10,
        endDateFrom,
        endDateTo,
      });

      expect(groupsClassRepo.findClasses).toHaveBeenCalledTimes(1);
    });

    it('UNIT: refuses endDateFrom later than endDateTo, naming both fields, without querying', async () => {
      await expect(
        groupsService.findClasses(groupsCurrentUser, {
          page: 1,
          pageSize: 10,
          endDateFrom: '2026-07-01',
          endDateTo: '2026-06-01',
        }),
      ).rejects.toMatchObject({
        response: {
          message: ERROR_MSG.COMMON.INVALID_DATE_RANGE('endDateFrom', 'endDateTo'),
        },
      });
      expect(groupsClassRepo.findClasses).not.toHaveBeenCalled();
    });

    it('UNIT: does not treat endDateFrom earlier than startDateFrom as a conflict', async () => {
      groupsClassRepo.findClasses.mockResolvedValue({ rows: [], total: 0 });

      await groupsService.findClasses(groupsCurrentUser, {
        page: 1,
        pageSize: 10,
        startDateFrom: '2026-03-01',
        endDateFrom: '2026-02-01',
      });

      expect(groupsClassRepo.findClasses).toHaveBeenCalledTimes(1);
    });

    it('UNIT: threads the measure drill-down filter through to the repository', async () => {
      groupsClassRepo.findSchoolGroupsForEducator.mockResolvedValue({ rows: [], total: 0 });
      const dto: ListSchoolGroupsReqDto = {
        page: 1,
        pageSize: 10,
        measure: ClassAttentionMeasure.NO_ASSIGNED_SIMS,
      };

      await groupsService.findSchoolGroups(groupsCurrentUser, dto);

      expect(groupsClassRepo.findSchoolGroupsForEducator).toHaveBeenCalledWith(
        'edu-1',
        expect.objectContaining({ measure: ClassAttentionMeasure.NO_ASSIGNED_SIMS }),
        expect.objectContaining({ skip: 0, take: 10 }),
      );
    });

    it('UNIT: passes the class status and start/end date filters through to the repository', async () => {
      groupsClassRepo.findSchoolGroupsForEducator.mockResolvedValue({ rows: [], total: 0 });
      const dto: ListSchoolGroupsReqDto = {
        page: 1,
        pageSize: 10,
        classStatus: [CommonStatus.ACTIVE],
        classStartDateFrom: '2026-01-01',
        classEndDateTo: '2026-12-31',
      };

      await groupsService.findSchoolGroups(groupsCurrentUser, dto);

      expect(groupsClassRepo.findSchoolGroupsForEducator).toHaveBeenCalledWith(
        'edu-1',
        expect.objectContaining({
          classStatuses: [CommonStatus.ACTIVE],
          classStartDateFrom: '2026-01-01',
          classEndDateTo: '2026-12-31',
        }),
        expect.objectContaining({ skip: 0, take: 10 }),
      );
    });

    it('UNIT: rejects an inverted class date range before querying the repository', async () => {
      await expect(
        groupsService.findSchoolGroups(groupsCurrentUser, {
          page: 1,
          pageSize: 10,
          classStartDateFrom: '2026-12-31',
          classEndDateTo: '2026-01-01',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(groupsClassRepo.findSchoolGroupsForEducator).not.toHaveBeenCalled();
    });

    it('UNIT: maps rows to response DTOs, labelling the unassigned bucket and using meta.total from the row', async () => {
      groupsClassRepo.findSchoolGroupsForEducator.mockResolvedValue({
        rows: [
          { schoolId: 'school-1', schoolName: 'Lincoln High', classCount: 3 },
          { schoolId: null, schoolName: null, classCount: 1 },
        ],
        total: 2,
      });

      const result = await groupsService.findSchoolGroups(groupsCurrentUser, {
        page: 1,
        pageSize: 10,
      });

      expect(result.data).toEqual([
        { schoolId: 'school-1', schoolName: 'Lincoln High', classCount: 3 },
        { schoolId: null, schoolName: ClassConstants.UNASSIGNED_SCHOOL_LABEL, classCount: 1 },
      ]);
      expect(result.meta?.total).toBe(2);
    });

    it('UNIT: returns an empty list with total 0 when there are no groups', async () => {
      groupsClassRepo.findSchoolGroupsForEducator.mockResolvedValue({ rows: [], total: 0 });
      const result = await groupsService.findSchoolGroups(groupsCurrentUser, {
        page: 1,
        pageSize: 10,
      });
      expect(result.data).toEqual([]);
      expect(result.meta?.total).toBe(0);
    });

    it('UNIT: reports the true total from the repository even when an out-of-range page returns no rows', async () => {
      groupsClassRepo.findSchoolGroupsForEducator.mockResolvedValue({ rows: [], total: 4 });
      const result = await groupsService.findSchoolGroups(groupsCurrentUser, {
        page: 99,
        pageSize: 10,
      });
      expect(result.data).toEqual([]);
      expect(result.meta?.total).toBe(4);
    });

    it('INTEGRATION: controller delegates to the service', async () => {
      groupsClassRepo.findSchoolGroupsForEducator.mockResolvedValue({ rows: [], total: 0 });
      const dto: ListSchoolGroupsReqDto = { page: 1, pageSize: 10 };
      const result = await groupsController.findSchoolGroups(groupsCurrentUser, dto);
      expect(result.data).toEqual([]);
    });

    it('UNIT: passes the measure filter through to the repository', async () => {
      groupsClassRepo.findSchoolGroupsForEducator.mockResolvedValue({ rows: [], total: 0 });
      await groupsService.findSchoolGroups(groupsCurrentUser, {
        page: 1,
        pageSize: 10,
        measure: ClassAttentionMeasure.CLOSING_SOON,
      });

      expect(groupsClassRepo.findSchoolGroupsForEducator).toHaveBeenCalledWith(
        'edu-1',
        expect.objectContaining({ measure: ClassAttentionMeasure.CLOSING_SOON }),
        expect.any(Object),
      );
    });
  });

  describe('findClasses', () => {
    it('UNIT: splits the unassigned sentinel out of schoolIds before querying the repository', async () => {
      groupsClassRepo.findClasses.mockResolvedValue({ rows: [], total: 0 });
      await groupsService.findClasses(groupsCurrentUser, {
        page: 1,
        pageSize: 10,
        schoolIds: [
          '3fa85f64-5717-4562-b3fc-2c963f66afa6',
          ClassConstants.UNASSIGNED_SCHOOL_SENTINEL,
        ],
      });

      expect(groupsClassRepo.findClasses).toHaveBeenCalledWith(
        'edu-1',
        expect.objectContaining({
          schoolIds: ['3fa85f64-5717-4562-b3fc-2c963f66afa6'],
          includeUnassigned: true,
        }),
        expect.objectContaining({ field: undefined, dir: 'ASC' }),
        expect.objectContaining({ skip: 0, take: 10 }),
      );
    });

    it('UNIT: leaves the school scope unrestricted when schoolIds is omitted', async () => {
      groupsClassRepo.findClasses.mockResolvedValue({ rows: [], total: 0 });
      await groupsService.findClasses(groupsCurrentUser, { page: 1, pageSize: 10 });

      expect(groupsClassRepo.findClasses).toHaveBeenCalledWith(
        'edu-1',
        expect.objectContaining({ schoolIds: undefined, includeUnassigned: false }),
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('UNIT: passes the Filter-Classes-derived filters and sort through to the repository', async () => {
      groupsClassRepo.findClasses.mockResolvedValue({ rows: [], total: 0 });
      const dto: ListClassesReqDto = {
        page: 1,
        pageSize: 10,
        search: 'onco',
        schoolIds: ['school-1'],
        classId: ['3fa85f64-5717-4562-b3fc-2c963f66afa6'],
        status: [CommonStatus.ACTIVE],
        startDateFrom: '2026-01-01',
        endDateTo: '2026-12-31',
        sortBy: ClassSortField.CLASS_NAME,
        sortDir: 'desc',
      };

      await groupsService.findClasses(groupsCurrentUser, dto);

      expect(groupsClassRepo.findClasses).toHaveBeenCalledWith(
        'edu-1',
        {
          search: 'onco',
          classIds: ['3fa85f64-5717-4562-b3fc-2c963f66afa6'],
          statuses: [CommonStatus.ACTIVE],
          startDateFrom: '2026-01-01',
          endDateTo: '2026-12-31',
          schoolIds: ['school-1'],
          includeUnassigned: false,
          measure: undefined,
          lite: false,
        },
        { field: ClassSortField.CLASS_NAME, dir: 'DESC' },
        { skip: 0, take: 10 },
      );
    });

    it('UNIT: threads the measure drill-down filter through to the repository', async () => {
      groupsClassRepo.findClasses.mockResolvedValue({ rows: [], total: 0 });
      await groupsService.findClasses(groupsCurrentUser, {
        page: 1,
        pageSize: 10,
        measure: ClassAttentionMeasure.UNREAD_REPORTS,
      });

      expect(groupsClassRepo.findClasses).toHaveBeenCalledWith(
        'edu-1',
        expect.objectContaining({ measure: ClassAttentionMeasure.UNREAD_REPORTS }),
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('UNIT: threads measure=active through to the repository', async () => {
      groupsClassRepo.findClasses.mockResolvedValue({ rows: [], total: 0 });
      await groupsService.findClasses(groupsCurrentUser, {
        page: 1,
        pageSize: 10,
        measure: ClassAttentionMeasure.ACTIVE,
      });

      expect(groupsClassRepo.findClasses).toHaveBeenCalledWith(
        'edu-1',
        expect.objectContaining({ measure: ClassAttentionMeasure.ACTIVE }),
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('UNIT: ignores sortDir when sortBy is absent, even when sortDir is garbage', async () => {
      groupsClassRepo.findClasses.mockResolvedValue({ rows: [], total: 0 });

      await groupsService.findClasses(groupsCurrentUser, {
        page: 1,
        pageSize: 10,
        sortDir: 'garbage' as unknown as 'asc' | 'desc',
      });

      expect(groupsClassRepo.findClasses).toHaveBeenCalledWith(
        'edu-1',
        expect.any(Object),
        { field: undefined, dir: 'ASC' },
        expect.any(Object),
      );
    });

    it('UNIT: rejects an inverted date range before querying the repository', async () => {
      await expect(
        groupsService.findClasses(groupsCurrentUser, {
          page: 1,
          pageSize: 10,
          startDateFrom: '2026-12-31',
          endDateTo: '2026-01-01',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(groupsClassRepo.findClasses).not.toHaveBeenCalled();
    });

    it('UNIT: maps rows to the lean class-summary shape (no nested students/sims)', async () => {
      groupsClassRepo.findClasses.mockResolvedValue({
        rows: [
          {
            id: 'class-1',
            className: 'Oncology Nursing',
            startDate: '2026-01-01',
            endDate: '2026-12-31',
            status: CommonStatus.ACTIVE,
            studentsCount: 28,
            simsCount: 7,
            reportsCount: 0,
            unreadReportsCount: 0,
          },
        ],
        total: 1,
      });

      const result = await groupsService.findClasses(groupsCurrentUser, {
        page: 1,
        pageSize: 10,
      });

      expect(result.data).toEqual([
        {
          classId: 'class-1',
          className: 'Oncology Nursing',
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          studentsCount: 28,
          simsCount: 7,
          reportsCount: 0,
          unreadReportsCount: 0,
          status: CommonStatus.ACTIVE,
        },
      ]);
      expect(result.data?.[0]).not.toHaveProperty('students');
      expect(result.data?.[0]).not.toHaveProperty('sims');
      expect(result.meta?.total).toBe(1);
    });

    it('UNIT: lite=true passes lite:true to the repository and maps id, name, dates and status', async () => {
      groupsClassRepo.findClasses.mockResolvedValue({
        rows: [
          {
            id: 'class-1',
            className: 'Oncology Nursing',
            startDate: '2026-01-01',
            endDate: '2026-12-31',
            status: CommonStatus.INACTIVE,
          },
        ],
        total: 1,
      });

      const result = await groupsService.findClasses(groupsCurrentUser, {
        page: 1,
        pageSize: 10,
        lite: true,
      });

      expect(groupsClassRepo.findClasses).toHaveBeenCalledWith(
        'edu-1',
        expect.objectContaining({ lite: true }),
        expect.any(Object),
        expect.any(Object),
      );
      expect(result.data).toEqual([
        {
          classId: 'class-1',
          className: 'Oncology Nursing',
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          status: CommonStatus.INACTIVE,
        },
      ]);
      expect(result.data?.[0]).not.toHaveProperty('studentsCount');
    });

    it('UNIT: reports the true total from the repository even when an out-of-range page returns no rows', async () => {
      groupsClassRepo.findClasses.mockResolvedValue({ rows: [], total: 7 });
      const result = await groupsService.findClasses(groupsCurrentUser, {
        page: 99,
        pageSize: 10,
      });
      expect(result.data).toEqual([]);
      expect(result.meta?.total).toBe(7);
    });

    it('INTEGRATION: controller delegates to the service', async () => {
      groupsClassRepo.findClasses.mockResolvedValue({ rows: [], total: 0 });
      const result = await groupsController.findClasses(groupsCurrentUser, {
        page: 1,
        pageSize: 10,
      });
      expect(result.data).toEqual([]);
    });
  });

  describe('getClassStatuses', () => {
    it('UNIT: returns the DB-valid class status values', async () => {
      const result = await groupsService.getClassStatuses();

      expect(result.data?.statuses).toEqual(ClassConstants.VALID_STATUSES);
    });

    it('INTEGRATION: controller delegates to the service', async () => {
      const result = await groupsController.getClassStatuses();

      expect(result.data?.statuses).toEqual(ClassConstants.VALID_STATUSES);
    });
  });
});

describe('ClassesService LMS student mappings (single conflict-ignoring insert)', () => {
  const educator = { id: 'edu-1' } as Educator;
  const insertManyIgnoreConflicts = jest.fn();
  const lmsStudentMappingRepo = { insertManyIgnoreConflicts, delete: jest.fn() };
  const lmsClassMappingRepo = { findOne: jest.fn(), create: jest.fn(), delete: jest.fn() };
  const studentRepo = {
    findAllNonEmptyStudentCodes: jest.fn(),
    findExistingStudentCodes: jest.fn(),
    find: jest.fn(),
    saveMany: jest.fn(),
  };
  const classRepo = { findOne: jest.fn(), create: jest.fn() };
  const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const staleLinkQuery = {
    update: () => staleLinkQuery,
    set: () => staleLinkQuery,
    where: () => staleLinkQuery,
    andWhere: () => staleLinkQuery,
    execute: async () => undefined,
  };
  let service: ClassesService;

  beforeEach(() => {
    jest.resetAllMocks();
    insertManyIgnoreConflicts.mockResolvedValue(undefined);
    studentRepo.findAllNonEmptyStudentCodes.mockResolvedValue([]);
    studentRepo.findExistingStudentCodes.mockResolvedValue([]);
    studentRepo.find.mockResolvedValue([]);
    studentRepo.saveMany.mockImplementation(async (rows: unknown[]) => rows);
    classRepo.create.mockImplementation(async (data: Partial<Class>) => ({
      id: 'class-1',
      ...data,
    }));
    classRepo.findOne.mockResolvedValue(null);
    service = new ClassesService(
      {} as any, // classSimulationService
      classRepo as unknown as ClassRepository,
      {} as any, // classEducatorRepo
      studentRepo as any,
      {} as any, // educatorRepo
      {} as any, // educatorSchoolRepo
      {} as any, // googleCourseMappingRepo
      {} as any, // googleStudentMappingRepo
      lmsClassMappingRepo as any,
      lmsStudentMappingRepo as any,
      {} as any, // simulationReportRepo
      { manager: { createQueryBuilder: () => staleLinkQuery } } as any, // dataSource
      {} as any, // lmsProvisionService
      {} as any,
      {} as any,
      logger as any,
    );
  });

  it('UNIT: syncing an existing linked class writes every mapping in one insert', async () => {
    const linkedClass = { id: 'class-1', lms_class_id: 'ABC', class_name: 'X' } as Class;
    const students = [
      { student_id: '007' },
      { student_id: 'u2' },
      { student_id: 'ABC-9' },
    ] as CreateStudentDto[];

    await (service as any).syncExistingLmsLinkedClass(
      linkedClass,
      {},
      educator,
      students,
      'course-1',
      'school-1',
    );

    expect(insertManyIgnoreConflicts).toHaveBeenCalledTimes(1);
    expect(insertManyIgnoreConflicts).toHaveBeenCalledWith([
      { schoolId: 'school-1', classId: 'class-1', lmsUserId: '007', studentCode: 'ABC-7' },
      { schoolId: 'school-1', classId: 'class-1', lmsUserId: 'u2', studentCode: 'ABC-u2' },
    ]);
    expect(linkedClass.total_no_of_students).toBe(3);
  });

  it('UNIT: creating a class from an LMS course writes every mapping in one insert', async () => {
    classRepo.create.mockImplementation(async (data: Partial<Class>) => ({
      id: 'class-2',
      ...data,
      lms_class_id: 'XYZ',
    }));
    lmsClassMappingRepo.findOne.mockResolvedValue(null);
    lmsClassMappingRepo.create.mockResolvedValue({});

    const result = await service.create(
      { class_name: 'LMS class', lmsCourseId: 'course-2', school_id: 'school-2' } as ClassDto,
      educator,
      [{ student_id: '1' }, { student_id: '2' }] as CreateStudentDto[],
    );

    expect(result.success).toBe(true);

    expect(insertManyIgnoreConflicts).toHaveBeenCalledTimes(1);
    expect(insertManyIgnoreConflicts).toHaveBeenCalledWith([
      { schoolId: 'school-2', classId: 'class-2', lmsUserId: '1', studentCode: 'XYZ-1' },
      { schoolId: 'school-2', classId: 'class-2', lmsUserId: '2', studentCode: 'XYZ-2' },
    ]);
  });
});
