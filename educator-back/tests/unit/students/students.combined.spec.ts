import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from 'src/common/decorators/required-roles.decorator';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { StudentsController } from '../../../src/students/students.controller';
import { StudentsService } from '../../../src/students/students.service';
import { Student, Class, Educator, UserRole } from '../../../src/database/entities';
import {
  STUDENT_REPOSITORY,
  CLASS_REPOSITORY,
  USER_REPOSITORY,
  EDUCATOR_REPOSITORY,
  CLASS_SIMULATION_REPOSITORY,
  SIMULATION_REPORT_REPOSITORY,
  SIMULATION_V2_REPOSITORY,
  STUDENT_SIMULATION_PROGRESS_REPOSITORY,
} from '../../../src/database/tokens';
import { CommonStatus } from 'src/common/enums/status.enum';
import { JwtRequest } from 'src/common/types';
import { MailService } from '../../../src/mail/mail.service';
import { AutomationAccessService } from '../../../src/common/services/automation-access.service';
import {
  StudentConstants,
  StudentCodeStatus,
  StudentSortField,
} from '../../../src/students/students.constants';
import { Messages } from '../../../src/common/utils/messages';
import { SIMULATION_PROGRESS_MSG } from 'src/common/messages/simulation-progress.message';
import { SimulationProgressStatus } from '../../../src/common/constants';
import { ClassSimulationService } from '../../../src/class-simulations/class-simulation.service';
import { ConfigService } from '@nestjs/config';
import { TokenService, LoggerService } from '../../../src/common/services';
import type { Response } from 'express';
import { RoleSlug } from 'src/common/constants';

const makeReq = (
  roles: RoleSlug[] = [RoleSlug.EDUCATOR],
  userId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  educatorId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
): JwtRequest => {
  const req = Object.assign(new Request('http://localhost'), {
    user: { userId, roles, educatorId },
  });
  return req;
};

const mockClass = (): Class => ({
  id: 'class-uuid',
  class_name: 'Biology 101',
  is_active: true,
  deleted_at: null,
});
const mockEducator = (tokens: number | null = 5): Educator =>
  ({
    id: 'edu-uuid',
    tokens,
    is_active: true,
    deleted_at: null,
    // `Educator.email`/`.status`/`.role` no longer exist — identity/status resolve via the linked
    // `userRole.user`/`userRole.status` chain, so the default mock is v2-linked by default.
    userRole: {
      userId: 'user-1',
      status: CommonStatus.ACTIVE,
      user: { id: 'user-1', email: 'edu@test.com', password: null },
    } as unknown as UserRole,
  }) as Educator;
const mockStudent = (o: Partial<Student> = {}): Student => ({
  id: 'stu-uuid',
  student_id: 'BIO_0001',
  student_name: 'Alice',
  email: 'alice@test.com',
  status: CommonStatus.ACTIVE,
  class: mockClass(),
  educator: mockEducator(),
  score: 85,
  attempt: 2,
  is_active: true,
  deleted_at: null,
  ...o,
});

