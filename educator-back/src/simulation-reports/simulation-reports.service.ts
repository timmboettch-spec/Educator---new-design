import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';
import type { Dayjs } from 'dayjs';

import {
  ClassAttentionMetadata,
  TranscriptEventDto,
  TranscriptHeaderDto,
  TranscriptMessageDto,
  TranscriptSpeaker,
  SummaryEntryDto,
  CommonActionDto,
  UserTranscriptResponseDto,
  StudentReportCompletionDto,
  ResyncLmsGradeDto,
} from './dto/simulation-report.dto';
import { JwtRequest, ServiceResponse } from 'src/common/types';
import {
  LmsGradeSyncStatus,
  BulkReviewResult,
  ICurrentUser,
  ClassReportRow,
  SimulationReportRow,
  ReportScoreModeRow,
  IReportListingRawRow,
} from 'src/common/interfaces';
import { ResponseResult } from 'src/common/class/response.class';
import { handleError } from 'src/common/utils/common.util';
import { nowUtc } from 'src/common/utils/dayjs.utils';
import { mapRowToReportFields } from 'src/common/utils/simulation-report.util';
import { BulkReviewReportsReqDto } from './dto/bulk-review-reports.dto';
import { toLmsSyncFailureReason } from 'src/common/utils/lms-sync-failure.util';
import { ErrorTypes } from 'src/common/utils/messages';
import { assertEducator } from 'src/common/utils/current-user.util';
import { SimulationReportConstants } from './simulation-reports.constant';
import { SimulationReportSelectorType } from 'src/common/constants/simulation-report.constants';
import { MailService } from 'src/mail/mail.service';
import { MailRetryService } from 'src/mail/mail-retry.service';
import { NotificationsGateway } from 'src/notifications/notifications.gateway';
import { NotificationsService } from 'src/notifications/notifications.service';
import {
  NotificationChannel,
  NotificationFrequency,
} from 'src/database/entities/notification-preference.entity';
import { RedisService } from 'src/redis/redis.service';
import { resolveEducatorEmail } from 'src/common/utils/educator-identity.util';
import {
  resolveAdminEmail,
  resolveAdminUserId,
} from 'src/common/utils/district-admin-profile.util';
import {
  SimulationReport,
  Student,
  Class,
  Educator,
  LmsStudentMapping,
  ClassEducator,
  LmsClassMapping,
  NotificationType,
} from 'src/database/entities';
import { loadEducatorForSchoolCheck } from 'src/educators/utils/educator-school-access.util';
import { educatorBelongsToSchool } from 'src/educators/utils/educator-school.util';
import {
  NOTIFICATION_REPOSITORY,
  SIMULATION_REPORT_REPOSITORY,
  SIMULATION_V2_REPOSITORY,
  STUDENT_SIMULATION_PROGRESS_REPOSITORY,
  TRANSCRIPT_REPOSITORY,
} from 'src/database/tokens';
import {
  NotificationRepository,
  SimulationReportRepository,
  SimulationV2Repository,
  StudentSimulationProgressRepository,
  TranscriptRepository,
} from 'src/database/repositories';
import { LmsGradeService } from 'src/lms/services/lms-grade.service';
import { GoogleGradePassbackService } from 'src/google/google-grade-passback.service';
import { LmsAssignmentService } from 'src/lms/services/lms-assignment.service';
import {
  extractOverallScoreFromRow,
  extractPerformanceQualityFromRow,
  formatTimeSpentFromRow,
  isPracticeReport,
} from './utils/report-score.util';
import { LoggerService } from 'src/common/services';
import path from 'path';
import fs from 'fs';
import { ListReportsReqDto, ListReportsResDto } from './dto/list-reports.dto';
import type { IPaginationMeta } from 'src/common/interfaces';
import { SUCCESS_MSG } from 'src/common/messages/success.message';
import { buildPaginationMeta, getPagination } from 'src/common/utils/pagination.util';
import { RoleSlug, SimulationReportListingConstants } from 'src/common/constants';

const DEFAULT_FIND_ALL_TAKE = 100;
const MAX_FIND_ALL_TAKE = 500;

type ReportQueryOptions = {
  take?: number;
  skip?: number;
  studentId?: string;
  scenarioId?: string;
  includeBlob?: boolean;
};

@Injectable()
export class SimulationReportsService {
  constructor(
    @Inject(SIMULATION_REPORT_REPOSITORY)
    private readonly reportRepo: SimulationReportRepository,
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly notificationRepo: NotificationRepository,
    @Inject(SIMULATION_V2_REPOSITORY)
    private readonly simulationV2Repo: SimulationV2Repository,
    @Inject(TRANSCRIPT_REPOSITORY)
    private readonly transcriptRepo: TranscriptRepository,
    @Inject(STUDENT_SIMULATION_PROGRESS_REPOSITORY)
    private readonly progressRepo: StudentSimulationProgressRepository,
    private readonly dataSource: DataSource,
    private readonly mailService: MailService,
    private readonly mailRetryService: MailRetryService,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly notificationsService: NotificationsService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly lmsGradeService: LmsGradeService,
    private readonly lmsAssignmentService: LmsAssignmentService,
    private readonly googleGradePassbackService: GoogleGradePassbackService,
    private readonly logger: LoggerService,
  ) {}

  private get studentRepo(): Repository<Student> {
    return this.dataSource.getRepository(Student);
  }

  private get classRepo(): Repository<Class> {
    return this.dataSource.getRepository(Class);
  }

  private get educatorRepo(): Repository<Educator> {
    return this.dataSource.getRepository(Educator);
  }

  private clampTake(take?: number): number | undefined {
    if (take === undefined || !Number.isFinite(take)) return undefined;
    return Math.max(1, Math.min(MAX_FIND_ALL_TAKE, Math.floor(take)));
  }

