import { SimulationReportsService } from '../../../src/simulation-reports/simulation-reports.service';
import { Class, LmsStudentMapping, Student } from '../../../src/database/entities';

type PassbackInternals = {
  submitGradePassback: (
    studentId: string,
    scenarioId: string,
    overallScore: number,
    resourceLinkId?: string,
    force?: boolean,
  ) => Promise<{ success: boolean; error?: string }>;
  submitGoogleGradePassback: (
    studentId: string,
    scenarioId: string,
    overallScore: number,
  ) => Promise<void>;
};

describe('SimulationReportsService grade sync failure notification', () => {
  const STUDENT_ID = 'stu-1';
  const SCENARIO_ID = 'sim-1';

  const student = {
    id: STUDENT_ID,
    student_id: 'CODE1',
    student_name: 'Ada Lovelace',
    educator_id: 'edu-1',
    class_id: 'class-1',
    class: { id: 'class-1', class_name: 'Nursing 101', educator_id: 'edu-owner' },
  };

  let managerRows: Map<unknown, unknown>;
  const studentRepo = { findOne: jest.fn(async () => student) };
  const classRepo = { findOne: jest.fn() };
  const dataSource = {
    getRepository: jest.fn((entity: unknown) => (entity === Class ? classRepo : studentRepo)),
    manager: { findOne: jest.fn(async (entity: unknown) => managerRows.get(entity) ?? null) },
  };
  const lmsGradeService = { getLastSuccessfulScore: jest.fn(), submitScore: jest.fn() };
  const lmsAssignmentService = { findMapping: jest.fn() };
  const googleGradePassbackService = { submitScore: jest.fn() };
  const notificationsGateway = { notifyEducatorLmsGradeSyncFailed: jest.fn() };
  const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

  const service = new SimulationReportsService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    dataSource as never,
    {} as never,
    {} as never,
    notificationsGateway as never,
    {} as never,
    {} as never,
    {} as never,
    lmsGradeService as never,
    lmsAssignmentService as never,
    googleGradePassbackService as never,
    logger as never,
  );

  const internals = service as unknown as PassbackInternals;

  beforeEach(() => {
    jest.clearAllMocks();
    managerRows = new Map<unknown, unknown>([
      [Student, student],
      [LmsStudentMapping, { lmsUserId: 'lms-user-1' }],
    ]);
    lmsAssignmentService.findMapping.mockResolvedValue({
      id: 'map-1',
      schoolId: 'school-1',
      lmsLineItemUrl: 'https://lms.example.com/lineitems/1',
      lmsLineItemLabel: null,
      lmsResourceLinkId: null,
    });
    lmsGradeService.getLastSuccessfulScore.mockResolvedValue(null);
    studentRepo.findOne.mockResolvedValue(student);
  });

  describe('LTI (Canvas/Moodle)', () => {
    it('notifies the educator with the class deep-link metadata when the LMS rejects the score', async () => {
      lmsGradeService.submitScore.mockResolvedValue({
        success: false,
        syncLogId: 'log-1',
        error: 'AGS 401 Unauthorized',
      });

      await internals.submitGradePassback(STUDENT_ID, SCENARIO_ID, 80);

      expect(notificationsGateway.notifyEducatorLmsGradeSyncFailed).toHaveBeenCalledWith(
        'edu-1',
        'Ada Lovelace',
        'Nursing 101',
        {
          studentId: STUDENT_ID,
          educatorId: 'edu-1',
          classId: 'class-1',
          className: 'Nursing 101',
          simulationId: SCENARIO_ID,
        },
      );
    });

    it('falls back to the class owner when the student has no educator of their own', async () => {
      studentRepo.findOne.mockResolvedValue({ ...student, educator_id: null });
      lmsGradeService.submitScore.mockResolvedValue({ success: false, error: 'AGS 500' });

      await internals.submitGradePassback(STUDENT_ID, SCENARIO_ID, 80);

      expect(notificationsGateway.notifyEducatorLmsGradeSyncFailed).toHaveBeenCalledWith(
        'edu-owner',
        'Ada Lovelace',
        'Nursing 101',
        expect.objectContaining({ educatorId: 'edu-owner' }),
      );
    });

    it('stays silent when the score is accepted', async () => {
      lmsGradeService.submitScore.mockResolvedValue({ success: true, syncLogId: 'log-1' });

      await internals.submitGradePassback(STUDENT_ID, SCENARIO_ID, 80);

      expect(notificationsGateway.notifyEducatorLmsGradeSyncFailed).not.toHaveBeenCalled();
    });

    it('stays silent when the simulation has no assignment mapping', async () => {
      lmsAssignmentService.findMapping.mockResolvedValue(null);

      await internals.submitGradePassback(STUDENT_ID, SCENARIO_ID, 80);

      expect(lmsGradeService.submitScore).not.toHaveBeenCalled();
      expect(notificationsGateway.notifyEducatorLmsGradeSyncFailed).not.toHaveBeenCalled();
    });

    it('stays silent when the student is not linked to an LMS user', async () => {
      managerRows.delete(LmsStudentMapping);

      await internals.submitGradePassback(STUDENT_ID, SCENARIO_ID, 80);

      expect(lmsGradeService.submitScore).not.toHaveBeenCalled();
      expect(notificationsGateway.notifyEducatorLmsGradeSyncFailed).not.toHaveBeenCalled();
    });
  });

  describe('Google Classroom', () => {
    it('notifies the educator when Google rejects the grade', async () => {
      googleGradePassbackService.submitScore.mockResolvedValue({
        success: false,
        skipped: false,
        syncLogId: 'sync-log-1',
        error: 'courseWork not found',
      });

      await internals.submitGoogleGradePassback(STUDENT_ID, SCENARIO_ID, 80);

      expect(notificationsGateway.notifyEducatorLmsGradeSyncFailed).toHaveBeenCalledWith(
        'edu-1',
        'Ada Lovelace',
        'Nursing 101',
        expect.objectContaining({ classId: 'class-1', simulationId: SCENARIO_ID }),
      );
    });

    it('stays silent for a skipped attempt, which is a setup gap rather than a rejection', async () => {
      googleGradePassbackService.submitScore.mockResolvedValue({
        success: false,
        skipped: true,
        error: 'no_student_mapping',
      });

      await internals.submitGoogleGradePassback(STUDENT_ID, SCENARIO_ID, 80);

      expect(notificationsGateway.notifyEducatorLmsGradeSyncFailed).not.toHaveBeenCalled();
    });

    it('notifies the educator when the coursework could not be created', async () => {
      googleGradePassbackService.submitScore.mockResolvedValue({
        success: false,
        syncLogId: null,
        error: 'ensure_coursework_failed',
        retriable: true,
      });

      await internals.submitGoogleGradePassback(STUDENT_ID, SCENARIO_ID, 80);

      expect(notificationsGateway.notifyEducatorLmsGradeSyncFailed).toHaveBeenCalledTimes(1);
    });
  });
});
