import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ClassesController } from '../../../src/class/classes.controller';
import { ClassesService } from '../../../src/class/classes.service';
import { EducatorsService } from '../../../src/educators/educators.service';
import { Class } from '../../../src/class/entity/class.entity';
import { ClassEducator } from '../../../src/class/entity/class-educator.entity';
import { ClassDto } from '../../../src/class/dto/classes.dto';
import { Student } from '../../../src/students/entity/students.entity';
import { Educator } from '../../../src/educators/entity/educator.entity';
import { EducatorSchool } from '../../../src/educators/entity/educator-school.entity';
import { User } from '../../../src/users/entity/user.entity';
import { Schools } from '../../../src/schools/entity/schools.entity';
import { Invite } from '../../../src/invites/entity/invite.entity';
import { ClassSimulation } from '../../../src/class-simulations/entity/class-simulation.entity';
import { ClassSimulationService } from '../../../src/class-simulations/class-simulation.service';
import { AzureBlobService } from '../../../src/config/azure-blob.config';
import { MailService } from '../../../src/mail/mail.service';
import { ConfigService } from '@nestjs/config';
import { NotificationsGateway } from '../../../src/notifications/notifications.gateway';
import { EducatorSessionService } from '../../../src/session/educator-session.service';
import { CommonStatus } from 'src/common/enums/status.enum';
import { JwtRequest } from 'src/common/types';
import { AppStatus } from 'src/common/utils/messages';
import { CreateStudentDto } from '../../../src/students/dto/students.dto';
import { LmsProvisionService } from '../../../src/lms/services/lms-provision.service';
import { LmsLookupService } from '../../../src/lms/services/lms-lookup.service';
import { LmsConfigService } from '../../../src/lms/services/lms-config.service';
import { LmsRosterService } from '../../../src/lms/services/lms-roster.service';
import { TutorPatientService } from '../../../src/common/utils/tutor-patient.service';
 
