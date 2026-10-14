import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { GoogleCourseMappingService } from '../../../src/google/google-course-mapping.service';
import { GoogleClassroomService } from '../../../src/google/google-classroom.service';
import { GoogleConnectionService } from '../../../src/google/google-connection.service';
import { GoogleCourseworkService } from '../../../src/google/google-coursework.service';
import { GoogleRosterSyncService } from '../../../src/google/google-roster-sync.service';
import { GoogleConstants } from '../../../src/google/google.constants';
import {
  ClassEducatorRepository,
  ClassRepository,
  GoogleCourseMappingRepository,
  GoogleStudentMappingRepository,
  StudentRepository,
} from '../../../src/database/repositories';
import { LoggerService } from '../../../src/common/services';
import { GoogleCourseMapping } from '../../../src/database/entities';
import { CommonStatus } from '../../../src/common/enums/status.enum';

describe('GoogleCourseMappingService', () => {
  const mappingRepo = {
    findBySchoolId: jest.fn(),
    findByClassId: jest.fn(),
    findBySchoolAndGoogleCourseId: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    deleteByIdAndSchoolId: jest.fn(),
  } as unknown as jest.Mocked<GoogleCourseMappingRepository>;

  const classRepo = {
    findOne: jest.fn(),
    findActiveByIdWithSchoolForEducator: jest.fn(),
    findByIdWithSchoolForEducator: jest.fn(),
    findBySchoolAndGoogleCourseId: jest.fn(),
    findSoftDeletedBySchoolAndGoogleCourseId: jest.fn(),
    findGoogleClassroomOriginForSchool: jest.fn(),
    findGoogleClassroomOriginForSchoolAndEducator: jest.fn(),
    findArchivedGoogleClassroomForSchool: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  } as unknown as jest.Mocked<ClassRepository>;

  const classEducatorRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
  } as unknown as jest.Mocked<ClassEducatorRepository>;

  const studentMappingRepo = {
    findByClassId: jest.fn(),
    deleteByClassId: jest.fn(),
  } as unknown as jest.Mocked<GoogleStudentMappingRepository>;

  const studentRepo = {
    update: jest.fn(),
  } as unknown as jest.Mocked<StudentRepository>;

  const connectionService = {
    getValidAccessToken: jest.fn(),
    markConnectionNeedsReauth: jest.fn(),
    findActiveConnection: jest.fn(),
    resolveActiveConnectionIdentity: jest.fn(),
  } as unknown as jest.Mocked<GoogleConnectionService>;

  const classroomService = {
    listCourses: jest.fn(),
    getCourse: jest.fn(),
  } as unknown as jest.Mocked<GoogleClassroomService>;

  const courseworkService = {
    syncCourseWorkForClass: jest.fn().mockResolvedValue(undefined),
    ensureCourseWorkForAssignment: jest.fn().mockResolvedValue(undefined),
    deleteCourseWorkForAssignment: jest.fn().mockResolvedValue(undefined),
    deleteCourseWorkForClass: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<GoogleCourseworkService>;

  const rosterSyncService = {
    syncLinkedCourse: jest.fn(),
  } as unknown as jest.Mocked<GoogleRosterSyncService>;

  const logger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  } as unknown as LoggerService;

  let service: GoogleCourseMappingService;

  const sampleMapping = {
    id: 'map-1',
    schoolId: 'school-1',
    classId: 'class-1',
    googleCourseId: 'course-1',
    googleCourseName: 'Realityworks Classroom Test Course',
    linkedByEducatorId: 'edu-1',
    lastRosterSyncedAt: null,
    createdAt: new Date('2026-09-08T00:00:00.000Z'),
    updatedAt: new Date('2026-09-08T00:00:00.000Z'),
  } as GoogleCourseMapping;

  const rosterResult = {
    mappingId: 'map-1',
    classId: 'class-1',
    googleCourseId: 'course-1',
    lastRosterSyncedAt: '2026-09-10T12:00:00.000Z',
    added: 2,
    reactivated: 0,
    deactivated: 0,
    unchanged: 0,
    total: 2,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (courseworkService.syncCourseWorkForClass as jest.Mock).mockResolvedValue(undefined);
    studentMappingRepo.findByClassId.mockResolvedValue([]);
    studentMappingRepo.deleteByClassId.mockResolvedValue(0);
    studentRepo.update.mockResolvedValue(1);
    classRepo.findGoogleClassroomOriginForSchool.mockResolvedValue([]);
    classRepo.findGoogleClassroomOriginForSchoolAndEducator.mockResolvedValue([]);
    classRepo.findBySchoolAndGoogleCourseId.mockResolvedValue(null);
    classRepo.findSoftDeletedBySchoolAndGoogleCourseId.mockResolvedValue(null);
    classRepo.findByIdWithSchoolForEducator.mockResolvedValue({
      id: 'class-1',
      school_id: 'school-1',
      status: CommonStatus.ACTIVE,
    } as never);
    classRepo.findOne.mockResolvedValue({
      id: 'class-1',
      school_id: 'school-1',
      deleted_at: null,
      status: CommonStatus.ACTIVE,
    } as never);
    classEducatorRepo.findOne.mockResolvedValue(null);
    classEducatorRepo.create.mockResolvedValue({
      id: 'ce-1',
      classId: 'class-1',
      educatorId: 'edu-1',
      isPrimary: false,
    } as never);
    classRepo.update.mockResolvedValue(undefined);
    connectionService.findActiveConnection.mockResolvedValue({
      schoolId: 'school-1',
      connectedByEducatorId: 'edu-1',
      googleAccountId: 'sub-1',
      googleAccountEmail: 'teacher@curionn.com',
    } as never);
    connectionService.resolveActiveConnectionIdentity.mockResolvedValue({
      schoolId: 'school-1',
      connectedByEducatorId: 'edu-1',
      googleAccountId: 'sub-1',
      googleAccountEmail: 'teacher@curionn.com',
    } as never);
    classroomService.getCourse.mockImplementation(async (_token: string, courseId: string) => ({
      id: courseId,
      name: 'Course',
      section: null,
      descriptionHeading: null,
      room: null,
      courseState: 'ACTIVE',
      enrollmentState: 'ACTIVE',
      alternateLink: null,
      ownerId: 'sub-1',
    }));
    rosterSyncService.syncLinkedCourse.mockResolvedValue(rosterResult);
    service = new GoogleCourseMappingService(
      mappingRepo,
      classRepo,
      classEducatorRepo,
      studentMappingRepo,
      studentRepo,
      connectionService,
      classroomService,
      courseworkService,
      rosterSyncService,
      logger,
    );
  });

  it('lists courses with linked mapping flags', async () => {
    connectionService.getValidAccessToken.mockResolvedValue('access-1');
    classroomService.listCourses.mockResolvedValue([
      {
        id: 'course-1',
        name: 'Realityworks Classroom Test Course',
        section: null,
        descriptionHeading: null,
        room: null,
        courseState: 'ACTIVE',
        enrollmentState: 'ACTIVE',
        alternateLink: null,
        ownerId: 'sub-1',
      },
      {
        id: 'course-2',
        name: 'Other',
        section: null,
        descriptionHeading: null,
        room: null,
        courseState: 'ACTIVE',
        enrollmentState: 'ACTIVE',
        alternateLink: null,
        ownerId: 'sub-1',
      },
    ]);
    mappingRepo.findBySchoolId.mockResolvedValue([sampleMapping]);
    classRepo.findGoogleClassroomOriginForSchool.mockResolvedValue([
      {
        id: 'class-1',
        class_name: 'Realityworks Classroom Test Course',
        google_course_id: 'course-1',
        origin: 'google_classroom',
        status: CommonStatus.ACTIVE,
      } as never,
    ]);

    const courses = await service.listCoursesForSchool('school-1', 'edu-1');

    expect(connectionService.getValidAccessToken).toHaveBeenCalledWith('school-1', 'edu-1');
    expect(connectionService.resolveActiveConnectionIdentity).toHaveBeenCalledWith(
      'school-1',
      'edu-1',
    );
    expect(classRepo.findByIdWithSchoolForEducator).toHaveBeenCalledWith('class-1', 'edu-1');
    expect(courses[0]).toEqual(
      expect.objectContaining({
        id: 'course-1',
        linked: true,
        mappingId: 'map-1',
        classId: 'class-1',
        className: 'Realityworks Classroom Test Course',
        archived: false,
        lastRosterSyncedAt: null,
      }),
    );
    expect(courses[1]).toEqual(
      expect.objectContaining({
        id: 'course-2',
        linked: false,
        mappingId: null,
        classId: null,
        lastRosterSyncedAt: null,
      }),
    );
  });

  it('hides unlinked co-taught courses and courses with missing owner identity', async () => {
    connectionService.getValidAccessToken.mockResolvedValue('access-1');
    classroomService.listCourses.mockResolvedValue([
      {
        id: 'owned-unlinked',
        name: 'Mine',
        section: null,
        descriptionHeading: null,
        room: null,
        courseState: 'ACTIVE',
        enrollmentState: 'ACTIVE',
        alternateLink: null,
        ownerId: 'sub-1',
      },
      {
        id: 'co-taught-unlinked',
        name: 'Theirs',
        section: null,
        descriptionHeading: null,
        room: null,
        courseState: 'ACTIVE',
        enrollmentState: 'ACTIVE',
        alternateLink: null,
        ownerId: 'sub-other',
      },
      {
        id: 'missing-owner',
        name: 'Unknown owner',
        section: null,
        descriptionHeading: null,
        room: null,
        courseState: 'ACTIVE',
        enrollmentState: 'ACTIVE',
        alternateLink: null,
        ownerId: null,
      },
    ]);
    mappingRepo.findBySchoolId.mockResolvedValue([]);
    classRepo.findGoogleClassroomOriginForSchool.mockResolvedValue([]);

    const courses = await service.listCoursesForSchool('school-1', 'edu-1');

    expect(courses.map((c) => c.id)).toEqual(['owned-unlinked']);
  });

  it('hides all unlinked courses when googleAccountId cannot be resolved', async () => {
    connectionService.getValidAccessToken.mockResolvedValue('access-1');
    connectionService.resolveActiveConnectionIdentity.mockResolvedValue({
      schoolId: 'school-1',
      connectedByEducatorId: 'edu-1',
      googleAccountId: null,
      googleAccountEmail: 'teacher@curionn.com',
    } as never);
    classroomService.listCourses.mockResolvedValue([
      {
        id: 'owned-unlinked',
        name: 'Mine',
        section: null,
        descriptionHeading: null,
        room: null,
        courseState: 'ACTIVE',
        enrollmentState: 'ACTIVE',
        alternateLink: null,
        ownerId: 'sub-1',
      },
    ]);
    mappingRepo.findBySchoolId.mockResolvedValue([]);
    classRepo.findGoogleClassroomOriginForSchool.mockResolvedValue([]);

    const courses = await service.listCoursesForSchool('school-1', 'edu-1');

    expect(courses).toEqual([]);
  });

  it('shows linked co-taught courses when the educator can access the RW class', async () => {
    connectionService.getValidAccessToken.mockResolvedValue('access-1');
    classroomService.listCourses.mockResolvedValue([
      {
        id: 'course-1',
        name: 'Co-taught linked',
        section: null,
        descriptionHeading: null,
        room: null,
        courseState: 'ACTIVE',
        enrollmentState: 'ACTIVE',
        alternateLink: null,
        ownerId: 'sub-other',
      },
    ]);
    mappingRepo.findBySchoolId.mockResolvedValue([sampleMapping]);
    classRepo.findByIdWithSchoolForEducator.mockResolvedValue({
      id: 'class-1',
      school_id: 'school-1',
      status: CommonStatus.ACTIVE,
    } as never);
    classRepo.findGoogleClassroomOriginForSchool.mockResolvedValue([
      {
        id: 'class-1',
        class_name: 'Co-taught linked',
        google_course_id: 'course-1',
        origin: 'google_classroom',
        status: CommonStatus.ACTIVE,
      } as never,
    ]);

    const courses = await service.listCoursesForSchool('school-1', 'edu-1');

    expect(courses).toHaveLength(1);
    expect(courses[0]).toEqual(
      expect.objectContaining({ id: 'course-1', linked: true, classId: 'class-1' }),
    );
    expect(classEducatorRepo.create).not.toHaveBeenCalled();
  });

  it('auto-adds co-instructor when Google returns a linked course the educator cannot yet access', async () => {
    connectionService.getValidAccessToken.mockResolvedValue('access-1');
    classroomService.listCourses.mockResolvedValue([
      {
        id: 'course-1',
        name: 'Co-taught linked',
        section: null,
        descriptionHeading: null,
        room: null,
        courseState: 'ACTIVE',
        enrollmentState: 'ACTIVE',
        alternateLink: null,
        ownerId: 'sub-other',
      },
    ]);
    mappingRepo.findBySchoolId.mockResolvedValue([sampleMapping]);
    classRepo.findByIdWithSchoolForEducator
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'class-1',
        school_id: 'school-1',
        status: CommonStatus.ACTIVE,
      } as never);
    classRepo.findOne.mockResolvedValue({
      id: 'class-1',
      school_id: 'school-1',
      deleted_at: null,
      status: CommonStatus.ACTIVE,
    } as never);
    classEducatorRepo.findOne.mockResolvedValue(null);
    classRepo.findGoogleClassroomOriginForSchool.mockResolvedValue([
      {
        id: 'class-1',
        class_name: 'Co-taught linked',
        google_course_id: 'course-1',
        origin: 'google_classroom',
        status: CommonStatus.ACTIVE,
      } as never,
    ]);

    const courses = await service.listCoursesForSchool('school-1', 'edu-2');

    expect(classEducatorRepo.create).toHaveBeenCalledWith({
      classId: 'class-1',
      educatorId: 'edu-2',
      isPrimary: false,
    });
    expect(courses).toHaveLength(1);
    expect(courses[0]).toEqual(
      expect.objectContaining({ id: 'course-1', linked: true, classId: 'class-1' }),
    );
  });

  it('rejects linking a Google course the caller does not own', async () => {
    connectionService.getValidAccessToken.mockResolvedValue('access-1');
    mappingRepo.findBySchoolAndGoogleCourseId.mockResolvedValue(null);
    mappingRepo.findByClassId.mockResolvedValue(null);
    classRepo.findByIdWithSchoolForEducator.mockResolvedValue({
      id: 'class-1',
      school_id: 'school-1',
      status: CommonStatus.ACTIVE,
      origin: 'google_classroom',
      google_course_id: 'course-other',
    } as never);
    classroomService.getCourse.mockResolvedValue({
      id: 'course-other',
      name: 'Other',
      section: null,
      descriptionHeading: null,
      room: null,
      courseState: 'ACTIVE',
      enrollmentState: 'ACTIVE',
      alternateLink: null,
      ownerId: 'sub-other',
    });

    await expect(
      service.linkCourse({
        schoolId: 'school-1',
        classId: 'class-1',
        googleCourseId: 'course-other',
        educatorId: 'edu-1',
        syncRoster: false,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('marks connection for reauth when Classroom API returns Unauthorized', async () => {
    connectionService.getValidAccessToken.mockResolvedValue('access-1');
    classroomService.listCourses.mockRejectedValue(
      new UnauthorizedException(GoogleConstants.MESSAGES.REAUTH_REQUIRED),
    );

    await expect(service.listCoursesForSchool('school-1', 'edu-1')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(connectionService.markConnectionNeedsReauth).toHaveBeenCalledWith(
      'school-1',
      'edu-1',
    );
  });

  it('returns read-only provision items without creating classes', async () => {
    connectionService.getValidAccessToken.mockResolvedValue('access-1');
    classroomService.listCourses.mockResolvedValue([
      {
        id: 'course-new',
        name: 'New Course',
        section: null,
        descriptionHeading: null,
        room: null,
        courseState: 'ACTIVE',
        enrollmentState: 'ACTIVE',
        alternateLink: null,
        ownerId: 'sub-1',
      },
    ]);
    mappingRepo.findBySchoolId.mockResolvedValue([]);
    classRepo.findBySchoolAndGoogleCourseId.mockResolvedValue(null);

    const result = await service.provisionCoursesForSchool({
      schoolId: 'school-1',
      educatorId: 'edu-1',
    });

    expect(result.newCount).toBe(0);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        className: 'New Course',
        linked: false,
        mappingId: null,
        isNew: false,
        archived: false,
        lastRosterSyncedAt: null,
      }),
    );
    expect(classRepo.create).not.toHaveBeenCalled();
  });

  it('skips provision when a class already exists for the Google course', async () => {
    connectionService.getValidAccessToken.mockResolvedValue('access-1');
    classroomService.listCourses.mockResolvedValue([
      {
        id: 'course-1',
        name: 'Existing',
        section: null,
        descriptionHeading: null,
        room: null,
        courseState: 'ACTIVE',
        enrollmentState: 'ACTIVE',
        alternateLink: null,
        ownerId: 'sub-1',
      },
    ]);
    mappingRepo.findBySchoolId.mockResolvedValue([]);
    classRepo.findBySchoolAndGoogleCourseId.mockResolvedValue({
      id: 'class-1',
      class_name: 'Existing',
      google_course_id: 'course-1',
      origin: 'google_classroom',
      status: CommonStatus.ARCHIEVED,
    } as never);

    const result = await service.provisionCoursesForSchool({
      schoolId: 'school-1',
      educatorId: 'edu-1',
    });

    expect(result.newCount).toBe(0);
    expect(result.archivedMatchCount).toBe(1);
    expect(classRepo.create).not.toHaveBeenCalled();
  });

  it('does not provision unlinked co-taught courses', async () => {
    connectionService.getValidAccessToken.mockResolvedValue('access-1');
    classroomService.listCourses.mockResolvedValue([
      {
        id: 'co-taught',
        name: 'Co-taught',
        section: null,
        descriptionHeading: null,
        room: null,
        courseState: 'ACTIVE',
        enrollmentState: 'ACTIVE',
        alternateLink: null,
        ownerId: 'sub-other',
      },
    ]);
    mappingRepo.findBySchoolId.mockResolvedValue([]);

    const result = await service.provisionCoursesForSchool({
      schoolId: 'school-1',
      educatorId: 'edu-1',
    });

    expect(result.newCount).toBe(0);
    expect(result.items).toEqual([]);
    expect(classRepo.create).not.toHaveBeenCalled();
  });

  it('links a Google course to a school class and syncs roster', async () => {
    connectionService.getValidAccessToken.mockResolvedValue('access-1');
    classRepo.findBySchoolAndGoogleCourseId.mockResolvedValue({
      id: 'class-1',
      school_id: 'school-1',
      origin: 'google_classroom',
      google_course_id: 'course-1',
      status: CommonStatus.ACTIVE,
    } as never);
    classRepo.findByIdWithSchoolForEducator.mockResolvedValue({
      id: 'class-1',
      school_id: 'school-1',
      origin: 'google_classroom',
      google_course_id: 'course-1',
      status: CommonStatus.ACTIVE,
    } as never);
    mappingRepo.findByClassId.mockResolvedValue(null);
    mappingRepo.create.mockResolvedValue(sampleMapping);

    const { mapping, roster } = await service.linkCourse({
      schoolId: 'school-1',
      googleCourseId: 'course-1',
      googleCourseName: 'Realityworks Classroom Test Course',
      educatorId: 'edu-1',
    });

    expect(mapping).toEqual(
      expect.objectContaining({
        id: 'map-1',
        classId: 'class-1',
        googleCourseId: 'course-1',
      }),
    );
    expect(roster).toEqual(rosterResult);
    expect(rosterSyncService.syncLinkedCourse).toHaveBeenCalledWith({
      schoolId: 'school-1',
      mappingId: 'map-1',
      educatorId: 'edu-1',
    });
  });

  it('reactivates an archived Google-origin class on relink', async () => {
    connectionService.getValidAccessToken.mockResolvedValue('access-1');
    classRepo.findBySchoolAndGoogleCourseId.mockResolvedValue({
      id: 'class-1',
      school_id: 'school-1',
      origin: 'google_classroom',
      google_course_id: 'course-1',
      status: CommonStatus.ARCHIEVED,
    } as never);
    classRepo.findByIdWithSchoolForEducator.mockResolvedValue({
      id: 'class-1',
      school_id: 'school-1',
      origin: 'google_classroom',
      google_course_id: 'course-1',
      status: CommonStatus.ACTIVE,
    } as never);
    mappingRepo.findByClassId.mockResolvedValue(null);
    mappingRepo.create.mockResolvedValue(sampleMapping);

    await service.linkCourse({
      schoolId: 'school-1',
      googleCourseId: 'course-1',
      googleCourseName: 'Realityworks Classroom Test Course',
      educatorId: 'edu-1',
    });

    expect(classRepo.update).toHaveBeenCalledWith('class-1', {
      status: CommonStatus.ACTIVE,
    });
  });

  it('restores a soft-deleted Google-origin class on relink after class deletion', async () => {
    connectionService.getValidAccessToken.mockResolvedValue('access-1');
    classRepo.findBySchoolAndGoogleCourseId.mockResolvedValue(null);
    classRepo.findSoftDeletedBySchoolAndGoogleCourseId.mockResolvedValue({
      id: 'class-deleted',
      school_id: 'school-1',
      origin: 'google_classroom',
      google_course_id: 'course-deleted',
      status: CommonStatus.INACTIVE,
      is_active: false,
      deleted_at: new Date('2026-10-05T00:00:00.000Z'),
    } as never);
    classRepo.findByIdWithSchoolForEducator.mockResolvedValue({
      id: 'class-deleted',
      school_id: 'school-1',
      origin: 'google_classroom',
      google_course_id: 'course-deleted',
      status: CommonStatus.ACTIVE,
    } as never);
    mappingRepo.findByClassId.mockResolvedValue(null);
    mappingRepo.create.mockResolvedValue({
      ...sampleMapping,
      classId: 'class-deleted',
      googleCourseId: 'course-deleted',
    } as GoogleCourseMapping);

    const { mapping } = await service.linkCourse({
      schoolId: 'school-1',
      googleCourseId: 'course-deleted',
      googleCourseName: 'Healthcare Skills',
      educatorId: 'edu-1',
    });

    expect(classRepo.update).toHaveBeenCalledWith('class-deleted', {
      is_active: true,
      deleted_at: null,
      status: CommonStatus.ACTIVE,
    });
    expect(classRepo.create).not.toHaveBeenCalled();
    expect(mapping.classId).toBe('class-deleted');
  });

  it('creates class and mapping on first link when none exists', async () => {
    connectionService.getValidAccessToken.mockResolvedValue('access-1');
    classRepo.findBySchoolAndGoogleCourseId.mockResolvedValue(null);
    classRepo.findSoftDeletedBySchoolAndGoogleCourseId.mockResolvedValue(null);
    classRepo.findOne.mockResolvedValue(null);
    classRepo.create.mockResolvedValue({
      id: 'class-new',
      school_id: 'school-1',
      origin: 'google_classroom',
      google_course_id: 'course-new',
      status: CommonStatus.ACTIVE,
    } as never);
    mappingRepo.findByClassId.mockResolvedValue(null);
    mappingRepo.create.mockResolvedValue({
      ...sampleMapping,
      classId: 'class-new',
      googleCourseId: 'course-new',
    } as GoogleCourseMapping);

    const { mapping } = await service.linkCourse({
      schoolId: 'school-1',
      googleCourseId: 'course-new',
      googleCourseName: 'New Course',
      educatorId: 'edu-1',
    });

    expect(classRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: 'google_classroom',
        google_course_id: 'course-new',
      }),
    );
    expect(mapping.classId).toBe('class-new');
  });

  it('bulk links provisioned courses', async () => {
    connectionService.getValidAccessToken.mockResolvedValue('access-1');
    classRepo.findBySchoolAndGoogleCourseId.mockResolvedValue({
      id: 'class-1',
      class_name: 'Course',
      google_course_id: 'course-1',
      origin: 'google_classroom',
      school_id: 'school-1',
      status: CommonStatus.ACTIVE,
    } as never);
    classRepo.findByIdWithSchoolForEducator.mockResolvedValue({
      id: 'class-1',
      school_id: 'school-1',
      origin: 'google_classroom',
      google_course_id: 'course-1',
      status: CommonStatus.ACTIVE,
    } as never);
    mappingRepo.findByClassId.mockResolvedValue(null);
    mappingRepo.findBySchoolAndGoogleCourseId.mockResolvedValue(null);
    mappingRepo.create.mockResolvedValue(sampleMapping);

    const result = await service.bulkLinkCourses({
      schoolId: 'school-1',
      educatorId: 'edu-1',
      courses: [
        {
          googleCourseId: 'course-1',
          googleCourseName: 'Realityworks Classroom Test Course',
        },
      ],
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0].success).toBe(true);
    expect(rosterSyncService.syncLinkedCourse).toHaveBeenCalled();
  });

  it('unlinks a mapping, archives google-origin class, and removes coursework', async () => {
    mappingRepo.findOne.mockResolvedValue({
      id: 'map-1',
      schoolId: 'school-1',
      classId: 'class-1',
    } as GoogleCourseMapping);
    mappingRepo.deleteByIdAndSchoolId.mockResolvedValue(true);
    studentMappingRepo.findByClassId.mockResolvedValue([{ studentId: 'st-1' }] as never);
    classRepo.findOne.mockResolvedValue({
      id: 'class-1',
      educator_id: 'edu-1',
      origin: 'google_classroom',
      status: CommonStatus.ACTIVE,
    } as never);

    await expect(service.unlinkMapping('school-1', 'map-1', 'edu-1')).resolves.toEqual({
      deleted: true,
    });
    expect(studentRepo.update).toHaveBeenCalledWith(
      'st-1',
      expect.objectContaining({ is_active: false }),
    );
    expect(studentMappingRepo.deleteByClassId).toHaveBeenCalledWith('class-1');
    expect(courseworkService.deleteCourseWorkForClass).toHaveBeenCalledWith('class-1');
    expect(mappingRepo.deleteByIdAndSchoolId).toHaveBeenCalledWith('map-1', 'school-1');
    expect(classRepo.update).toHaveBeenCalledWith('class-1', {
      status: CommonStatus.ARCHIEVED,
    });
  });

  it('rejects unlink when caller is not the class owner', async () => {
    mappingRepo.findOne.mockResolvedValue({
      id: 'map-1',
      schoolId: 'school-1',
      classId: 'class-1',
    } as GoogleCourseMapping);
    classRepo.findOne.mockResolvedValue({
      id: 'class-1',
      educator_id: 'other-edu',
      origin: 'google_classroom',
      status: CommonStatus.ACTIVE,
    } as never);

    await expect(service.unlinkMapping('school-1', 'map-1', 'edu-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(mappingRepo.deleteByIdAndSchoolId).not.toHaveBeenCalled();
  });

  it('does not archive a manual class on unlink', async () => {
    mappingRepo.findOne.mockResolvedValue({
      id: 'map-1',
      schoolId: 'school-1',
      classId: 'class-1',
    } as GoogleCourseMapping);
    mappingRepo.deleteByIdAndSchoolId.mockResolvedValue(true);
    classRepo.findOne.mockResolvedValue({
      id: 'class-1',
      educator_id: 'edu-1',
      origin: 'manual',
      status: CommonStatus.ACTIVE,
    } as never);

    await service.unlinkMapping('school-1', 'map-1', 'edu-1');
    expect(classRepo.update).not.toHaveBeenCalled();
  });

  it('archives google-origin classes for one educator on disconnect cleanup', async () => {
    classRepo.findGoogleClassroomOriginForSchoolAndEducator.mockResolvedValue([
      {
        id: 'class-1',
        origin: 'google_classroom',
        educator_id: 'edu-1',
        status: CommonStatus.ACTIVE,
      } as never,
      {
        id: 'class-pending',
        origin: 'google_classroom',
        educator_id: 'edu-1',
        status: CommonStatus.ACTIVE,
      } as never,
    ]);
    mappingRepo.findBySchoolId.mockResolvedValue([sampleMapping]);
    mappingRepo.findOne.mockResolvedValue(sampleMapping);
    mappingRepo.deleteByIdAndSchoolId.mockResolvedValue(true);
    classRepo.findOne.mockResolvedValue({
      id: 'class-1',
      educator_id: 'edu-1',
      origin: 'google_classroom',
      status: CommonStatus.ACTIVE,
    } as never);

    const result = await service.archiveGoogleClassesForEducator('school-1', 'edu-1');

    expect(classRepo.findGoogleClassroomOriginForSchoolAndEducator).toHaveBeenCalledWith(
      'school-1',
      'edu-1',
    );
    expect(result.unlinked).toBe(1);
    expect(classRepo.update).toHaveBeenCalledWith('class-pending', {
      status: CommonStatus.ARCHIEVED,
    });
  });

  it('lists archived google classes', async () => {
    classRepo.findArchivedGoogleClassroomForSchool.mockResolvedValue([
      {
        id: 'class-1',
        class_name: 'Archived Class',
        google_course_id: 'course-1',
        educator_id: 'edu-1',
        updated_at: new Date('2026-09-10T00:00:00.000Z'),
      } as never,
    ]);
    connectionService.getValidAccessToken.mockResolvedValue('access-1');
    classroomService.listCourses.mockResolvedValue([
      {
        id: 'course-1',
        name: 'Archived Class',
        section: null,
        descriptionHeading: null,
        room: null,
        courseState: 'ACTIVE',
        enrollmentState: 'ACTIVE',
        alternateLink: null,
        ownerId: 'sub-1',
      },
    ]);

    const rows = await service.listArchivedGoogleClasses('school-1', 'edu-1');
    expect(connectionService.getValidAccessToken).toHaveBeenCalledWith('school-1', 'edu-1');
    expect(rows[0]).toEqual(
      expect.objectContaining({
        classId: 'class-1',
        googleCourseId: 'course-1',
        courseExists: true,
      }),
    );
  });

  it('lists only mappings for classes the educator can access', async () => {
    mappingRepo.findBySchoolId.mockResolvedValue([
      sampleMapping,
      {
        ...sampleMapping,
        id: 'map-other',
        classId: 'class-other',
        googleCourseId: 'course-other',
      } as GoogleCourseMapping,
    ]);
    classRepo.findByIdWithSchoolForEducator.mockImplementation(async (classId: string) =>
      classId === 'class-1'
        ? ({ id: 'class-1', school_id: 'school-1', status: CommonStatus.ACTIVE } as never)
        : null,
    );

    const mappings = await service.listMappings('school-1', 'edu-1');

    expect(mappings).toHaveLength(1);
    expect(mappings[0]).toEqual(
      expect.objectContaining({ id: 'map-1', classId: 'class-1', googleCourseId: 'course-1' }),
    );
  });

  it('throws when unlink target is missing', async () => {
    mappingRepo.findOne.mockResolvedValue(null);
    await expect(
      service.unlinkMapping('school-1', 'missing', 'edu-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(courseworkService.deleteCourseWorkForClass).not.toHaveBeenCalled();
  });
});
