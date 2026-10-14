import { SimulationReportsService } from '../../../src/simulation-reports/simulation-reports.service';
import { SimulationReportConstants } from '../../../src/simulation-reports/simulation-reports.constant';
import {
  Class,
  ClassEducator,
  LmsClassMapping,
  LmsStudentMapping,
  Student,
} from '../../../src/database/entities';
import { ErrorTypes } from '../../../src/common/utils/messages';
import { RoleSlug } from '../../../src/common/constants';

describe('SimulationReportsService LMS grade sync status + resync', () => {
  // `canManageClassLmsGrades` matches against `ICurrentUser.educatorId` (the educator profile id,
  // which `Class.educator_id`/`ClassEducator.educatorId` FKs actually reference), not `userId`
  // (the account id) — see `src/simulation-reports/simulation-reports.service.ts`.
  const educator = { userId: 'edu-1', educatorId: 'edu-1', roles: [RoleSlug.EDUCATOR] };
  const student = { id: 'stu-1', student_id: 'CODE1', class: { id: 'class-1' } };

  let classRow: Record<string, unknown> | null;
  let managerRows: Map<unknown, unknown>;
  const classRepo = { findOne: jest.fn(async () => classRow) };
  const studentRepo = { findOne: jest.fn(async () => student) };
  const dataSource = {
    getRepository: jest.fn((entity: unknown) => (entity === Class ? classRepo : studentRepo)),
    manager: { findOne: jest.fn(async (entity: unknown) => managerRows.get(entity) ?? null) },
  };
  const reportRepo = {
    findOne: jest.fn(async () => null),
    findScoreRowsByStudentAndScenario: jest.fn(),
  };
  const lmsGradeService = {
    findLatestSyncLogs: jest.fn(),
    getLastSuccessfulScore: jest.fn(),
    submitScore: jest.fn(),
  };
  const lmsAssignmentService = { findByClass: jest.fn(), findMapping: jest.fn() };
  const googleGradePassbackService = { submitScore: jest.fn() };
  const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

  const service = new SimulationReportsService(
    reportRepo as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    dataSource as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    lmsGradeService as never,
    lmsAssignmentService as never,
    googleGradePassbackService as never,
    logger as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    classRow = { id: 'class-1', educator_id: 'edu-1', is_active: true, school_id: 'school-1' };
    managerRows = new Map<unknown, unknown>([
      [LmsClassMapping, { id: 'cm-1' }],
      [Student, student],
      [LmsStudentMapping, { lmsUserId: 'lms-user-1' }],
    ]);
  });

  describe('getLmsGradeSyncStatuses', () => {
    it('returns the newest attempt per simulation + student across mappings, without LMS error text', async () => {
      lmsAssignmentService.findByClass.mockResolvedValue([
        { id: 'map-1', simulationId: 'sim-1' },
        { id: 'map-2', simulationId: null },
        { id: 'map-3', simulationId: 'sim-1' },
      ]);
      lmsGradeService.findLatestSyncLogs.mockResolvedValue([
        {
          mappingId: 'map-1',
          studentId: 'stu-1',
          status: 'sent',
          errorMessage: null,
          attemptedAt: new Date('2026-09-01T10:00:00Z'),
        },
        {
          mappingId: 'map-1',
          studentId: 'stu-2',
          status: 'sent',
          errorMessage: null,
          attemptedAt: new Date('2026-09-01T10:00:00Z'),
        },
        {
          mappingId: 'map-3',
          studentId: 'stu-1',
          status: 'failed',
          errorMessage: 'LTI AGS score POST failed (401): Unauthorized https://lms.example.com',
          attemptedAt: new Date('2026-09-02T10:00:00Z'),
        },
      ]);

      const result = await service.getLmsGradeSyncStatuses(educator, 'class-1');

      expect(lmsGradeService.findLatestSyncLogs).toHaveBeenCalledWith(['map-1', 'map-3']);
      expect(result.success).toBe(true);
      expect(result.data).toEqual([
        {
          simulationId: 'sim-1',
          studentId: 'stu-1',
          status: 'failed',
          failureReason: 'lms_authentication',
        },
        { simulationId: 'sim-1', studentId: 'stu-2', status: 'sent' },
      ]);
    });

    it('returns an empty list for a class that is not LMS-linked', async () => {
      managerRows.delete(LmsClassMapping);

      const result = await service.getLmsGradeSyncStatuses(educator, 'class-1');

      expect(result).toMatchObject({ success: true, data: [] });
      expect(lmsAssignmentService.findByClass).not.toHaveBeenCalled();
    });

    it('returns an empty list instead of an error when the educator cannot access the class', async () => {
      classRow = { ...classRow, educator_id: 'someone-else' };

      const result = await service.getLmsGradeSyncStatuses(educator, 'class-1');

      expect(result).toMatchObject({ success: true, data: [] });
      expect(dataSource.manager.findOne).toHaveBeenCalledWith(ClassEducator, {
        where: { classId: 'class-1', educatorId: 'edu-1' },
      });
    });

    it('returns a fixed message and logs the details when loading fails', async () => {
      lmsAssignmentService.findByClass.mockRejectedValueOnce(
        new Error('connect ECONNREFUSED 10.0.0.5'),
      );

      const result = await service.getLmsGradeSyncStatuses(educator, 'class-1');

      expect(result).toMatchObject({
        success: false,
        message: SimulationReportConstants.MESSAGES.LMS_SYNC_STATUS_FAILED,
        type: ErrorTypes.BAD_REQUEST,
      });
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('resyncLmsGrade', () => {
    const dto = { scenarioId: 'sim-1', studentId: 'stu-1' };

    beforeEach(() => {
      reportRepo.findScoreRowsByStudentAndScenario.mockResolvedValue([
        { mode: 'Assessment', score: 70, scoreJson: null },
        { mode: 'Assessment', score: 85, scoreJson: null },
        { mode: 'Practice', score: 99, scoreJson: null },
      ]);
      lmsAssignmentService.findMapping.mockResolvedValue({
        id: 'map-1',
        schoolId: 'school-1',
        lmsLineItemUrl: 'https://lms.example.com/lineitems/1',
        lmsLineItemLabel: null,
        lmsResourceLinkId: null,
      });
    });

    it('re-sends the best Assessment score even when it does not beat the last successful sync', async () => {
      lmsGradeService.getLastSuccessfulScore.mockResolvedValue(85);
      lmsGradeService.submitScore.mockResolvedValue({ success: true, syncLogId: 'log-1' });

      const result = await service.resyncLmsGrade(educator, 'class-1', dto);

      expect(lmsGradeService.submitScore).toHaveBeenCalledWith(
        expect.objectContaining({ mappingId: 'map-1', scoreGiven: 85, lmsUserId: 'lms-user-1' }),
      );
      expect(result).toMatchObject({
        success: true,
        data: { simulationId: 'sim-1', studentId: 'stu-1', status: 'sent' },
      });
    });

    it('returns a fixed user-safe message instead of the raw LMS error when the grade is rejected', async () => {
      lmsGradeService.getLastSuccessfulScore.mockResolvedValue(null);
      lmsGradeService.submitScore.mockResolvedValue({
        success: false,
        syncLogId: 'log-2',
        error: 'AGS 400 https://lms.example.com/lineitems/1 invalid user',
      });

      const result = await service.resyncLmsGrade(educator, 'class-1', dto);

      expect(result).toMatchObject({
        success: false,
        message: SimulationReportConstants.MESSAGES.LMS_RESYNC_FAILED,
        type: ErrorTypes.BAD_REQUEST,
      });
    });

    it('returns not found (never forbidden) when the educator cannot access the class', async () => {
      classRow = null;

      const result = await service.resyncLmsGrade(educator, 'class-1', dto);

      expect(result).toMatchObject({ success: false, type: ErrorTypes.NOT_FOUND });
      expect(lmsGradeService.submitScore).not.toHaveBeenCalled();
    });
  });
});