const makeReq = (userId: string, roles: string[]): JwtRequest => {
  const req = Object.assign(new Request('http://localhost'), { user: { userId, roles } });
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
 
const educatorReq = makeReq('edu-1', ['Educator']);
const adminReq = makeReq('admin-1', ['Admin']);
 
const validDto: ClassDto = {
  class_name: 'Biology',
  term: 'i',
  year: '2025',
  start_date: '2025-01-01',
  end_date: '2025-06-01',
};
 
describe('Classes (Controller + Service)', () => {
  let controller: ClassesController;
  let service: ClassesService;
 
  const classRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(),
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
  };
  const classSimulationRepo = { findOne: jest.fn(), find: jest.fn(), update: jest.fn() };
  const classSimulationService = {
    findByClass: jest.fn().mockResolvedValue({ data: [] }),
    findByClassIdsBatch: jest.fn().mockResolvedValue(new Map()),
  };
  const educatorRepo = { findOne: jest.fn() };
  const classEducatorRepo = { findOne: jest.fn(), create: jest.fn(), save: jest.fn() };
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
        { provide: getRepositoryToken(Class), useValue: classRepo },
        { provide: getRepositoryToken(ClassEducator), useValue: classEducatorRepo },
        { provide: getRepositoryToken(Student), useValue: studentRepo },
        { provide: getRepositoryToken(Educator), useValue: educatorRepo },
        { provide: getRepositoryToken(EducatorSchool), useValue: { findOne: jest.fn(), count: jest.fn().mockResolvedValue(0), save: jest.fn().mockResolvedValue({}), remove: jest.fn().mockResolvedValue({}), update: jest.fn() } },
        { provide: getRepositoryToken(User), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(Schools), useValue: { findOne: jest.fn() } },
        {
          provide: getRepositoryToken(Invite),
          useValue: { findOne: jest.fn(), delete: jest.fn(), save: jest.fn(), create: jest.fn() },
        },
        { provide: getRepositoryToken(ClassSimulation), useValue: classSimulationRepo },
        { provide: ClassSimulationService, useValue: classSimulationService },
        {
          provide: AzureBlobService,
          useValue: { uploadFile: jest.fn(), isConfigured: jest.fn().mockReturnValue(false) },
        },
        { provide: DataSource, useValue: dataSource },
        { provide: MailService, useValue: { sendMail: jest.fn().mockResolvedValue(undefined) } },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('http://localhost:5173') },
        },
        { provide: NotificationsGateway, useValue: { notifyAccountDeleted: jest.fn(), notifyAccountDeactivated: jest.fn(), notifyAdminEducatorLowSeatWarning: jest.fn(), notifyAdminSchoolLowSeatWarning: jest.fn() } },
        { provide: EducatorSessionService, useValue: { invalidateEducator: jest.fn().mockResolvedValue(undefined), invalidateBySchool: jest.fn().mockResolvedValue([]) } },
        { provide: TutorPatientService, useValue: { getReportsByStudentIds: jest.fn().mockResolvedValue({ matched: [], isMatch: false }) } },
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
    }).compile();
    controller = module.get(ClassesController);
    service = module.get(ClassesService);
  });
 
  afterEach(() => jest.clearAllMocks());
 
  describe('create', () => {
    beforeEach(() => {
      educatorRepo.findOne.mockResolvedValue(makeEducator());
    });
    it('UNIT: returns failure when required fields missing', async () => {
      const result = await service.create(
        { class_name: '', term: undefined, year: undefined },
        makeEducator(),
        [],
      );
      expect(result.success).toBe(false);
    });
 
    it('INTEGRATION: throws ForbiddenException for non-Educator', async () => {
      await expect(controller.create(validDto, adminReq)).rejects.toThrow(ForbiddenException);
    });
 
    it('INTEGRATION: throws BadRequestException when start_date after end_date', async () => {
      await expect(
        controller.create(
          { ...validDto, start_date: '2025-12-01', end_date: '2025-01-01' },
          educatorReq,
        ),
      ).rejects.toThrow(BadRequestException);
    });
 
    it('INTEGRATION: throws BadRequestException on duplicate student_id', async () => {
      const dto: ClassDto = {
        ...validDto,
        students: [
          { student_name: 'A', student_id: 'DUP' },
          { student_name: 'B', student_id: 'DUP' },
        ] as CreateStudentDto[],
      };
      await expect(controller.create(dto, educatorReq)).rejects.toThrow(BadRequestException);
    });
 
    it('INTEGRATION: throws BadRequestException when both students and total_no_of_students', async () => {
      const dto: ClassDto = {
        ...validDto,
        students: [{ student_name: 'A' }] as CreateStudentDto[],
        total_no_of_students: 1,
      };
      await expect(controller.create(dto, educatorReq)).rejects.toThrow(BadRequestException);
    });
 
    it('INTEGRATION: throws NotFoundException when educator not found', async () => {
      jest.spyOn(service, 'findEducatorById').mockResolvedValue(null);
      jest.spyOn(service, 'findByCriteria').mockResolvedValue(null);
      await expect(controller.create(validDto, educatorReq)).rejects.toThrow(NotFoundException);
    });
 
    it('INTEGRATION: throws BadRequestException when class already exists', async () => {
      jest.spyOn(service, 'findEducatorById').mockResolvedValue(makeEducator());
      jest.spyOn(service, 'findByCriteria').mockResolvedValue(makeClass());
      await expect(controller.create(validDto, educatorReq)).rejects.toThrow(BadRequestException);
    });
 
    it('INTEGRATION: creates successfully', async () => {
      jest.spyOn(service, 'findEducatorById').mockResolvedValue(makeEducator());
      jest.spyOn(service, 'findByCriteria').mockResolvedValue(null);
      jest
        .spyOn(service, 'create')
        .mockResolvedValue({ success: true, message: 'Created', data: makeClass() });
      const result = await controller.create(validDto, educatorReq);
      expect(result.status).toBe(AppStatus.SUCCESS);
    });
  });
 
  describe('findAll', () => {
    const stubClassFindAllQb = (rows: unknown[]): void => {
      classRepo.createQueryBuilder.mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(rows),
      });
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
 
  describe('findOne', () => {
    const stubClassFindOneQb = (row: Class | null) => {
      classRepo.createQueryBuilder.mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(row),
      });
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
    it('UNIT: updates class name', async () => {
      classRepo.save.mockResolvedValue(makeClass({ class_name: 'Chemistry' }));
      const result = await service.update(makeClass(), {
        class_name: 'Chemistry',
      });
      expect(result.data?.class_name).toBe('Chemistry');
    });
 
    it('INTEGRATION: throws NotFoundException when not found', async () => {
      jest.spyOn(service, 'findClassByIdWithEducator').mockResolvedValue(null);
      await expect(
        controller.update({ id: 'bad' }, { class_name: 'X' }, educatorReq),
      ).rejects.toThrow(NotFoundException);
    });
 
    it('INTEGRATION: updates successfully', async () => {
      jest.spyOn(service, 'findClassByIdWithEducator').mockResolvedValue(makeClass());
      jest.spyOn(service, 'update').mockResolvedValue({
        success: true,
        message: 'Updated',
        data: makeClass({ class_name: 'Chemistry' }),
      });
      const result = await controller.update(
        { id: 'class-1' },
        { class_name: 'Chemistry' },
        educatorReq,
      );
      expect((result.data as Class).class_name).toBe('Chemistry');
    });
  });
 
  describe('remove', () => {
    it('UNIT: removes class and students', async () => {
      classRepo.findOne.mockResolvedValue(makeClass());
      mockTransactionManager.find.mockResolvedValue([
        { id: 'student-1', is_active: true, status: CommonStatus.ACTIVE },
      ]);
      const result = await service.remove('class-1');
      expect(result.success).toBe(true);
      expect(dataSource.transaction).toHaveBeenCalled();
      expect(mockTransactionManager.delete).toHaveBeenCalled();
      expect(mockTransactionManager.update).toHaveBeenCalled();
      expect(mockTransactionManager.save).toHaveBeenCalled();
    });
 
    it('INTEGRATION: throws NotFoundException when not found', async () => {
      jest.spyOn(service, 'findClassByIdWithEducator').mockResolvedValue(null);
      await expect(controller.remove({ id: 'bad' }, educatorReq)).rejects.toThrow(
        NotFoundException,
      );
    });
 
    it('INTEGRATION: deletes successfully', async () => {
      jest.spyOn(service, 'findClassByIdWithEducator').mockResolvedValue(makeClass());
      jest
        .spyOn(service, 'remove')
        .mockResolvedValue({ success: true, message: 'Deleted', data: null });
      const result = await controller.remove({ id: 'class-1' }, educatorReq);
      expect(result.data).toBeNull();
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
      classRepo.createQueryBuilder.mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          { ...makeClass(), students: new Array(7).fill({ is_active: true }) },
        ]),
      });
      const result = await service.findAll('edu-1');
      expect(result.data![0].total_no_of_students).toBe(7);
    });
 
    it('create: tokens check uses availableTokens from educatorService', async () => {
      jest.spyOn(service, 'findEducatorById').mockResolvedValue(makeEducator());
      jest.spyOn(service, 'findByCriteria').mockResolvedValue(null);
      jest
        .spyOn(service, 'create')
        .mockResolvedValue({ success: true, message: 'Created', data: makeClass() });
      await controller.create(validDto, educatorReq);
    });
  });
 
  describe('student code generation (CCC-XXXX format)', () => {
    const FORMAT_REGEX = /^[A-Z0-9]{3}-[A-Z0-9]{4}$/;
    const mockQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    const capturedStudents: Partial<Student>[] = [];
 
    beforeEach(() => {
      capturedStudents.length = 0;
      (studentRepo as Record<string, unknown>).createQueryBuilder = jest
        .fn()
        .mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getRawMany.mockResolvedValue([]);
      classRepo.create.mockImplementation((c: Partial<Class>) => c as Class);
      classRepo.save
        .mockResolvedValueOnce({ ...makeClass(), id: 'class-1', class_name: validDto.class_name })
        .mockResolvedValue({ ...makeClass(), id: 'class-1' });
      classRepo.findOne.mockResolvedValue({ ...makeClass(), students: [] });
      studentRepo.create.mockImplementation((s: Partial<Student>) => s as Student);
      studentRepo.save.mockImplementation((students: Student | Student[]) => {
        if (Array.isArray(students)) capturedStudents.push(...students);
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
      classRepo.save.mockReset();
      classRepo.save
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
      classRepo.save.mockReset();
      classRepo.save
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
  });
});
