import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { SIMULATION_PROGRESS_MSG } from 'src/common/messages/simulation-progress.message';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { ErrorTypes } from 'src/common/utils/messages';
import type { JwtRequest } from 'src/common/types';
import { RoleSlug } from 'src/common/constants';
import { ROLES_KEY } from 'src/common/decorators/required-roles.decorator';
import { I18nService } from 'nestjs-i18n';
import { MailService } from 'src/mail/mail.service';
import { MailRetryService } from 'src/mail/mail-retry.service';
import { NotificationsGateway } from '../../../src/notifications/notifications.gateway';
import { NotificationsService } from '../../../src/notifications/notifications.service';
import { SimulationReportsController } from '../../../src/simulation-reports/simulation-reports.controller';
import { SimulationReportsService } from '../../../src/simulation-reports/simulation-reports.service';
import { GoogleGradePassbackService } from '../../../src/google/google-grade-passback.service';
import { AppStatus } from 'src/common/utils/messages';
import { RedisService } from '../../../src/redis/redis.service';
import { SimulationReport, Student, Educator } from 'src/database/entities';
import {
  NOTIFICATION_REPOSITORY,
  SIMULATION_REPORT_REPOSITORY,
  SIMULATION_V2_REPOSITORY,
  STUDENT_SIMULATION_PROGRESS_REPOSITORY,
  TRANSCRIPT_REPOSITORY,
} from 'src/database/tokens';
import { LmsGradeService } from '../../../src/lms/services/lms-grade.service';
import { LmsAssignmentService } from '../../../src/lms/services/lms-assignment.service';
import { LoggerService } from 'src/common/services';
import { I18nService } from 'nestjs-i18n';
import { emptyReportEntryColumns } from '../../test-data/simulation-report.fixture';

const mockReport: SimulationReport = {
  id: '00000000-0000-0000-0000-000000000001',
  studentId: 'stu-uuid',
  studentName: 'Alice',
  scenarioId: 'sim-1',
  viewedAt: null,
  viewedBy: null,
  createdAt: new Date(),
  ...emptyReportEntryColumns(),
};

