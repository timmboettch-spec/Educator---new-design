import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { GoogleRosterSyncService } from '../../../src/google/google-roster-sync.service';
import { GoogleClassroomService } from '../../../src/google/google-classroom.service';
import { GoogleConnectionService } from '../../../src/google/google-connection.service';
import { GoogleConstants } from '../../../src/google/google.constants';
import { LoggerService } from '../../../src/common/services';
import { CommonStatus } from '../../../src/common/enums/status.enum';
import {
  ClassRepository,
  GoogleCourseMappingRepository,
  GoogleStudentMappingRepository,
  StudentRepository,
} from '../../../src/database/repositories';
import { GoogleCourseMapping, GoogleStudentMapping } from '../../../src/database/entities';

describe('GoogleRosterSyncService', () => {
  const courseMappingRepo = {
    findOne: jest.fn(),
    findBySchoolId: jest.fn(),
    save: jest.fn(),
  } as unknown as jest.Mocked<GoogleCourseMappingRepository>;

  const studentMappingRepo = {
    findByClassId: jest.fn(),
    findByClassAndGoogleUserId: jest.fn(),
    findByClassAndGoogleEmail: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  } as unknown as jest.Mocked<GoogleStudentMappingRepository>;

  const studentRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deleteById: jest.fn(),
    findExistingStudentCodes: jest.fn(),
  } as unknown as jest.Mocked<StudentRepository>;

  const classRepo = {
    findActiveByIdWithSchoolForEducator: jest.fn(),
  } as unknown as jest.Mocked<ClassRepository>;

  const connectionService = {
    getValidAccessToken: jest.fn(),
    markConnectionNeedsReauth: jest.fn(),
  } as unknown as jest.Mocked<GoogleConnectionService>;

  const classroomService = {
    fetchRoster: jest.fn(),
  } as unknown as jest.Mocked<GoogleClassroomService>;

  const logger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  } as unknown as LoggerService;

  const dataSource = {
    transaction: jest.fn(async (cb: (manager: unknown) => Promise<unknown>) => {
      const manager = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn((_entity: unknown, data: Record<string, unknown>) => data),
        save: jest.fn(async (entity: Record<string, unknown>) => {
          if (entity.googleUserId) {
            return { id: `gsm-${entity.googleUserId}`, ...entity };
          }
          return {
            id: `st-${String(entity.student_id ?? 'xxxx').slice(-4)}`,
            ...entity,
          };
        }),
      };
      return cb(manager);
    }),
  };

  const courseMapping = {
    id: 'map-1',
    schoolId: 'school-1',
    classId: 'class-1',
    googleCourseId: 'g-course-1',
    googleCourseName: 'Realityworks Classroom Test Course',
    lastRosterSyncedAt: null,
  } as GoogleCourseMapping;

  const roster = [
    {
      googleUserId: 'g-1',
      googleEmail: 'gc-student1@curionn.com',
      googleName: 'GC Student 1',
    },
    {
      googleUserId: 'g-2',
      googleEmail: 'gc-student2@curionn.com',
      googleName: 'GC Student 2',
    },
    {
      googleUserId: 'g-3',
      googleEmail: 'gc-student3@curionn.com',
      googleName: 'GC Student 3',
    },
  ];

  let service: GoogleRosterSyncService;

  beforeEach(() => {
    jest.clearAllMocks();
    courseMappingRepo.findOne.mockResolvedValue({ ...courseMapping });
    courseMappingRepo.save.mockImplementation(async (entity) => entity);
    classRepo.findActiveByIdWithSchoolForEducator.mockResolvedValue({
      id: 'class-1',
      school_id: 'school-1',
      educator_id: 'edu-1',
      is_active: true,
    } as never);
    studentRepo.deleteById.mockResolvedValue(true);
    connectionService.getValidAccessToken.mockResolvedValue('token-1');
    classroomService.fetchRoster.mockResolvedValue(roster);
    studentMappingRepo.findByClassId.mockResolvedValue([]);
    studentRepo.findExistingStudentCodes.mockResolvedValue([]);
    studentRepo.create.mockImplementation(async (data) => ({
      id: `st-${String(data.student_id).slice(-4)}`,
      student_id: data.student_id,
      is_active: true,
    }));
    studentMappingRepo.create.mockImplementation(async (data) => ({
      id: `gsm-${data.googleUserId}`,
      ...data,
    }));
    service = new GoogleRosterSyncService(
      courseMappingRepo,
      studentMappingRepo,
      studentRepo,
      classRepo,
      connectionService,
      classroomService,
      dataSource as never,
      logger,
    );
  });

  it('creates students and mappings on first sync', async () => {
    const result = await service.syncLinkedCourse({
      schoolId: 'school-1',
      mappingId: 'map-1',
      educatorId: 'edu-1',
    });

    expect(result.added).toBe(3);
    expect(result.unchanged).toBe(0);
    expect(result.deactivated).toBe(0);
    expect(result.total).toBe(3);
    expect(dataSource.transaction).toHaveBeenCalledTimes(3);
    expect(courseMappingRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ lastRosterSyncedAt: expect.any(Date) }),
    );
  });

  it('is idempotent on a second sync with the same roster', async () => {
    const existing = roster.map((student, index) => ({
      id: `gsm-${student.googleUserId}`,
      schoolId: 'school-1',
      classId: 'class-1',
      googleCourseId: 'g-course-1',
      googleUserId: student.googleUserId,
      googleEmail: student.googleEmail,
      googleName: student.googleName,
      studentId: `st-${index + 1}`,
      studentCode: `GC-00${index + 1}`,
    })) as GoogleStudentMapping[];
    studentMappingRepo.findByClassId.mockResolvedValue(existing);
    studentRepo.findOne.mockImplementation(async ({ where }) => ({
      id: (where as { id: string }).id,
      is_active: true,
    }));

    const result = await service.syncLinkedCourse({
      schoolId: 'school-1',
      mappingId: 'map-1',
      educatorId: 'edu-1',
    });

    expect(result.added).toBe(0);
    expect(result.unchanged).toBe(3);
    expect(result.deactivated).toBe(0);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('deactivates Google-mapped students missing from the roster, not hand-added students', async () => {
    const existing = [
      {
        id: 'gsm-g-1',
        googleUserId: 'g-1',
        googleEmail: 'gc-student1@curionn.com',
        googleName: 'GC Student 1',
        studentId: 'st-1',
        studentCode: 'GC-1',
        classId: 'class-1',
        schoolId: 'school-1',
        googleCourseId: 'g-course-1',
      },
      {
        id: 'gsm-g-gone',
        googleUserId: 'g-gone',
        googleEmail: 'gone@curionn.com',
        googleName: 'Gone',
        studentId: 'st-gone',
        studentCode: 'GC-GONE',
        classId: 'class-1',
        schoolId: 'school-1',
        googleCourseId: 'g-course-1',
      },
    ] as GoogleStudentMapping[];
    studentMappingRepo.findByClassId.mockResolvedValue(existing);
    classroomService.fetchRoster.mockResolvedValue([roster[0]]);
    studentRepo.findOne.mockImplementation(async ({ where }) => ({
      id: (where as { id: string }).id,
      is_active: true,
    }));

    const result = await service.syncLinkedCourse({
      schoolId: 'school-1',
      mappingId: 'map-1',
      educatorId: 'edu-1',
    });

    expect(result.deactivated).toBe(1);
    expect(studentRepo.update).toHaveBeenCalledWith(
      'st-gone',
      expect.objectContaining({
        is_active: false,
        status: CommonStatus.INACTIVE,
      }),
    );
    expect(studentRepo.update).not.toHaveBeenCalledWith(
      'hand-added',
      expect.anything(),
    );
  });

  it('throws REAUTH_REQUIRED when the Google token is expired', async () => {
    classroomService.fetchRoster.mockRejectedValue(
      new UnauthorizedException(GoogleConstants.MESSAGES.REAUTH_REQUIRED),
    );

    await expect(
      service.syncLinkedCourse({
        schoolId: 'school-1',
        mappingId: 'map-1',
        educatorId: 'edu-1',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(connectionService.markConnectionNeedsReauth).toHaveBeenCalledWith(
      'school-1',
      'edu-1',
    );
  });

  it('throws when the course mapping is missing', async () => {
    courseMappingRepo.findOne.mockResolvedValue(null);
    await expect(
      service.syncLinkedCourse({
        schoolId: 'school-1',
        mappingId: 'missing',
        educatorId: 'edu-1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(classroomService.fetchRoster).not.toHaveBeenCalled();
  });

  it('reactivates a previously inactive Google-mapped student', async () => {
    studentMappingRepo.findByClassId.mockResolvedValue([
      {
        id: 'gsm-g-1',
        googleUserId: 'g-1',
        googleEmail: 'gc-student1@curionn.com',
        googleName: 'GC Student 1',
        studentId: 'st-1',
        studentCode: 'GC-1',
        classId: 'class-1',
        schoolId: 'school-1',
        googleCourseId: 'g-course-1',
      },
    ] as GoogleStudentMapping[]);
    classroomService.fetchRoster.mockResolvedValue([roster[0]]);
    studentRepo.findOne.mockResolvedValue({
      id: 'st-1',
      is_active: false,
      deleted_at: new Date(),
    } as never);

    const result = await service.syncLinkedCourse({
      schoolId: 'school-1',
      mappingId: 'map-1',
      educatorId: 'edu-1',
    });

    expect(result.added).toBe(0);
    expect(result.reactivated).toBe(1);
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(studentRepo.update).toHaveBeenCalledWith(
      'st-1',
      expect.objectContaining({
        is_active: true,
        deleted_at: null,
        status: CommonStatus.ACTIVE,
      }),
    );
  });

  it('matches an existing mapping by email when the Google user id changed', async () => {
    const existing = {
      id: 'gsm-old',
      googleUserId: 'g-old',
      googleEmail: 'gc-student1@curionn.com',
      googleName: 'GC Student 1',
      studentId: 'st-1',
      studentCode: 'GC-1',
      classId: 'class-1',
      schoolId: 'school-1',
      googleCourseId: 'g-course-1',
    } as GoogleStudentMapping;
    studentMappingRepo.findByClassId.mockResolvedValue([existing]);
    classroomService.fetchRoster.mockResolvedValue([roster[0]]);
    studentRepo.findOne.mockResolvedValue({
      id: 'st-1',
      is_active: true,
    } as never);

    const result = await service.syncLinkedCourse({
      schoolId: 'school-1',
      mappingId: 'map-1',
      educatorId: 'edu-1',
    });

    expect(result.added).toBe(0);
    expect(result.unchanged).toBe(1);
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(studentMappingRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        googleUserId: 'g-1',
        googleEmail: 'gc-student1@curionn.com',
      }),
    );
  });

  it('throws REAUTH_REQUIRED when getValidAccessToken rejects', async () => {
    connectionService.getValidAccessToken.mockRejectedValue(
      new UnauthorizedException(GoogleConstants.MESSAGES.REAUTH_REQUIRED),
    );

    await expect(
      service.syncLinkedCourse({
        schoolId: 'school-1',
        mappingId: 'map-1',
        educatorId: 'edu-1',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(classroomService.fetchRoster).not.toHaveBeenCalled();
  });

  it('syncs every linked course for a school', async () => {
    courseMappingRepo.findBySchoolId.mockResolvedValue([
      { ...courseMapping, id: 'map-1' },
      { ...courseMapping, id: 'map-2' },
    ] as GoogleCourseMapping[]);
    courseMappingRepo.findOne.mockImplementation(async ({ where }) => ({
      ...courseMapping,
      id: (where as { id: string }).id,
    }));

    const results = await service.syncAllLinkedCoursesForSchool('school-1', 'edu-1');

    expect(results).toHaveLength(2);
    expect(results.map((row) => row.mappingId)).toEqual(['map-1', 'map-2']);
    expect(classroomService.fetchRoster).toHaveBeenCalledTimes(2);
    expect(classRepo.findActiveByIdWithSchoolForEducator).toHaveBeenCalledWith(
      'class-1',
      'edu-1',
    );
  });

  it('skips inaccessible mappings when syncing all school rosters', async () => {
    courseMappingRepo.findBySchoolId.mockResolvedValue([
      { ...courseMapping, id: 'map-mine', classId: 'class-1' },
      { ...courseMapping, id: 'map-other', classId: 'class-other' },
    ] as GoogleCourseMapping[]);
    classRepo.findActiveByIdWithSchoolForEducator.mockImplementation(
      async (classId: string) =>
        classId === 'class-1'
          ? ({
              id: 'class-1',
              school_id: 'school-1',
              educator_id: 'edu-1',
              is_active: true,
            } as never)
          : null,
    );
    courseMappingRepo.findOne.mockImplementation(async ({ where }) => {
      const id = (where as { id: string }).id;
      if (id === 'map-mine') {
        return { ...courseMapping, id: 'map-mine', classId: 'class-1' };
      }
      return { ...courseMapping, id: 'map-other', classId: 'class-other' };
    });

    const results = await service.syncAllLinkedCoursesForSchool('school-1', 'edu-1');

    expect(results).toHaveLength(1);
    expect(results[0].mappingId).toBe('map-mine');
    expect(classroomService.fetchRoster).toHaveBeenCalledTimes(1);
  });

  it('rejects sync when the educator does not own the class', async () => {
    classRepo.findActiveByIdWithSchoolForEducator.mockResolvedValue(null);

    await expect(
      service.syncLinkedCourse({
        schoolId: 'school-1',
        mappingId: 'map-1',
        educatorId: 'edu-other',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(classroomService.fetchRoster).not.toHaveBeenCalled();
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rolls back when mapping insert fails inside the transaction (no orphan student)', async () => {
    dataSource.transaction.mockImplementationOnce(async (cb: (manager: unknown) => Promise<unknown>) => {
      const manager = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn((_entity: unknown, data: Record<string, unknown>) => data),
        save: jest.fn(async (entity: Record<string, unknown>) => {
          if (entity.googleUserId) {
            throw new Error('unique violation');
          }
          return { id: 'st-temp', ...entity };
        }),
      };
      return cb(manager);
    });
    studentMappingRepo.findByClassAndGoogleUserId.mockResolvedValue(null);

    await expect(
      service.syncLinkedCourse({
        schoolId: 'school-1',
        mappingId: 'map-1',
        educatorId: 'edu-1',
      }),
    ).rejects.toThrow('unique violation');
    // Transaction rollback removes the uncommitted student — no compensate-delete.
    expect(studentRepo.deleteById).not.toHaveBeenCalled();
  });
});
