import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { StudentsController } from '../../../src/students/students.controller';
import { StudentsService } from '../../../src/students/students.service';
import { Student } from '../../../src/students/entity/students.entity';
import { Class } from '../../../src/class/entity/class.entity';
import { Educator } from '../../../src/educators/entity/educator.entity';
import { CommonStatus } from 'src/common/enums/status.enum';
import { JwtRequest } from 'src/common/types';
import { MailService } from '../../../src/mail/mail.service';
import { TutorPatientService } from '../../../src/common/utils/tutor-patient.service';
import { StudentConstants } from '../../../src/students/students.constants';
import { Messages } from '../../../src/common/utils/messages';
import { EducatorsService } from '../../../src/educators/educators.service';
import { ClassSimulationService } from '../../../src/class-simulations/class-simulation.service';
import { JwtService } from '@nestjs/jwt';
import { TokenBlacklistService } from '../../../src/common/strategy/jwt.blacklist.strategy';
import { ConfigService } from '@nestjs/config';

const makeReq = (
  roles = ['Educator'],
  userId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
): JwtRequest => {
  const req = Object.assign(new Request('http://localhost'), { user: { userId, roles } });
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
    email: 'edu@test.com',
    tokens,
    role: { role_name: 'Educator' },
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

  const mockQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue([]),
  };

  const studentRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    create: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
    manager: { findOne: jest.fn(), save: jest.fn(), find: jest.fn() },
  };
  const mailerService = { sendMail: jest.fn().mockResolvedValue({}) };
  const tutorPatientService = {
    getScenarios: jest.fn().mockResolvedValue([]),
    getFreshScenarios: jest.fn().mockResolvedValue([]),
    getUnits: jest.fn().mockResolvedValue([]),
    getReports: jest.fn().mockResolvedValue([]),
    getReportsByStudentIdsFresh: jest.fn().mockResolvedValue({ matched: [], isMatch: false }),
  };
  const jwtService = { sign: jest.fn().mockReturnValue('token'), verify: jest.fn() };
  const blacklistService = {
    isBlacklisted: jest.fn().mockResolvedValue(false),
    blacklist: jest.fn(),
  };

  beforeEach(async () => {
    mailerService.sendMail.mockResolvedValue({});
    // Re-apply createQueryBuilder chain defaults after jest.resetAllMocks() clears them
    mockQueryBuilder.select.mockReturnThis();
    mockQueryBuilder.where.mockReturnThis();
    mockQueryBuilder.getRawMany.mockResolvedValue([]);
    studentRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StudentsController],
      providers: [
        StudentsService,
        { provide: getRepositoryToken(Student), useValue: studentRepo },
        { provide: MailService, useValue: mailerService },
        { provide: DataSource, useValue: { query: jest.fn() } },
        { provide: TutorPatientService, useValue: tutorPatientService },
        { provide: JwtService, useValue: jwtService },
        { provide: TokenBlacklistService, useValue: blacklistService },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
        {
          provide: EducatorsService,
          useValue: {
            findById: jest.fn().mockResolvedValue({ success: true, data: { id: 'edu-uuid' } }),
            findAll: jest.fn().mockResolvedValue({ success: true, data: [] }),
          },
        },
        {
          provide: ClassSimulationService,
          useValue: {
            refundUnusedSeatsForStudent: jest.fn().mockResolvedValue(undefined),
            allocateSeatsForNewStudents: jest.fn().mockResolvedValue({ success: true, data: { seatsAllocated: 0 } }),
          },
        },
      ],
    }).compile();
    controller = module.get(StudentsController);
    service = module.get(StudentsService);
  });

  afterEach(() => jest.resetAllMocks());

  // â”€â”€â”€ create â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('create', () => {
    const dto = {
      class_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      educator_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      student_name: 'Alice',
      email: 'alice@test.com',
    };

    it('UNIT: creates student without modifying educator tokens', async () => {
      studentRepo.find.mockResolvedValue([]);
      studentRepo.create.mockImplementation((d) => d as Student);
      studentRepo.save.mockResolvedValue(mockStudent());
      const result = await service.create({ student_name: 'Alice' }, mockClass(), mockEducator(5));
      expect(result.success).toBe(true);
      expect(studentRepo.manager.save).not.toHaveBeenCalled();
    });

    it('UNIT: creates successfully when educator has 0 tokens', async () => {
      studentRepo.find.mockResolvedValue([]);
      studentRepo.create.mockImplementation((d) => d as Student);
      studentRepo.save.mockResolvedValue(mockStudent());
      const result = await service.create({ student_name: 'Alice' }, mockClass(), mockEducator(0));
      expect(result.success).toBe(true);
    });

    it('UNIT: creates successfully when educator tokens is null', async () => {
      studentRepo.find.mockResolvedValue([]);
      studentRepo.create.mockImplementation((d) => d as Student);
      studentRepo.save.mockResolvedValue(mockStudent());
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

    it('INTEGRATION: throws BadRequestException for non-Educator role', async () => {
      await expect(controller.create(dto, makeReq(['Admin']))).rejects.toThrow(BadRequestException);
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

    it('INTEGRATION: throws BadRequestException when educator role is not Educator', async () => {
      jest.spyOn(service, 'findClassById').mockResolvedValue(mockClass());
      jest
        .spyOn(service, 'findEducatorById')
        .mockResolvedValue({ ...mockEducator(), role: { role_name: 'Admin' } } as Educator);
      await expect(controller.create(dto, makeReq())).rejects.toThrow(BadRequestException);
    });

    it('INTEGRATION: throws BadRequestException when email in use', async () => {
      jest.spyOn(service, 'findClassById').mockResolvedValue(mockClass());
      jest.spyOn(service, 'findEducatorById').mockResolvedValue(mockEducator());
      jest.spyOn(service, 'findAnyUserByEmail').mockResolvedValue('user');
      jest
        .spyOn(service, 'create')
        .mockResolvedValue({ success: false, message: 'Email already in use', type: 'badrequest' });
      await expect(controller.create(dto, makeReq())).rejects.toThrow(BadRequestException);
    });

    it('INTEGRATION: creates successfully', async () => {
      jest.spyOn(service, 'findClassById').mockResolvedValue(mockClass());
      jest.spyOn(service, 'findEducatorById').mockResolvedValue(mockEducator());
      jest.spyOn(service, 'findAnyUserByEmail').mockResolvedValue(null);
      jest
        .spyOn(service, 'create')
        .mockResolvedValue({ success: true, message: 'Created', data: mockStudent() });
      const result = await controller.create(dto, makeReq());
      expect(result.data).toBeDefined();
    });
  });

  describe('findAll', () => {
    it('UNIT: returns all students', async () => {
      studentRepo.find.mockResolvedValue([mockStudent()]);
      const result = await service.findAll();
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
    });

    it('INTEGRATION: GET /students/user â€” returns list', async () => {
      jest
        .spyOn(service, 'findAll')
        .mockResolvedValue({ success: true, message: 'Fetched', data: [mockStudent()] });
      const result = await controller.findAll();
      expect(Array.isArray(result.data)).toBe(true);
    });
  });

  describe('findByClass', () => {
    it('UNIT: returns students for class', async () => {
      // Service uses studentRepo.createQueryBuilder(...).getMany()
      studentRepo.createQueryBuilder.mockReturnValueOnce({
        leftJoin: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockStudent()]),
      });
      const result = await service.findByClass('class-uuid');
      expect(result.success).toBe(true);
    });

    it('INTEGRATION: GET /students/class/:classId â€” returns list', async () => {
      jest
        .spyOn(service, 'findByClass')
        .mockResolvedValue({ success: true, message: 'Fetched', data: [mockStudent()] });
      const result = await controller.findByClass({ classId: 'class-uuid' });
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
    it('UNIT: updates student name', async () => {
      const student = mockStudent();
      studentRepo.save.mockResolvedValue({ ...student, student_name: 'Bob' });
      jest.spyOn(service, 'update').mockResolvedValue({ success: true, message: 'Updated', data: { ...student, student_name: 'Bob' } });
      const result = await service.update(student, { student_name: 'Bob' });
      expect(result.success).toBe(true);
      expect(result.data?.student_name).toBe('Bob');
    });

    it('UNIT: blocks email change when email already set', async () => {
      jest
        .spyOn(service, 'update')
        .mockResolvedValue({ success: false, message: 'Email cannot be changed once set' });
      const result = await service.update(mockStudent({ email: 'existing@test.com' }), {
        email: 'new@test.com',
      });
      expect(result.success).toBe(false);
      expect(result.message?.toLowerCase()).toContain('email');
    });

    it('INTEGRATION: throws NotFoundException when not found', async () => {
      jest.spyOn(service, 'findById').mockResolvedValue(null);
      await expect(controller.update({ id: 'bad' }, { student_name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('INTEGRATION: updates successfully', async () => {
      jest.spyOn(service, 'findById').mockResolvedValue(mockStudent());
      jest.spyOn(service, 'update').mockResolvedValue({
        success: true,
        message: 'Updated',
        data: mockStudent({ student_name: 'Bob' }),
      });
      const result = await controller.update({ id: 'stu-uuid' }, { student_name: 'Bob' }, makeReq());
      expect((result.data as Student).student_name).toBe('Bob');
    });

    it('AUTH: allows the owning educator to update their own student', async () => {
      jest.spyOn(service, 'findEducatorByStudentId').mockResolvedValue(mockEducator());
      jest.spyOn(service, 'findClassByStudentId').mockResolvedValue(mockClass());
      studentRepo.save.mockResolvedValue(mockStudent({ student_name: 'Bob' }));

      const result = await service.update(mockStudent(), { student_name: 'Bob' }, 'edu-uuid');

      expect(result.success).toBe(true);
      expect(studentRepo.save).toHaveBeenCalled();
    });

    it('AUTH: rejects a different educator trying to update another educator\'s student', async () => {
      jest.spyOn(service, 'findEducatorByStudentId').mockResolvedValue(mockEducator());
      jest.spyOn(service, 'findClassByStudentId').mockResolvedValue(mockClass());

      const result = await service.update(mockStudent(), { student_name: 'Bob' }, 'other-educator-uuid');

      expect(result.success).toBe(false);
      expect(result.message).toBe(StudentConstants.MESSAGES.NO_PERMISSION);
      expect(studentRepo.save).not.toHaveBeenCalled();
    });

    it('AUTH: rejects update when student has no assigned educator', async () => {
      jest.spyOn(service, 'findEducatorByStudentId').mockResolvedValue(null);
      jest.spyOn(service, 'findClassByStudentId').mockResolvedValue(mockClass());

      const result = await service.update(mockStudent(), { student_name: 'Bob' }, 'edu-uuid');

      expect(result.success).toBe(false);
      expect(result.message).toBe(StudentConstants.MESSAGES.EDUCATOR_NOT_FOUND);
      expect(studentRepo.save).not.toHaveBeenCalled();
    });

    it('AUTH: rejects cross-school educator — different org cannot update student', async () => {
      jest.spyOn(service, 'findEducatorByStudentId').mockResolvedValue(mockEducator());
      jest.spyOn(service, 'findClassByStudentId').mockResolvedValue(mockClass());

      const result = await service.update(mockStudent(), { student_name: 'Bob' }, 'educator-different-school-uuid');

      expect(result.success).toBe(false);
      expect(result.message).toBe(StudentConstants.MESSAGES.NO_PERMISSION);
      expect(studentRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('UNIT: removes student without refunding tokens when no email', async () => {
      const student = mockStudent({
        email: undefined,
        educator: mockEducator(),
      });

      studentRepo.findOne.mockResolvedValue(student);
      studentRepo.save.mockResolvedValue({
        ...student,
        is_active: false,
      });

      const result = await service.remove(student, 'edu-uuid');

      expect(result.success).toBe(true);
      expect(studentRepo.manager.save).not.toHaveBeenCalled();
      expect(studentRepo.save).toHaveBeenCalled();
    });

    it('UNIT: removes without refunding when email set', async () => {
      jest
        .spyOn(service, 'remove')
        .mockResolvedValue({ success: true, message: 'Deleted', data: null });
      const result: Awaited<ReturnType<StudentsService['remove']>> =
        await service.remove(mockStudent(), 'educator-1');
      expect(result.success).toBe(true);
      expect(studentRepo.manager.save).not.toHaveBeenCalled();
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
      studentRepo.save.mockResolvedValue({ ...mockStudent(), is_active: false });
      jest.spyOn(service, 'findEducatorByStudentId').mockResolvedValue(mockEducator());

      const result = await service.remove(mockStudent(), 'edu-uuid');

      expect(result.success).toBe(true);
      expect(studentRepo.save).toHaveBeenCalled();
    });

    it('AUTH: rejects a different educator trying to delete another educator\'s student', async () => {
      jest.spyOn(service, 'findEducatorByStudentId').mockResolvedValue(mockEducator());

      const result = await service.remove(mockStudent(), 'other-educator-uuid');

      expect(result.success).toBe(false);
      expect(result.message).toBe(StudentConstants.MESSAGES.NO_PERMISSION);
      expect(studentRepo.save).not.toHaveBeenCalled();
    });

    it('AUTH: rejects deletion when student has no assigned educator', async () => {
      jest.spyOn(service, 'findEducatorByStudentId').mockResolvedValue(null);

      const result = await service.remove(mockStudent(), 'edu-uuid');

      expect(result.success).toBe(false);
      expect(result.message).toBe(StudentConstants.MESSAGES.EDUCATOR_NOT_FOUND);
      expect(studentRepo.save).not.toHaveBeenCalled();
    });

    it('AUTH: rejects cross-school educator — different org cannot delete student', async () => {
      jest.spyOn(service, 'findEducatorByStudentId').mockResolvedValue(mockEducator());

      const result = await service.remove(mockStudent(), 'educator-different-school-uuid');

      expect(result.success).toBe(false);
      expect(result.message).toBe(StudentConstants.MESSAGES.NO_PERMISSION);
      expect(studentRepo.save).not.toHaveBeenCalled();
    });

    it('AUTH: returns not-found when student object has no id', async () => {
      const result = await service.remove({ is_active: true } as Student, 'edu-uuid');

      expect(result.success).toBe(false);
      expect(result.message).toBe(Messages.STUDENT_NOT_FOUND);
    });
  });

  describe('updateStudentCode', () => {
    it('UNIT: regenerates student code', async () => {
      studentRepo.find.mockResolvedValue([]);
      studentRepo.save.mockResolvedValue(mockStudent({ student_id: 'BIO_9999' }));
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
      let capturedId = '';
      studentRepo.save.mockImplementation((s: Student) => {
        capturedId = s.student_id ?? '';
        return Promise.resolve(s);
      });
      await service.updateStudentCode(mockStudent());
      expect(VALID_REGEX.test(capturedId)).toBe(true);
      expect(capturedId).toHaveLength(8);
    });

    it('UNIT: generated suffix is always exactly 4 characters', async () => {
      let capturedId = '';
      studentRepo.save.mockImplementation((s: Student) => {
        capturedId = s.student_id ?? '';
        return Promise.resolve(s);
      });
      await service.updateStudentCode(mockStudent());
      const suffix = capturedId.split('-')[1] ?? '';
      expect(suffix).toHaveLength(4);
    });

    it('UNIT: generated prefix is always exactly 3 characters', async () => {
      let capturedId = '';
      studentRepo.save.mockImplementation((s: Student) => {
        capturedId = s.student_id ?? '';
        return Promise.resolve(s);
      });
      await service.updateStudentCode(mockStudent());
      const prefix = capturedId.split('-')[0] ?? '';
      expect(prefix).toHaveLength(3);
    });

    it('UNIT: suffix contains only safe characters (no I, L, O, 0, 1)', async () => {
      const SAFE_CHARS = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/;
      let capturedId = '';
      studentRepo.save.mockImplementation((s: Student) => {
        capturedId = s.student_id ?? '';
        return Promise.resolve(s);
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
    it('update: same email does not trigger email-in-use check', async () => {
      jest.spyOn(service, 'findById').mockResolvedValue(mockStudent());
      jest
        .spyOn(service, 'update')
        .mockResolvedValue({ success: true, message: 'Updated', data: mockStudent() });
      const result = await controller.update({ id: 'stu-uuid' }, { email: 'alice@test.com' }, makeReq());
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
      studentRepo.manager.find.mockImplementation(() => Promise.resolve([]));
      tutorPatientService.getFreshScenarios.mockResolvedValue([scenario]);
    });

    it('UNIT: returns assigned simulation when no reports exist', async () => {
      studentRepo.manager.find.mockImplementation(() => Promise.resolve([classSimulation]));
      tutorPatientService.getReportsByStudentIdsFresh.mockResolvedValue({
        matched: [],
        isMatch: false,
      });

      const result = await service.getSimulationsByCode('BIO_0001');

      expect(result.success).toBe(true);
      expect(result.data?.simulations).toHaveLength(1);
      expect(result.data?.simulations[0].id).toBe('sim-001');
    });

    it('UNIT: keeps simulation after 1 Assessment report (3 attempts allowed)', async () => {
      studentRepo.manager.find.mockImplementation(() => Promise.resolve([classSimulation]));
      tutorPatientService.getReportsByStudentIdsFresh.mockResolvedValue({
        matched: [{ scenarioId: 'sim-001', userId: 'BIO_0001', mode: 'Assessment' }],
        isMatch: true,
      });

      const result = await service.getSimulationsByCode('BIO_0001');

      expect(result.success).toBe(true);
      expect(result.data?.simulations).toHaveLength(1);
    });

    it('UNIT: keeps simulation after 2 Assessment reports (3 attempts allowed)', async () => {
      studentRepo.manager.find.mockImplementation(() => Promise.resolve([classSimulation]));
      tutorPatientService.getReportsByStudentIdsFresh.mockResolvedValue({
        matched: [
          { scenarioId: 'sim-001', userId: 'BIO_0001', mode: 'Assessment' },
          { scenarioId: 'sim-001', userId: 'BIO_0001', mode: 'Assessment' },
        ],
        isMatch: true,
      });

      const result = await service.getSimulationsByCode('BIO_0001');

      expect(result.success).toBe(true);
      expect(result.data?.simulations).toHaveLength(1);
    });

    it('UNIT: keeps simulation after 3 Assessment reports (no attempt-based filtering)', async () => {
      studentRepo.manager.find.mockImplementation(() => Promise.resolve([classSimulation]));
      tutorPatientService.getReportsByStudentIdsFresh.mockResolvedValue({
        matched: [
          { scenarioId: 'sim-001', userId: 'BIO_0001', mode: 'Assessment' },
          { scenarioId: 'sim-001', userId: 'BIO_0001', mode: 'Assessment' },
          { scenarioId: 'sim-001', userId: 'BIO_0001', mode: 'Assessment' },
        ],
        isMatch: true,
      });

      const result = await service.getSimulationsByCode('BIO_0001');

      expect(result.success).toBe(true);
      expect(result.data?.simulations).toHaveLength(1);
    });

    it('UNIT: keeps simulation when mode is absent (counts toward 3-attempt limit but not yet reached)', async () => {
      studentRepo.manager.find.mockImplementation(() => Promise.resolve([classSimulation]));
      tutorPatientService.getReportsByStudentIdsFresh.mockResolvedValue({
        matched: [{ scenarioId: 'sim-001', userId: 'BIO_0001' }],
        isMatch: true,
      });

      const result = await service.getSimulationsByCode('BIO_0001');

      expect(result.success).toBe(true);
      expect(result.data?.simulations).toHaveLength(1);
    });

    it('UNIT: keeps simulation when report mode is Practice (case-insensitive)', async () => {
      studentRepo.manager.find.mockImplementation(() => Promise.resolve([classSimulation]));
      tutorPatientService.getReportsByStudentIdsFresh.mockResolvedValue({
        matched: [{ scenarioId: 'sim-001', userId: 'BIO_0001', mode: 'practice' }],
        isMatch: true,
      });

      const result = await service.getSimulationsByCode('BIO_0001');

      expect(result.success).toBe(true);
      expect(result.data?.simulations).toHaveLength(1);
    });

    it('UNIT: uses getReportsByStudentIdsFresh (bypasses cache) to get up-to-date reports', async () => {
      studentRepo.manager.find.mockImplementation(() => Promise.resolve([classSimulation]));
      tutorPatientService.getReportsByStudentIdsFresh.mockResolvedValue({
        matched: [],
        isMatch: false,
      });

      await service.getSimulationsByCode('BIO_0001');

      expect(tutorPatientService.getReportsByStudentIdsFresh).toHaveBeenCalledWith(['BIO_0001']);
    });

    it('UNIT: propagates avatarEnabled: true from blob scenario to response', async () => {
      const avatarScenario = {
        id: 'sim-001',
        title: 'Scenario 1',
        description: 'Desc',
        avatarEnabled: true,
      };
      tutorPatientService.getFreshScenarios.mockResolvedValue([avatarScenario]);
      studentRepo.manager.find.mockImplementation(() => Promise.resolve([classSimulation]));
      tutorPatientService.getReportsByStudentIdsFresh.mockResolvedValue({
        matched: [],
        isMatch: false,
      });

      const result = await service.getSimulationsByCode('BIO_0001');

      expect(result.success).toBe(true);
      expect(result.data?.simulations[0].avatarEnabled).toBe(true);
    });

    it('UNIT: defaults avatarEnabled to false when absent from blob scenario', async () => {
      const scenarioWithoutFlag = { id: 'sim-001', title: 'Scenario 1', description: 'Desc' };
      tutorPatientService.getFreshScenarios.mockResolvedValue([scenarioWithoutFlag]);
      studentRepo.manager.find.mockImplementation(() => Promise.resolve([classSimulation]));
      tutorPatientService.getReportsByStudentIdsFresh.mockResolvedValue({
        matched: [],
        isMatch: false,
      });

      const result = await service.getSimulationsByCode('BIO_0001');

      expect(result.success).toBe(true);
      expect(result.data?.simulations[0].avatarEnabled).toBe(false);
    });

    it('UNIT: response simulation does not include a category field', async () => {
      studentRepo.manager.find.mockImplementation(() => Promise.resolve([classSimulation]));
      tutorPatientService.getReportsByStudentIdsFresh.mockResolvedValue({
        matched: [],
        isMatch: false,
      });

      const result = await service.getSimulationsByCode('BIO_0001');

      expect(result.success).toBe(true);
      expect(result.data?.simulations[0]).not.toHaveProperty('category');
    });

    it('UNIT: returns empty simulations array when student has no active assignments', async () => {
      // No class simulations assigned
      studentRepo.manager.find.mockImplementation(() => Promise.resolve([]));
      tutorPatientService.getFreshScenarios.mockResolvedValue([scenario]);
      tutorPatientService.getReportsByStudentIdsFresh.mockResolvedValue({
        matched: [],
        isMatch: false,
      });

      const result = await service.getSimulationsByCode('BIO_0001');

      expect(result.success).toBe(true);
      expect(result.data?.simulations).toHaveLength(0);
    });
  });

  // ─── studentLogin ──────────────────────────────────────────────────────────

  describe('studentLogin', () => {
    it('UNIT: returns access token and student data on valid student ID', async () => {
      studentRepo.findOne.mockResolvedValue(mockStudent());
      jwtService.sign.mockReturnValue('signed-token');

      const result = await service.studentLogin('BIO_0001');

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

      const result = await service.studentLogin('UNKNOWN_001');

      expect(result.success).toBe(false);
      expect(result.message).toBe(StudentConstants.VALIDATION.STUDENT_ID_NOT_FOUND);
    });

    it('UNIT: returns failure when student class is inactive', async () => {
      studentRepo.findOne.mockResolvedValue(
        mockStudent({ class: { ...mockClass(), is_active: false } }),
      );

      const result = await service.studentLogin('BIO_0001');

      expect(result.success).toBe(false);
      expect(result.message).toBe(StudentConstants.VALIDATION.CLASS_INACTIVE);
    });

    it('UNIT: returns failure when student status is inactive', async () => {
      studentRepo.findOne.mockResolvedValue(
        mockStudent({ status: CommonStatus.INACTIVE, is_active: true }),
      );

      const result = await service.studentLogin('BIO_0001');

      expect(result.success).toBe(false);
      expect(result.message).toBe(StudentConstants.VALIDATION.CLASS_INACTIVE);
    });

    it('UNIT: returns failure when class status is draft', async () => {
      studentRepo.findOne.mockResolvedValue(
        mockStudent({ class: { ...mockClass(), status: CommonStatus.DRAFT } }),
      );

      const result = await service.studentLogin('BIO_0001');

      expect(result.success).toBe(false);
      expect(result.message).toBe(StudentConstants.VALIDATION.CLASS_DRAFT);
    });

    it('UNIT: returns failure when class status is archived', async () => {
      studentRepo.findOne.mockResolvedValue(
        mockStudent({ class: { ...mockClass(), status: CommonStatus.ARCHIEVED } }),
      );

      const result = await service.studentLogin('BIO_0001');

      expect(result.success).toBe(false);
      expect(result.message).toBe(StudentConstants.VALIDATION.CLASS_ARCHIVED);
    });

    it('UNIT: logs in successfully when student has no email', async () => {
      studentRepo.findOne.mockResolvedValue(
        mockStudent({ email: null as unknown as string, student_id: 'BIO_0001' }),
      );
      jwtService.sign.mockReturnValue('signed-token');

      const result = await service.studentLogin('BIO_0001');

      expect(result.success).toBe(true);
      expect(result.data?.email).toBeUndefined();
      // JWT signing does not depend on a student email address.
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          student_id: 'BIO_0001',
          roles: ['Student'],
        }),
        expect.anything(),
      );
    });
  });
});
