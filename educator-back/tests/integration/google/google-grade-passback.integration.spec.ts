import { UnauthorizedException } from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { GoogleGradePassbackService } from '../../../src/google/google-grade-passback.service';
import { GoogleClassroomService } from '../../../src/google/google-classroom.service';
import { GoogleConnectionService } from '../../../src/google/google-connection.service';
import { GoogleCourseworkService } from '../../../src/google/google-coursework.service';
import { LoggerService } from '../../../src/common/services';
import { SimulationReportsService } from '../../../src/simulation-reports/simulation-reports.service';
import { GoogleConstants } from '../../../src/google/google.constants';

/**
 * Integration-style wiring tests: seeded Google mappings + passback trigger path.
 * Classroom HTTP is mocked; repository fakes stand in for DB-seeded mappings.
 */
describe('Google grade passback (integration wiring)', () => {
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
    create: jest.fn((data) => ({ id: 'log-seeded', ...data })),
    save: jest.fn(async (e) => e),
    update: jest.fn(),
    findLastSuccessfulScore: jest.fn(),
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
  const classRepo = {
    findOne: jest.fn(),
  };
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

  let passbackService: GoogleGradePassbackService;

  beforeEach(() => {
    jest.clearAllMocks();
    studentFindOne.mockResolvedValue({
      id: 'st-seeded',
      student_id: 'GC-SEED',
      class: { id: 'class-seeded' },
    });
    courseMappingRepo.findByClassId.mockResolvedValue({
      id: 'cmap-seeded',
      schoolId: 'school-seeded',
      classId: 'class-seeded',
      googleCourseId: 'g-course-seeded',
    });
    schoolFindOne.mockResolvedValue({
      id: 'school-seeded',
      google_classroom_enabled: true,
    });
    studentMappingRepo.findByClassAndStudentId.mockResolvedValue({
      googleUserId: 'google-user-seeded',
      studentId: 'st-seeded',
      classId: 'class-seeded',
    });
    courseworkMappingRepo.findByClassAndSimulation.mockResolvedValue({
      id: 'cwmap-seeded',
      schoolId: 'school-seeded',
      classId: 'class-seeded',
      simulationId: 'sim-seeded',
      googleCourseId: 'g-course-seeded',
      googleCourseworkId: 'cw-seeded',
    });
    gradeSyncLogRepo.findLastSuccessfulScore.mockResolvedValue(null);
    classRepo.findOne.mockResolvedValue({
      id: 'class-seeded',
      educator_id: 'edu-seeded',
    });
    connectionService.getValidAccessToken.mockResolvedValue('token-seeded');
    classroomService.listStudentSubmissions.mockResolvedValue([
      {
        id: 'sub-seeded',
        userId: 'google-user-seeded',
        state: 'TURNED_IN',
        assignedGrade: null,
        draftGrade: null,
      },
    ] as never);
    classroomService.patchStudentSubmission.mockResolvedValue({
      id: 'sub-seeded',
      assignedGrade: 92,
      draftGrade: 92,
    } as never);
    classroomService.returnStudentSubmission.mockResolvedValue(undefined as never);

    passbackService = new GoogleGradePassbackService(
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

  it('submits score when course, student, and coursework mappings are seeded', async () => {
    const result = await passbackService.submitScore({
      studentId: 'st-seeded',
      scenarioId: 'sim-seeded',
      scoreGiven: 92,
    });

    expect(result.success).toBe(true);
    expect(result.syncLogId).toBe('log-seeded');
    expect(classroomService.patchStudentSubmission).toHaveBeenCalledWith(
      'token-seeded',
      'g-course-seeded',
      'cw-seeded',
      'sub-seeded',
      { assignedGrade: 92, draftGrade: 92 },
    );
    expect(gradeSyncLogRepo.update).toHaveBeenCalledWith(
      'log-seeded',
      expect.objectContaining({ status: 'sent' }),
    );
  });

  it('auto-creates coursework with null classSimulationId when mapping missing', async () => {
    courseworkMappingRepo.findByClassAndSimulation.mockResolvedValue(null);
    courseworkService.ensureCourseWorkForAssignment.mockResolvedValue({
      id: 'cwmap-auto',
      schoolId: 'school-seeded',
      classId: 'class-seeded',
      classSimulationId: null,
      simulationId: 'sim-seeded',
      googleCourseId: 'g-course-seeded',
      googleCourseworkId: 'cw-auto',
    } as never);

    const result = await passbackService.submitScore({
      studentId: 'st-seeded',
      scenarioId: 'sim-seeded',
      scoreGiven: 88,
    });

    expect(courseworkService.ensureCourseWorkForAssignment).toHaveBeenCalledWith(
      expect.objectContaining({ classSimulationId: null }),
    );
    expect(result.success).toBe(true);
  });

  it('handleStudentReportCompletion triggers GoogleGradePassbackService.submitScore', async () => {
    const googleSubmitScore = jest.fn().mockResolvedValue({
      success: true,
      syncLogId: 'log-from-completion',
    });
    const lmsSubmitScore = jest.fn().mockResolvedValue({
      success: true,
      syncLogId: 'lms-log',
    });

    const reportsService = Object.create(
      SimulationReportsService.prototype,
    ) as SimulationReportsService;
    Object.assign(reportsService, {
      googleGradePassbackService: { submitScore: googleSubmitScore },
      lmsGradeService: { submitScore: lmsSubmitScore },
      lmsAssignmentService: {},
      logger,
      resolveStudentByPathId: jest.fn().mockResolvedValue({
        id: 'st-seeded',
        student_id: 'GC-SEED',
      }),
      notifyEducatorReportAvailable: jest.fn().mockResolvedValue(undefined),
      resolveAuthoritativeReportScore: jest.fn().mockResolvedValue(91),
      resolveBestAssessmentScoreForPassback: jest.fn().mockResolvedValue(91),
      submitGradePassback: jest.fn().mockResolvedValue(undefined),
      submitGoogleGradePassback: SimulationReportsService.prototype['submitGoogleGradePassback'],
    });

    const result = await reportsService.handleStudentReportCompletion('st-seeded', {
      scenarioId: 'sim-seeded',
      reportId: 'report-seeded',
      mode: 'Assessment',
      score: 91,
    });

    expect(result.success).toBe(true);
    expect(result.data?.gradePassbackTriggered).toBe(true);

    // Fire-and-forget Google passback
    await new Promise((resolve) => setImmediate(resolve));
    expect(googleSubmitScore).toHaveBeenCalledWith({
      studentId: 'st-seeded',
      scenarioId: 'sim-seeded',
      scoreGiven: 91,
      scoreMaximum: 100,
    });
  });

  it('surfaces non-retriable ensure_coursework_failed on auth errors', async () => {
    courseworkMappingRepo.findByClassAndSimulation.mockResolvedValue(null);
    courseworkService.ensureCourseWorkForAssignment.mockRejectedValue(
      new UnauthorizedException(GoogleConstants.MESSAGES.REAUTH_REQUIRED),
    );

    const result = await passbackService.submitScore({
      studentId: 'st-seeded',
      scenarioId: 'sim-seeded',
      scoreGiven: 70,
    });

    expect(result.error).toBe('ensure_coursework_failed');
    expect(result.retriable).toBe(false);
  });

  it('treats pending unique violation as concurrent skip', async () => {
    gradeSyncLogRepo.save.mockRejectedValue(
      new QueryFailedError(
        'INSERT',
        [],
        Object.assign(new Error('duplicate key'), { code: '23505' }),
      ),
    );

    const result = await passbackService.submitScore({
      studentId: 'st-seeded',
      scenarioId: 'sim-seeded',
      scoreGiven: 70,
    });

    expect(result.skipped).toBe(true);
    expect(result.error).toBe('concurrent_pending');
  });
});