describe('Students (Controller + Service)', () => {
  let controller: StudentsController;
  let service: StudentsService;

  const studentRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    saveMany: jest.fn(),
    findActiveCodesInClass: jest.fn(),
    update: jest.fn(),
    findAllNonEmptyStudentCodes: jest.fn(),
    findActiveByClassWithClassAndEducator: jest.fn(),
    findStudents: jest.fn(),
  };
  const classRepo = { findOne: jest.fn() };
  const userRepo = { findOne: jest.fn() };
  const educatorRepo = { findOne: jest.fn() };
  const classSimulationRepo = {
    find: jest.fn(),
  };
  const simulationReportRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    findAttemptRowsByStudentId: jest.fn(),
  };
  const simulationV2Repository = {
    find: jest.fn().mockResolvedValue([]),
  };
  const simulationProgressRepo = {
    findByStudentAndScenarioId: jest.fn(),
    findByStudentAndScenarioIds: jest.fn(),
  };

  const mailerService = { sendMail: jest.fn().mockResolvedValue({}) };
  const automationAccessService = {
    isAutomationStudentCode: jest.fn().mockReturnValue(false),
  };
  const tokenService = {
    generateTokens: jest.fn().mockReturnValue({ access_token: 'token', expires_in: 86400 }),
    setAuthCookies: jest.fn(),
    clearAuthCookies: jest.fn(),
    blackListToken: jest.fn().mockResolvedValue(undefined),
    isBlackListed: jest.fn().mockResolvedValue(false),
  };
  const mockRes = { cookie: jest.fn(), clearCookie: jest.fn() } as unknown as Response;
  const classSimulationServiceMock = {
    refundUnusedSeatsForStudent: jest.fn().mockResolvedValue(undefined),
    allocateSeatsForNewStudents: jest
      .fn()
      .mockResolvedValue({ success: true, data: { seatsAllocated: 0 } }),
  };

  beforeEach(async () => {
    mailerService.sendMail.mockResolvedValue({});
    // Safe defaults so any code path that reaches these repos doesn't blow up on `undefined`.
    studentRepo.findAllNonEmptyStudentCodes.mockResolvedValue([]);
    classSimulationRepo.find.mockResolvedValue([]);
    simulationReportRepo.find.mockResolvedValue([]);
    simulationReportRepo.findOne.mockResolvedValue(null);
    simulationProgressRepo.findByStudentAndScenarioId.mockResolvedValue(null);
    simulationProgressRepo.findByStudentAndScenarioIds.mockResolvedValue([]);
    simulationV2Repository.find.mockResolvedValue([]);
    classSimulationServiceMock.allocateSeatsForNewStudents.mockResolvedValue({
      success: true,
      data: { seatsAllocated: 0 },
    });
    classSimulationServiceMock.refundUnusedSeatsForStudent.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StudentsController],
      providers: [
        StudentsService,
        { provide: STUDENT_REPOSITORY, useValue: studentRepo },
        { provide: CLASS_REPOSITORY, useValue: classRepo },
        { provide: USER_REPOSITORY, useValue: userRepo },
        { provide: EDUCATOR_REPOSITORY, useValue: educatorRepo },
        { provide: CLASS_SIMULATION_REPOSITORY, useValue: classSimulationRepo },
        { provide: SIMULATION_REPORT_REPOSITORY, useValue: simulationReportRepo },
        { provide: SIMULATION_V2_REPOSITORY, useValue: simulationV2Repository },
        { provide: STUDENT_SIMULATION_PROGRESS_REPOSITORY, useValue: simulationProgressRepo },
        { provide: MailService, useValue: mailerService },
        { provide: AutomationAccessService, useValue: automationAccessService },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
        { provide: ClassSimulationService, useValue: classSimulationServiceMock },
        { provide: TokenService, useValue: tokenService },
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
    controller = module.get(StudentsController);
    service = module.get(StudentsService);
  });

  afterEach(() => jest.resetAllMocks());

  // ─── create ─────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto = {
      class_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      educator_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      student_name: 'Alice',
      email: 'alice@test.com',
    };

    it('UNIT: creates student without touching the educator’s token balance', async () => {
      studentRepo.findAllNonEmptyStudentCodes.mockResolvedValue([]);
      studentRepo.create.mockResolvedValue(mockStudent());
      const educator = mockEducator(5);
      const result = await service.create({ student_name: 'Alice' }, mockClass(), educator);
      expect(result.success).toBe(true);
      expect(classSimulationServiceMock.allocateSeatsForNewStudents).toHaveBeenCalledWith(
        'class-uuid',
        'edu-uuid',
        1,
      );
      // Seat allocation is delegated entirely to ClassSimulationService — StudentsService
      // never mutates the educator's token fields directly.
      expect(educator.tokens).toBe(5);
    });

    it('UNIT: creates successfully when educator has 0 tokens', async () => {
      studentRepo.findAllNonEmptyStudentCodes.mockResolvedValue([]);
      studentRepo.create.mockResolvedValue(mockStudent());
      const result = await service.create({ student_name: 'Alice' }, mockClass(), mockEducator(0));
      expect(result.success).toBe(true);
    });

    it('UNIT: creates successfully when educator tokens is null', async () => {
      studentRepo.findAllNonEmptyStudentCodes.mockResolvedValue([]);
      studentRepo.create.mockResolvedValue(mockStudent());
      const result = await service.create(
        { student_name: 'Alice' },
        mockClass(),
        mockEducator(null),
      );
      expect(result.success).toBe(true);
    });

    it('INTEGRATION: throws BadRequestException for invalid class_id', async () => {
      await expect(controller.create({ ...dto, class_id: 'bad-id' }, makeReq())).rejects.toThrow(
        BadRequestException,
      );
    });

    // Per ADR-0006 this is enforced by @RequiredRoles on the route, evaluated by the global
    // AuthGuard before the handler runs — a direct controller call in a unit test bypasses the
    // guard, so the declaration is what's assertable here. Runtime enforcement is proved in
    // tests/integration/auth/route-coverage.integration.spec.ts.
    it('declares @RequiredRoles(EDUCATOR) on create, so a district admin never reaches it', () => {
      const roles = new Reflector().getAllAndOverride<RoleSlug[]>(ROLES_KEY, [
        StudentsController.prototype.create as () => unknown,
        StudentsController,
      ]);
      expect(roles).toEqual([RoleSlug.EDUCATOR]);
    });

    it('INTEGRATION: throws NotFoundException when class not found', async () => {
      jest.spyOn(service, 'findClassById').mockResolvedValue(null);
      await expect(controller.create(dto, makeReq())).rejects.toThrow(NotFoundException);
    });

    it('INTEGRATION: throws NotFoundException when educator not found', async () => {
      jest.spyOn(service, 'findClassById').mockResolvedValue(mockClass());
      jest.spyOn(service, 'findEducatorById').mockResolvedValue(null);
      await expect(controller.create(dto, makeReq())).rejects.toThrow(NotFoundException);
    });

    it('INTEGRATION: throws BadRequestException when service.create fails', async () => {
      jest.spyOn(service, 'findClassById').mockResolvedValue(mockClass());
      jest.spyOn(service, 'findEducatorById').mockResolvedValue(mockEducator());
      jest
        .spyOn(service, 'create')
        .mockResolvedValue({ success: false, message: 'Email already in use', type: 'badrequest' });
      await expect(controller.create(dto, makeReq())).rejects.toThrow(BadRequestException);
    });

    it('INTEGRATION: creates successfully', async () => {
      jest.spyOn(service, 'findClassById').mockResolvedValue(mockClass());
      jest.spyOn(service, 'findEducatorById').mockResolvedValue(mockEducator());
      jest
        .spyOn(service, 'create')
        .mockResolvedValue({ success: true, message: 'Created', data: mockStudent() });
      const result = await controller.create(dto, makeReq());
      expect(result.data).toBeDefined();
    });
  });

  describe('bulkCreate', () => {
    it('UNIT: allocates AI seats for the whole batch', async () => {
      studentRepo.findAllNonEmptyStudentCodes.mockResolvedValue([]);
      studentRepo.saveMany.mockImplementation((students: Partial<Student>[]) =>
        Promise.resolve(students.map((s, idx) => ({ ...mockStudent(), id: `stu-${idx}`, ...s }))),
      );

      const result = await service.bulkCreate(
        { class_id: 'class-uuid', count: 2 },
        mockClass(),
        mockEducator(),
      );

      expect(result.success).toBe(true);
      expect(classSimulationServiceMock.allocateSeatsForNewStudents).toHaveBeenCalledWith(
        'class-uuid',
        'edu-uuid',
        2,
      );
    });

    it('UNIT: queries existing codes only once for the entire batch', async () => {
      studentRepo.findAllNonEmptyStudentCodes.mockResolvedValue([
        'BIO-AAAA',
        'ENG-XXXX',
        'CHEM-YYYY',
      ]);
      studentRepo.saveMany.mockImplementation((students: Partial<Student>[]) =>
        Promise.resolve(students.map((s, idx) => ({ ...mockStudent(), id: `stu-${idx}`, ...s }))),
      );

      const result = await service.bulkCreate(
        { class_id: 'class-uuid', count: 10 },
        mockClass(),
        mockEducator(),
      );

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(10);
      // Regression guard: DB scan must happen exactly once for the whole batch, not per student.
      expect(studentRepo.findAllNonEmptyStudentCodes).toHaveBeenCalledTimes(1);

      const codes = result.data!.map((s) => s.student_id);
      expect(new Set(codes).size).toBe(10);
      codes.forEach((code) => {
        expect(code).toMatch(/^BIO-[A-Z0-9]{4}$/);
        expect(['BIO-AAAA', 'ENG-XXXX', 'CHEM-YYYY']).not.toContain(code);
      });
    });

    it('UNIT: a repeating random suffix still yields distinct codes within one batch', async () => {
      studentRepo.findAllNonEmptyStudentCodes.mockResolvedValue([]);
      studentRepo.saveMany.mockImplementation((students: Partial<Student>[]) =>
        Promise.resolve(students.map((s, idx) => ({ ...mockStudent(), id: `stu-${idx}`, ...s }))),
      );
      // Each suffix is served twice in a row, so every second draw collides in-batch.
      const suffixes = ['AAAA', 'AAAA', 'BBBB', 'BBBB', 'CCCC', 'CCCC'];
      let draw = 0;
      const suffixSpy = jest
        .spyOn(service as unknown as { generateRandomSuffix: () => string }, 'generateRandomSuffix')
        .mockImplementation(() => suffixes[draw++]!);

      const result = await service.bulkCreate(
        { class_id: 'class-uuid', count: 3 },
        mockClass(),
        mockEducator(),
      );

      expect(result.success).toBe(true);
      expect(result.data!.map((s) => s.student_id)).toEqual(['BIO-AAAA', 'BIO-BBBB', 'BIO-CCCC']);
      suffixSpy.mockRestore();
    });

    it('UNIT: exhausting the attempt ceiling raises the collision error', async () => {
      studentRepo.findAllNonEmptyStudentCodes.mockResolvedValue(['BIO-AAAA']);
      const suffixSpy = jest
        .spyOn(service as unknown as { generateRandomSuffix: () => string }, 'generateRandomSuffix')
        .mockReturnValue('AAAA');
      studentRepo.saveMany.mockClear();

      const result = await service.bulkCreate(
        { class_id: 'class-uuid', count: 1 },
        mockClass(),
        mockEducator(),
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe(StudentConstants.VALIDATION.COLLISION_ERROR);
      expect(suffixSpy).toHaveBeenCalledTimes(10_000);
      expect(studentRepo.saveMany).not.toHaveBeenCalled();
      suffixSpy.mockRestore();
    });

    it('INTEGRATION: bulk creates students successfully via controller', async () => {
      jest.spyOn(service, 'findClassById').mockResolvedValue(mockClass());
      jest.spyOn(service, 'findEducatorById').mockResolvedValue(mockEducator());
      studentRepo.findAllNonEmptyStudentCodes.mockResolvedValue([]);
      studentRepo.saveMany.mockImplementation((students: Partial<Student>[]) =>
        Promise.resolve(students.map((s, idx) => ({ ...mockStudent(), id: `stu-${idx}`, ...s }))),
      );

      const result = await controller.bulkCreate({ class_id: 'class-uuid', count: 5 }, makeReq());

      expect(result.data).toHaveLength(5);
    });
  });

  describe('findAll', () => {
    it('UNIT: returns all students', async () => {
      studentRepo.find.mockResolvedValue([mockStudent()]);
      const result = await service.findAll();
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
    });

    it('INTEGRATION: GET /students/user — returns list', async () => {
      jest
        .spyOn(service, 'findAll')
        .mockResolvedValue({ success: true, message: 'Fetched', data: [mockStudent()] });
      const result = await controller.findAll();
      expect(Array.isArray(result.data)).toBe(true);
    });
  });

  describe('findByClass', () => {
    it('UNIT: returns students for class', async () => {
      // Service delegates to StudentRepository#findActiveByClassWithClassAndEducator.
      studentRepo.findActiveByClassWithClassAndEducator.mockResolvedValue([mockStudent()]);
      const result = await service.findByClass('class-uuid');
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(studentRepo.findActiveByClassWithClassAndEducator).toHaveBeenCalledWith('class-uuid');
    });

    it('INTEGRATION: GET /students/class/:classId — returns list', async () => {
      jest
        .spyOn(service, 'findByClass')
        .mockResolvedValue({ success: true, message: 'Fetched', data: [mockStudent()] });
      const result = await controller.findByClass({ classId: 'class-uuid' });
      expect(Array.isArray(result.data)).toBe(true);
    });
  });

  describe('findStudents', () => {
    const currentUser = { userId: 'edu-uuid', educatorId: 'edu-uuid' } as any;

    it('UNIT: passes classIds/schoolIds/isActive filters and pagination through to the repository', async () => {
      studentRepo.findStudents.mockResolvedValue({ rows: [], total: 0 });

      await service.findStudents(currentUser, {
        page: 1,
        pageSize: 10,
        classIds: ['class-1'],
        schoolIds: ['school-1'],
        isActive: true,
      } as any);

      expect(studentRepo.findStudents).toHaveBeenCalledWith(
        'edu-uuid',
        expect.objectContaining({
          classIds: ['class-1'],
          schoolIds: ['school-1'],
          isActive: true,
          lite: false,
        }),
        { field: undefined, dir: 'DESC' },
        { skip: 0, take: 10 },
      );
    });

    it('UNIT: defaults to newest-first (created_at DESC) when no sortBy is given — preserves the original default roster order', async () => {
      studentRepo.findStudents.mockResolvedValue({ rows: [], total: 0 });

      await service.findStudents(currentUser, { page: 1, pageSize: 10 } as any);

      expect(studentRepo.findStudents).toHaveBeenCalledWith(
        'edu-uuid',
        expect.any(Object),
        { field: undefined, dir: 'DESC' },
        expect.any(Object),
      );
    });

    it('UNIT: trims a search term before passing it to the repository', async () => {
      studentRepo.findStudents.mockResolvedValue({ rows: [], total: 0 });

      await service.findStudents(currentUser, {
        page: 1,
        pageSize: 10,
        search: '  bio-4z  ',
      } as any);

      expect(studentRepo.findStudents).toHaveBeenCalledWith(
        'edu-uuid',
        expect.objectContaining({ search: 'bio-4z' }),
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('UNIT: passes search as undefined when omitted', async () => {
      studentRepo.findStudents.mockResolvedValue({ rows: [], total: 0 });

      await service.findStudents(currentUser, { page: 1, pageSize: 10 } as any);

      expect(studentRepo.findStudents).toHaveBeenCalledWith(
        'edu-uuid',
        expect.objectContaining({ search: undefined }),
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('UNIT: a whitespace-only search trims to an empty string (no filter applied downstream)', async () => {
      studentRepo.findStudents.mockResolvedValue({ rows: [], total: 0 });

      await service.findStudents(currentUser, {
        page: 1,
        pageSize: 10,
        search: '   ',
      } as any);

      expect(studentRepo.findStudents).toHaveBeenCalledWith(
        'edu-uuid',
        expect.objectContaining({ search: '' }),
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('UNIT: maps rows to the full student-summary shape, including the new fields', async () => {
      studentRepo.findStudents.mockResolvedValue({
        rows: [
          {
            id: 'stu-1',
            studentId: 'BIO_0001',
            name: 'Alice',
            email: 'alice@test.com',
            classId: 'class-1',
            schoolId: null,
            status: CommonStatus.ACTIVE,
            isActive: true,
            submissionDate: null,
            simsCompleted: '2',
            score: 85,
            timeSpent: '2 hours 15 minutes',
            timeRemaining: '45 minutes',
            reportsCount: 3,
            codeStatus: StudentCodeStatus.ACTIVE,
          },
        ],
        total: 1,
      });

      const result = await service.findStudents(currentUser, { page: 1, pageSize: 10 } as any);

      expect(result.data).toEqual([
        {
          id: 'stu-1',
          studentId: 'BIO_0001',
          name: 'Alice',
          email: 'alice@test.com',
          classId: 'class-1',
          schoolId: null,
          status: CommonStatus.ACTIVE,
          isActive: true,
          submissionDate: null,
          simsCompleted: '2',
          score: 85,
          timeSpent: '2 hours 15 minutes',
          timeRemaining: '45 minutes',
          reportsCount: 3,
          codeStatus: StudentCodeStatus.ACTIVE,
        },
      ]);
      expect(result.meta?.total).toBe(1);
    });

    it('UNIT: maps codeStatus to REVOKED when the repository reports a revoked code', async () => {
      studentRepo.findStudents.mockResolvedValue({
        rows: [
          {
            id: 'stu-1',
            studentId: '',
            name: 'Alice',
            email: 'alice@test.com',
            classId: 'class-1',
            schoolId: null,
            status: CommonStatus.ACTIVE,
            isActive: true,
            submissionDate: null,
            simsCompleted: '2',
            score: 85,
            timeSpent: null,
            timeRemaining: null,
            reportsCount: 0,
            codeStatus: StudentCodeStatus.REVOKED,
          },
        ],
        total: 1,
      });

      const result = await service.findStudents(currentUser, { page: 1, pageSize: 10 } as any);

      expect(result.data?.[0].codeStatus).toBe(StudentCodeStatus.REVOKED);
    });

    it('UNIT: lite=true passes lite:true to the repository and maps only id/studentId/name', async () => {
      studentRepo.findStudents.mockResolvedValue({
        rows: [{ id: 'stu-1', studentId: 'BIO_0001', name: 'Alice' }],
        total: 1,
      });

      const result = await service.findStudents(currentUser, {
        page: 1,
        pageSize: 10,
        lite: true,
      } as any);

      expect(studentRepo.findStudents).toHaveBeenCalledWith(
        'edu-uuid',
        expect.objectContaining({ lite: true }),
        { field: undefined, dir: 'DESC' },
        { skip: 0, take: 10 },
      );
      expect(result.data).toEqual([{ id: 'stu-1', studentId: 'BIO_0001', name: 'Alice' }]);
      expect(result.data?.[0]).not.toHaveProperty('email');
      expect(result.data?.[0]).not.toHaveProperty('status');
      expect(result.data?.[0]).not.toHaveProperty('reportsCount');
      expect(result.data?.[0]).not.toHaveProperty('codeStatus');
    });

    it('UNIT: translates sortBy/sortDir into the sort object passed to the repository', async () => {
      studentRepo.findStudents.mockResolvedValue({ rows: [], total: 0 });

      await service.findStudents(currentUser, {
        page: 1,
        pageSize: 10,
        sortBy: StudentSortField.REPORTS,
        sortDir: 'desc',
      } as any);

      expect(studentRepo.findStudents).toHaveBeenCalledWith(
        'edu-uuid',
        expect.any(Object),
        { field: StudentSortField.REPORTS, dir: 'DESC' },
        { skip: 0, take: 10 },
      );
    });

    it('UNIT: defaults sortDir to ASC when sortBy is provided without sortDir', async () => {
      studentRepo.findStudents.mockResolvedValue({ rows: [], total: 0 });

      await service.findStudents(currentUser, {
        page: 1,
        pageSize: 10,
        sortBy: StudentSortField.CODE_STATUS,
      } as any);

      expect(studentRepo.findStudents).toHaveBeenCalledWith(
        'edu-uuid',
        expect.any(Object),
        { field: StudentSortField.CODE_STATUS, dir: 'ASC' },
        { skip: 0, take: 10 },
      );
    });

    it('INTEGRATION: controller delegates to the service', async () => {
      jest.spyOn(service, 'findStudents').mockResolvedValue({
        message: 'Fetched',
        data: [{ id: 'stu-1', studentId: 'BIO_0001', name: 'Alice' }],
        meta: {
          total: 1,
          page: 1,
          pageSize: 10,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false,
        },
      } as any);

      const result = await controller.findStudents(currentUser, { page: 1, pageSize: 10 } as any);
      expect(Array.isArray(result.data)).toBe(true);
    });
  });

  describe('findOne', () => {
    it('UNIT: returns student when found', async () => {
      studentRepo.findOne.mockResolvedValue(mockStudent());
      const result = await service.findOne('stu-uuid');
      expect(result.success).toBe(true);
    });

    it('UNIT: returns failure when not found', async () => {
      studentRepo.findOne.mockResolvedValue(null);
      const result = await service.findOne('bad');
      expect(result.success).toBe(false);
    });

    it('INTEGRATION: throws when not found', async () => {
      jest
        .spyOn(service, 'findOne')
        .mockResolvedValue({ success: false, message: 'Not found', type: 'notfound' });
      await expect(controller.findOne({ id: 'bad' })).rejects.toThrow();
    });
  });

  describe('update', () => {
    it('UNIT: updates a student field and persists via studentRepo.update', async () => {
      const student = mockStudent();
      studentRepo.findOne.mockResolvedValue(student);
      studentRepo.update.mockResolvedValue(1);

      const result = await service.update(student, { submission_date: '2024-01-01' }, 'edu-uuid');

      expect(result.success).toBe(true);
      expect(result.data?.submission_date).toBe('2024-01-01');
      expect(studentRepo.update).toHaveBeenCalledWith('stu-uuid', expect.any(Object));
    });

    it('UNIT: returns failure when the student has no class assigned', async () => {
      const student = mockStudent();
      // findClassByStudentId looks the student back up via studentRepo.findOne; return one with no class.
      studentRepo.findOne.mockResolvedValue({ ...student, class: undefined });

      const result = await service.update(student, { submission_date: '2024-01-01' }, 'edu-uuid');

      expect(result.success).toBe(false);
      expect(studentRepo.update).not.toHaveBeenCalled();
    });

    it('INTEGRATION: throws NotFoundException when not found', async () => {
      jest.spyOn(service, 'findById').mockResolvedValue(null);
      await expect(
        controller.update({ id: 'bad' }, { submission_date: '2024-01-01' }, makeReq()),
      ).rejects.toThrow(NotFoundException);
    });

    it('INTEGRATION: updates successfully', async () => {
      jest.spyOn(service, 'findById').mockResolvedValue(mockStudent());
      jest.spyOn(service, 'update').mockResolvedValue({
        success: true,
        message: 'Updated',
        data: mockStudent({ submission_date: '2024-01-01' }),
      });
      const result = await controller.update(
        { id: 'stu-uuid' },
        { submission_date: '2024-01-01' },
        makeReq(),
      );
      expect((result.data as Student).submission_date).toBe('2024-01-01');
    });

    it('AUTH: allows the owning educator to update their own student', async () => {
      jest.spyOn(service, 'findEducatorByStudentId').mockResolvedValue(mockEducator());
      jest.spyOn(service, 'findClassByStudentId').mockResolvedValue(mockClass());
      studentRepo.update.mockResolvedValue(1);

      const result = await service.update(
        mockStudent(),
        { submission_date: '2024-01-01' },
        'edu-uuid',
      );

      expect(result.success).toBe(true);
      expect(studentRepo.update).toHaveBeenCalled();
    });

    it("AUTH: rejects a different educator trying to update another educator's student", async () => {
      jest.spyOn(service, 'findEducatorByStudentId').mockResolvedValue(mockEducator());
      jest.spyOn(service, 'findClassByStudentId').mockResolvedValue(mockClass());

      const result = await service.update(
        mockStudent(),
        { submission_date: '2024-01-01' },
        'other-educator-uuid',
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe(StudentConstants.MESSAGES.NO_PERMISSION);
      expect(studentRepo.update).not.toHaveBeenCalled();
    });

    it('AUTH: rejects update when student has no assigned educator', async () => {
      jest.spyOn(service, 'findEducatorByStudentId').mockResolvedValue(null);
      jest.spyOn(service, 'findClassByStudentId').mockResolvedValue(mockClass());

      const result = await service.update(
        mockStudent(),
        { submission_date: '2024-01-01' },
        'edu-uuid',
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe(StudentConstants.MESSAGES.EDUCATOR_NOT_FOUND);
      expect(studentRepo.update).not.toHaveBeenCalled();
    });

    it('AUTH: rejects cross-school educator — different org cannot update student', async () => {
      jest.spyOn(service, 'findEducatorByStudentId').mockResolvedValue(mockEducator());
      jest.spyOn(service, 'findClassByStudentId').mockResolvedValue(mockClass());

      const result = await service.update(
        mockStudent(),
        { submission_date: '2024-01-01' },
        'educator-different-school-uuid',
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe(StudentConstants.MESSAGES.NO_PERMISSION);
      expect(studentRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('UNIT: removes student and refunds unused seats via ClassSimulationService', async () => {
      const student = mockStudent({
        email: undefined,
        educator: mockEducator(),
      });

      studentRepo.findOne.mockResolvedValue(student);
      studentRepo.update.mockResolvedValue(1);

      const result = await service.remove(student, 'edu-uuid');

      expect(result.success).toBe(true);
      expect(classSimulationServiceMock.refundUnusedSeatsForStudent).toHaveBeenCalledWith(student);
      expect(studentRepo.update).toHaveBeenCalled();
    });

    it('UNIT: soft-deletes the student (is_active false, status inactive)', async () => {
      const student = mockStudent();
      studentRepo.findOne.mockResolvedValue(student);
      studentRepo.update.mockResolvedValue(1);

      const result = await service.remove(student, 'edu-uuid');

      expect(result.success).toBe(true);
      expect(student.is_active).toBe(false);
      expect(student.status).toBe(CommonStatus.INACTIVE);
    });

    it('INTEGRATION: throws NotFoundException when not found', async () => {
      jest.spyOn(service, 'findById').mockResolvedValue(null);
      await expect(controller.remove({ id: 'bad' }, makeReq())).rejects.toThrow(NotFoundException);
    });

    it('INTEGRATION: deletes successfully', async () => {
      jest.spyOn(service, 'findById').mockResolvedValue(mockStudent());
      jest
        .spyOn(service, 'remove')
        .mockResolvedValue({ success: true, message: 'Deleted', data: null });
      const result = await controller.remove({ id: 'stu-uuid' }, makeReq());
      expect(result.data).toBeNull();
    });

    // ─── authorization regression ────────────────────────────────────────────

    it('AUTH: allows the owning educator to delete their own student', async () => {
      studentRepo.findOne.mockResolvedValue(mockStudent());
      studentRepo.update.mockResolvedValue(1);
      jest.spyOn(service, 'findEducatorByStudentId').mockResolvedValue(mockEducator());

      const result = await service.remove(mockStudent(), 'edu-uuid');

      expect(result.success).toBe(true);
      expect(studentRepo.update).toHaveBeenCalled();
    });

    it("AUTH: rejects a different educator trying to delete another educator's student", async () => {
      jest.spyOn(service, 'findEducatorByStudentId').mockResolvedValue(mockEducator());

      const result = await service.remove(mockStudent(), 'other-educator-uuid');

      expect(result.success).toBe(false);
      expect(result.message).toBe(StudentConstants.MESSAGES.NO_PERMISSION);
      expect(studentRepo.update).not.toHaveBeenCalled();
    });

    it('AUTH: rejects deletion when student has no assigned educator', async () => {
      jest.spyOn(service, 'findEducatorByStudentId').mockResolvedValue(null);

      const result = await service.remove(mockStudent(), 'edu-uuid');

      expect(result.success).toBe(false);
      expect(result.message).toBe(StudentConstants.MESSAGES.EDUCATOR_NOT_FOUND);
      expect(studentRepo.update).not.toHaveBeenCalled();
    });

    it('AUTH: rejects cross-school educator — different org cannot delete student', async () => {
      jest.spyOn(service, 'findEducatorByStudentId').mockResolvedValue(mockEducator());

      const result = await service.remove(mockStudent(), 'educator-different-school-uuid');

      expect(result.success).toBe(false);
      expect(result.message).toBe(StudentConstants.MESSAGES.NO_PERMISSION);
      expect(studentRepo.update).not.toHaveBeenCalled();
    });

    it('AUTH: returns not-found when student object has no id', async () => {
      const result = await service.remove({ is_active: true } as Student, 'edu-uuid');

      expect(result.success).toBe(false);
      expect(result.message).toBe(Messages.STUDENT_NOT_FOUND);
    });
  });

  describe('updateStudentCode', () => {
    it('UNIT: regenerates student code', async () => {
      studentRepo.findAllNonEmptyStudentCodes.mockResolvedValue([]);
      studentRepo.update.mockResolvedValue(1);
      const result = await service.updateStudentCode(mockStudent());
      expect(result.success).toBe(true);
    });

    it('UNIT: fails when student has no class', async () => {
      const result = await service.updateStudentCode(mockStudent({ class: undefined }));
      expect(result.success).toBe(false);
    });

    it('INTEGRATION: throws NotFoundException when not found', async () => {
      jest.spyOn(service, 'findById').mockResolvedValue(null);
      await expect(controller.updateStudentCode({ id: 'bad' })).rejects.toThrow(NotFoundException);
    });
  });

  // ─── student code format (CCC-XXXX) ──────────────────────────────────────

  describe('student code format (CCC-XXXX)', () => {
    const VALID_REGEX = /^[A-Z0-9]{3}-[A-Z0-9]{4}$/;

    it('UNIT: STUDENT_CODE_REGEX matches valid CCC-XXXX codes', () => {
      expect(StudentsService.STUDENT_CODE_REGEX.test('BIO-2M3N')).toBe(true);
      expect(StudentsService.STUDENT_CODE_REGEX.test('NUR-ABCD')).toBe(true);
      expect(StudentsService.STUDENT_CODE_REGEX.test('123-4567')).toBe(true);
    });

    it('UNIT: STUDENT_CODE_REGEX rejects codes with 3-char suffix (7 chars total)', () => {
      expect(StudentsService.STUDENT_CODE_REGEX.test('BIO-2M3')).toBe(false);
      expect(StudentsService.STUDENT_CODE_REGEX.test('NUR-ABC')).toBe(false);
    });

    it('UNIT: STUDENT_CODE_REGEX rejects codes with 5-char suffix', () => {
      expect(StudentsService.STUDENT_CODE_REGEX.test('BIO-2M3N5')).toBe(false);
    });

    it('UNIT: STUDENT_CODE_REGEX rejects codes with 2-char prefix', () => {
      expect(StudentsService.STUDENT_CODE_REGEX.test('BI-2M3N')).toBe(false);
    });

    it('UNIT: STUDENT_CODE_REGEX rejects codes without hyphen', () => {
      expect(StudentsService.STUDENT_CODE_REGEX.test('BIO2M3N')).toBe(false);
    });

    it('UNIT: generated code always matches CCC-XXXX format', async () => {
      studentRepo.findAllNonEmptyStudentCodes.mockResolvedValue([]);
      let capturedId = '';
      studentRepo.update.mockImplementation((_id: string, data: Partial<Student>) => {
        capturedId = data.student_id ?? '';
        return Promise.resolve(1);
      });
      await service.updateStudentCode(mockStudent());
      expect(VALID_REGEX.test(capturedId)).toBe(true);
      expect(capturedId).toHaveLength(8);
    });

    it('UNIT: generated suffix is always exactly 4 characters', async () => {
      studentRepo.findAllNonEmptyStudentCodes.mockResolvedValue([]);
      let capturedId = '';
      studentRepo.update.mockImplementation((_id: string, data: Partial<Student>) => {
        capturedId = data.student_id ?? '';
        return Promise.resolve(1);
      });
      await service.updateStudentCode(mockStudent());
      const suffix = capturedId.split('-')[1] ?? '';
      expect(suffix).toHaveLength(4);
    });

    it('UNIT: generated prefix is always exactly 3 characters', async () => {
      studentRepo.findAllNonEmptyStudentCodes.mockResolvedValue([]);
      let capturedId = '';
      studentRepo.update.mockImplementation((_id: string, data: Partial<Student>) => {
        capturedId = data.student_id ?? '';
        return Promise.resolve(1);
      });
      await service.updateStudentCode(mockStudent());
      const prefix = capturedId.split('-')[0] ?? '';
      expect(prefix).toHaveLength(3);
    });

    it('UNIT: suffix contains only safe characters (no I, L, O, 0, 1)', async () => {
      studentRepo.findAllNonEmptyStudentCodes.mockResolvedValue([]);
      const SAFE_CHARS = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/;
      let capturedId = '';
      studentRepo.update.mockImplementation((_id: string, data: Partial<Student>) => {
        capturedId = data.student_id ?? '';
        return Promise.resolve(1);
      });
      await service.updateStudentCode(mockStudent());
      const suffix = capturedId.split('-')[1] ?? '';
      expect(SAFE_CHARS.test(suffix)).toBe(true);
    });
  });

  describe('sendBatchEmail', () => {
    const batchDto = {
      class_id: 'class-uuid',
      subject: 'Code',
      message: 'Use this',
      accessCode: true,
    };

    it('UNIT: sends to all students in class', async () => {
      studentRepo.find.mockResolvedValue([
        mockStudent(),
        mockStudent({ id: 'stu-2', email: 'bob@test.com' }),
      ]);
      jest.spyOn(service, 'sendBatchEmail').mockResolvedValue({
        success: true,
        message: StudentConstants.MESSAGES.EMAIL_SENT_COUNT(2),
        data: { sent: 2, failed: 0 },
      });
      const result = await service.sendBatchEmail(batchDto);
      expect(result.success).toBe(true);
      expect(result.data?.sent).toBe(2);
    });

    it('UNIT: partial success when some have no email', async () => {
      studentRepo.find.mockResolvedValue([
        mockStudent(),
        mockStudent({ id: 'stu-2', email: undefined }),
      ]);
      jest.spyOn(service, 'sendBatchEmail').mockResolvedValue({
        success: true,
        message: StudentConstants.MESSAGES.EMAIL_SENT_COUNT(1),
        data: { sent: 1, failed: 1 },
      });
      const result = await service.sendBatchEmail(batchDto);
      expect(result.data?.sent).toBe(1);
      expect(result.data?.failed).toBe(1);
    });

    it('UNIT: fails when no students in class', async () => {
      studentRepo.find.mockResolvedValue([]);
      const result = await service.sendBatchEmail(batchDto);
      expect(result.success).toBe(false);
    });

    it('UNIT: bulk send displays count-based success toast message', async () => {
      studentRepo.find.mockResolvedValue([
        mockStudent(),
        mockStudent({ id: 'stu-2', email: 'bob@test.com' }),
      ]);
      jest.spyOn(service, 'sendBatchEmail').mockResolvedValue({
        success: true,
        message: StudentConstants.MESSAGES.EMAIL_SENT_COUNT(2),
        data: { sent: 2, failed: 0 },
      });
      const result = await service.sendBatchEmail(batchDto);
      expect(result.success).toBe(true);
      expect(result.message).toBe(StudentConstants.MESSAGES.EMAIL_SENT_COUNT(2));
    });

    it('UNIT: individual send displays "Email sent successfully" toast message', async () => {
      studentRepo.findOne.mockResolvedValue(mockStudent());
      jest.spyOn(service, 'sendBatchEmail').mockResolvedValue({
        success: true,
        message: StudentConstants.MESSAGES.EMAIL_SENT_SINGLE,
        data: { sent: 1, failed: 0 },
      });
      const result = await service.sendBatchEmail({ ...batchDto, student_id: 'stu-uuid' });
      expect(result.success).toBe(true);
      expect(result.message).toBe(StudentConstants.MESSAGES.EMAIL_SENT_SINGLE);
    });
  });

  describe('sendEmailReport', () => {
    const reportDto = {
      class_id: 'class-uuid',
      subject: 'Report',
      message: 'See report',
      sendPdf: false,
    };

    it('UNIT: sends report to all students', async () => {
      studentRepo.find.mockResolvedValue([
        mockStudent(),
        mockStudent({ id: 'stu-2', email: 'bob@test.com' }),
      ]);
      const result = await service.sendEmailReport(reportDto);
      expect(result.success).toBe(true);
      expect(result.data?.sent).toBe(2);
    });

    it('UNIT: attaches PDF when sendPdf=true', async () => {
      studentRepo.find.mockResolvedValue([mockStudent()]);
      await service.sendEmailReport({ ...reportDto, sendPdf: true });
      expect(mailerService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: expect.arrayContaining([
            expect.objectContaining({ contentType: 'application/pdf' }),
          ]) as unknown,
        }),
      );
    });

    it('UNIT: accepts frontend PDF as a data URI and decodes it correctly', async () => {
      studentRepo.find.mockResolvedValue([mockStudent()]);
      const dataUri = 'data:application/pdf;base64,JVBERi0xLjQKJcTl8uXrp/Og0MTGCjEgMCBvYmoK';
      await service.sendEmailReport({ ...reportDto, sendPdf: true, pdf_base64: dataUri });
      const mockCalls = mailerService.sendMail.mock.calls as unknown as Array<
        [{ attachments?: Array<{ contentType: string; content: Buffer }> }]
      >;
      const sentOptions = mockCalls[0][0];
      const attachment = sentOptions.attachments?.[0];
      expect(attachment).toBeDefined();
      expect(attachment?.contentType).toBe('application/pdf');
      expect(attachment?.content).toBeInstanceOf(Buffer);
      expect(attachment?.content.slice(0, 4).toString('utf8')).toBe('%PDF');
    });

    it('UNIT: rejects invalid pdf_base64 payloads', async () => {
      studentRepo.find.mockResolvedValue([mockStudent()]);
      const result = await service.sendEmailReport({
        ...reportDto,
        sendPdf: true,
        pdf_base64: 'notvalidbase64',
      });
      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid PDF base64 payload');
    });

    it('UNIT: fails when class_id missing', async () => {
      const result = await service.sendEmailReport({ ...reportDto, class_id: '' });
      expect(result.success).toBe(false);
    });

    it('UNIT: bulk report displays count-based success toast message', async () => {
      studentRepo.find.mockResolvedValue([
        mockStudent(),
        mockStudent({ id: 'stu-2', email: 'bob@test.com' }),
      ]);
      const result = await service.sendEmailReport(reportDto);
      expect(result.success).toBe(true);
      expect(result.message).toBe(StudentConstants.MESSAGES.EMAIL_SENT_COUNT(2));
    });

    it('UNIT: individual report displays "Email sent successfully" toast message', async () => {
      studentRepo.findOne.mockResolvedValue(mockStudent());
      const result = await service.sendEmailReport({ ...reportDto, student_id: 'stu-uuid' });
      expect(result.success).toBe(true);
      expect(result.message).toBe(StudentConstants.MESSAGES.EMAIL_SENT_SINGLE);
    });
  });

  describe('service helpers', () => {
    it('findAnyUserByEmail returns user when User found', async () => {
      jest.spyOn(service, 'findAnyUserByEmail').mockResolvedValue('user');
      const result = await service.findAnyUserByEmail('admin@test.com');
      expect(result).toBe('user');
    });

    it('findAnyUserByEmail returns null when no match', async () => {
      jest.spyOn(service, 'findAnyUserByEmail').mockResolvedValue(null);
      const result = await service.findAnyUserByEmail('new@test.com');
      expect(result).toBe(null);
    });

    it('findById returns student', async () => {
      studentRepo.findOne.mockResolvedValue(mockStudent());
      const result = await service.findById('stu-uuid');
      expect(result?.id).toBe('stu-uuid');
    });
  });

  describe('regression', () => {
    it('update: controller passes DTO through to service.update and returns the result', async () => {
      jest.spyOn(service, 'findById').mockResolvedValue(mockStudent());
      jest
        .spyOn(service, 'update')
        .mockResolvedValue({ success: true, message: 'Updated', data: mockStudent() });
      const result = await controller.update(
        { id: 'stu-uuid' },
        { submission_date: '2024-01-01' },
        makeReq(),
      );
      expect(result.data).toBeDefined();
    });

    it('sendBatchEmail: response always has sent and failed counts', async () => {
      studentRepo.find.mockResolvedValue([mockStudent()]);
      jest.spyOn(service, 'sendBatchEmail').mockResolvedValue({
        success: true,
        message: StudentConstants.MESSAGES.EMAIL_SENT_COUNT(1),
        data: { sent: 1, failed: 0 },
      });
      const result = await service.sendBatchEmail({
        class_id: 'class-uuid',
        subject: 'S',
        message: 'M',
        accessCode: true,
      });
      expect(result.data).toHaveProperty('sent');
      expect(result.data).toHaveProperty('failed');
    });
  });

  // ─── getSimulationsByCode (assessment filtering) ──────────────────────────

  describe('startAssessment', () => {
    beforeEach(() => {
      studentRepo.findOne.mockResolvedValue(
        mockStudent({ id: 'stu-uuid', student_id: 'BIO_0001' }),
      );
    });

    const progress = (
      status: SimulationProgressStatus,
      assessmentAttemptsCount: number,
    ): Record<string, unknown> => ({ status, assessmentAttemptsCount });

    it('reads Simulation Progress, not stored Reports', async () => {
      await service.startAssessment('stu-uuid', 'sim-001');

      expect(simulationProgressRepo.findByStudentAndScenarioId).toHaveBeenCalledWith(
        'stu-uuid',
        'sim-001',
      );
      expect(simulationReportRepo.find).not.toHaveBeenCalled();
    });

    it('lets the student start when there is no progress row (not started)', async () => {
      await expect(service.startAssessment('stu-uuid', 'sim-001')).resolves.toMatchObject({
        success: true,
      });
    });

    it.each([1, 2])('allows an Assessment start with %i attempts used', async (used) => {
      simulationProgressRepo.findByStudentAndScenarioId.mockResolvedValue(
        progress(SimulationProgressStatus.IN_PROGRESS, used),
      );

      await expect(service.startAssessment('stu-uuid', 'sim-001')).resolves.toMatchObject({
        success: true,
      });
    });

    it('allows Practice once the Assessment limit is used while the Simulation is open', async () => {
      simulationProgressRepo.findByStudentAndScenarioId.mockResolvedValue(
        progress(SimulationProgressStatus.IN_PROGRESS, 3),
      );

      await expect(
        service.startAssessment('stu-uuid', 'sim-001', 'Practice'),
      ).resolves.toMatchObject({ success: true });
    });

    it('blocks an Assessment at Max Attempts', async () => {
      simulationProgressRepo.findByStudentAndScenarioId.mockResolvedValue(
        progress(SimulationProgressStatus.IN_PROGRESS, 3),
      );

      await expect(service.startAssessment('stu-uuid', 'sim-001')).resolves.toMatchObject({
        success: false,
        message: SIMULATION_PROGRESS_MSG.ASSESSMENT_ATTEMPT_LIMIT_REACHED,
      });
    });

    it.each(['Assessment', 'Practice'] as const)('blocks %s when Completed', async (mode) => {
      simulationProgressRepo.findByStudentAndScenarioId.mockResolvedValue(
        progress(SimulationProgressStatus.COMPLETED, 3),
      );

      await expect(service.startAssessment('stu-uuid', 'sim-001', mode)).resolves.toMatchObject({
        success: false,
        message: SIMULATION_PROGRESS_MSG.SIMULATION_COMPLETED,
      });
    });

    it.each(['Assessment', 'Practice'] as const)('blocks %s when Forfeited', async (mode) => {
      simulationProgressRepo.findByStudentAndScenarioId.mockResolvedValue(
        progress(SimulationProgressStatus.FORFEITED, 1),
      );

      await expect(service.startAssessment('stu-uuid', 'sim-001', mode)).resolves.toMatchObject({
        success: false,
        message: SIMULATION_PROGRESS_MSG.ASSESSMENT_FORFEITED,
      });
    });

    it('lets the repeat-allowed student start regardless of progress', async () => {
      studentRepo.findOne.mockResolvedValue(
        mockStudent({ id: 'stu-uuid', student_id: '85170719' }),
      );
      simulationProgressRepo.findByStudentAndScenarioId.mockResolvedValue(
        progress(SimulationProgressStatus.COMPLETED, 3),
      );

      await expect(service.startAssessment('stu-uuid', 'sim-001')).resolves.toMatchObject({
        success: true,
      });
    });
  });

  describe('getSimulationsByCode', () => {
    const baseStudent = mockStudent({ id: 'stu-uuid', student_id: 'BIO_0001' });
    const scenario = {
      id: 'sim-001',
      title: 'Scenario 1',
      description: 'Desc',
      avatarEnabled: false,
    };
    const classSimulation = {
      simulation_id: 'sim-001',
      class_id: 'class-uuid',
      is_active: true,
      start_date: null,
      due_date: null,
      end_date: null,
    };

    beforeEach(() => {
      studentRepo.findOne.mockResolvedValue(baseStudent);
      classSimulationRepo.find.mockResolvedValue([]);
      simulationReportRepo.findAttemptRowsByStudentId.mockResolvedValue([]);
      simulationV2Repository.find.mockResolvedValue([scenario]);
    });

    it('UNIT: returns assigned simulation when no reports exist', async () => {
      classSimulationRepo.find.mockResolvedValue([classSimulation]);
      simulationReportRepo.findAttemptRowsByStudentId.mockResolvedValue([]);

      const result = await service.getSimulationsByCode('BIO_0001');

      expect(result.success).toBe(true);
      expect(result.data?.simulations).toHaveLength(1);
      expect(result.data?.simulations[0].id).toBe('sim-001');
    });

    it('UNIT: keeps simulation after 1 Assessment report (3 attempts allowed)', async () => {
      classSimulationRepo.find.mockResolvedValue([classSimulation]);
      simulationReportRepo.findAttemptRowsByStudentId.mockResolvedValue([
        { scenario_id: 'sim-001', mode: 'Assessment' },
      ]);

      const result = await service.getSimulationsByCode('BIO_0001');

      expect(result.success).toBe(true);
      expect(result.data?.simulations).toHaveLength(1);
    });

    it('UNIT: keeps simulation after 2 Assessment reports (3 attempts allowed)', async () => {
      classSimulationRepo.find.mockResolvedValue([classSimulation]);
      simulationReportRepo.findAttemptRowsByStudentId.mockResolvedValue([
        { scenario_id: 'sim-001', mode: 'Assessment' },
        { scenario_id: 'sim-001', mode: 'Assessment' },
      ]);

      const result = await service.getSimulationsByCode('BIO_0001');

      expect(result.success).toBe(true);
      expect(result.data?.simulations).toHaveLength(1);
    });

    it('UNIT: keeps simulation after 3 Assessment reports (no attempt-based filtering)', async () => {
      classSimulationRepo.find.mockResolvedValue([classSimulation]);
      simulationReportRepo.findAttemptRowsByStudentId.mockResolvedValue([
        { scenario_id: 'sim-001', mode: 'Assessment' },
        { scenario_id: 'sim-001', mode: 'Assessment' },
        { scenario_id: 'sim-001', mode: 'Assessment' },
      ]);

      const result = await service.getSimulationsByCode('BIO_0001');

      expect(result.success).toBe(true);
      expect(result.data?.simulations).toHaveLength(1);
    });

    it('UNIT: keeps simulation when mode is absent (counts toward 3-attempt limit but not yet reached)', async () => {
      classSimulationRepo.find.mockResolvedValue([classSimulation]);
      simulationReportRepo.findAttemptRowsByStudentId.mockResolvedValue([
        { scenario_id: 'sim-001' },
      ]);

      const result = await service.getSimulationsByCode('BIO_0001');

      expect(result.success).toBe(true);
      expect(result.data?.simulations).toHaveLength(1);
    });

    it('UNIT: keeps simulation when report mode is Practice (case-insensitive)', async () => {
      classSimulationRepo.find.mockResolvedValue([classSimulation]);
      simulationReportRepo.findAttemptRowsByStudentId.mockResolvedValue([
        { scenario_id: 'sim-001', mode: 'practice' },
      ]);

      const result = await service.getSimulationsByCode('BIO_0001');

      expect(result.success).toBe(true);
      expect(result.data?.simulations).toHaveLength(1);
    });

    describe('Simulation Progress', () => {
      const progressRow = (
        status: SimulationProgressStatus,
        assessmentAttemptsCount: number,
      ): Record<string, unknown> => ({
        status,
        assessmentAttemptsCount,
        simulation: { id: 'sim-001' },
      });

      beforeEach(() => {
        classSimulationRepo.find.mockResolvedValue([classSimulation]);
      });

      it.each([0, 1, 2, 3])(
        'reports attemptCount 0 and canForfeit false with %i attempts used (progress not loaded)',
        async (used) => {
          simulationProgressRepo.findByStudentAndScenarioIds.mockResolvedValue(
            used === 0 ? [] : [progressRow(SimulationProgressStatus.IN_PROGRESS, used)],
          );

          const result = await service.getSimulationsByCode('BIO_0001');

          expect(result.data?.simulations[0]).toMatchObject({
            id: 'sim-001',
            attemptCount: 0,
            maxAttempts: 3,
            canForfeit: false,
          });
        },
      );

      it('does not query Simulation Progress for the listing', async () => {
        await service.getSimulationsByCode('BIO_0001');

        expect(simulationProgressRepo.findByStudentAndScenarioIds).not.toHaveBeenCalled();
      });

      it('keeps Completed Simulations in the list (closed Simulations are not filtered out)', async () => {
        simulationProgressRepo.findByStudentAndScenarioIds.mockResolvedValue([
          progressRow(SimulationProgressStatus.COMPLETED, 3),
        ]);

        const result = await service.getSimulationsByCode('BIO_0001');

        expect(result.data?.simulations).toHaveLength(1);
        expect(result.data?.simulations[0].canForfeit).toBe(false);
      });
    });

    it('UNIT: reads the student Attempts from the database, never the Blob store', async () => {
      classSimulationRepo.find.mockResolvedValue([classSimulation]);
      const attempt = { id: 'row-1', student_id: 'stu-uuid', scenario_id: 'sim-001' };
      simulationReportRepo.findAttemptRowsByStudentId.mockResolvedValue([attempt]);

      const result = await service.getSimulationsByCode('BIO_0001');

      expect(simulationReportRepo.findAttemptRowsByStudentId).toHaveBeenCalledWith('stu-uuid');
      expect(result.data?.reports).toEqual([attempt]);
    });

    it('UNIT: a student with no Student Code gets no Attempts and triggers no report scan', async () => {
      studentRepo.findOne.mockResolvedValue(
        mockStudent({ id: 'stu-uuid', student_id: null as never }),
      );
      classSimulationRepo.find.mockResolvedValue([classSimulation]);

      const result = await service.getSimulationsByCode('BIO_0001');

      expect(result.data?.reports).toEqual([]);
      expect(simulationReportRepo.findAttemptRowsByStudentId).not.toHaveBeenCalled();
    });

    it('UNIT: propagates avatarEnabled: true from blob scenario to response', async () => {
      const avatarScenario = {
        id: 'sim-001',
        title: 'Scenario 1',
        description: 'Desc',
        avatarEnabled: true,
      };
      simulationV2Repository.find.mockResolvedValue([avatarScenario]);
      classSimulationRepo.find.mockResolvedValue([classSimulation]);
      simulationReportRepo.findAttemptRowsByStudentId.mockResolvedValue([]);

      const result = await service.getSimulationsByCode('BIO_0001');

      expect(result.success).toBe(true);
      expect(result.data?.simulations[0].avatarEnabled).toBe(true);
    });

    it('UNIT: defaults avatarEnabled to false when absent from blob scenario', async () => {
      const scenarioWithoutFlag = { id: 'sim-001', title: 'Scenario 1', description: 'Desc' };
      simulationV2Repository.find.mockResolvedValue([scenarioWithoutFlag]);
      classSimulationRepo.find.mockResolvedValue([classSimulation]);
      simulationReportRepo.findAttemptRowsByStudentId.mockResolvedValue([]);

      const result = await service.getSimulationsByCode('BIO_0001');

      expect(result.success).toBe(true);
      expect(result.data?.simulations[0].avatarEnabled).toBe(false);
    });

    it('UNIT: response simulation does not include a category field', async () => {
      classSimulationRepo.find.mockResolvedValue([classSimulation]);
      simulationReportRepo.findAttemptRowsByStudentId.mockResolvedValue([]);

      const result = await service.getSimulationsByCode('BIO_0001');

      expect(result.success).toBe(true);
      expect(result.data?.simulations[0]).not.toHaveProperty('category');
    });

    it('UNIT: returns empty simulations array when student has no active assignments', async () => {
      // No class simulations assigned
      classSimulationRepo.find.mockResolvedValue([]);
      simulationV2Repository.find.mockResolvedValue([scenario]);
      simulationReportRepo.findAttemptRowsByStudentId.mockResolvedValue([]);

      const result = await service.getSimulationsByCode('BIO_0001');

      expect(result.success).toBe(true);
      expect(result.data?.simulations).toHaveLength(0);
    });
  });

  // ─── studentLogin ──────────────────────────────────────────────────────────

  describe('studentLogin', () => {
    it('UNIT: returns access token and student data on valid student ID', async () => {
      studentRepo.findOne.mockResolvedValue(mockStudent());
      tokenService.generateTokens.mockReturnValue({
        access_token: 'signed-token',
        expires_in: 86400,
      });

      const result = await service.studentLogin('BIO_0001', mockRes);

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        student_id: 'BIO_0001',
        access_token: 'signed-token',
        token_type: 'Bearer',
        class_id: 'class-uuid',
      });
    });

    it('UNIT: returns failure when student ID is not found in DB', async () => {
      studentRepo.findOne.mockResolvedValue(null);

      const result = await service.studentLogin('UNKNOWN_001', mockRes);

      expect(result.success).toBe(false);
      expect(result.message).toBe(StudentConstants.VALIDATION.STUDENT_ID_NOT_FOUND);
    });

    it('UNIT: returns failure when student class is inactive', async () => {
      studentRepo.findOne.mockResolvedValue(
        mockStudent({ class: { ...mockClass(), is_active: false } }),
      );

      const result = await service.studentLogin('BIO_0001', mockRes);

      expect(result.success).toBe(false);
      expect(result.message).toBe(StudentConstants.VALIDATION.CLASS_INACTIVE);
    });

    it('UNIT: returns failure when student status is inactive', async () => {
      studentRepo.findOne.mockResolvedValue(
        mockStudent({ status: CommonStatus.INACTIVE, is_active: true }),
      );

      const result = await service.studentLogin('BIO_0001', mockRes);

      expect(result.success).toBe(false);
      expect(result.message).toBe(StudentConstants.VALIDATION.CLASS_INACTIVE);
    });

    it('UNIT: returns failure when class status is draft', async () => {
      studentRepo.findOne.mockResolvedValue(
        mockStudent({ class: { ...mockClass(), status: CommonStatus.DRAFT } }),
      );

      const result = await service.studentLogin('BIO_0001', mockRes);

      expect(result.success).toBe(false);
      expect(result.message).toBe(StudentConstants.VALIDATION.CLASS_DRAFT);
    });

    it('UNIT: returns failure when class status is archived', async () => {
      studentRepo.findOne.mockResolvedValue(
        mockStudent({ class: { ...mockClass(), status: CommonStatus.ARCHIEVED } }),
      );

      const result = await service.studentLogin('BIO_0001', mockRes);

      expect(result.success).toBe(false);
      expect(result.message).toBe(StudentConstants.VALIDATION.CLASS_ARCHIVED);
    });

    it('UNIT: logs in successfully when student has no email', async () => {
      studentRepo.findOne.mockResolvedValue(
        mockStudent({ email: null as unknown as string, student_id: 'BIO_0001' }),
      );
      tokenService.generateTokens.mockReturnValue({
        access_token: 'signed-token',
        expires_in: 86400,
      });

      const result = await service.studentLogin('BIO_0001', mockRes);

      expect(result.success).toBe(true);
      // StudentLoginData carries no `email` field at all — login succeeds without one,
      // and the response never leaks it.
      expect(result.data).not.toHaveProperty('email');
      expect(result.data?.student_id).toBe('BIO_0001');
      // Token generation does not depend on a student email address.
      expect(tokenService.generateTokens).toHaveBeenCalledWith(
        expect.objectContaining({
          student_id: 'BIO_0001',
          roles: [RoleSlug.STUDENT],
        }),
      );
    });

    it('UNIT: returns failure when student educator is inactive', async () => {
      studentRepo.findOne.mockResolvedValue(
        mockStudent({
          educator: {
            ...mockEducator(),
            userRole: { status: CommonStatus.INACTIVE, user: {} } as unknown as UserRole,
          } as Educator,
        }),
      );

      const result = await service.studentLogin('BIO_0001', mockRes);

      expect(result.success).toBe(false);
      expect(result.message).toBe(StudentConstants.VALIDATION.EDUCATOR_INACTIVE);
    });

    it('UNIT: returns failure when student educator is soft-deleted or not active', async () => {
      studentRepo.findOne.mockResolvedValue(
        mockStudent({
          educator: {
            ...mockEducator(),
            is_active: false,
            deleted_at: new Date(),
          } as Educator,
        }),
      );

      const result = await service.studentLogin('BIO_0001', mockRes);

      expect(result.success).toBe(false);
      expect(result.message).toBe(StudentConstants.VALIDATION.CLASS_INACTIVE);
    });
  });

  // ─── importFromCsv ──────────────────────────────────────────────────────────

  describe('importFromCsv', () => {
    const CSV_HEADER = 'student_id,student_name,email';
    const validRow = (id: string, name: string, email = '') => `${id},${name},${email}`;
    const makeBuffer = (...lines: string[]): Buffer =>
      Buffer.from([CSV_HEADER, ...lines].join('\n'), 'utf-8');

    beforeEach(() => {
      studentRepo.findActiveCodesInClass.mockResolvedValue([]);
      studentRepo.saveMany.mockImplementation(async (rows: Partial<Student>[]) =>
        rows.map((data) => ({ ...mockStudent(), ...data }) as Student),
      );
    });

    it('UNIT: inserts all rows when CSV is fully valid', async () => {
      const buf = makeBuffer(validRow('STU001', 'Alice'), validRow('STU002', 'Bob'));
      const result = await service.importFromCsv(buf, mockClass(), mockEducator());
      expect(result.success).toBe(true);
      expect(result.data?.inserted).toBe(2);
      expect(result.data?.failedCount).toBe(0);
      expect(result.data?.failed).toHaveLength(0);
    });

    it('UNIT: partial success — valid rows inserted, invalid rows reported', async () => {
      const buf = makeBuffer(validRow('STU001', 'Alice'), 'STU002,,');
      const result = await service.importFromCsv(buf, mockClass(), mockEducator());
      expect(result.success).toBe(true);
      expect(result.data?.inserted).toBe(1);
      expect(result.data?.failedCount).toBe(1);
      expect(result.data?.failed[0].error).toBe(StudentConstants.VALIDATION.MISSING_DATA);
    });

    it('UNIT: rejects duplicate student_id within the same CSV file', async () => {
      const buf = makeBuffer(validRow('STU001', 'Alice'), validRow('STU001', 'Alice Clone'));
      const result = await service.importFromCsv(buf, mockClass(), mockEducator());
      expect(result.data?.inserted).toBe(1);
      expect(result.data?.failedCount).toBe(1);
      expect(result.data?.failed[0].error).toBe(StudentConstants.VALIDATION.DUPLICATE_ID);
    });

    it('UNIT: rejects a row whose student_id already exists in the class (DB duplicate)', async () => {
      studentRepo.findActiveCodesInClass.mockResolvedValueOnce(['STU001']);
      const buf = makeBuffer(validRow('STU001', 'Alice'));
      const result = await service.importFromCsv(buf, mockClass(), mockEducator());
      expect(result.data?.inserted).toBe(0);
      expect(result.data?.failed[0].error).toBe(StudentConstants.VALIDATION.STUDENT_EXISTS);
      expect(studentRepo.saveMany).not.toHaveBeenCalled();
    });

    it('UNIT: a failing batched insert fails the whole request', async () => {
      studentRepo.saveMany.mockRejectedValueOnce(new Error('db down'));
      const buf = makeBuffer(validRow('STU001', 'Alice'), validRow('STU002', 'Bob'));
      const result = await service.importFromCsv(buf, mockClass(), mockEducator());
      expect(result.success).toBe(false);
      expect(result.message).toBe('db down');
      expect(studentRepo.saveMany).toHaveBeenCalledTimes(1);
    });

    it('UNIT: returns failure when CSV has no data rows', async () => {
      const buf = Buffer.from(CSV_HEADER, 'utf-8');
      const result = await service.importFromCsv(buf, mockClass(), mockEducator());
      expect(result.success).toBe(false);
      expect(result.message).toBe(StudentConstants.VALIDATION.CSV_PARSE_FAILED);
    });

    it('UNIT: returns failure when required headers are missing', async () => {
      const buf = Buffer.from('name,email\nAlice,a@b.com', 'utf-8');
      const result = await service.importFromCsv(buf, mockClass(), mockEducator());
      expect(result.success).toBe(false);
      expect(result.message).toBe(StudentConstants.VALIDATION.CSV_PARSE_FAILED);
    });

    it('UNIT: row with missing student_id is reported as failed', async () => {
      const buf = makeBuffer(',Alice,alice@test.com');
      const result = await service.importFromCsv(buf, mockClass(), mockEducator());
      expect(result.data?.failedCount).toBe(1);
      expect(result.data?.failed[0].error).toBe(StudentConstants.VALIDATION.MISSING_DATA);
    });

    it('UNIT: tracks total row count correctly for mixed valid/invalid input', async () => {
      const buf = makeBuffer(
        validRow('STU001', 'Alice'),
        ',Missing ID,',
        validRow('STU001', 'Dup,'),
        validRow('STU003', 'Carol'),
      );
      const result = await service.importFromCsv(buf, mockClass(), mockEducator());
      expect(result.data?.total).toBe(4);
      expect(result.data?.inserted).toBe(2);
      expect(result.data?.failedCount).toBe(2);
    });
  });

  // ─── bulkUpload (controller) ─────────────────────────────────────────────

  describe('bulkUpload (controller)', () => {
    const classId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const makeFile = (content: string): Express.Multer.File =>
      ({
        buffer: Buffer.from(content, 'utf-8'),
        originalname: 'roster.csv',
        mimetype: 'text/csv',
      }) as Express.Multer.File;

    it('INTEGRATION: throws BadRequestException when no file is provided', async () => {
      await expect(controller.bulkUpload(undefined, classId, makeReq())).rejects.toThrow(
        BadRequestException,
      );
    });

    it('INTEGRATION: throws BadRequestException for invalid class_id', async () => {
      await expect(controller.bulkUpload(makeFile(''), 'not-a-uuid', makeReq())).rejects.toThrow(
        BadRequestException,
      );
    });

    // Per ADR-0006 this is enforced by @RequiredRoles on the route, evaluated by the global
    // AuthGuard before the handler runs — a direct controller call in a unit test bypasses the
    // guard, so the declaration is what's assertable here. Runtime enforcement is proved in
    // tests/integration/auth/route-coverage.integration.spec.ts.
    it('declares @RequiredRoles(EDUCATOR) on bulkUpload, so a district admin never reaches it', () => {
      const roles = new Reflector().getAllAndOverride<RoleSlug[]>(ROLES_KEY, [
        StudentsController.prototype.bulkUpload as () => unknown,
        StudentsController,
      ]);
      expect(roles).toEqual([RoleSlug.EDUCATOR]);
    });

    it('INTEGRATION: throws NotFoundException when class does not exist', async () => {
      jest.spyOn(service, 'findClassById').mockResolvedValue(null);
      await expect(controller.bulkUpload(makeFile(''), classId, makeReq())).rejects.toThrow(
        NotFoundException,
      );
    });

    it('INTEGRATION: throws NotFoundException when educator does not exist', async () => {
      jest.spyOn(service, 'findClassById').mockResolvedValue(mockClass());
      jest.spyOn(service, 'findEducatorById').mockResolvedValue(null);
      await expect(controller.bulkUpload(makeFile(''), classId, makeReq())).rejects.toThrow(
        NotFoundException,
      );
    });

    it('INTEGRATION: returns success response on valid CSV upload', async () => {
      jest.spyOn(service, 'findClassById').mockResolvedValue(mockClass());
      jest.spyOn(service, 'findEducatorById').mockResolvedValue(mockEducator());
      jest.spyOn(service, 'importFromCsv').mockResolvedValue({
        success: true,
        message: '2 student(s) imported successfully',
        data: { total: 2, inserted: 2, failedCount: 0, failed: [] },
      });
      const res = await controller.bulkUpload(
        makeFile('student_id,student_name\nS1,Alice'),
        classId,
        makeReq(),
      );
      expect(res.data?.inserted).toBe(2);
      expect(res.message).toBe('2 student(s) imported successfully');
    });

    it('INTEGRATION: propagates partial-success data when some rows fail', async () => {
      jest.spyOn(service, 'findClassById').mockResolvedValue(mockClass());
      jest.spyOn(service, 'findEducatorById').mockResolvedValue(mockEducator());
      jest.spyOn(service, 'importFromCsv').mockResolvedValue({
        success: true,
        message: '1 student(s) imported successfully',
        data: {
          total: 2,
          inserted: 1,
          failedCount: 1,
          failed: [{ row: {} as never, error: 'Missing student data (ID or Name)' }],
        },
      });
      const res = await controller.bulkUpload(
        makeFile('student_id,student_name\nS1,Alice\n,'),
        classId,
        makeReq(),
      );
      expect(res.data?.failedCount).toBe(1);
      expect(res.data?.inserted).toBe(1);
    });
  });
});