  private async notifyEducatorGradeSyncFailed(
    studentId: string,
    scenarioId: string,
  ): Promise<void> {
    try {
      const student = await this.studentRepo.findOne({
        where: { id: studentId },
        relations: ['class', 'educator'],
      });
      const educatorId =
        student?.educator?.id ?? student?.educator_id ?? student?.class?.educator_id ?? null;
      if (!student || !educatorId) {
        this.logger.warn(
          `[Grade Passback] no educator to notify for student=${studentId} scenario=${scenarioId}`,
        );
        return;
      }

      const classId = student.class?.id ?? student.class_id ?? '';
      const className = student.class?.class_name ?? classId;
      const studentName = student.student_name || student.student_id || studentId;

      await this.notificationsGateway.notifyEducatorLmsGradeSyncFailed(
        educatorId,
        studentName,
        className,
        { studentId, educatorId, classId, className, simulationId: scenarioId },
      );
    } catch (err) {
      this.logger.error(
        `[Grade Passback] failure notification failed for student=${studentId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async notifyEducatorReportAvailable(
    studentId: string,
    scenarioId: string,
    fallbackStudentName?: string,
    skipIfAlreadyNotified = false,
    reportId?: string,
  ): Promise<void> {
    const student = await this.studentRepo.findOne({
      where: { id: studentId },
      relations: ['class', 'educator'],
    });

    const educatorId =
      student?.educator?.id ?? student?.educator_id ?? student?.class?.educator_id ?? null;

    if (!student || !educatorId) {
      this.logger.warn(
        `[notifyEducatorReportAvailable] skipped — student=${studentId} found=${!!student} ` +
          `educator.id=${student?.educator?.id ?? 'null'} educator_id=${student?.educator_id ?? 'null'} ` +
          `class.educator_id=${student?.class?.educator_id ?? 'null'} scenario=${scenarioId}`,
      );
      return;
    }

    if (skipIfAlreadyNotified) {
      const dismissKey = `notif:dismissed:${educatorId}:${studentId}:${scenarioId}`;
      const dismissed = await this.redisService.get<number>(dismissKey);
      if (dismissed) return; // educator explicitly dismissed — skip everything for this student+scenario

      const dedupKey = reportId
        ? `notif:sent:educator:${educatorId}:${reportId}`
        : `notif:sent:educator:${educatorId}:${studentId}:${scenarioId}`;
      const count = await this.redisService.increment(dedupKey, 86400);
      // Educator already notified for this report — skip educator notification but still notify admin
      if (count !== 1) {
        try {
          const educator = await this.educatorRepo.findOne({
            where: { id: educatorId },
            relations: ['admin', 'admin.userRole', 'school', 'school.user_id'],
          });
          const adminId =
            (educator ? resolveAdminUserId(educator) : null) ??
            educator?.school?.user_id?.id ??
            null;
          if (adminId) {
            const classId = student.class?.id ?? student.class_id ?? '';
            const className = student.class?.class_name ?? classId;
            const simulation = await this.simulationV2Repo.findByBusinessId(scenarioId);
            const studentNameResolved = fallbackStudentName || studentId;
            const simulationTitle = simulation?.title || scenarioId;
            await this.notificationsGateway.notifyAdminStudentReportAvailable(
              adminId,
              studentNameResolved,
              simulationTitle,
              { studentId, educatorId, classId, className, scenarioId },
            );
          }
        } catch (err) {
          this.logger.error(
            `[notifyEducatorReportAvailable] admin-only notification failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        return;
      }
    }

    const classId = student.class?.id ?? student.class_id ?? '';
    const className = student.class?.class_name ?? classId;
    const simulation = await this.simulationV2Repo.findByBusinessId(scenarioId);

    const studentName = fallbackStudentName || studentId;
    const simulationTitle = simulation?.title || scenarioId;

    this.logger.log(
      `[notifyEducatorReportAvailable] firing → educator=${educatorId} student=${studentId} scenario=${scenarioId} simulation="${simulationTitle}"`,
    );

    const metadata = { studentId, educatorId, classId, className, scenarioId };
    await this.notificationsGateway.notifyEducatorStudentReportAvailable(
      educatorId,
      studentName,
      simulationTitle,
      metadata,
    );

    try {
      const educator = await this.educatorRepo.findOne({
        where: { id: educatorId },
        relations: [
          'admin',
          'admin.userRole',
          'admin.userRole.user',
          'school',
          'school.user_id',
          'userRole',
          'userRole.user',
        ],
      });

      const adminId =
        (educator ? resolveAdminUserId(educator) : null) ?? educator?.school?.user_id?.id ?? null;
      const adminEmail =
        (educator ? resolveAdminEmail(educator) : null) ?? educator?.school?.user_id?.email ?? null;
      const educatorIdentifier = educator ? resolveEducatorEmail(educator) : null;
      // Dual-login: educator and admin are the same account — structurally, the same `users`
      // row (preferred); falls back to email equality for a legacy educator with no linked
      // user_role yet.
      const isDualLogin = !!(
        adminId &&
        (educator?.userRole?.userId === adminId ||
          (adminEmail &&
            educatorIdentifier &&
            adminEmail.toLowerCase() === educatorIdentifier.toLowerCase()))
      );

      // Always send admin in-app notification when the educator has an admin, for every new report
      if (adminId && isDualLogin) {
        await this.notificationsGateway.notifyAdminStudentReportAvailable(
          adminId,
          studentName,
          simulationTitle,
          metadata,
        );
      }

      if (educatorIdentifier) {
        if (educatorIdentifier && isDualLogin) {
          const emailEnabled = await this.notificationsService.isPreferenceEnabled(
            educatorId,
            NotificationType.STUDENT_REPORT_AVAILABLE,
            NotificationChannel.EMAIL,
          );

          if (!emailEnabled) {
            // User disabled report email notifications — skip entirely
          } else {
            const freq = await this.notificationsService.getEmailFrequency(
              educatorId,
              NotificationType.STUDENT_REPORT_AVAILABLE,
            );

            if (freq === NotificationFrequency.NEVER) {
              // User opted out via frequency setting
            } else if (freq === NotificationFrequency.IMMEDIATE) {
              const logoUrl = this.configService.get<string>('EMAIL_LOGO_URL') ?? '';
              this.mailService
                .sendMail({
                  to: educatorIdentifier,
                  subject: `Student Report Available — ${simulationTitle}`,
                  template: 'report-available',
                  context: {
                    educatorName: educator?.full_name?.trim() || educatorIdentifier,
                    studentName,
                    simulationTitle,
                    className,
                    logoUrl,
                  },
                })
                .catch((err: unknown) =>
                  this.logger.error(
                    `[notifyEducatorReportAvailable] email failed for educator=${educatorId}: ${err instanceof Error ? err.message : String(err)}`,
                  ),
                );
            } else {
              // Digest: queue the notification in Redis for the scheduled digest sender
              const digestKey = `email:digest:${educatorId}:${freq.toLowerCase()}:reports`;
              const entry = JSON.stringify({ studentName, simulationTitle, className, scenarioId });
              await this.redisService.rpush(digestKey, entry);
            }
          }

          // Only notify admin when their email matches the educator's email (dual-login)
          if (isDualLogin) {
            if (educatorIdentifier) {
              const logoUrl = this.configService.get<string>('mail.logoUrl') || '';

              let logoBuffer: Buffer | null = null;
              try {
                const logoPath = path.join(__dirname, '..', 'assets', 'realityworks-ai-logo.png');
                if (fs.existsSync(logoPath)) {
                  logoBuffer = fs.readFileSync(logoPath);
                }
              } catch (err) {
                this.logger.warn(`[signup] Failed to load logo image: ${(err as Error).message}`);
              }

              const attachments = logoBuffer
                ? [
                    {
                      filename: 'realityworks-ai-logo.png',
                      contentType: 'image/png',
                      content: logoBuffer,
                      cid: 'realityworks-ai-logo',
                    },
                  ]
                : [];

              this.mailService
                .sendMail({
                  to: educatorIdentifier,
                  subject: `Student Report Available — ${simulationTitle}`,
                  template: 'report-available',
                  context: {
                    educatorName: educator?.full_name?.trim() || educatorIdentifier,
                    studentCode: student.student_id ?? studentName,
                    studentName,
                    simulationTitle,
                    className,
                    logoUrl,
                  },
                  attachments,
                })
                .catch((err: unknown) =>
                  this.logger.error(
                    `[notifyEducatorReportAvailable] email failed for educator=${educatorId}: ${
                      err instanceof Error ? err.message : String(err)
                    }`,
                  ),
                );
            } else {
              const freq = await this.notificationsService.getEmailFrequency(
                educatorId,
                NotificationType.STUDENT_REPORT_AVAILABLE,
              );
              // Digest: queue the notification in Redis for the scheduled digest sender
              const digestKey = `email:digest:${educatorId}:${freq.toLowerCase()}:reports`;
              const entry = JSON.stringify({
                studentCode: student.student_id ?? studentName,
                studentName,
                simulationTitle,
                className,
                scenarioId,
              });
              await this.redisService.rpush(digestKey, entry);
            }

            const adminId =
              (educator ? resolveAdminUserId(educator) : null) ??
              educator?.school?.user_id?.id ??
              null;
            const adminEmail =
              (educator ? resolveAdminEmail(educator) : null) ??
              educator?.school?.user_id?.email ??
              null;
            // Only notify admin when it's the same account as the educator (structural match,
            // falling back to email equality for a legacy educator with no linked user_role).
            const isSameAccount =
              !!adminId &&
              (educator?.userRole?.userId === adminId ||
                (!!adminEmail &&
                  !!educatorIdentifier &&
                  adminEmail.toLowerCase() === educatorIdentifier.toLowerCase()));
            if (adminId && isSameAccount) {
              // Independent dedup: only the caller that increments to 1 proceeds.
              const adminDedupKey = `notif:sent:admin:${adminId}:${studentId}:${scenarioId}`;
              const adminCount = await this.redisService.increment(adminDedupKey, 86400);
              if (adminCount === 1) {
                await this.notificationsGateway.notifyAdminStudentReportAvailable(
                  adminId,
                  studentName,
                  simulationTitle,
                  metadata,
                );

                // Also send admin email when admin's email preference is enabled
                const adminEmailEnabled = await this.notificationsService.isPreferenceEnabled(
                  adminId,
                  NotificationType.STUDENT_REPORT_AVAILABLE,
                  NotificationChannel.EMAIL,
                );

                if (adminEmailEnabled) {
                  const adminFreq = await this.notificationsService.getEmailFrequency(
                    adminId,
                    NotificationType.STUDENT_REPORT_AVAILABLE,
                  );

                  if (adminFreq === NotificationFrequency.IMMEDIATE && adminEmail) {
                    const logoUrl = this.configService.get<string>('EMAIL_LOGO_URL') ?? '';
                    this.mailService
                      .sendMail({
                        to: adminEmail,
                        subject: `Student Report Available — ${simulationTitle}`,
                        template: 'report-available',
                        context: {
                          educatorName: educator?.full_name?.trim() || adminEmail,
                          studentName,
                          simulationTitle,
                          className,
                          logoUrl,
                        },
                      })
                      .catch((err: unknown) =>
                        this.logger.error(
                          `[notifyEducatorReportAvailable] admin email failed for admin=${adminId}: ${err instanceof Error ? err.message : String(err)}`,
                        ),
                      );
                  } else if (adminFreq !== NotificationFrequency.NEVER) {
                    // Digest: queue for the scheduled digest sender
                    const digestKey = `email:digest:${adminId}:${adminFreq.toLowerCase()}:reports`;
                    const entry = JSON.stringify({
                      studentName,
                      simulationTitle,
                      className,
                      scenarioId,
                    });
                    await this.redisService.rpush(digestKey, entry);
                  }
                }
              }
            }
          }
        }
      }
    } catch (err) {
      this.logger.error(
        `[notifyEducatorReportAvailable] post-notification step failed for educator=${educatorId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async findAll(options: ReportQueryOptions = {}): Promise<ServiceResponse<SimulationReportRow[]>> {
    try {
      const take = this.clampTake(options.take ?? DEFAULT_FIND_ALL_TAKE) ?? DEFAULT_FIND_ALL_TAKE;
      const skip =
        options.skip !== undefined && Number.isFinite(options.skip)
          ? Math.max(0, Math.floor(options.skip))
          : 0;
      const data = await this.reportRepo.findReportRowsPage({
        studentId: options.studentId?.trim() || undefined,
        scenarioId: options.scenarioId?.trim() || undefined,
        skip,
        take,
      });
      return { success: true, message: SimulationReportConstants.MESSAGES.ALL_FETCHED, data };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch reports';
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  async findByStudentId(input: string): Promise<ServiceResponse<SimulationReportRow[]>> {
    try {
      let studentUuid: string | null = null;

      if (this.UUID_REGEX.test(input)) {
        studentUuid = input;
      } else {
        const student = await this.studentRepo.findOne({
          where: { student_id: input },
          select: { id: true },
        });
        studentUuid = student?.id ?? null;
      }

      const data = studentUuid
        ? await this.reportRepo.findReportRowsByStudentIds([studentUuid])
        : [];
      return { success: true, message: SimulationReportConstants.MESSAGES.ALL_FETCHED, data };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch reports';
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  async findByClassId(class_id: string): Promise<ServiceResponse<ClassReportRow[]>> {
    try {
      const rows = await this.reportRepo.findReportRowsByClassId(class_id);
      // Temporary: the Educator App's grade resync button still reads `student_id` on this route.
      // Drop the alias once the Educator App reads `studentId`.
      const data = rows.map((row) => ({ ...row, student_id: row.studentId }));
      return { success: true, message: SimulationReportConstants.MESSAGES.ALL_FETCHED, data };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch reports';
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  async findByEducatorId(educator_id: string): Promise<ServiceResponse<SimulationReportRow[]>> {
    try {
      const [rows, allScenarios] = await Promise.all([
        this.reportRepo.findReportRowsByEducatorId(educator_id),
        this.simulationV2Repo.findAllWithoutChildrenJoined(),
      ]);

      const activeScenarioIds = new Set(
        allScenarios
          .filter((s) => {
            const status = String(s.status ?? '')
              .toLowerCase()
              .trim();
            return status !== 'draft' && status !== 'archived';
          })
          .map((s) => s.id),
      );

      const data = rows.filter((r) => !r.scenarioId || activeScenarioIds.has(r.scenarioId));
      this.logger.log(`[findByEducatorId] educator=${educator_id} matched=${data.length} reports`);
      return { success: true, message: SimulationReportConstants.MESSAGES.ALL_FETCHED, data };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch reports';
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  async findByAdminId(adminId: string): Promise<ServiceResponse<SimulationReportRow[]>> {
    try {
      const data = await this.reportRepo.findReportRowsByAdminId(adminId);
      this.logger.log(`[findByAdminId] admin=${adminId} matched=${data.length} reports`);
      return { success: true, message: SimulationReportConstants.MESSAGES.ALL_FETCHED, data };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch reports';
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  async findByClassIdWithDateRange(
    class_id: string,
    months: number,
  ): Promise<ServiceResponse<SimulationReportRow[]>> {
    try {
      const since = nowUtc().subtract(months, 'month').toDate();
      const data = await this.reportRepo.findReportRowsByClassIdSince(class_id, since);
      return { success: true, message: SimulationReportConstants.MESSAGES.ALL_FETCHED, data };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch reports';
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  async monthlyBreakdown(
    months: number,
  ): Promise<ServiceResponse<{ month: string; year: number; count: number }[]>> {
    return this.monthlyBreakdownForScope(months);
  }

  async completedCount(
    months: number,
  ): Promise<ServiceResponse<{ count: number; months: number; since: string }>> {
    return this.completedCountForScope(months);
  }

  async completedCountByAdmin(
    adminId: string,
    months: number,
  ): Promise<ServiceResponse<{ count: number; months: number; since: string }>> {
    return this.completedCountForScope(months, adminId);
  }

  async monthlyBreakdownByAdmin(
    adminId: string,
    months: number,
  ): Promise<ServiceResponse<{ month: string; year: number; count: number }[]>> {
    return this.monthlyBreakdownForScope(months, adminId);
  }

  /** First instant (UTC) of the oldest month a `months`-month window covers. */
  private statsWindowStart(months: number): Dayjs {
    return nowUtc()
      .startOf('month')
      .subtract(months - 1, 'month');
  }

  private async monthlyBreakdownForScope(
    months: number,
    adminId?: string,
  ): Promise<ServiceResponse<{ month: string; year: number; count: number }[]>> {
    try {
      const windowStart = this.statsWindowStart(months);
      const counts = await this.reportRepo.countReportsPerMonth({
        since: windowStart.toDate(),
        adminId,
      });
      const countByMonth = new Map(counts.map((row) => [row.month, row.count]));

      const data = Array.from({ length: months }, (_, i) => {
        const monthStart = windowStart.add(i, 'month');
        return {
          month: monthStart.format('MMM'),
          year: monthStart.year(),
          count: countByMonth.get(monthStart.format('YYYY-MM')) ?? 0,
        };
      });
      return { success: true, message: SimulationReportConstants.MESSAGES.ALL_FETCHED, data };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch monthly stats';
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  private async completedCountForScope(
    months: number,
    adminId?: string,
  ): Promise<ServiceResponse<{ count: number; months: number; since: string }>> {
    try {
      const since = this.statsWindowStart(months);
      const counts = await this.reportRepo.countReportsPerMonth({ since: since.toDate(), adminId });
      const count = counts.reduce((sum, row) => sum + row.count, 0);
      return {
        success: true,
        message: SimulationReportConstants.MESSAGES.ALL_FETCHED,
        data: { count, months, since: since.toISOString() },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch stats';
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  async findAllStudentsCompleted(): Promise<ServiceResponse<object[]>> {
    try {
      const data = await this.studentRepo
        .createQueryBuilder('s')
        .select([
          's.id AS id',
          's.student_id AS student_id',
          's.student_name AS student_name',
          's.sims_completed AS sims_completed',
          's.score AS score',
          's.time_spent AS time_spent',
          's.submission_date AS submission_date',
        ])
        .where('s.is_active = :isActive', { isActive: true })
        .orderBy('s.sims_completed', 'DESC', 'NULLS LAST')
        .getRawMany<object>();
      return { success: true, message: 'Students completed fetched', data };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch students';
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  private readonly UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  async findById(id: string): Promise<ServiceResponse<SimulationReportRow>> {
    try {
      const report = await this.reportRepo.findRowByIdOrReportId(id);
      if (!report) {
        return {
          success: false,
          message: SimulationReportConstants.MESSAGES.NOT_FOUND,
          type: ErrorTypes.NOT_FOUND,
        };
      }
      return { success: true, message: SimulationReportConstants.MESSAGES.FETCHED, data: report };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch report';
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  private static readonly TRANSCRIPT_KEYS = [
    'conversationHistory',
    'conversation',
    'messages',
    'chatHistory',
    'dialogHistory',
    'transcript',
    'speechEvents',
    'dialogue',
    'actions',
    'actionsTaken',
    'completedActions',
    'performedActions',
    'userActions',
    'actionsLog',
    'eventLog',
    'transcriptEvents',
    'events',
    'timeline',
    'timelineEvents',
    'history',
    'log',
  ];

  private static readonly SKIP_KEYS = new Set([
    'grading',
    'expectedActions',
    'assessmentGuidance',
    'rubric',
    'scoring',
    'phases',
    'phaseData',
    'availableMedications',
    'orders',
    'actionCategories',
    'historyPrompts',
    'patientData',
    'aiPatientData',
    'sbar',
    'studentBriefing',
  ]);

  private static readonly TIMING_FIELDS = [
    'startedAt',
    'startTime',
    'start',
    'started',
    'endedAt',
    'endTime',
    'end',
    'ended',
    'simulationTime',
    'simTime',
    'timestamp',
    'time',
    'elapsed',
    'createdAt',
    'created_at',
    'dateTime',
    'datetime',
    'date',
    'recordedAt',
    'occurredAt',
    'eventTime',
    'messageTime',
    'ts',
    'elapsedTime',
    'elapsedSeconds',
  ];

  private static readonly KNOWN_EVENT_FIELDS = new Set([
    'id',
    'timestamp',
    'simulationTime',
    'simTime',
    'time',
    'elapsed',
    'type',
    'eventType',
    'actionType',
    'title',
    'action',
    'name',
    'label',
    'description',
    'category',
    'subCategory',
    'subcategory',
    'group',
    'section',
    'speaker',
    'role',
    'sender',
    'source',
    'startedAt',
    'startTime',
    'start',
    'started',
    'endedAt',
    'endTime',
    'end',
    'ended',
    'duration',
    'elapsed',
    'status',
    'result',
    'outcome',
    'transcript',
    'text',
    'message',
    'content',
    'speech',
    'createdAt',
    'created_at',
    'dateTime',
    'datetime',
    'date',
    'recordedAt',
    'occurredAt',
    'eventTime',
    'messageTime',
    'ts',
    'elapsedTime',
    'elapsedSeconds',
  ]);

  private isTimedEvent(item: unknown): boolean {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return false;
    const obj = item as Record<string, unknown>;
    if (
      SimulationReportsService.TIMING_FIELDS.some(
        (f) => obj[f] !== null && obj[f] !== undefined && obj[f] !== '',
      )
    )
      return true;
    const hasSpeaker =
      obj['role'] !== undefined ||
      obj['speaker'] !== undefined ||
      obj['sender'] !== undefined ||
      obj['source'] !== undefined;
    const hasContent =
      obj['content'] !== undefined ||
      obj['text'] !== undefined ||
      obj['message'] !== undefined ||
      obj['transcript'] !== undefined ||
      obj['speech'] !== undefined;
    return hasSpeaker && hasContent;
  }

  private transcriptScore(arr: unknown[]): number {
    if (arr.length === 0) return 0;
    const timed = arr.filter((i) => this.isTimedEvent(i)).length;
    return timed / arr.length;
  }

  private collectAllEvents(reportData: Record<string, unknown>): unknown[] {
    const usedKeys = new Set<string>();
    const merged: unknown[] = [];

    const isPriorityKey = new Set(SimulationReportsService.TRANSCRIPT_KEYS);

    const tryAdd = (key: string, arr: unknown[], isPriority: boolean): boolean => {
      if (usedKeys.has(key)) return false;
      if (SimulationReportsService.SKIP_KEYS.has(key)) return false;
      if (!Array.isArray(arr) || arr.length === 0) return false;

      const timed = arr.filter((i) => this.isTimedEvent(i));
      if (timed.length === 0) return false;

      if (!isPriority) {
        const score = timed.length / arr.length;
        if (score < 0.3) return false;
      }

      usedKeys.add(key);
      merged.push(...timed);
      return true;
    };

    for (const key of SimulationReportsService.TRANSCRIPT_KEYS) {
      const val = reportData[key];
      if (Array.isArray(val)) tryAdd(key, val, true);
    }

    for (const [key, val] of Object.entries(reportData)) {
      if (Array.isArray(val) && !isPriorityKey.has(key)) tryAdd(key, val, false);
    }

    return merged;
  }

  private extractTranscriptEvents(reportData: Record<string, unknown>): TranscriptEventDto[] {
    const candidates = this.collectAllEvents(reportData);
    if (candidates.length === 0) return [];

    return candidates.map((raw, index): TranscriptEventDto => {
      const e = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;

      const rawMeta: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(e)) {
        if (!SimulationReportsService.KNOWN_EVENT_FIELDS.has(k)) {
          rawMeta[k] = v;
        }
      }

      const rawType = this.toStringOrNull(
        e['type'] ?? e['eventType'] ?? e['actionType'] ?? e['speaker'] ?? e['role'],
      );

      const rawTimestamp = this.toStringOrNull(
        e['timestamp'] ??
          e['createdAt'] ??
          e['created_at'] ??
          e['dateTime'] ??
          e['datetime'] ??
          e['date'] ??
          e['recordedAt'] ??
          e['occurredAt'] ??
          e['eventTime'] ??
          e['messageTime'] ??
          e['ts'] ??
          e['startedAt'] ??
          e['startTime'] ??
          e['start'] ??
          e['started'],
      );

      return {
        id:
          typeof e['id'] === 'string' || typeof e['id'] === 'number'
            ? String(e['id'])
            : `event-${index}`,
        timestamp: rawTimestamp,
        simulationTime: this.toStringOrNull(
          e['simulationTime'] ??
            e['simTime'] ??
            e['time'] ??
            e['elapsed'] ??
            e['elapsedTime'] ??
            e['elapsedSeconds'],
        ),
        type: rawType ?? 'UNKNOWN',
        title: this.toStringOrNull(
          e['title'] ?? e['action'] ?? e['name'] ?? e['label'] ?? e['description'],
        ),
        category: this.toStringOrNull(e['category'] ?? e['group'] ?? e['section']),
        subCategory: this.toStringOrNull(e['subCategory'] ?? e['subcategory']),
        speaker: this.toStringOrNull(e['speaker'] ?? e['role'] ?? e['sender'] ?? e['source']),
        startedAt: rawTimestamp,
        endedAt: this.toStringOrNull(e['endedAt'] ?? e['endTime'] ?? e['end'] ?? e['ended']),
        duration:
          typeof e['duration'] === 'number'
            ? e['duration']
            : typeof e['duration'] === 'string'
              ? parseFloat(e['duration']) || null
              : null,
        status: this.toStringOrNull(e['status'] ?? e['result'] ?? e['outcome']),
        transcript: this.toStringOrNull(
          e['transcript'] ?? e['text'] ?? e['message'] ?? e['content'] ?? e['speech'],
        ),
        metadata: rawMeta,
      };
    });
  }

  private toStringOrNull(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
      return String(value);
    }
    return null;
  }

  private sortEventsByTime(events: TranscriptEventDto[]): TranscriptEventDto[] {
    const toSeconds = (val: string | null): number => {
      if (!val) return Number.MAX_SAFE_INTEGER;
      const parts = val.split(':');
      if (parts.length === 2) {
        return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
      }
      if (parts.length >= 3) {
        const ms = Date.parse(val);
        if (!isNaN(ms)) return ms;
        return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10);
      }
      const n = parseFloat(val);
      return isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
    };

    return [...events].sort((a, b) => {
      const ta = toSeconds(a.simulationTime ?? a.startedAt ?? a.timestamp);
      const tb = toSeconds(b.simulationTime ?? b.startedAt ?? b.timestamp);
      return ta - tb;
    });
  }

  private static readonly SPEAKER_MAP: Record<string, TranscriptSpeaker> = {
    user: 'user',
    student: 'user',
    learner: 'user',
    assistant: 'assistant',
    ai: 'assistant',
    bot: 'assistant',
    tutor: 'assistant',
    patient: 'assistant',
    virtual_patient: 'assistant',
    virtualpatient: 'assistant',
    avatar: 'assistant',
    virtualavatar: 'assistant',
    virtual_avatar: 'assistant',
    provider: 'provider',
    doctor: 'provider',
    physician: 'provider',
    nurse: 'provider',
    sbar_report: 'sbar_report',
    sbar: 'sbar_report',
    system: 'system',
    narrator: 'system',
    info: 'system',
    order: 'order',
    student_team_comm: 'student_team_comm',
    team: 'student_team_comm',
    peer: 'student_team_comm',
    group: 'student_team_comm',
    teamcomm: 'student_team_comm',
  };

  private normalizeSpeaker(raw: string | null): TranscriptSpeaker {
    if (!raw) return 'system';
    const key = raw.toLowerCase().replace(/[^a-z0-9_]/g, '');
    return SimulationReportsService.SPEAKER_MAP[key] ?? 'system';
  }

  private parseSimTimeToSeconds(simTime: string | null): number | undefined {
    if (!simTime) return undefined;
    const parts = simTime.split(':').map(Number);
    if (parts.length === 2 && !parts.some(isNaN)) {
      return parts[0] * 60 + parts[1];
    }
    if (parts.length === 3 && !parts.some(isNaN)) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    const n = parseFloat(simTime);
    return isNaN(n) ? undefined : n;
  }

  private secondsToElapsedTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  private mapToTranscriptMessages(
    events: TranscriptEventDto[],
    scenarioStartMs?: number | null,
  ): TranscriptMessageDto[] {
    return events.map((evt, index): TranscriptMessageDto => {
      const rawTs = evt.timestamp ?? evt.startedAt;
      const tsMs = rawTs ? Date.parse(rawTs) : NaN;
      const timestampValue = isNaN(tsMs) ? undefined : tsMs;

      let timestamp = rawTs ?? '';
      if (!isNaN(tsMs)) {
        const d = new Date(tsMs);
        timestamp = `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
      }

      const simTime = evt.simulationTime;
      let elapsedSeconds = this.parseSimTimeToSeconds(simTime);
      if (elapsedSeconds === undefined && timestampValue !== undefined && scenarioStartMs != null) {
        elapsedSeconds = Math.max(0, Math.round((timestampValue - scenarioStartMs) / 1000));
      }
      const elapsedTime =
        elapsedSeconds !== undefined
          ? this.secondsToElapsedTime(elapsedSeconds)
          : (simTime ?? undefined);

      const message = evt.transcript ?? evt.title ?? '';

      return {
        id: evt.id,
        speaker: this.normalizeSpeaker(evt.speaker ?? evt.type),
        message,
        timestamp,
        ...(timestampValue !== undefined && { timestampValue }),
        ...(elapsedTime !== undefined && { elapsedTime }),
        ...(elapsedSeconds !== undefined && { elapsedSeconds }),
        ...(typeof evt.duration === 'number' && { duration: evt.duration }),
        ...(elapsedSeconds !== undefined && { _orderKey: elapsedSeconds }),
        _originalIndex: index,
      };
    });
  }

  async debugReportDataKeys(attemptId: string): Promise<ServiceResponse<object>> {
    try {
      const report = await this.reportRepo.findRowByIdOrReportId(attemptId);

      if (!report) {
        return {
          success: false,
          message: SimulationReportConstants.MESSAGES.TRANSCRIPT_NOT_FOUND,
          type: ErrorTypes.NOT_FOUND,
        };
      }

      const populated = Object.entries(report as unknown as Record<string, unknown>).filter(
        ([, val]) => val !== null && val !== undefined,
      );

      const keyInfo = populated.map(([key, val]) => ({
        key,
        type: Array.isArray(val) ? 'array' : typeof val,
        length: Array.isArray(val) ? val.length : null,
        sample:
          Array.isArray(val) && val.length > 0
            ? typeof val[0] === 'object' && val[0] !== null
              ? Object.keys(val[0] as object)
              : (val[0] as string | number | boolean | null)
            : typeof val === 'object' && val !== null
              ? null
              : val,
      }));

      return {
        success: true,
        message: 'report columns inspected',
        data: { attemptId, keyInfo },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Debug failed';
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  private extractScenarioStartMs(rawData: Record<string, unknown>): number | null {
    const candidates = [
      rawData['startedAt'],
      rawData['scenarioStartTime'],
      rawData['startTime'],
      rawData['createdAt'],
    ];
    for (const c of candidates) {
      if (typeof c === 'number' && c > 0) return c;
      if (typeof c === 'string' && c) {
        const ms = new Date(c).getTime();
        if (!isNaN(ms)) return ms;
      }
    }
    return null;
  }

  private extractSummaryEntries(
    rawData: Record<string, unknown>,
    scenarioStartMs: number | null,
  ): SummaryEntryDto[] {
    const results: SummaryEntryDto[] = [];

    const byCategory = rawData['summaryByCategory'];
    if (byCategory && typeof byCategory === 'object' && !Array.isArray(byCategory)) {
      for (const [catKey, entries] of Object.entries(byCategory as Record<string, unknown>)) {
        if (!Array.isArray(entries)) continue;
        for (const e of entries) {
          if (!e || typeof e !== 'object') continue;
          const entry = e as Record<string, unknown>;
          if (!entry['category']) entry['category'] = catKey;
          if (entry['id'] === undefined || entry['id'] === null) {
            entry['id'] = `${catKey}-${results.length}`;
          } else {
            entry['id'] =
              typeof entry['id'] === 'string' || typeof entry['id'] === 'number'
                ? String(entry['id'])
                : `${catKey}-${results.length}`;
          }
          if (typeof entry['timestampValue'] !== 'number') {
            const ts =
              entry['timestamp'] ?? entry['startedAt'] ?? entry['createdAt'] ?? entry['time'];
            entry['timestampValue'] =
              typeof ts === 'number'
                ? ts
                : typeof ts === 'string' && ts
                  ? new Date(ts).getTime() || 0
                  : 0;
          }
          results.push(entry as unknown as SummaryEntryDto);
        }
      }
    } else if (Array.isArray(byCategory)) {
      for (const e of byCategory) {
        if (!e || typeof e !== 'object') continue;
        results.push(e as SummaryEntryDto);
      }
    }

    if (results.length === 0) {
      for (const key of ['summaryEntries', 'summary', 'assessmentSummary', 'gradingSummary']) {
        const flat = rawData[key];
        if (Array.isArray(flat) && flat.length > 0) {
          for (const e of flat) {
            if (!e || typeof e !== 'object') continue;
            results.push(e as SummaryEntryDto);
          }
          break;
        }
      }
    }

    const existingIds = new Set(results.map((r) => String(r.id ?? '')));
    const DIRECT_CATEGORY_KEYS: Record<string, string> = {
      actions: 'actions',
      teamCommunication: 'teamCommunication',
      demographics: 'demographics',
      history: 'history',
      orders: 'orders',
      medications: 'medications',
      patientResponses: 'patientResponses',
      studentResponses: 'studentResponses',
    };

    for (const [key, category] of Object.entries(DIRECT_CATEGORY_KEYS)) {
      const arr = rawData[key];
      if (!Array.isArray(arr) || arr.length === 0) continue;
      for (const e of arr) {
        if (!e || typeof e !== 'object') continue;
        const entry = e as Record<string, unknown>;
        const entryId =
          typeof entry['id'] === 'string' || typeof entry['id'] === 'number'
            ? String(entry['id'])
            : `${key}-${results.length}`;
        if (existingIds.has(entryId)) continue; // already included
        if (!entry['category']) entry['category'] = category;
        if (entry['id'] === undefined || entry['id'] === null) entry['id'] = entryId;
        if (typeof entry['timestampValue'] !== 'number') {
          const ts =
            entry['timestamp'] ?? entry['startedAt'] ?? entry['createdAt'] ?? entry['time'];
          entry['timestampValue'] =
            typeof ts === 'number'
              ? ts
              : typeof ts === 'string' && ts
                ? new Date(ts).getTime() || 0
                : 0;
        }
        existingIds.add(entryId);
        results.push(entry as unknown as SummaryEntryDto);
      }
    }

    const filtered = results.filter((e) => e.category !== 'system' && e.category !== 'vitals');

    if (scenarioStartMs !== null) {
      for (const e of filtered) {
        if (e.elapsedSeconds == null && typeof e.timestampValue === 'number') {
          e.elapsedSeconds = Math.max(0, Math.round((e.timestampValue - scenarioStartMs) / 1000));
        }
      }
    }

    filtered.sort((a, b) => (a.timestampValue ?? 0) - (b.timestampValue ?? 0));

    return filtered;
  }

  private extractCommonActions(rawData: Record<string, unknown>): CommonActionDto[] {
    const tracker = rawData['commonActionTracker'];
    if (!tracker || typeof tracker !== 'object') return [];

    const log = (tracker as Record<string, unknown>)['actionLog'];
    if (!Array.isArray(log)) return [];

    const validTypes = new Set(['infection', 'privacy', 'environmental']);
    const results: CommonActionDto[] = [];

    for (const entry of log) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      const label = typeof e['label'] === 'string' ? e['label'] : '';
      const type = typeof e['type'] === 'string' ? e['type'] : '';
      if (!label || !validTypes.has(type)) continue;
      results.push(e as unknown as CommonActionDto);
    }

    return results;
  }

  async getUserTranscript(attemptId: string): Promise<ServiceResponse<UserTranscriptResponseDto>> {
    try {
      const report = await this.reportRepo.findRowByIdOrReportId(attemptId);

      if (!report) {
        return {
          success: false,
          message: SimulationReportConstants.MESSAGES.TRANSCRIPT_NOT_FOUND,
          type: ErrorTypes.NOT_FOUND,
        };
      }

      let studentRow:
        | { student_name: string; student_id: string; class_id: string; class_name: string }
        | undefined;

      const studentIdIsUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(report.studentId);

      type StudentRow = {
        student_name: string;
        student_id: string;
        class_id: string;
        class_name: string;
      };

      if (studentIdIsUuid) {
        const rows = await this.studentRepo
          .createQueryBuilder('s')
          .leftJoin('classes', 'c', 'c.id = s.class_id')
          .select([
            's.student_name AS student_name',
            's.student_id AS student_id',
            's.class_id AS class_id',
            'c.class_name AS class_name',
          ])
          .where('s.id = :studentId', { studentId: report.studentId })
          .limit(1)
          .getRawMany<StudentRow>();
        studentRow = rows[0];
      }

      if (!studentRow && report.studentId) {
        const rows = await this.studentRepo
          .createQueryBuilder('s')
          .leftJoin('classes', 'c', 'c.id = s.class_id')
          .select([
            's.student_name AS student_name',
            's.student_id AS student_id',
            's.class_id AS class_id',
            'c.class_name AS class_name',
          ])
          .where('s.student_id = :studentCode', { studentCode: report.studentId })
          .limit(1)
          .getRawMany<StudentRow>();
        studentRow = rows[0];
      }

      const rawReport = report as unknown as Record<string, unknown>;
      const fallbackStudentName = this.toStringOrNull(
        rawReport['student_name'] ?? rawReport['studentName'],
      );

      const fallbackStudentCode = this.toStringOrNull(
        rawReport['userId'] ??
          rawReport['user_id'] ??
          rawReport['studentId'] ??
          rawReport['student_id'] ??
          report.studentId,
      );
      const fallbackClassName = this.toStringOrNull(
        rawReport['className'] ??
          rawReport['class_name'] ??
          rawReport['classname'] ??
          rawReport['classTitle'] ??
          rawReport['class'],
      );

      let simulationName = report.scenarioId ?? '';
      let simulationType: string | null = null;
      const rawData: Record<string, unknown> = { ...mapRowToReportFields(report) };
      try {
        const scenario = report.scenarioId
          ? await this.simulationV2Repo.findByBusinessId(report.scenarioId)
          : null;
        if (scenario) {
          simulationName = scenario.title ?? simulationName;
          simulationType = scenario.department ?? scenario.learnerLevel ?? null;
        }
      } catch (err) {
        this.logger.warn(
          `[SimulationReport] Could not resolve simulation name: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      let transcriptRawData: Record<string, unknown> | null = null;

      const transcriptId = this.toStringOrNull(report.transcriptId);

      if (transcriptId) {
        try {
          const found = await this.transcriptRepo.findByBusinessId(transcriptId);
          transcriptRawData = found ? { ...found } : null;
        } catch (err) {
          this.logger.warn(
            `[SimulationReport] Could not fetch transcript: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        const rawId = rawData['id'];
        const resolvedId =
          typeof rawId === 'string' || typeof rawId === 'number'
            ? String(rawId)
            : typeof report.id === 'string'
              ? report.id
              : '';
        const candidates = [resolvedId, resolvedId.replace(/^report-/i, '')].filter(Boolean);
        for (const candidate of candidates) {
          try {
            const fetched = await this.transcriptRepo.findByBusinessId(candidate);
            if (fetched) {
              transcriptRawData = { ...fetched };
              break;
            }
          } catch {
            /* skip */
          }
        }
      }

      const isRealIso = (v: unknown): v is string | Date => {
        if (!v) return false;
        const ms = new Date(v as string | Date).getTime();
        if (isNaN(ms)) return false;

        const year = new Date(ms).getFullYear();
        return year >= 2020 && year <= 2035;
      };

      const transcriptStartedAt = transcriptRawData
        ? (transcriptRawData['startedAt'] as string | undefined)
        : undefined;

      const reportStartedAt = rawData['startedAt'];
      const reportStartedAtReal =
        typeof reportStartedAt === 'string' && reportStartedAt.includes('T')
          ? reportStartedAt
          : undefined;

      const createdAtRaw =
        (isRealIso(transcriptStartedAt) ? transcriptStartedAt : undefined) ??
        (isRealIso(reportStartedAtReal) ? reportStartedAtReal : undefined) ??
        report.createdAt ??
        (rawData['created_at'] as Date | undefined) ??
        (rawData['createdAt'] as Date | undefined) ??
        (rawData['submittedAt'] as Date | undefined) ??
        (rawData['completedAt'] as Date | undefined);

      const createdAt = createdAtRaw ? new Date(createdAtRaw) : new Date();
      const pad = (n: number): string => String(n).padStart(2, '0');
      const realDate = [
        createdAt.getFullYear(),
        pad(createdAt.getMonth() + 1),
        pad(createdAt.getDate()),
      ].join('-');
      const realTime = `${pad(createdAt.getHours())}:${pad(createdAt.getMinutes())}`;

      let simDateFromActions: string | null = null;
      let simTimeFromActions: string | null = null;
      const tracker = rawData['commonActionTracker'];
      if (tracker && typeof tracker === 'object') {
        const actionLog = (tracker as Record<string, unknown>)['actionLog'];
        if (Array.isArray(actionLog) && actionLog.length > 0) {
          let earliest = actionLog[0] as Record<string, unknown>;
          for (const entry of actionLog as Record<string, unknown>[]) {
            if (
              typeof entry['timestampSimMs'] === 'number' &&
              typeof earliest['timestampSimMs'] === 'number' &&
              entry['timestampSimMs'] < earliest['timestampSimMs']
            ) {
              earliest = entry;
            }
          }
          const ts = typeof earliest['timestamp'] === 'string' ? earliest['timestamp'] : null;
          if (ts) {
            const parts = ts.split(', ');
            if (parts.length === 2) {
              simDateFromActions = parts[0].trim();
              simTimeFromActions = parts[1].trim();
            }
          }
        }
      }

      const simulationDateRaw =
        simDateFromActions ??
        this.toStringOrNull(
          rawData['simulationDate'] ??
            rawData['simDate'] ??
            rawData['scenarioDate'] ??
            rawData['simScenarioDate'] ??
            rawData['scenarioStartDate'],
        );

      const simulationTimeRaw =
        simTimeFromActions ??
        this.toStringOrNull(
          rawData['simulationTime'] ??
            rawData['simTime'] ??
            rawData['simClock'] ??
            rawData['clockTime'],
        );

      const totalDuration =
        typeof rawData['totalTimeSeconds'] === 'number'
          ? rawData['totalTimeSeconds']
          : typeof rawData['totalTimeSeconds'] === 'string'
            ? parseFloat(rawData['totalTimeSeconds']) || null
            : null;

      let rawEvents = this.extractTranscriptEvents(rawData);

      if (rawEvents.length === 0) {
        for (const val of Object.values(rawData)) {
          if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
            const nested = this.extractTranscriptEvents(val as Record<string, unknown>);
            if (nested.length > rawEvents.length) rawEvents = nested;
          }
        }
      }

      if (transcriptRawData) {
        let speechEvents = this.extractTranscriptEvents(transcriptRawData);

        if (speechEvents.length === 0) {
          for (const val of Object.values(transcriptRawData)) {
            if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
              const nested = this.extractTranscriptEvents(val as Record<string, unknown>);
              if (nested.length > speechEvents.length) speechEvents = nested;
            }
          }
        }

        if (speechEvents.length > 0) {
          const existingIds = new Set(rawEvents.map((e) => e.id));
          const newSpeechEvents = speechEvents.filter((e) => !existingIds.has(e.id));
          rawEvents = [...rawEvents, ...newSpeechEvents];
        }
      }

      const sortedEvents = this.sortEventsByTime(rawEvents);

      let scenarioStartMs = this.extractScenarioStartMs(rawData);
      if (scenarioStartMs == null && transcriptRawData) {
        scenarioStartMs = this.extractScenarioStartMs(transcriptRawData);
      }

      const transcriptStudentName = transcriptRawData
        ? this.toStringOrNull(transcriptRawData['studentName'] ?? transcriptRawData['student_name'])
        : null;
      const transcriptStudentCode = transcriptRawData
        ? this.toStringOrNull(
            transcriptRawData['studentKey'] ??
              transcriptRawData['studentId'] ??
              transcriptRawData['userId'] ??
              transcriptRawData['user_id'],
          )
        : null;
      const transcriptClassName = transcriptRawData
        ? this.toStringOrNull(
            transcriptRawData['studentClass'] ??
              transcriptRawData['className'] ??
              transcriptRawData['class_name'],
          )
        : null;

      const SPEECH_SPEAKERS = new Set<string>([
        'user',
        'assistant',
        'provider',
        'sbar_report',
        'student_team_comm',
      ]);

      const speechRawEvents = sortedEvents.filter((evt) => {
        const normalized = this.normalizeSpeaker(evt.speaker ?? evt.type);
        return SPEECH_SPEAKERS.has(normalized);
      });

      const messages = this.mapToTranscriptMessages(speechRawEvents, scenarioStartMs);
      const summaryEntries = this.extractSummaryEntries(rawData, scenarioStartMs);
      const commonActions = this.extractCommonActions(rawData);

      const modeRaw = this.toStringOrNull(
        rawData['mode'] ??
          rawData['reportMode'] ??
          rawData['attemptMode'] ??
          rawData['attempt_mode'],
      );
      const mode: string | null = modeRaw
        ? /practice/i.test(modeRaw)
          ? 'Practice'
          : 'Assessment'
        : null;

      const header: TranscriptHeaderDto = {
        studentName:
          studentRow?.student_name ??
          report.studentName ??
          fallbackStudentName ??
          transcriptStudentName ??
          'Unknown',
        studentCode:
          studentRow?.student_id ??
          fallbackStudentCode ??
          transcriptStudentCode ??
          report.studentId ??
          '',
        className: studentRow?.class_name ?? fallbackClassName ?? transcriptClassName ?? '',
        simulationName,
        simulationType,
        mode,
        attemptId: report.id,
        realDate,
        realTime,
        simulationDate: simulationDateRaw,
        simulationTime: simulationTimeRaw,
        totalDuration,
      };

      return {
        success: true,
        message: SimulationReportConstants.MESSAGES.TRANSCRIPT_FETCHED,
        data: { header, messages, summaryEntries, commonActions, scenarioStartMs },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch transcript';
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  buildReportPdf(studentName: string, studentCode: string, reports: SimulationReportRow[]): Buffer {
    const lines: string[] = [
      `%PDF-1.4`,
      `1 0 obj<</Type /Catalog /Pages 2 0 R>>endobj`,
      `2 0 obj<</Type /Pages /Kids [3 0 R] /Count 1>>endobj`,
      `3 0 obj<</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]`,
      `/Contents 4 0 R /Resources <</Font <</F1 <</Type /Font /Subtype /Type1 /BaseFont /Helvetica>>>>>>>>endobj`,
    ];

    const bodyLines: string[] = [
      `BT /F1 14 Tf 50 750 Td (Simulation Report) Tj`,
      `0 -25 Td /F1 11 Tf (Student: ${studentName}) Tj`,
      `0 -20 Td (Student Code: ${studentCode}) Tj`,
      `0 -20 Td (Total Simulations: ${reports.length}) Tj`,
      `0 -30 Td /F1 10 Tf`,
    ];

    let yOffset = 0;
    reports.forEach((r, i) => {
      const scenarioId = r.scenarioId ?? 'Unknown';
      const overallScore = extractOverallScoreFromRow(r);
      const score = overallScore !== null ? String(overallScore) : '-';
      const time = r.totalTimeSeconds !== null ? String(r.totalTimeSeconds) : '-';
      const date = r.createdAt ? String(r.createdAt) : '-';
      bodyLines.push(
        `${yOffset === 0 ? '' : `0 -10 Td`}0 -20 Td (${i + 1}. Scenario: ${scenarioId}) Tj`,
      );
      bodyLines.push(`0 -15 Td (   Score: ${score}   Time: ${time}s   Date: ${date}) Tj`);
      yOffset++;
    });

    bodyLines.push('ET');
    const body = bodyLines.join('\n');

    lines.push(`4 0 obj<</Length ${body.length}>>`);
    lines.push(`stream`);
    lines.push(body);
    lines.push(`endstream endobj`);
    lines.push(`xref trailer <</Root 1 0 R>> %%EOF`);

    return Buffer.from(lines.join('\n'), 'utf-8');
  }

  async getReportPdfByStudentId(studentId: string): Promise<ServiceResponse<Buffer>> {
    try {
      const { data, success, message, type } = await this.findByStudentId(studentId);
      if (!success) return { success: false, message: message!, type };

      const student = await this.studentRepo.findOne({
        where: { id: studentId },
        select: { student_id: true },
      });
      const studentName = 'Student';
      const studentCode = student?.student_id ?? studentId;

      const pdf = this.buildReportPdf(studentName, studentCode, data ?? []);

      return {
        success: true,
        message: SimulationReportConstants.MESSAGES.PDF_GENERATED,
        data: pdf,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate PDF';
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  async emailReportPdfByStudentId(
    studentId: string,
    toEmail: string,
  ): Promise<ServiceResponse<null>> {
    try {
      const pdfResult = await this.getReportPdfByStudentId(studentId);
      if (!pdfResult.success)
        return { success: false, message: pdfResult.message!, type: pdfResult.type };
      const studentName = 'Student';
      const recipientEmail = toEmail;

      if (!recipientEmail) {
        return {
          success: false,
          message: 'No email address available for this student',
          type: ErrorTypes.BAD_REQUEST,
        };
      }

      const mailOptions = {
        to: recipientEmail,
        subject: `Simulation Report — ${studentName}`,
        template: 'batch-email',
        context: {
          subject: `Simulation Report for ${studentName}`,
          message: 'Please find your simulation report attached as a PDF.',
          studentName,
          className: '',
          accessCode: '',
        },
        attachments: [
          {
            filename: `simulation-report-${studentName.replace(/\s+/g, '-').toLowerCase()}.pdf`,
            content: pdfResult.data!,
            contentType: 'application/pdf',
          },
        ],
      };

      try {
        await this.mailService.sendMail(mailOptions);
        return {
          success: true,
          message: SimulationReportConstants.MESSAGES.EMAIL_SENT,
          data: null,
        };
      } catch (sendError) {
        // This path is user-initiated (an interactive "email me this
        // report" request), so respond immediately with "queued" rather
        // than a hard failure — mailRetryService.enqueue() takes over
        // delivery in the background and never throws, so it's safe to
        // await here without its own try/catch.
        this.logger.error(
          `[emailReportPdfByStudentId] send failed for student=${studentId}: ${
            sendError instanceof Error ? sendError.message : String(sendError)
          }`,
        );
        await this.mailRetryService.enqueue(
          mailOptions,
          `emailReportPdfByStudentId:student=${studentId}`,
        );
        return {
          success: true,
          message: SimulationReportConstants.MESSAGES.EMAIL_QUEUED_FOR_RETRY,
          data: null,
        };
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : SimulationReportConstants.MESSAGES.EMAIL_FAILED;
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  async markAsViewed(id: string, educatorId: string): Promise<ServiceResponse<SimulationReport>> {
    try {
      const report = await this.reportRepo.findAccessibleById(id, educatorId);
      if (!report) {
        return {
          success: false,
          message: SimulationReportConstants.MESSAGES.NOT_FOUND,
          type: ErrorTypes.NOT_FOUND,
        };
      }

      if (!report.viewedAt) {
        await this.reportRepo.update(id, {
          viewedAt: new Date(),
          viewedBy: educatorId,
        });
      }

      const updated = await this.reportRepo.findOne({ where: { id } });
      return {
        success: true,
        message: SimulationReportConstants.MESSAGES.MARKED_VIEWED,
        data: updated!,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to mark report as viewed';
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  /**
   * Mark/unmark a scoped selection of reports reviewed in one atomic write.
   * Ids that don't exist and ids outside the caller's owned/co-instructed
   * classes are both reported the same way, as `notAccessibleIds`.
   */
  async bulkReview(
    currentUser: ICurrentUser,
    dto: BulkReviewReportsReqDto,
  ): Promise<ResponseResult<BulkReviewResult>> {
    try {
      const rows = await this.reportRepo.bulkReview({
        selectorType: dto.type,
        ids: dto.ids,
        reviewed: dto.reviewed,
        educatorId: currentUser.educatorId as string,
      });

      const selectorField: Record<SimulationReportSelectorType, keyof (typeof rows)[number]> = {
        [SimulationReportSelectorType.REPORT]: 'id',
        [SimulationReportSelectorType.STUDENT]: 'student_id',
        [SimulationReportSelectorType.SIMULATION]: 'scenario_id',
        [SimulationReportSelectorType.CLASS]: 'class_id',
      };
      const matchedSelectorIds = new Set(rows.map((row) => row[selectorField[dto.type]]));

      return new ResponseResult({
        message: SimulationReportConstants.MESSAGES.BULK_REVIEW_COMPLETED,
        data: {
          updatedIds: [...new Set(rows.map((row) => row.id))],
          notAccessibleIds: [...new Set(dto.ids.filter((id) => !matchedSelectorIds.has(id)))],
        },
      });
    } catch (error) {
      return handleError(error);
    }
  }

  async getAttentionMetadataByClass(
    classId: string,
  ): Promise<ServiceResponse<ClassAttentionMetadata>> {
    try {
      const rows = await this.reportRepo.getAttentionCountsByClass(classId);

      const reportCount = parseInt(rows[0]?.report_count ?? '0', 10);
      const unreadReportCount = parseInt(rows[0]?.unread_count ?? '0', 10);

      return {
        success: true,
        message: SimulationReportConstants.MESSAGES.ATTENTION_FETCHED,
        data: {
          classId,
          reportCount,
          unreadReportCount,
          needsAttention: reportCount > 0 && unreadReportCount > 0,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch attention metadata';
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  async getClassesNeedingAttention(
    educatorId: string,
  ): Promise<ServiceResponse<ClassAttentionMetadata[]>> {
    try {
      const rows = await this.reportRepo.getAttentionCountsByEducator(educatorId);

      const data: ClassAttentionMetadata[] = rows.map((r) => {
        const reportCount = parseInt(r.report_count, 10);
        const unreadReportCount = parseInt(r.unread_count, 10);
        return {
          classId: r.class_id,
          reportCount,
          unreadReportCount,
          needsAttention: reportCount > 0 && unreadReportCount > 0,
        };
      });

      return {
        success: true,
        message: SimulationReportConstants.MESSAGES.ATTENTION_FETCHED,
        data,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to fetch classes needing attention';
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  async handleStudentReportCompletion(
    pathStudentId: string,
    dto: StudentReportCompletionDto,
    jwtUser?: { ltiLaunch?: { simulationId?: string; resourceLinkId?: string; classId?: string } },
  ): Promise<
    ServiceResponse<{
      reportId: string;
      scenarioId: string;
      gradePassbackTriggered: boolean;
    }>
  > {
    try {
      const student = await this.resolveStudentByPathId(pathStudentId);
      if (!student?.id) {
        return {
          success: false,
          message: 'Student not found',
          type: ErrorTypes.NOT_FOUND,
        };
      }

      const scenarioId = dto.scenarioId.trim();

      // Issue #1: Enforce LTI simulation lock on grade passback submission
      // If student was locked to a specific simulation via LTI launch, they can't submit grades for a different simulation
      if (jwtUser?.ltiLaunch?.simulationId && jwtUser.ltiLaunch.simulationId !== scenarioId) {
        this.logger.warn(
          `Denying grade submission — LTI launch locked student to simulation=${jwtUser.ltiLaunch.simulationId}, attempted scenarioId=${scenarioId}`,
        );
        return {
          success: false,
          message: 'You can only submit grades for the simulation linked to your LMS activity',
          type: ErrorTypes.FORBIDDEN,
        };
      }

      const studentName =
        typeof dto.studentName === 'string' && dto.studentName.trim()
          ? dto.studentName.trim()
          : undefined;

      const effectiveReportId =
        typeof dto.reportId === 'string' && dto.reportId.trim()
          ? dto.reportId.trim()
          : `report_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

      if (dto.isEarlyCompletion) {
        // Forfeit lives on Simulation Progress (ADR-0010): no placeholder Report, no stats sync.
        await this.progressRepo.forfeit(student.id, scenarioId);
        if (student?.student_id) {
          this.notificationsGateway.notifyStudentSimulationsUpdated(student.student_id, scenarioId);
        }
      }

      await this.notifyEducatorReportAvailable(
        student.id,
        scenarioId,
        studentName,
        true,
        effectiveReportId,
      );

      let gradePassbackTriggered = false;
      const overallScore = await this.resolveAuthoritativeReportScore(
        effectiveReportId,
        scenarioId,
        student,
      );
      if (overallScore !== null) {
        gradePassbackTriggered = true;
        // Push the best Assessment attempt so a lower re-take cannot overwrite Canvas.
        const scoreToPush = await this.resolveBestAssessmentScoreForPassback(
          scenarioId,
          student,
          overallScore,
        );

        // Issue #2: Thread resourceLinkId from JWT to enable priority lookup in grade passback
        const resourceLinkId = jwtUser?.ltiLaunch?.resourceLinkId;
        void this.submitGradePassback(
          student.id,
          scenarioId,
          scoreToPush,
          resourceLinkId,
          false,
          effectiveReportId,
        ).catch((err) =>
          this.logger.error(
            `[handleStudentReportCompletion] grade passback error: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
        void this.submitGoogleGradePassback(student.id, scenarioId, scoreToPush).catch((err) =>
          this.logger.error(
            `[handleStudentReportCompletion] Google Classroom grade passback error: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
      } else {
        this.logger.warn(
          `[handleStudentReportCompletion] No authoritative score for report ${effectiveReportId}`,
        );
      }

      return {
        success: true,
        message: 'Simulation completion processed successfully',
        data: {
          reportId: effectiveReportId,
          scenarioId,
          gradePassbackTriggered,
        },
      };
    } catch (error) {
      if (error instanceof ConflictException) {
        return { success: false, message: error.message, type: ErrorTypes.CONFLICT };
      }
      const message =
        error instanceof Error ? error.message : 'Failed to process simulation completion';
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  /** Grade passback must use stored report scores — not client-supplied completion payload. */
  private async resolveAuthoritativeReportScore(
    reportId: string,
    scenarioId: string,
    student: Student,
  ): Promise<number | null> {
    const trimmedReportId = reportId.trim();
    if (!trimmedReportId) {
      return null;
    }

    const row = await this.reportRepo.findOwnedScoreRowByIdOrReportId(trimmedReportId);
    if (!row) {
      return null;
    }
    if (row.studentId !== student.id) {
      this.logger.warn(
        `[Grade Passback] Report ${trimmedReportId} does not belong to student ${student.student_id ?? student.id}`,
      );
      return null;
    }
    if (row.scenarioId !== scenarioId) {
      this.logger.warn(
        `[Grade Passback] Report ${trimmedReportId} scenario mismatch (expected ${scenarioId})`,
      );
      return null;
    }
    if (isPracticeReport(row.mode)) {
      this.logger.debug(
        `[Grade Passback] Skipping practice report ${trimmedReportId} for LMS sync`,
      );
      return null;
    }
    return extractOverallScoreFromRow(row);
  }

  /**
   * LMS gradebook should keep the student's best Assessment score across attempts,
   * not necessarily the most recent attempt.
   */
  private async resolveBestAssessmentScoreForPassback(
    scenarioId: string,
    student: Student,
    currentAttemptScore: number,
  ): Promise<number> {
    const bestFromHistory = await this.findBestAssessmentScore(scenarioId, student);
    const best =
      bestFromHistory === null
        ? currentAttemptScore
        : Math.max(bestFromHistory, currentAttemptScore);

    if (best !== currentAttemptScore) {
      this.logger.log(
        `[Grade Passback] Using best Assessment score ${best} (current attempt ${currentAttemptScore}) for student ${
          student.student_id ?? student.id
        } scenario ${scenarioId}`,
      );
    }

    return best;
  }

  private async resolveStudentByPathId(studentId: string): Promise<Student | null> {
    const trimmed = studentId.trim();
    if (!trimmed) return null;

    const isValidUuid = this.UUID_REGEX.test(trimmed);

    return this.studentRepo.findOne({
      where: isValidUuid ? [{ id: trimmed }, { student_id: trimmed }] : [{ student_id: trimmed }],
      relations: ['class', 'educator'],
    });
  }

  /** @deprecated Prefer handleStudentReportCompletion with the report payload. */
  async updateReportStatusByStudentId(
    studentId?: string,
  ): Promise<ServiceResponse<SimulationReportRow[]>> {
    try {
      const scenarios = await this.simulationV2Repo.findAllWithoutChildrenJoined();
      const simulationSourceMessage = 'Scenario data loaded from the database';

      const student = studentId ? await this.resolveStudentByPathId(studentId) : null;
      const reports = student?.id
        ? await this.reportRepo.findAttemptRowsByStudentId(student.id)
        : [];

      if (student?.id && reports.length > 0) {
        await this.notifyLatestReportForStudent(student.id);
      }

      return {
        success: true,
        message: `Reports loaded from the database ${reports.length} report(s) and ${simulationSourceMessage} ${scenarios.length} scenario(s) successfully.`,
        data: reports,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to refresh reports from the database';
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  /**
   * This endpoint is called right after a single new report is created, so only the most recent
   * Attempt is notified, to avoid re-firing notifications for every earlier one.
   */
  private async notifyLatestReportForStudent(studentId: string): Promise<void> {
    const latest = await this.reportRepo.findLatestAttemptNotificationRow(studentId);
    const scenarioId = latest?.scenarioId?.trim();
    if (!latest || !scenarioId) return;

    const studentName = latest.studentName?.trim() || undefined;
    const reportId = latest.reportId?.trim() || undefined;

    await this.notifyEducatorReportAvailable(studentId, scenarioId, studentName, true, reportId);
  }

  async updateSimulationFromBlob(): Promise<ServiceResponse<Record<string, unknown>[]>> {
    try {
      const scenarios = await this.simulationV2Repo.findAllWithoutChildrenJoined();

      return {
        success: true,
        message: `Scenario data loaded from the database ${scenarios.length} scenario(s) loaded successfully.`,
        data: scenarios as unknown as Record<string, unknown>[],
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to refresh scenarios from the database';
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  /**
   * Push a grade to the LMS via AGS.
   *
   * Priority 1: If resourceLinkId is provided, use it for exact mapping lookup.
   * Priority 2: Fall back to (classId, simulationId) lookup for backwards compatibility.
   */
  private async submitGradePassback(
    studentId: string,
    scenarioId: string,
    overallScore: number,
    resourceLinkId?: string,
    force = false,
    reportBlobId?: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const student = await this.dataSource.manager.findOne(Student, {
        where: { id: studentId },
        relations: ['class'],
      });
      if (!student?.class?.id) {
        this.logger.debug(`[Grade Passback] Student ${studentId} has no class`);
        return { success: false, error: 'Student has no class' };
      }

      const mapping = await this.lmsAssignmentService.findMapping(
        student.class.id,
        scenarioId,
        resourceLinkId,
      );
      if (!mapping) {
        this.logger.debug(
          `[Grade Passback] No LMS assignment mapping for class=${student.class.id} scenario=${scenarioId} resourceLink=${resourceLinkId ?? 'none'}`,
        );
        return { success: false, error: 'No LMS assignment mapping for this simulation' };
      }

      const lmsMapping = await this.dataSource.manager.findOne(LmsStudentMapping, {
        where: {
          classId: student.class.id,
          studentCode: student.student_id,
        },
      });
      if (!lmsMapping?.lmsUserId) {
        this.logger.warn(
          `[Grade Passback] No LMS user mapping for student ${student.student_id} in class ${student.class.id}`,
        );
        return { success: false, error: 'No LMS user mapping for this student' };
      }

      // Guard against incomplete blob history: never push below the last successful
      // Canvas/Moodle sync, and skip redundant AGS POSTs when the score did not improve.
      const lastSuccessfulScore = await this.lmsGradeService.getLastSuccessfulScore(
        mapping.id,
        studentId,
      );
      const scoreToSend =
        lastSuccessfulScore === null ? overallScore : Math.max(overallScore, lastSuccessfulScore);

      if (!force && lastSuccessfulScore !== null && scoreToSend <= lastSuccessfulScore) {
        this.logger.log(
          `[Grade Passback] Skipping AGS POST — score ${scoreToSend} <= last successful sync ${lastSuccessfulScore} for student ${student.student_id}`,
        );
        return { success: true };
      }

      const result = await this.lmsGradeService.submitScore({
        mappingId: mapping.id,
        schoolId: mapping.schoolId,
        lineItemUrl: mapping.lmsLineItemUrl,
        lmsUserId: lmsMapping.lmsUserId,
        scoreGiven: scoreToSend,
        scoreMaximum: 100,
        studentId,
        studentCode: student.student_id,
        lineItemLabel: mapping.lmsLineItemLabel,
        lmsResourceLinkId: mapping.lmsResourceLinkId,
        reportBlobId,
      });

      if (!result.success) {
        this.logger.error(
          `[Grade Passback] LMS rejected score ${scoreToSend} for student ${student.student_id}: ${result.error ?? 'unknown'}`,
        );
        await this.notifyEducatorGradeSyncFailed(studentId, scenarioId);
        return { success: false, error: result.error };
      }

      this.logger.log(
        `[Grade Passback] Submitted score ${scoreToSend} for student ${student.student_id} to LMS (syncLogId=${result.syncLogId})`,
      );
      return { success: true };
    } catch (err) {
      this.logger.error(
        `[Grade Passback] Failed for student=${studentId} scenario=${scenarioId}: ${(err as Error).message}`,
        (err as Error).stack,
      );
      return { success: false, error: (err as Error).message };
    }
  }

  async getLmsGradeSyncStatuses(
    user: JwtRequest['user'],
    classId: string,
  ): Promise<ServiceResponse<LmsGradeSyncStatus[]>> {
    try {
      const message = SimulationReportConstants.MESSAGES.LMS_SYNC_STATUS_FETCHED;
      const [canAccess, classMapping] = await Promise.all([
        this.canManageClassLmsGrades(user, classId),
        this.dataSource.manager.findOne(LmsClassMapping, {
          where: { classId },
          select: { id: true },
        }),
      ]);
      // Empty list instead of 403: the frontend API interceptor logs the user out on any 403.
      if (!canAccess || !classMapping) {
        return { success: true, message, data: [] };
      }

      const mappings = await this.lmsAssignmentService.findByClass(classId);
      const simulationIdByMappingId = new Map(
        mappings.flatMap((m) => (m.simulationId ? [[m.id, m.simulationId] as const] : [])),
      );
      const logs = await this.lmsGradeService.findLatestSyncLogs([
        ...simulationIdByMappingId.keys(),
      ]);
      logs.sort((a, b) => new Date(b.attemptedAt).getTime() - new Date(a.attemptedAt).getTime());

      const latest = new Map<string, LmsGradeSyncStatus>();
      for (const log of logs) {
        const simulationId = simulationIdByMappingId.get(log.mappingId);
        const key = `${simulationId}:${log.studentId}`;
        if (!simulationId || latest.has(key)) {
          continue;
        }
        const failed = log.status !== 'sent';
        latest.set(key, {
          simulationId,
          studentId: log.studentId,
          status: failed ? 'failed' : 'sent',
          ...(failed ? { failureReason: toLmsSyncFailureReason(log.errorMessage) } : {}),
        });
      }

      return { success: true, message, data: [...latest.values()] };
    } catch (error) {
      this.logger.error(
        `[LMS Grade Sync] Failed to load sync status for class ${classId}: ${(error as Error).message}`,
        (error as Error).stack,
      );
      return {
        success: false,
        message: SimulationReportConstants.MESSAGES.LMS_SYNC_STATUS_FAILED,
        type: ErrorTypes.BAD_REQUEST,
      };
    }
  }

  async resyncLmsGrade(
    user: JwtRequest['user'],
    classId: string,
    dto: ResyncLmsGradeDto,
  ): Promise<ServiceResponse<LmsGradeSyncStatus>> {
    const { MESSAGES } = SimulationReportConstants;
    try {
      // 404 instead of 403: the frontend API interceptor logs the user out on any 403.
      if (!(await this.canManageClassLmsGrades(user, classId))) {
        return {
          success: false,
          message: MESSAGES.LMS_CLASS_ACCESS_DENIED,
          type: ErrorTypes.NOT_FOUND,
        };
      }

      const student = await this.studentRepo.findOne({
        where: { id: dto.studentId },
        relations: ['class'],
      });
      if (!student || student.class?.id !== classId) {
        return {
          success: false,
          message: MESSAGES.LMS_STUDENT_NOT_IN_CLASS,
          type: ErrorTypes.NOT_FOUND,
        };
      }

      const bestScore = await this.findBestAssessmentScore(dto.scenarioId, student);
      if (bestScore === null) {
        return {
          success: false,
          message: MESSAGES.LMS_NO_ASSESSMENT_SCORE,
          type: ErrorTypes.BAD_REQUEST,
        };
      }

      const result = await this.submitGradePassback(
        dto.studentId,
        dto.scenarioId,
        bestScore,
        undefined,
        true,
      );
      if (!result.success) {
        return {
          success: false,
          message: MESSAGES.LMS_RESYNC_FAILED,
          type: ErrorTypes.BAD_REQUEST,
        };
      }

      return {
        success: true,
        message: MESSAGES.LMS_GRADE_RESYNCED,
        data: { simulationId: dto.scenarioId, studentId: dto.studentId, status: 'sent' },
      };
    } catch (error) {
      this.logger.error(
        `[LMS Grade Sync] Resync failed for student ${dto.studentId} scenario ${dto.scenarioId}: ${(error as Error).message}`,
        (error as Error).stack,
      );
      return { success: false, message: MESSAGES.LMS_RESYNC_FAILED, type: ErrorTypes.BAD_REQUEST };
    }
  }

  private async canManageClassLmsGrades(
    user: JwtRequest['user'],
    classId: string,
  ): Promise<boolean> {
    const userId = String(user?.educatorId ?? '').trim();
    const roles = user?.roles ?? [];
    if (!userId) {
      return false;
    }

    const classEntity = await this.classRepo.findOne({ where: { id: classId, is_active: true } });
    if (!classEntity) {
      return false;
    }

    if (roles.includes(RoleSlug.DISTRICT_ADMIN)) {
      if (!classEntity.school_id) {
        return false;
      }
      const educator = await loadEducatorForSchoolCheck(this.dataSource.manager, userId);
      return educatorBelongsToSchool(educator, classEntity.school_id);
    }

    if (!roles.includes(RoleSlug.EDUCATOR)) {
      return false;
    }
    if (classEntity.educator_id === userId) {
      return true;
    }
    const coTeacher = await this.dataSource.manager.findOne(ClassEducator, {
      where: { classId, educatorId: userId },
    });
    return !!coTeacher;
  }

  private async findBestAssessmentScore(
    scenarioId: string,
    student: Student,
  ): Promise<number | null> {
    if (!student.id) return null;
    let rows: ReportScoreModeRow[];
    try {
      rows = await this.reportRepo.findScoreRowsByStudentAndScenario(student.id, scenarioId);
    } catch (err) {
      this.logger.warn(
        `[Grade Passback] Failed loading prior attempts for best-score selection: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
    let best: number | null = null;
    for (const row of rows) {
      if (isPracticeReport(row.mode)) continue;
      const score = extractOverallScoreFromRow(row);
      if (score !== null && (best === null || score > best)) best = score;
    }
    return best;
  }

  private async submitGoogleGradePassback(
    studentId: string,
    scenarioId: string,
    overallScore: number,
  ): Promise<void> {
    try {
      const result = await this.googleGradePassbackService.submitScore({
        studentId,
        scenarioId,
        scoreGiven: overallScore,
        scoreMaximum: 100,
      });
      if (!result.success && !result.skipped) {
        this.logger.error(
          `[Google Grade Passback] Failed score ${overallScore} for student ${studentId}: ${result.error ?? 'unknown'}`,
        );
        await this.notifyEducatorGradeSyncFailed(studentId, scenarioId);
      }
    } catch (err) {
      this.logger.error(
        `[Google Grade Passback] Failed for student=${studentId} scenario=${scenarioId}: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  /** RE-192: flat, paginated, filterable report listing — follows `findClasses`' filter-object
   * + `getPagination()` pattern (`src/class/classes.service.ts`). */
  async findReports(
    currentUser: ICurrentUser,
    dto: ListReportsReqDto,
  ): Promise<ResponseResult<ListReportsResDto[], IPaginationMeta>> {
    try {
      assertEducator(currentUser);

      const { page, pageSize, skip, take } = getPagination({
        page: dto.page,
        pageSize: dto.pageSize,
      });
      const filters = {
        studentIds: dto.studentIds,
        classIds: dto.classIds,
        schoolIds: dto.schoolIds,
        simulationIds: dto.simulationIds,
        reviewStatus: dto.reviewStatus,
      };
      const sort = {
        field: dto.sortBy ?? SimulationReportListingConstants.DEFAULT_SORT.FIELD,
        direction: dto.sortBy
          ? (dto.sortDirection ?? SimulationReportListingConstants.DEFAULT_SORT.DIRECTION)
          : SimulationReportListingConstants.DEFAULT_SORT.DIRECTION,
      };

      const { rows, total } = await this.reportRepo.findReportsForListing(
        currentUser.educatorId,
        filters,
        sort,
        { skip, take },
      );

      return new ResponseResult({
        message: SUCCESS_MSG.COMMON.FETCHED('Reports'),
        data: rows.map((row) => this.toListReportsResDto(row)),
        meta: buildPaginationMeta(total, page, pageSize),
      });
    } catch (error) {
      return handleError(error);
    }
  }

  private toListReportsResDto(row: IReportListingRawRow): ListReportsResDto {
    return {
      reportId: row.reportId,
      studentCode: row.studentCode,
      mode: row.mode,
      simulationName: row.simulationName,
      score: extractOverallScoreFromRow(row),
      performanceQuality: extractPerformanceQualityFromRow(row),
      timeSpent: formatTimeSpentFromRow(row),
      completedAt: row.completedAt.toISOString(),
      transcriptId: row.transcriptId,
      viewedAt: row.viewedAt ? row.viewedAt.toISOString() : null,
      viewedBy: row.viewedBy,
    };
  }
}
