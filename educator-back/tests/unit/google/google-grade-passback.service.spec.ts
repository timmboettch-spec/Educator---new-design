import { UnauthorizedException } from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { GoogleGradePassbackService } from '../../../src/google/google-grade-passback.service';
import { GoogleClassroomService } from '../../../src/google/google-classroom.service';
import { GoogleConnectionService } from '../../../src/google/google-connection.service';
import { GoogleCourseworkService } from '../../../src/google/google-coursework.service';
import { LoggerService } from '../../../src/common/services';
import { GoogleConstants } from '../../../src/google/google.constants';

describe('GoogleGradePassbackService', () => {
  const courseMappingRepo = {
    findByClassId: jest.fn(),
  };
  const courseworkMappingRepo = {
    findByClassAndSimulation: jest.fn(),
  };
  const studentMappingRepo = {
    findByClassAndStudentId: jest.fn(),
    findByClassAndStudentCode: jest.fn(),
  };
  const gradeSyncLogRepo = {
    create: jest.fn((data) => ({ id: 'log-1', ...data })),
    save: jest.fn(async (e) => e),
    update: jest.fn(),
    findLastSuccessfulScore: jest.fn(),
  };
  const classRepo = {
    findOne: jest.fn(),
  };
  const classroomService = {
    listStudentSubmissions: jest.fn(),
    patchStudentSubmission: jest.fn(),
    returnStudentSubmission: jest.fn(),
  } as unknown as jest.Mocked<GoogleClassroomService>;
  const connectionService = {
    getValidAccessToken: jest.fn(),
    markConnectionNeedsReauth: jest.fn(),
  } as unknown as jest.Mocked<GoogleConnectionService>;
  const courseworkService = {
    ensureCourseWorkForAssignment: jest.fn(),
  } as unknown as jest.Mocked<GoogleCourseworkService>;
  const studentFindOne = jest.fn();
  const schoolFindOne = jest.fn();
  const dataSource = {
    getRepository: jest.fn(() => ({ findOne: studentFindOne })),
    manager: { findOne: schoolFindOne },
  } as unknown as DataSource;
  const logger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  } as unknown as LoggerService;

  let service: GoogleGradePassbackService;

  beforeEach(() => {
    jest.clearAllMocks();
    gradeSyncLogRepo.create.mockImplementation((data) => ({ id: 'log-1', ...data }));
    gradeSyncLogRepo.save.mockImplementation(async (e) => e);
    gradeSyncLogRepo.update.mockResolvedValue(undefined);
    gradeSyncLogRepo.findLastSuccessfulScore.mockResolvedValue(null);
    studentFindOne.mockResolvedValue({
      id: 'st-1',
      student_id: 'GC-ABC',
      class: { id: 'class-1' },
    });
    classRepo.findOne.mockResolvedValue({
      id: 'class-1',
      educator_id: 'edu-1',
    });
    courseMappingRepo.findByClassId.mockResolvedValue({
      id: 'cmap-1',
      schoolId: 'school-1',
      classId: 'class-1',
      googleCourseId: 'g-course-1',
    });
    schoolFindOne.mockResolvedValue({
      id: 'school-1',
      google_classroom_enabled: true,
    });
    studentMappingRepo.findByClassAndStudentId.mockResolvedValue({
      googleUserId: 'google-user-1',
      studentId: 'st-1',
      classId: 'class-1',
    });
    courseworkMappingRepo.findByClassAndSimulation.mockResolvedValue({
      id: 'cwmap-1',
      schoolId: 'school-1',
      classId: 'class-1',
      simulationId: 'sim-1',
      googleCourseId: 'g-course-1',
      googleCourseworkId: 'cw-1',
    });
    connectionService.getValidAccessToken.mockResolvedValue('token');
    classroomService.listStudentSubmissions.mockResolvedValue([
      {
        id: 'sub-1',
        userId: 'google-user-1',
        state: 'TURNED_IN',
        assignedGrade: null,
        draftGrade: null,
      },
    ] as never);
    classroomService.patchStudentSubmission.mockResolvedValue({
      id: 'sub-1',
      assignedGrade: 95,
      draftGrade: 95,
    } as never);
    classroomService.returnStudentSubmission.mockResolvedValue(undefined as never);

    service = new GoogleGradePassbackService(
      courseMappingRepo as never,
      courseworkMappingRepo as never,
      studentMappingRepo as never,
      gradeSyncLogRepo as never,
      classRepo as never,
      classroomService,
      connectionService,
      courseworkService,
      dataSource,
      logger,
    );
  });

  it('submits best score to Classroom (list → patch → return)', async () => {
    const result = await service.submitScore({
      studentId: 'st-1',
      scenarioId: 'sim-1',
      scoreGiven: 95,
    });

    expect(result.success).toBe(true);
    expect(result.skipped).toBeUndefined();
    expect(classroomService.patchStudentSubmission).toHaveBeenCalledWith(
      'token',
      'g-course-1',
      'cw-1',
      'sub-1',
      { assignedGrade: 95, draftGrade: 95 },
    );
    expect(classroomService.returnStudentSubmission).toHaveBeenCalled();
    expect(gradeSyncLogRepo.update).toHaveBeenCalledWith(
      'log-1',
      expect.objectContaining({ status: 'sent' }),
    );
  });

  it('skips when class is not linked to a Google course', async () => {
    courseMappingRepo.findByClassId.mockResolvedValue(null);

    const result = await service.submitScore({
      studentId: 'st-1',
      scenarioId: 'sim-1',
      scoreGiven: 90,
    });

    expect(result.skipped).toBe(true);
    expect(result.error).toBe('no_course_link');
    expect(classroomService.patchStudentSubmission).not.toHaveBeenCalled();
  });

  it('skips when Google Classroom is disabled for the school', async () => {
    schoolFindOne.mockResolvedValue({
      id: 'school-1',
      google_classroom_enabled: false,
    });

    const result = await service.submitScore({
      studentId: 'st-1',
      scenarioId: 'sim-1',
      scoreGiven: 90,
    });

    expect(result.skipped).toBe(true);
    expect(result.error).toBe('feature_disabled');
    expect(classroomService.patchStudentSubmission).not.toHaveBeenCalled();
    expect(connectionService.getValidAccessToken).not.toHaveBeenCalled();
    expect(courseworkService.ensureCourseWorkForAssignment).not.toHaveBeenCalled();
  });

  it('skips when student is not in Google roster mappings', async () => {
    studentMappingRepo.findByClassAndStudentId.mockResolvedValue(null);
    studentMappingRepo.findByClassAndStudentCode.mockResolvedValue(null);

    const result = await service.submitScore({
      studentId: 'st-1',
      scenarioId: 'sim-1',
      scoreGiven: 90,
    });

    expect(result.skipped).toBe(true);
    expect(result.error).toBe('no_student_mapping');
  });

  it('creates coursework when mapping is missing but course is linked', async () => {
    courseworkMappingRepo.findByClassAndSimulation.mockResolvedValue(null);
    courseworkService.ensureCourseWorkForAssignment.mockResolvedValue({
      id: 'cwmap-new',
      schoolId: 'school-1',
      classId: 'class-1',
      simulationId: 'sim-1',
      googleCourseId: 'g-course-1',
      googleCourseworkId: 'cw-new',
    } as never);

    const result = await service.submitScore({
      studentId: 'st-1',
      scenarioId: 'sim-1',
      scoreGiven: 88,
    });

    expect(courseworkService.ensureCourseWorkForAssignment).toHaveBeenCalledWith(
      expect.objectContaining({
        classId: 'class-1',
        classSimulationId: null,
        simulationId: 'sim-1',
      }),
    );
    expect(result.success).toBe(true);
  });

  it('returns typed ensure_coursework_failed with retriable=false on UnauthorizedException', async () => {
    courseworkMappingRepo.findByClassAndSimulation.mockResolvedValue(null);
    courseworkService.ensureCourseWorkForAssignment.mockRejectedValue(
      new UnauthorizedException(GoogleConstants.MESSAGES.REAUTH_REQUIRED),
    );

    const result = await service.submitScore({
      studentId: 'st-1',
      scenarioId: 'sim-1',
      scoreGiven: 88,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('ensure_coursework_failed');
    expect(result.retriable).toBe(false);
  });

  it('skips student-code lookup when student_id is empty/whitespace', async () => {
    studentFindOne.mockResolvedValue({
      id: 'st-1',
      student_id: '   ',
      class: { id: 'class-1' },
    });
    studentMappingRepo.findByClassAndStudentId.mockResolvedValue(null);

    const result = await service.submitScore({
      studentId: 'st-1',
      scenarioId: 'sim-1',
      scoreGiven: 90,
    });

    expect(studentMappingRepo.findByClassAndStudentCode).not.toHaveBeenCalled();
    expect(result.error).toBe('no_student_mapping');
  });

  it('skips duplicate when pending unique constraint is hit', async () => {
    gradeSyncLogRepo.save.mockRejectedValue(
      new QueryFailedError('INSERT', [], Object.assign(new Error('duplicate'), { code: '23505' })),
    );

    const result = await service.submitScore({
      studentId: 'st-1',
      scenarioId: 'sim-1',
      scoreGiven: 90,
    });

    expect(result.skipped).toBe(true);
    expect(result.error).toBe('concurrent_pending');
    expect(classroomService.patchStudentSubmission).not.toHaveBeenCalled();
  });

  it('skips when score did not improve over last successful sync', async () => {
    gradeSyncLogRepo.findLastSuccessfulScore.mockResolvedValue(97);

    const result = await service.submitScore({
      studentId: 'st-1',
      scenarioId: 'sim-1',
      scoreGiven: 90,
    });

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(true);
    expect(classroomService.patchStudentSubmission).not.toHaveBeenCalled();
  });

  it('logs failure when Classroom API errors', async () => {
    classroomService.listStudentSubmissions.mockRejectedValue(
      new Error(GoogleConstants.MESSAGES.GRADE_PASSBACK_FAILED),
    );

    const result = await service.submitScore({
      studentId: 'st-1',
      scenarioId: 'sim-1',
      scoreGiven: 80,
    });

    expect(result.success).toBe(false);
    expect(gradeSyncLogRepo.update).toHaveBeenCalledWith(
      'log-1',
      expect.objectContaining({ status: 'failed' }),
    );
  });

  it('marks connection for reauth on UnauthorizedException', async () => {
    classroomService.listStudentSubmissions.mockRejectedValue(
      new UnauthorizedException(GoogleConstants.MESSAGES.REAUTH_REQUIRED),
    );

    await service.submitScore({
      studentId: 'st-1',
      scenarioId: 'sim-1',
      scoreGiven: 80,
    });

    expect(connectionService.markConnectionNeedsReauth).toHaveBeenCalledWith('school-1', 'edu-1');
  });
});