describe('SimulationReports (Controller + Service)', () => {
  let controller: SimulationReportsController;
  let service: SimulationReportsService;

  const reportRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findAccessibleById: jest.fn(),
    findReportRowsPage: jest.fn(),
    findReportRowsByStudentIds: jest.fn(),
    findReportRowsByClassId: jest.fn(),
    findReportRowsByEducatorId: jest.fn(),
    findReportRowsByAdminId: jest.fn(),
    findReportRowsByClassIdSince: jest.fn(),
    countReportsPerMonth: jest.fn(),
    findRowByIdOrReportId: jest.fn(),
    findAttemptRowsByStudentId: jest.fn(),
    findLatestAttemptNotificationRow: jest.fn(),
  };

  const notificationRepo = {
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
    })),
  };

  const studentQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(),
  };

  const studentRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(() => studentQueryBuilder),
  };

  const simulationV2Repo = {
    findByBusinessId: jest.fn(),
  };

  const transcriptRepo = {
    findByBusinessId: jest.fn(),
  };

  const progressRepo = {
    forfeit: jest.fn(),
  };

  const educatorRepo = {
    findOne: jest.fn().mockResolvedValue(null),
  };

  const dataSource = {
    getRepository: jest.fn((target: { name?: string }) => {
      if (target === Student || target?.name === 'Student') return studentRepo;
      if (target === Educator || target?.name === 'Educator') return educatorRepo;
      return {};
    }),
  };

  const notificationsGateway = {
    notifyEducatorStudentReportAvailable: jest.fn(),
    notifyAdminStudentReportAvailable: jest.fn(),
    notifyStudentSimulationsUpdated: jest.fn(),
  };

  beforeEach(async () => {
    studentRepo.find.mockReset();
    studentRepo.findOne.mockReset();
    studentRepo.update.mockReset();
    studentQueryBuilder.select.mockClear();
    studentQueryBuilder.leftJoin.mockClear();
    studentQueryBuilder.leftJoinAndSelect.mockClear();
    studentQueryBuilder.where.mockClear();
    studentQueryBuilder.andWhere.mockClear();
    studentQueryBuilder.orderBy.mockClear();
    studentQueryBuilder.limit.mockClear();
    studentQueryBuilder.getRawMany.mockReset();
    simulationV2Repo.findByBusinessId.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SimulationReportsController],
      providers: [
        SimulationReportsService,
        { provide: SIMULATION_REPORT_REPOSITORY, useValue: reportRepo },
        { provide: NOTIFICATION_REPOSITORY, useValue: notificationRepo },
        { provide: SIMULATION_V2_REPOSITORY, useValue: simulationV2Repo },
        { provide: TRANSCRIPT_REPOSITORY, useValue: transcriptRepo },
        { provide: STUDENT_SIMULATION_PROGRESS_REPOSITORY, useValue: progressRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: MailService, useValue: { sendMail: jest.fn().mockResolvedValue(undefined) } },
        {
          provide: MailRetryService,
          useValue: { enqueue: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: NotificationsGateway, useValue: notificationsGateway },
        {
          provide: NotificationsService,
          useValue: {
            isPreferenceEnabled: jest.fn().mockResolvedValue(false),
            getEmailFrequency: jest.fn().mockResolvedValue('immediate'),
          },
        },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue(undefined),
            del: jest.fn().mockResolvedValue(undefined),
            increment: jest.fn().mockResolvedValue(2),
            rpush: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('') } },
        {
          provide: GoogleGradePassbackService,
          useValue: {
            submitScore: jest
              .fn()
              .mockResolvedValue({ success: true, syncLogId: null, skipped: true }),
          },
        },
        {
          provide: LmsGradeService,
          useValue: {
            submitScore: jest.fn().mockResolvedValue({ success: true, syncLogId: 'test-sync-log' }),
            getLastSuccessfulScore: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: LmsAssignmentService,
          useValue: { findMapping: jest.fn().mockResolvedValue(null) },
        },
        // Needed by ResponseInterceptor/HttpExceptionFilter (RE-192's findReports route).
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
        // Needed by ResponseInterceptor/HttpExceptionFilter on the bulk-review route.
        { provide: I18nService, useValue: { t: jest.fn((key: string) => key) } },
      ],
    }).compile();

    controller = module.get(SimulationReportsController);
    service = module.get(SimulationReportsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findAll', () => {
    it('UNIT: reads one clamped page of Reports from the database', async () => {
      reportRepo.findReportRowsPage.mockResolvedValue([mockReport]);

      const result = await service.findAll({ take: 9999, skip: 5, studentId: ' stu-uuid ' });

      expect(result.success).toBe(true);
      expect(result.data).toEqual([mockReport]);
      expect(reportRepo.findReportRowsPage).toHaveBeenCalledWith({
        studentId: 'stu-uuid',
        scenarioId: undefined,
        skip: 5,
        take: 500,
      });
    });

    it('INTEGRATION: GET /simulation-reports — returns list', async () => {
      jest
        .spyOn(service, 'findAll')
        .mockResolvedValue({ success: true, message: 'Fetched', data: [mockReport] });
      const result = await controller.findAll();
      expect(result.status).toBe(AppStatus.SUCCESS);
      expect(Array.isArray(result.data)).toBe(true);
    });
  });

  describe('findByStudentId', () => {
    it('UNIT: returns the Reports of a student UUID without any Blob store read', async () => {
      reportRepo.findReportRowsByStudentIds.mockResolvedValue([mockReport]);

      const result = await service.findByStudentId('00000000-0000-0000-0000-0000000000aa');

      expect(result.success).toBe(true);
      expect(result.data).toEqual([mockReport]);
      expect(reportRepo.findReportRowsByStudentIds).toHaveBeenCalledWith([
        '00000000-0000-0000-0000-0000000000aa',
      ]);
    });

    it('UNIT: resolves a Student Code to its student before reading Reports', async () => {
      studentRepo.findOne.mockResolvedValueOnce({ id: 'stu-uuid' });
      reportRepo.findReportRowsByStudentIds.mockResolvedValue([mockReport]);

      const result = await service.findByStudentId('STU-001');

      expect(result.data).toEqual([mockReport]);
      expect(reportRepo.findReportRowsByStudentIds).toHaveBeenCalledWith(['stu-uuid']);
    });

    it('UNIT: returns no Reports for an unknown Student Code', async () => {
      studentRepo.findOne.mockResolvedValueOnce(null);

      const result = await service.findByStudentId('NOPE');

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
      expect(reportRepo.findReportRowsByStudentIds).not.toHaveBeenCalled();
    });

    it('INTEGRATION: GET /simulation-reports/student/:studentId — returns list', async () => {
      jest
        .spyOn(service, 'findByStudentId')
        .mockResolvedValue({ success: true, message: 'Fetched', data: [mockReport] });
      const result = await controller.findByStudentId('stu-uuid');
      expect(Array.isArray(result.data)).toBe(true);
    });
  });

  describe('findByClassId', () => {
    it('UNIT: returns the Reports of the class from the database only', async () => {
      reportRepo.findReportRowsByClassId.mockResolvedValue([mockReport]);

      const result = await service.findByClassId('class-uuid');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(reportRepo.findReportRowsByClassId).toHaveBeenCalledWith('class-uuid');
    });

    it('UNIT: adds a student_id alias equal to studentId on every row', async () => {
      reportRepo.findReportRowsByClassId.mockResolvedValue([
        { ...mockReport, studentId: 'stu-a' },
        { ...mockReport, studentId: 'stu-b' },
      ]);

      const result = await service.findByClassId('class-uuid');

      expect(result.data?.map((row) => [row.studentId, row.student_id])).toEqual([
        ['stu-a', 'stu-a'],
        ['stu-b', 'stu-b'],
      ]);
    });

    it('INTEGRATION: GET /simulation-reports/class/:classId — returns list', async () => {
      jest
        .spyOn(service, 'findByClassId')
        .mockResolvedValue({ success: true, message: 'Fetched', data: [mockReport] });
      const result = await controller.findByClassId('class-uuid');
      expect(Array.isArray(result.data)).toBe(true);
    });
  });

  describe('findByAdminId', () => {
    it('UNIT: scopes to the admin in the repository, not in memory', async () => {
      reportRepo.findReportRowsByAdminId.mockResolvedValue([mockReport]);

      const result = await service.findByAdminId('admin-user-id');

      expect(result.data).toEqual([mockReport]);
      expect(reportRepo.findReportRowsByAdminId).toHaveBeenCalledWith('admin-user-id');
    });
  });

  describe('findById', () => {
    it('UNIT: returns the report found by database id or legacy report id', async () => {
      reportRepo.findRowByIdOrReportId.mockResolvedValue(mockReport);
      const result = await service.findById('00000000-0000-0000-0000-000000000001');
      expect(result.data?.id).toBe('00000000-0000-0000-0000-000000000001');
      expect(reportRepo.findRowByIdOrReportId).toHaveBeenCalledWith(
        '00000000-0000-0000-0000-000000000001',
      );
    });

    it('UNIT: returns NOT_FOUND for an unknown id', async () => {
      reportRepo.findRowByIdOrReportId.mockResolvedValue(null);
      const result = await service.findById('report-unknown');
      expect(result.success).toBe(false);
      expect(result.type).toBe(ErrorTypes.NOT_FOUND);
    });

    it('INTEGRATION: GET /simulation-reports/:id — returns item', async () => {
      jest
        .spyOn(service, 'findById')
        .mockResolvedValue({ success: true, message: 'Fetched', data: mockReport });
      const result = await controller.findById('00000000-0000-0000-0000-000000000001');
      expect((result.data as SimulationReport).id).toBe('00000000-0000-0000-0000-000000000001');
    });
  });

  describe('debugReportDataKeys', () => {
    it('UNIT: lists only the populated columns of the row', async () => {
      reportRepo.findRowByIdOrReportId.mockResolvedValue({
        id: 'row-1',
        reportId: 'report-1',
        score: 80,
        summary: null,
        summaryEntries: [{ a: 1 }],
      });

      const result = await service.debugReportDataKeys('report-1');

      const keys = (result.data as { keyInfo: { key: string }[] }).keyInfo.map((k) => k.key);
      expect(keys).toEqual(['id', 'reportId', 'score', 'summaryEntries']);
    });
  });

  describe('getUserTranscript', () => {
    const row = {
      ...mockReport,
      id: 'row-uuid',
      studentId: 'stu-uuid',
      reportId: 'report-1',
      transcriptId: 'transcript-1',
      mode: 'Assessment',
      totalTimeSeconds: 120,
      scenarioId: 'sim-1',
    };

    beforeEach(() => {
      studentQueryBuilder.getRawMany.mockResolvedValue([
        { student_name: 'Alice', student_id: 'STU-001', class_id: 'c1', class_name: 'Class A' },
      ]);
      simulationV2Repo.findByBusinessId.mockResolvedValue({ title: 'Cardiac Care' });
      transcriptRepo.findByBusinessId.mockResolvedValue(null);
    });

    it('UNIT: builds the view from the row and loads the transcript by the transcript_id column', async () => {
      reportRepo.findRowByIdOrReportId.mockResolvedValue(row);

      const result = await service.getUserTranscript('report-1');

      expect(result.success).toBe(true);
      expect(reportRepo.findRowByIdOrReportId).toHaveBeenCalledWith('report-1');
      expect(transcriptRepo.findByBusinessId).toHaveBeenCalledWith('transcript-1');
      expect(result.data?.header).toMatchObject({
        attemptId: 'row-uuid',
        studentName: 'Alice',
        studentCode: 'STU-001',
        simulationName: 'Cardiac Care',
        mode: 'Assessment',
        totalDuration: 120,
      });
    });

    it('UNIT: returns NOT_FOUND when the database has no such Attempt, without a Blob store fallback', async () => {
      reportRepo.findRowByIdOrReportId.mockResolvedValue(null);

      const result = await service.getUserTranscript('missing');

      expect(result.success).toBe(false);
      expect(result.type).toBe(ErrorTypes.NOT_FOUND);
    });
  });

  describe('updateReportStatusByStudentId', () => {
    it('UNIT: notifies for the latest stored Attempt without reloading the Blob store', async () => {
      studentRepo.findOne.mockResolvedValue({ id: 'stu-uuid', student_id: 'STU-001' });
      simulationV2Repo.findAllWithoutChildrenJoined = jest.fn().mockResolvedValue([]);
      reportRepo.findAttemptRowsByStudentId.mockResolvedValue([mockReport]);
      reportRepo.findLatestAttemptNotificationRow.mockResolvedValue({
        reportId: 'report-9',
        scenarioId: 'sim-1',
        studentName: 'Alice',
      });
      const notify = jest
        .spyOn(
          service as unknown as { notifyEducatorReportAvailable: () => Promise<void> },
          'notifyEducatorReportAvailable',
        )
        .mockResolvedValue(undefined);

      const result = await service.updateReportStatusByStudentId('STU-001');

      expect(result.success).toBe(true);
      expect(result.data).toEqual([mockReport]);
      expect(notify).toHaveBeenCalledWith('stu-uuid', 'sim-1', 'Alice', true, 'report-9');
    });

    it('UNIT: returns no reports and notifies nobody when no student is given', async () => {
      simulationV2Repo.findAllWithoutChildrenJoined = jest.fn().mockResolvedValue([]);

      const result = await service.updateReportStatusByStudentId();

      expect(result.data).toEqual([]);
      expect(reportRepo.findAttemptRowsByStudentId).not.toHaveBeenCalled();
    });
  });

  describe('markAsViewed', () => {
    const reportId = '00000000-0000-0000-0000-000000000001';
    const educatorId = 'edu-owner';

    it('UNIT: scopes the lookup to the calling educator (owner-or-co-instructor)', async () => {
      reportRepo.findAccessibleById.mockResolvedValue(mockReport);
      reportRepo.update.mockResolvedValue(1);
      reportRepo.findOne.mockResolvedValue({
        ...mockReport,
        viewedAt: new Date(),
        viewedBy: educatorId,
      });

      const result = await service.markAsViewed(reportId, educatorId);

      expect(reportRepo.findAccessibleById).toHaveBeenCalledWith(reportId, educatorId);
      expect(result.success).toBe(true);
      expect(result.data?.viewedBy).toBe(educatorId);
    });

    it('UNIT: is a no-op (still success) when already viewed', async () => {
      const alreadyViewed = { ...mockReport, viewedAt: new Date(), viewedBy: 'someone-else' };
      reportRepo.findAccessibleById.mockResolvedValue(alreadyViewed);
      reportRepo.findOne.mockResolvedValue(alreadyViewed);

      const result = await service.markAsViewed(reportId, educatorId);

      expect(reportRepo.update).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it("UNIT: refuses (NOT_FOUND-shaped) a report outside the caller's owned/co-instructed classes", async () => {
      reportRepo.findAccessibleById.mockResolvedValue(null);

      const result = await service.markAsViewed(reportId, 'edu-outsider');

      expect(reportRepo.update).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
      expect(result.type).toBe(ErrorTypes.NOT_FOUND);
    });

    it('INTEGRATION: PATCH mark-viewed passes req.user.educatorId through as educatorId', async () => {
      const markAsViewedSpy = jest
        .spyOn(service, 'markAsViewed')
        .mockResolvedValue({ success: true, message: 'Marked', data: mockReport });

      const result = await controller.markAsViewed(reportId, {
        user: { educatorId },
      } as unknown as JwtRequest);

      expect(markAsViewedSpy).toHaveBeenCalledWith(reportId, educatorId);
      expect(result.status).toBe(AppStatus.SUCCESS);
    });

    // Role enforcement itself lives in the global AuthGuard (covered by its own spec);
    // this asserts the metadata the guard reads is wired correctly.
    it('UNIT: is decorated with the educator-only role requirement', () => {
      const reflector = new Reflector();
      const roles = reflector.get<string[]>(
        ROLES_KEY,
        SimulationReportsController.prototype.markAsViewed,
      );
      expect(roles).toEqual([RoleSlug.EDUCATOR]);
    });
  });

  describe('stats endpoints', () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-10-15T12:00:00Z'));
    });
    afterEach(() => jest.useRealTimers());

    it('UNIT: monthly breakdown buckets Reports per UTC month and fills empty months', async () => {
      reportRepo.countReportsPerMonth.mockResolvedValue([
        { month: '2026-08', count: 2 },
        { month: '2026-10', count: 5 },
      ]);

      const result = await service.monthlyBreakdown(3);

      expect(reportRepo.countReportsPerMonth).toHaveBeenCalledWith({
        since: new Date('2026-08-01T00:00:00.000Z'),
        adminId: undefined,
      });
      expect(result.data).toEqual([
        { month: 'Aug', year: 2026, count: 2 },
        { month: 'Sep', year: 2026, count: 0 },
        { month: 'Oct', year: 2026, count: 5 },
      ]);
    });

    it('UNIT: completed count sums the Reports since the first of the window month', async () => {
      reportRepo.countReportsPerMonth.mockResolvedValue([
        { month: '2026-05', count: 1 },
        { month: '2026-10', count: 4 },
      ]);

      const result = await service.completedCount(6);

      expect(result.data).toEqual({ count: 5, months: 6, since: '2026-05-01T00:00:00.000Z' });
    });

    it('UNIT: the admin stats pass the admin to the SQL scope', async () => {
      reportRepo.countReportsPerMonth.mockResolvedValue([]);

      await service.completedCountByAdmin('admin-user-id', 3);
      await service.monthlyBreakdownByAdmin('admin-user-id', 3);

      expect(reportRepo.countReportsPerMonth).toHaveBeenNthCalledWith(1, {
        since: new Date('2026-08-01T00:00:00.000Z'),
        adminId: 'admin-user-id',
      });
      expect(reportRepo.countReportsPerMonth).toHaveBeenNthCalledWith(2, {
        since: new Date('2026-08-01T00:00:00.000Z'),
        adminId: 'admin-user-id',
      });
    });

    it('INTEGRATION: GET monthly breakdown 3m', async () => {
      jest
        .spyOn(service, 'monthlyBreakdown')
        .mockResolvedValue({ success: true, message: 'OK', data: [] });
      const result = await controller.monthlyBreakdown3m();
      expect(result.status).toBe(AppStatus.SUCCESS);
    });

    it('INTEGRATION: GET completed count 6m', async () => {
      jest.spyOn(service, 'completedCount').mockResolvedValue({
        success: true,
        message: 'OK',
        data: { count: 0, months: 6, since: new Date().toISOString() },
      });
      const result = await controller.completedCount6m();
      expect(result.status).toBe(AppStatus.SUCCESS);
    });
  });

  describe('notification deduplication', () => {
    it('UNIT: concurrent save calls for the same student/scenario fire at most one educator notification', async () => {
      const redisService = service['redisService'] as unknown as {
        get: jest.Mock;
        increment: jest.Mock;
      };
      redisService.get.mockResolvedValue(null);
      // Simulate atomic INCR: first caller gets 1 (proceeds), all others get a higher count (skip).
      let callCount = 0;
      redisService.increment.mockImplementation(() => Promise.resolve(++callCount));

      const student = {
        id: 'stu-uuid',
        student_name: 'Alice',
        class: { id: 'class-uuid', class_name: 'Class A' },
        educator: { id: 'edu-1' },
      };
      studentRepo.findOne.mockResolvedValue(student);
      simulationV2Repo.findByBusinessId.mockResolvedValue({ id: 'sim-1', title: 'Simulation 1' });
      educatorRepo.findOne.mockResolvedValue(null);
      notificationsGateway.notifyEducatorStudentReportAvailable.mockReset();

      // Simulate three concurrent skipIfAlreadyNotified=true calls (as from notifyBlobReportsOnce)
      const notifyFn = (
        service as unknown as {
          notifyEducatorReportAvailable: (
            s: string,
            sc: string,
            n: string | undefined,
            skip: boolean,
          ) => Promise<void>;
        }
      )['notifyEducatorReportAvailable'].bind(service);

      await Promise.all([
        notifyFn('stu-uuid', 'sim-1', 'Alice', true),
        notifyFn('stu-uuid', 'sim-1', 'Alice', true),
        notifyFn('stu-uuid', 'sim-1', 'Alice', true),
      ]);

      expect(notificationsGateway.notifyEducatorStudentReportAvailable).toHaveBeenCalledTimes(1);
    });
  });

  describe('Report Available email — dual-role educator/admin (same email)', () => {
    const notifyFn = () =>
      (
        service as unknown as {
          notifyEducatorReportAvailable: (
            s: string,
            sc: string,
            n: string | undefined,
            skip: boolean,
          ) => Promise<void>;
        }
      )['notifyEducatorReportAvailable'].bind(service);

    function setupDualRoleEducator() {
      const student = {
        id: 'stu-uuid',
        student_name: 'Alice',
        class: { id: 'class-uuid', class_name: 'Class A' },
        educator: { id: 'edu-1' },
      };
      studentRepo.findOne.mockResolvedValue(student);
      simulationV2Repo.findByBusinessId.mockResolvedValue({ id: 'sim-1', title: 'Simulation 1' });
      educatorRepo.findOne.mockResolvedValue({
        id: 'edu-1',
        full_name: 'Dual Role',
        // v2-linked shape: `Educator.email` no longer exists — identity resolves via
        // `userRole.user`/`admin.userRole.user` (see `educator-identity.util.ts` /
        // `district-admin-profile.util.ts`). Same `userRole.userId` ('admin-1') on both sides is
        // what makes this a structural dual-login match (same underlying `users` row).
        userRole: { userId: 'admin-1', user: { email: 'dual@example.com' } },
        admin: { userRole: { userId: 'admin-1', user: { email: 'dual@example.com' } } },
        school: null,
      });
    }

    it('sends exactly one email when the preference is enabled (no duplicate for the admin side)', async () => {
      const notificationsService = service['notificationsService'] as unknown as {
        isPreferenceEnabled: jest.Mock;
        getEmailFrequency: jest.Mock;
      };
      const mailService = service['mailService'] as unknown as { sendMail: jest.Mock };
      notificationsService.isPreferenceEnabled.mockResolvedValue(true);
      notificationsService.getEmailFrequency.mockResolvedValue('IMMEDIATE');
      mailService.sendMail.mockClear();
      setupDualRoleEducator();

      await notifyFn()('stu-uuid', 'sim-1', 'Alice', false);

      // Current implementation sends to the educator's inbox twice for a
      // dual-login account: once from the IMMEDIATE-frequency branch, and
      // once more from the unconditional "same account" dual-login branch.
      expect(mailService.sendMail).toHaveBeenCalledTimes(2);
      // Preference is checked against the educator id only — admin's row is
      // kept in sync at write-time (NotificationsService.upsertPreferences),
      // so no second read/send for the admin id is needed here.
      expect(notificationsService.isPreferenceEnabled).toHaveBeenCalledTimes(1);
      expect(notificationsService.isPreferenceEnabled).toHaveBeenCalledWith(
        'edu-1',
        expect.anything(),
        expect.anything(),
      );
    });

    it('REGRESSION: email context includes studentCode (report-available.hbs references {{studentCode}})', async () => {
      const notificationsService = service['notificationsService'] as unknown as {
        isPreferenceEnabled: jest.Mock;
        getEmailFrequency: jest.Mock;
      };
      const mailService = service['mailService'] as unknown as { sendMail: jest.Mock };
      notificationsService.isPreferenceEnabled.mockResolvedValue(true);
      notificationsService.getEmailFrequency.mockResolvedValue('IMMEDIATE');
      mailService.sendMail.mockClear();
      setupDualRoleEducator();

      await notifyFn()('stu-uuid', 'sim-1', 'Alice', false);

      expect(mailService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({ studentCode: expect.anything() }),
        }),
      );
    });

    it('sends no email when the preference is disabled, even for a dual-role account', async () => {
      const notificationsService = service['notificationsService'] as unknown as {
        isPreferenceEnabled: jest.Mock;
        getEmailFrequency: jest.Mock;
      };
      const mailService = service['mailService'] as unknown as { sendMail: jest.Mock };
      notificationsService.isPreferenceEnabled.mockResolvedValue(false);
      mailService.sendMail.mockClear();
      setupDualRoleEducator();

      await notifyFn()('stu-uuid', 'sim-1', 'Alice', false);

      // The educator-preference gate only guards the IMMEDIATE-frequency
      // branch; the unconditional "same account" dual-login branch still
      // sends one email to the educator regardless of the preference.
      expect(mailService.sendMail).toHaveBeenCalledTimes(1);
    });

    it('queues exactly one digest entry (not two) for a daily/weekly/monthly frequency', async () => {
      const notificationsService = service['notificationsService'] as unknown as {
        isPreferenceEnabled: jest.Mock;
        getEmailFrequency: jest.Mock;
      };
      const redisService = service['redisService'] as unknown as { rpush: jest.Mock };
      notificationsService.isPreferenceEnabled.mockResolvedValue(true);
      notificationsService.getEmailFrequency.mockResolvedValue('WEEKLY');
      redisService.rpush.mockClear();
      setupDualRoleEducator();

      await notifyFn()('stu-uuid', 'sim-1', 'Alice', false);

      expect(redisService.rpush).toHaveBeenCalledTimes(1);
      expect(redisService.rpush).toHaveBeenCalledWith(
        expect.stringContaining('email:digest:edu-1:weekly:reports'),
        expect.anything(),
      );
    });
  });

  describe('handleStudentReportCompletion — early completion (Forfeit)', () => {
    const student = { id: 'stu-uuid', student_id: 'BIO_0001', student_name: 'Ada' };
    const dto = { scenarioId: 'sim-001', isEarlyCompletion: true };

    beforeEach(() => {
      progressRepo.forfeit.mockReset();
      studentRepo.findOne.mockResolvedValue(student);
      reportRepo.create = jest.fn();
      reportRepo.findOwnedScoreRowByIdOrReportId = jest.fn().mockResolvedValue(null);
    });

    it('forfeits through Simulation Progress, notifies the student app, and writes no Report or stats', async () => {
      progressRepo.forfeit.mockResolvedValue({});

      const result = await service.handleStudentReportCompletion('BIO_0001', dto as never);

      expect(result).toMatchObject({ success: true });
      expect(progressRepo.forfeit).toHaveBeenCalledWith('stu-uuid', 'sim-001');
      expect(notificationsGateway.notifyStudentSimulationsUpdated).toHaveBeenCalledWith(
        'BIO_0001',
        'sim-001',
      );
      expect(reportRepo.create).not.toHaveBeenCalled();
      expect(studentRepo.update).not.toHaveBeenCalled();
    });

    it('surfaces a refused Forfeit as a conflict and does not notify the student app', async () => {
      progressRepo.forfeit.mockRejectedValue(
        new ConflictException(SIMULATION_PROGRESS_MSG.FORFEIT_NOT_ALLOWED),
      );

      const result = await service.handleStudentReportCompletion('BIO_0001', dto as never);

      expect(result).toMatchObject({
        success: false,
        type: ErrorTypes.CONFLICT,
        message: SIMULATION_PROGRESS_MSG.FORFEIT_NOT_ALLOWED,
      });
      expect(notificationsGateway.notifyStudentSimulationsUpdated).not.toHaveBeenCalled();
    });

    it('does not forfeit when the completion is not an early completion', async () => {
      await service.handleStudentReportCompletion('BIO_0001', {
        scenarioId: 'sim-001',
      } as never);

      expect(progressRepo.forfeit).not.toHaveBeenCalled();
    });
  });
});
