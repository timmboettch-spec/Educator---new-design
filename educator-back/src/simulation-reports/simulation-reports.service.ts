import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, FindOptionsWhere, In, Repository } from 'typeorm';
import { SimulationReport } from './entity/simulation-report.entity';
import {
  CreateSimulationReportDto,
  ClassAttentionMetadata,
  TranscriptEventDto,
  TranscriptHeaderDto,
  TranscriptMessageDto,
  TranscriptSpeaker,
  SummaryEntryDto,
  CommonActionDto,
  UserTranscriptResponseDto,
} from './dto/simulation-report.dto';
import { BlobScenario, ReportData, ServiceResponse } from 'src/common/types';
import { ErrorTypes } from 'src/common/utils/messages';
import { SimulationReportConstants } from './simulation-reports.constant';
import { TutorPatientService } from 'src/common/utils/tutor-patient.service';
import { MailService } from 'src/mail/mail.service';
import { NotificationsGateway } from 'src/notifications/notifications.gateway';
import {
  Notification,
  NotificationType,
  RecipientType,
} from 'src/notifications/entity/notification.entity';
import { Student } from 'src/students/entity/students.entity';
import { Class } from 'src/class/entity/class.entity';
import { Simulation } from 'src/simulations/entity/simulation.entity';
import { ClassSimulation } from 'src/class-simulations/entity/class-simulation.entity';
import { Educator } from 'src/educators/entity/educator.entity';
import { RedisService } from 'src/redis/redis.service';

const TOTAL_ALLOCATED_SECONDS = 400 * 3600;
const REPEAT_ALLOWED_STUDENT_CODES = new Set(['85170719']);
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
  private readonly logger = new Logger(SimulationReportsService.name);

  private isRepeatAllowedStudent(studentCode?: string | null): boolean {
    return !!studentCode && REPEAT_ALLOWED_STUDENT_CODES.has(studentCode);
  }

  constructor(
    @InjectRepository(SimulationReport)
    private readonly reportRepo: Repository<SimulationReport>,
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    private readonly dataSource: DataSource,
    private readonly tutorPatientService: TutorPatientService,
    private readonly mailService: MailService,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {}

  private get studentRepo(): Repository<Student> {
    return this.dataSource.getRepository(Student);
  }

  private get classRepo(): Repository<Class> {
    return this.dataSource.getRepository(Class);
  }

  private get simulationRepo(): Repository<Simulation> {
    return this.dataSource.getRepository(Simulation);
  }

  private get classSimulationRepo(): Repository<ClassSimulation> {
    return this.dataSource.getRepository(ClassSimulation);
  }

  private get educatorRepo(): Repository<Educator> {
    return this.dataSource.getRepository(Educator);
  }

  private clampTake(take?: number): number | undefined {
    if (take === undefined || !Number.isFinite(take)) return undefined;
    return Math.max(1, Math.min(MAX_FIND_ALL_TAKE, Math.floor(take)));
  }

  private async notifyEducatorReportAvailable(
    studentId: string,
    scenarioId: string,
    fallbackStudentName?: string,
    skipIfAlreadyNotified = false,
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
      if (dismissed) return;

      // INCR is atomic — only the caller that gets 1 proceeds; all others skip.
      const dedupKey = `notif:sent:educator:${educatorId}:${studentId}:${scenarioId}`;
      const count = await this.redisService.increment(dedupKey, 86400);
      if (count !== 1) return;
    }

    const classId = student.class?.id ?? student.class_id ?? '';
    const className = student.class?.class_name ?? classId;
    const simulation = await this.simulationRepo.findOne({ where: { id: scenarioId } });

    const studentName = fallbackStudentName || studentId;
    const simulationTitle = simulation?.title || scenarioId;

    this.logger.log(
      `[notifyEducatorReportAvailable] firing → educator=${educatorId} student=${studentId} scenario=${scenarioId} simulation="${simulationTitle}"`,
    );

    const metadata = { studentId, classId, className, scenarioId };
    await this.notificationsGateway.notifyEducatorStudentReportAvailable(
      educatorId,
      studentName,
      simulationTitle,
      metadata,
    );

    try {
      const educator = await this.educatorRepo.findOne({
        where: { id: educatorId },
        relations: ['admin', 'school', 'school.user_id'],
      });

      // Always send email to educator
      if (educator?.email) {
        const logoUrl = this.configService.get<string>('EMAIL_LOGO_URL') ?? '';
        this.mailService
          .sendMail({
            to: educator.email,
            subject: `Student Report Available — ${simulationTitle}`,
            template: 'report-available',
            context: {
              educatorName: educator.full_name?.trim() || educator.email,
              studentName,
              simulationTitle,
              className,
              logoUrl,
            },
          })
          .catch((err: unknown) =>
            this.logger.error(
              `[notifyEducatorReportAvailable] email failed for educator=${educatorId}: ${
                err instanceof Error ? err.message : String(err)
              }`,
            ),
          );
      }

      const adminId = educator?.admin?.id ?? educator?.school?.user_id?.id ?? null;
      const adminEmail = educator?.admin?.email ?? educator?.school?.user_id?.email ?? null;
      // Only notify admin when their email matches the educator's email (same account)
      if (adminId && adminEmail && adminEmail.toLowerCase() === educator?.email?.toLowerCase()) {
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

  private getScenarioIdFromReport(report: SimulationReport): string | null {
    const raw = report as unknown as Record<string, unknown>;
    const scenarioId = raw['scenario_id'] ?? raw['scenarioId'];
    return typeof scenarioId === 'string' && scenarioId.trim() ? scenarioId : null;
  }

  private getStudentNameFromReport(report: SimulationReport): string | undefined {
    const raw = report as unknown as Record<string, unknown>;
    const candidate = raw['student_name'] ?? raw['studentName'] ?? raw['userName'];
    return typeof candidate === 'string' && candidate.trim() ? candidate : undefined;
  }

  private async notifyBlobReportsOnce(blobReports: SimulationReport[]): Promise<void> {
    for (const report of blobReports) {
      if (!report.student_id) continue;
      const scenarioId = this.getScenarioIdFromReport(report);
      if (!scenarioId) continue;

      await this.notifyEducatorReportAvailable(
        report.student_id,
        scenarioId,
        this.getStudentNameFromReport(report),
        true,
      );
    }
  }

  private async loadBlobReports(): Promise<Record<string, unknown>[]> {
    return (await this.tutorPatientService.getReports()) as Record<string, unknown>[];
  }

  private async loadReportsByStudentCode(studentCode: string): Promise<Record<string, unknown>[]> {
    const svc = this.tutorPatientService as unknown as {
      getReportsByStudentIds?: (
        ids: string[],
      ) => Promise<{ matched?: Record<string, unknown>[]; isMatch?: boolean }>;
    };

    if (typeof svc.getReportsByStudentIds === 'function') {
      const result = await svc.getReportsByStudentIds([studentCode]);
      return Array.isArray(result?.matched) ? result.matched : [];
    }

    const normalise = (s: string): string => s.toUpperCase().replace(/[-_ ]/g, '');
    const target = normalise(studentCode);
    const allReports = await this.loadBlobReports();
    return allReports.filter((r) => {
      const code = (r['userId'] ?? r['student_id'] ?? r['studentId']) as string | undefined;
      return typeof code === 'string' && normalise(code) === target;
    });
  }

  //TODO: To be moved to migration file
  onModuleInit(): void {
    void this.backfillTimeRemaining();
  }

  private async backfillTimeRemaining(): Promise<void> {
    const rows = await this.studentRepo
      .createQueryBuilder('s')
      .select(['s.id AS id', 's.time_spent AS time_spent'])
      .where('s.time_spent IS NOT NULL')
      .andWhere(`s.time_spent <> ''`)
      .andWhere(
        new Brackets((qb) =>
          qb.where('s.time_remaining IS NULL').orWhere(`s.time_remaining = '-'`),
        ),
      )
      .getRawMany<{ id: string; time_spent: string | null }>();

    for (const row of rows) {
      const parts = (row.time_spent ?? '').split(':').map(Number);
      if (parts.length !== 3 || parts.some(isNaN)) continue;
      const spentSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
      const remaining = Math.max(0, TOTAL_ALLOCATED_SECONDS - spentSeconds);
      const rh = Math.floor(remaining / 3600);
      const rm = Math.floor((remaining % 3600) / 60);
      const rs = remaining % 60;
      const timeRemaining = `${String(rh).padStart(2, '0')}:${String(rm).padStart(2, '0')}:${String(rs).padStart(2, '0')}`;
      await this.studentRepo.update(row.id, { time_remaining: timeRemaining });
    }
  }

  private async validateStudent(student_id: string): Promise<{ class_id: string } | string> {
    const student = await this.studentRepo.findOne({
      where: { id: student_id },
      relations: ['class'],
    });
    if (!student?.class?.id) return `Student "${student_id}" not found`;
    return { class_id: student.class.id };
  }

  private async validateAssignment(class_id: string, scenario_id: string): Promise<string | null> {
    const assigned = await this.classSimulationRepo.exists({
      where: { class_id, simulation_id: scenario_id },
    });
    if (!assigned) return `Simulation "${scenario_id}" is not assigned to the student's class`;
    return null;
  }

  private async validate(student_id: string, scenario_id: string): Promise<string | null> {
    const studentResult = await this.validateStudent(student_id);
    if (typeof studentResult === 'string') return studentResult;
    return this.validateAssignment(studentResult.class_id, scenario_id);
  }

  private async syncStudentStats(student_id: string, report_data: ReportData): Promise<void> {
    const allReports = await this.reportRepo.find({
      where: { student_id },
      select: ['id', 'report_data'],
    });

    const totalSeconds = allReports.reduce((sum, r) => {
      const d = r.report_data as ReportData;
      return sum + (typeof d?.totalTimeSeconds === 'number' ? d.totalTimeSeconds : 0);
    }, 0);

    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    const timeSpent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

    const remainingSeconds = Math.max(0, TOTAL_ALLOCATED_SECONDS - totalSeconds);
    const rh = Math.floor(remainingSeconds / 3600);
    const rm = Math.floor((remainingSeconds % 3600) / 60);
    const rs = remainingSeconds % 60;
    const timeRemaining = `${String(rh).padStart(2, '0')}:${String(rm).padStart(2, '0')}:${String(rs).padStart(2, '0')}`;

    const score = typeof report_data?.score === 'number' ? report_data.score : null;
    const submissionDate =
      typeof report_data?.createdAt === 'string' ? report_data.createdAt : null;

    await this.studentRepo.update(student_id, {
      sims_completed: String(allReports.length),
      time_spent: timeSpent,
      time_remaining: timeRemaining,
      attempt: allReports.length,
      score: score ?? undefined,
      submission_date: submissionDate ?? undefined,
    });
  }

  async save(dto: CreateSimulationReportDto): Promise<ServiceResponse<SimulationReport>> {
    try {
      const error = await this.validate(dto.student_id, dto.scenario_id);
      if (error) return { success: false, message: error, type: ErrorTypes.BAD_REQUEST };

      const student = await this.studentRepo.findOne({ where: { id: dto.student_id } });
      const isRepeatAllowedStudent = this.isRepeatAllowedStudent(student?.student_id);

      const reportMode = (dto.report_data as Record<string, unknown>)['mode'] as string | undefined;
      const isAssessment = reportMode === 'Assessment';

      const duplicate = await this.reportRepo.findOne({
        where: { student_id: dto.student_id, scenario_id: dto.scenario_id },
      });
      if (duplicate) {
        if (isRepeatAllowedStudent) {
          duplicate.student_name = dto.student_name;
          duplicate.report_data = dto.report_data;
          const updated = await this.reportRepo.save(duplicate);

          await this.syncStudentStats(dto.student_id, dto.report_data);
          void this.notifyEducatorReportAvailable(
            dto.student_id,
            dto.scenario_id,
            dto.student_name,
          ).catch((err) =>
            this.logger.error(
              `[save] notification error: ${err instanceof Error ? err.message : String(err)}`,
            ),
          );
          if (student?.student_id && isAssessment) {
            this.notificationsGateway.notifyStudentSimulationsUpdated(
              student.student_id,
              dto.scenario_id,
            );
          }

          return {
            success: true,
            message: SimulationReportConstants.MESSAGES.SAVED,
            data: updated,
          };
        }

        return {
          success: false,
          message: `Report already exists for this student and simulation "${dto.scenario_id}"`,
          type: ErrorTypes.BAD_REQUEST,
        };
      }

      const saved = await this.reportRepo.save(
        this.reportRepo.create({
          student_id: dto.student_id,
          student_name: dto.student_name,
          scenario_id: dto.scenario_id,
          report_data: dto.report_data,
        }),
      );

      await this.syncStudentStats(dto.student_id, dto.report_data);
      void this.notifyEducatorReportAvailable(
        dto.student_id,
        dto.scenario_id,
        dto.student_name,
      ).catch((err) =>
        this.logger.error(
          `[save] notification error: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
      if (student?.student_id && isAssessment) {
        this.notificationsGateway.notifyStudentSimulationsUpdated(
          student.student_id,
          dto.scenario_id,
        );
      }

      return { success: true, message: SimulationReportConstants.MESSAGES.SAVED, data: saved };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save report';
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }
  async syncStats(student_id: string): Promise<ServiceResponse<null>> {
    try {
      const allReports = await this.reportRepo.find({
        where: { student_id },
        select: ['id', 'report_data'],
        order: { created_at: 'DESC' },
        take: 1,
      });
      if (!allReports.length) {
        return {
          success: false,
          message: SimulationReportConstants.MESSAGES.NOT_FOUND,
          type: ErrorTypes.NOT_FOUND,
        };
      }
      const latest = allReports[0];
      await this.syncStudentStats(student_id, latest.report_data);
      return { success: true, message: SimulationReportConstants.MESSAGES.SYNCED, data: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to sync stats';
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  async findAll(options: ReportQueryOptions = {}): Promise<ServiceResponse<SimulationReport[]>> {
    try {
      const take = this.clampTake(options.take ?? DEFAULT_FIND_ALL_TAKE) ?? DEFAULT_FIND_ALL_TAKE;
      const skip =
        options.skip !== undefined && Number.isFinite(options.skip)
          ? Math.max(0, Math.floor(options.skip))
          : 0;
      const data = await this.getMergedReports({
        ...options,
        take,
        skip,
        includeBlob: options.includeBlob ?? true,
      });

      const source = this.tutorPatientService.getReportSourceLabel();
      let successMessage: string;
      if (source === 'cache') {
        successMessage = 'Report fetched from local cache successfully';
      } else if (source === 'redis') {
        successMessage = 'Report fetched from redis successfully';
      } else if (source === 'memory-fallback') {
        successMessage = 'Report fetched from in-memory cache successfully';
      } else {
        successMessage = 'Report fetched from blob successfully';
      }
      return { success: true, message: successMessage, data };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch reports';
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  private async getMergedReports(options: ReportQueryOptions = {}): Promise<SimulationReport[]> {
    const where: FindOptionsWhere<SimulationReport> = {};
    const studentId = options.studentId?.trim();
    const scenarioId = options.scenarioId?.trim();
    if (studentId) where.student_id = studentId;
    if (scenarioId) where.scenario_id = scenarioId;

    const take = this.clampTake(options.take);
    const skip =
      options.skip !== undefined && Number.isFinite(options.skip)
        ? Math.max(0, Math.floor(options.skip))
        : undefined;

    const dbData = await this.reportRepo.find({
      where: Object.keys(where).length ? where : undefined,
      order: { created_at: 'DESC' },
      take,
      skip,
    });

    const includeBlob = options.includeBlob ?? true;
    if (!includeBlob || (skip !== undefined && skip > 0)) {
      return dbData;
    }

    const blobReports = await this.loadBlobReports();

    const normalise = (s: string): string => s.toUpperCase().replace(/[-_ ]/g, '');

    let studentCodeFilter: string | null = null;
    if (studentId) {
      const student = await this.studentRepo.findOne({
        where: { id: studentId },
        select: { student_id: true },
      });
      if (!student?.student_id) return dbData;
      studentCodeFilter = normalise(student.student_id);
    }

    const filteredBlob = blobReports.filter((raw) => {
      const rawScenario = raw['scenario_id'] ?? raw['scenarioId'];
      if (scenarioId && rawScenario !== scenarioId) return false;
      if (studentCodeFilter) {
        const rawCode = raw['userId'] ?? raw['student_id'] ?? raw['studentId'];
        if (typeof rawCode !== 'string' || normalise(rawCode) !== studentCodeFilter) return false;
      }
      return true;
    });

    const blobCodes = Array.from(
      new Set(
        filteredBlob
          .map((raw) => raw['userId'] ?? raw['student_id'] ?? raw['studentId'])
          .filter((code): code is string => typeof code === 'string' && code.trim().length > 0),
      ),
    );

    if (!blobCodes.length) return dbData;

    const studentRows = await this.studentRepo.find({
      where: { student_id: In(blobCodes) },
      select: { id: true, student_id: true },
    });
    const codeToUuid = new Map(
      studentRows
        .filter((row) => typeof row.id === 'string' && typeof row.student_id === 'string')
        .map((row): [string, string] => [normalise(row.student_id as string), row.id as string]),
    );

    const normalisedBlob = filteredBlob
      .map((r) => {
        const raw = r;
        const code = (raw['userId'] ?? raw['student_id'] ?? raw['studentId']) as string | undefined;
        const normCode = code ? normalise(code) : undefined;
        const uuid = normCode ? codeToUuid.get(normCode) : undefined;
        if (!uuid) return null;
        const createdAt = raw['created_at'] ?? raw['createdAt'] ?? null;
        return { ...raw, student_id: uuid, created_at: createdAt } as unknown as SimulationReport;
      })
      .filter((r): r is SimulationReport => r !== null);

    const seen = new Set(dbData.map((r) => `${r.student_id}__${r.scenario_id}`));
    const uniqueBlob = normalisedBlob.filter((r) => {
      const raw = r as unknown as Record<string, unknown>;
      const sid = (raw['scenario_id'] ?? raw['scenarioId'] ?? '') as string;
      return !seen.has(`${r.student_id}__${sid}`);
    });

    const limitedBlob =
      take !== undefined ? uniqueBlob.slice(0, Math.max(0, take - dbData.length)) : uniqueBlob;

    return [...dbData, ...limitedBlob];
  }

  async findByStudentId(input: string): Promise<ServiceResponse<SimulationReport[]>> {
    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input);
      let studentCode: string | null = null;
      let studentUuid: string | null = null;
      let dbData: SimulationReport[] = [];

      if (isUuid) {
        studentUuid = input;
        const student = await this.studentRepo.findOne({
          where: { id: input },
          select: { student_id: true },
        });
        studentCode = student?.student_id ?? null;
        dbData = await this.reportRepo.find({
          where: { student_id: input },
          order: { created_at: 'DESC' },
        });
      } else {
        studentCode = input;

        const student = await this.studentRepo.findOne({
          where: { student_id: input },
          select: { id: true },
        });
        if (student?.id) {
          studentUuid = student.id;
          dbData = await this.reportRepo.find({
            where: { student_id: studentUuid },
            order: { created_at: 'DESC' },
          });
        }
      }

      let matchedBlob: SimulationReport[] = [];
      if (studentCode) {
        const matched = await this.loadReportsByStudentCode(studentCode);
        matchedBlob = matched.map(
          (r) => ({ ...r, student_id: studentUuid ?? input }) as unknown as SimulationReport,
        );
      }

      const idKey = studentUuid ?? input;
      const seen = new Set(dbData.map((r) => `${r.student_id}__${r.scenario_id}`));
      const uniqueBlob = matchedBlob.filter((r) => {
        const raw = r as unknown as Record<string, unknown>;
        const sid = (raw['scenario_id'] ?? raw['scenarioId'] ?? '') as string;
        return !seen.has(`${idKey}__${sid}`);
      });

      const source = this.tutorPatientService.getReportSourceLabel();
      let successMessage: string;
      if (source === 'redis') {
        successMessage = 'Report fetched from redis successfully';
      } else if (source === 'memory-fallback') {
        successMessage = 'Report fetched from in-memory cache successfully';
      } else {
        successMessage = 'Report fetched from blob successfully';
      }
      const data = [...dbData, ...uniqueBlob];
      return { success: true, message: successMessage, data };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch reports';
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  async findByClassId(class_id: string): Promise<ServiceResponse<SimulationReport[]>> {
    try {
      const studentRows = await this.studentRepo
        .createQueryBuilder('s')
        .leftJoin('s.school', 'school')
        .select(['s.id AS id', 's.student_id AS student_id'])
        .where('s.class_id = :classId', { classId: class_id })
        .andWhere('(s.school_id IS NULL OR school.is_active = true)')
        .getRawMany<{ id: string; student_id: string | null }>();

      if (studentRows.length === 0) {
        return { success: true, message: 'Report fetched successfully', data: [] };
      }

      const studentUuids = studentRows.map((s) => s.id);
      const codes = studentRows
        .map((s) => s.student_id)
        .filter((c): c is string => typeof c === 'string' && c.trim().length > 0);

      const normalise = (s: string): string => s.toUpperCase().replace(/[-_ ]/g, '');
      const uuidByCode = new Map(
        studentRows
          .filter((s) => typeof s.student_id === 'string' && s.student_id.trim())
          .map((s) => [normalise(s.student_id as string), s.id]),
      );

      const dbData = await this.reportRepo.find({
        where: { student_id: In(studentUuids) },
        order: { created_at: 'DESC' },
      });

      let matchedBlob: SimulationReport[] = [];
      if (codes.length > 0) {
        const result = await this.tutorPatientService.getReportsByStudentIds(codes);
        const matched = Array.isArray(result?.matched) ? result.matched : [];
        matchedBlob = matched
          .map((r) => {
            const raw = r as Record<string, unknown>;
            const code = (raw['userId'] ?? raw['student_id'] ?? raw['studentId']) as
              string | undefined;
            const uuid = code ? uuidByCode.get(normalise(code)) : undefined;
            if (!uuid) return null;
            const createdAt = raw['created_at'] ?? raw['createdAt'] ?? null;
            return {
              ...raw,
              student_id: uuid,
              created_at: createdAt,
            } as unknown as SimulationReport;
          })
          .filter((r): r is SimulationReport => r !== null);
      }

      const seen = new Set(dbData.map((r) => `${r.student_id}__${r.scenario_id}`));
      const uniqueBlob = matchedBlob.filter((r) => {
        const raw = r as unknown as Record<string, unknown>;
        const sid = (raw['scenario_id'] ?? raw['scenarioId'] ?? '') as string;
        return !seen.has(`${r.student_id}__${sid}`);
      });

      const data = [...dbData, ...uniqueBlob];
      const source = this.tutorPatientService.getReportSourceLabel();
      let successMessage: string;
      if (source === 'redis') {
        successMessage = 'Report fetched from redis successfully';
      } else if (source === 'memory-fallback') {
        successMessage = 'Report fetched from in-memory cache successfully';
      } else {
        successMessage = 'Report fetched from blob successfully';
      }
      return { success: true, message: successMessage, data };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch reports';
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  async findByEducatorId(educator_id: string): Promise<ServiceResponse<SimulationReport[]>> {
    try {
      const studentRows = await this.studentRepo
        .createQueryBuilder('s')
        .leftJoin('s.school', 'school')
        .select('s.id', 'id')
        .addSelect('s.student_id', 'student_id')
        .where('s.educator_id = :educatorId', { educatorId: educator_id })
        .andWhere('s.is_active = true')
        .andWhere('(s.school_id IS NULL OR school.is_active = true)')
        .getRawMany<{ id: string; student_id: string | null }>();

      if (studentRows.length === 0) {
        return { success: true, message: 'Report fetched successfully', data: [] };
      }

      const studentUuids = studentRows.map((s) => s.id);
      const codes = studentRows
        .map((s) => s.student_id)
        .filter((c): c is string => typeof c === 'string' && c.trim().length > 0);

      const normalise = (s: string): string => s.toUpperCase().replace(/[-_ ]/g, '');
      const uuidByCode = new Map(
        studentRows
          .filter((s) => typeof s.student_id === 'string' && s.student_id.trim())
          .map((s) => [normalise(s.student_id as string), s.id]),
      );

      // Run DB reports, blob reports, and scenarios in parallel — all three are
      // independent once we have the student UUIDs/codes.
      const [dbData, blobResult, allScenarios] = await Promise.all([
        this.reportRepo.find({
          where: { student_id: In(studentUuids) },
          order: { created_at: 'DESC' },
        }),
        codes.length > 0
          ? this.tutorPatientService.getReportsByStudentIds(codes)
          : Promise.resolve({ matched: [] as unknown[] }),
        this.tutorPatientService.getScenarios() as Promise<BlobScenario[]>,
      ]);

      const matched = Array.isArray(blobResult?.matched) ? blobResult.matched : [];
      const matchedBlob: SimulationReport[] = matched
        .map((r) => {
          const raw = r as Record<string, unknown>;
          const code = (raw['userId'] ?? raw['student_id'] ?? raw['studentId']) as
            string | undefined;
          const uuid = code ? uuidByCode.get(normalise(code)) : undefined;
          if (!uuid) return null;
          const createdAt = raw['created_at'] ?? raw['createdAt'] ?? null;
          return { ...raw, student_id: uuid, created_at: createdAt } as unknown as SimulationReport;
        })
        .filter((r): r is SimulationReport => r !== null);

      const seen = new Set(dbData.map((r) => `${r.student_id}__${r.scenario_id}`));
      const uniqueBlob = matchedBlob.filter((r) => {
        const raw = r as unknown as Record<string, unknown>;
        const sid = (raw['scenario_id'] ?? raw['scenarioId'] ?? '') as string;
        return !seen.has(`${r.student_id}__${sid}`);
      });

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

      const allData = [...dbData, ...uniqueBlob];
      const data = allData.filter((r) => {
        const raw = r as unknown as Record<string, unknown>;
        const sid = r.scenario_id ?? (raw['scenarioId'] as string | undefined) ?? '';
        return !sid || activeScenarioIds.has(sid);
      });
      this.logger.log(`[findByEducatorId] educator=${educator_id} matched=${data.length} reports`);
      const source = this.tutorPatientService.getReportSourceLabel();
      let successMessage: string;
      if (source === 'cache') {
        successMessage = 'Report fetched from local cache successfully';
      } else if (source === 'redis') {
        successMessage = 'Report fetched from redis successfully';
      } else if (source === 'memory-fallback') {
        successMessage = 'Report fetched from in-memory cache successfully';
      } else {
        successMessage = 'Report fetched from blob successfully';
      }
      return { success: true, message: successMessage, data };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch reports';
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  async findByAdminId(admin_id: string): Promise<ServiceResponse<SimulationReport[]>> {
    try {
      const studentRows: { id: string }[] = await this.dataSource.query(
        `SELECT DISTINCT s.id
         FROM students s
         JOIN educators e ON e.id = s.educator_id
         WHERE e.admin_id = $1`,
        [admin_id],
      );

      this.logger.log(`[findByAdminId] admin=${admin_id} found ${studentRows.length} students`);

      if (!studentRows.length) {
        const classStudentRows: { id: string }[] = await this.dataSource.query(
          `SELECT DISTINCT s.id
           FROM students s
           JOIN classes c ON c.id = s.class_id
           JOIN educators e ON e.id = c.educator_id
           WHERE e.admin_id = $1`,
          [admin_id],
        );

        this.logger.log(
          `[findByAdminId] fallback class-join found ${classStudentRows.length} students`,
        );

        const fallbackUuids = new Set(classStudentRows.map((s) => s.id));
        const all = await this.getMergedReports();
        const fallbackData = all.filter((r) => fallbackUuids.has(r.student_id));
        const fallbackSource = this.tutorPatientService.getReportSourceLabel();
        let fallbackMessage: string;
        if (fallbackSource === 'redis') {
          fallbackMessage = 'Report fetched from redis successfully';
        } else if (fallbackSource === 'memory-fallback') {
          fallbackMessage = 'Report fetched from in-memory cache successfully';
        } else {
          fallbackMessage = 'Report fetched from blob successfully';
        }
        return { success: true, message: fallbackMessage, data: fallbackData };
      }

      const studentUuids = new Set(studentRows.map((s) => s.id));
      const all = await this.getMergedReports();
      const data = all.filter((r) => studentUuids.has(r.student_id));
      const source = this.tutorPatientService.getReportSourceLabel();
      let successMessage: string;
      if (source === 'cache') {
        successMessage = 'Report fetched from local cache successfully';
      } else if (source === 'redis') {
        successMessage = 'Report fetched from redis successfully';
      } else if (source === 'memory-fallback') {
        successMessage = 'Report fetched from in-memory cache successfully';
      } else {
        successMessage = 'Report fetched from blob successfully';
      }
      return { success: true, message: successMessage, data };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch reports';
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  async findByClassIdWithDateRange(
    class_id: string,
    months: number,
  ): Promise<ServiceResponse<SimulationReport[]>> {
    try {
      const since = new Date();
      since.setMonth(since.getMonth() - months);

      const studentRows = await this.studentRepo
        .createQueryBuilder('s')
        .select('s.id', 'id')
        .where('s.class_id = :classId', { classId: class_id })
        .getRawMany<{ id: string }>();
      const studentUuids = new Set(studentRows.map((s) => s.id));

      const all = await this.getMergedReports();
      const data = all.filter((r) => {
        if (!studentUuids.has(r.student_id)) return false;
        const createdAt = r.created_at ? new Date(r.created_at) : null;
        return createdAt ? createdAt >= since : true;
      });
      const source = this.tutorPatientService.getReportSourceLabel();
      let successMessage: string;
      if (source === 'cache') {
        successMessage = 'Report fetched from local cache successfully';
      } else if (source === 'redis') {
        successMessage = 'Report fetched from redis successfully';
      } else if (source === 'memory-fallback') {
        successMessage = 'Report fetched from in-memory cache successfully';
      } else {
        successMessage = 'Report fetched from blob successfully';
      }
      return { success: true, message: successMessage, data };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch reports';
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  async monthlyBreakdown(
    months: number,
  ): Promise<ServiceResponse<{ month: string; year: number; count: number }[]>> {
    return this.monthlyBreakdownForReports(await this.getMergedReports(), months);
  }

  private monthlyBreakdownForReports(
    reports: SimulationReport[],
    months: number,
  ): ServiceResponse<{ month: string; year: number; count: number }[]> {
    try {
      const now = new Date();
      const allMonths: { month: string; year: number; count: number; _key: string }[] = [];
      for (let i = months - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        allMonths.push({
          month: d.toLocaleString('en-US', { month: 'short' }),
          year: d.getFullYear(),
          count: 0,
          _key: `${d.getFullYear()}-${d.getMonth()}`,
        });
      }
      const windowStart = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

      for (const r of reports) {
        const raw = r as unknown as Record<string, unknown>;
        const dateVal: string | number | Date = r.created_at ?? raw['createdAt'] ?? null;
        if (!dateVal) continue;
        const d = new Date(dateVal);
        if (isNaN(d.getTime()) || d < windowStart) continue;

        const key = `${d.getFullYear()}-${d.getMonth()}`;
        const bucket = allMonths.find((m) => m._key === key);
        if (bucket) bucket.count++;
      }

      const data = allMonths.map(({ month, year, count }) => ({ month, year, count }));
      const source = this.tutorPatientService.getReportSourceLabel();
      let successMessage: string;
      if (source === 'cache') {
        successMessage = 'Report fetched from local cache successfully';
      } else if (source === 'redis') {
        successMessage = 'Report fetched from redis successfully';
      } else if (source === 'memory-fallback') {
        successMessage = 'Report fetched from in-memory cache successfully';
      } else {
        successMessage = 'Report fetched from blob successfully';
      }
      return { success: true, message: successMessage, data };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch monthly stats';
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  async completedCount(
    months: number,
  ): Promise<ServiceResponse<{ count: number; months: number; since: string }>> {
    return this.completedCountForReports(await this.getMergedReports(), months);
  }

  private completedCountForReports(
    reports: SimulationReport[],
    months: number,
  ): ServiceResponse<{ count: number; months: number; since: string }> {
    try {
      const now = new Date();
      const since = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

      const count = reports.filter((r) => {
        const raw = r as unknown as Record<string, unknown>;
        const dateVal: string | number | Date = r.created_at ?? raw['createdAt'] ?? null;
        if (!dateVal) return false;
        const d = new Date(dateVal);
        return !isNaN(d.getTime()) && d >= since;
      }).length;

      const source = this.tutorPatientService.getReportSourceLabel();
      let successMessage: string;
      if (source === 'cache') {
        successMessage = 'Report fetched from local cache successfully';
      } else if (source === 'redis') {
        successMessage = 'Report fetched from redis successfully';
      } else if (source === 'memory-fallback') {
        successMessage = 'Report fetched from in-memory cache successfully';
      } else {
        successMessage = 'Report fetched from blob successfully';
      }
      return {
        success: true,
        message: successMessage,
        data: { count, months, since: since.toISOString() },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch stats';
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  async completedCountByAdmin(
    adminId: string,
    months: number,
  ): Promise<ServiceResponse<{ count: number; months: number; since: string }>> {
    try {
      const reports = await this.getReportsByAdminId(adminId);
      return this.completedCountForReports(reports, months);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch stats';
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  async monthlyBreakdownByAdmin(
    adminId: string,
    months: number,
  ): Promise<ServiceResponse<{ month: string; year: number; count: number }[]>> {
    try {
      const reports = await this.getReportsByAdminId(adminId);
      return this.monthlyBreakdownForReports(reports, months);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch monthly stats';
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  private async getReportsByAdminId(adminId: string): Promise<SimulationReport[]> {
    let studentRows: { id: string }[] = await this.dataSource.query(
      `SELECT DISTINCT s.id
       FROM students s
       JOIN educators e ON e.id = s.educator_id
       WHERE e.admin_id = $1`,
      [adminId],
    );

    if (!studentRows.length) {
      studentRows = await this.dataSource.query(
        `SELECT DISTINCT s.id
         FROM students s
         JOIN classes c ON c.id = s.class_id
         JOIN educators e ON e.id = c.educator_id
         WHERE e.admin_id = $1`,
        [adminId],
      );
    }

    if (!studentRows.length) return [];

    const studentUuids = new Set(studentRows.map((s) => s.id));
    const all = await this.getMergedReports();
    return all.filter((r) => studentUuids.has(r.student_id));
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

  async findById(id: string): Promise<ServiceResponse<SimulationReport>> {
    try {
      const dbReport = this.UUID_REGEX.test(id)
        ? await this.reportRepo.findOne({ where: { id } })
        : null;
      if (dbReport) {
        return {
          success: true,
          message: SimulationReportConstants.MESSAGES.FETCHED,
          data: dbReport,
        };
      }

      const all = await this.getMergedReports();
      const report = all.find((r) => r.id === id);
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
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        attemptId,
      );

      let report: SimulationReport | null = null;
      if (isUuid) {
        report = await this.reportRepo.findOne({ where: { id: attemptId } });
      }
      if (!report) {
        const all = await this.getMergedReports();
        const raw = all.find((r) => {
          const rid = (r as unknown as Record<string, unknown>)['id'] ?? r.id;
          return (
            (typeof rid === 'string' || typeof rid === 'number' ? String(rid) : '') === attemptId
          );
        });
        report = raw ?? null;
      }

      if (!report) {
        return {
          success: false,
          message: SimulationReportConstants.MESSAGES.TRANSCRIPT_NOT_FOUND,
          type: ErrorTypes.NOT_FOUND,
        };
      }

      const rawData = (report.report_data ?? report) as Record<string, unknown>;

      const keyInfo = Object.entries(rawData).map(([key, val]) => ({
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
        message: 'report_data keys inspected',
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
      let report: SimulationReport | null | undefined = null;
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        attemptId,
      );

      if (isUuid) {
        report = await this.reportRepo.findOne({ where: { id: attemptId } });
      }

      if (!report) {
        const all = await this.getMergedReports();
        const raw = all.find((r) => {
          const rid = (r as unknown as Record<string, unknown>)['id'] ?? r.id;
          return (
            (typeof rid === 'string' || typeof rid === 'number' ? String(rid) : '') === attemptId
          );
        });
        report = raw ?? null;
      }

      if (!report) {
        const allBlob = await this.loadBlobReports();
        const blobRaw = allBlob.find((r) => {
          const rid = r['id'] ?? r['_id'] ?? r['reportId'] ?? r['attemptId'];
          return (
            (typeof rid === 'string' || typeof rid === 'number' ? String(rid) : '') === attemptId
          );
        });
        if (blobRaw) {
          report = blobRaw as unknown as SimulationReport;
        }
      }

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
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(report.student_id);

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
          .where('s.id = :studentId', { studentId: report.student_id })
          .limit(1)
          .getRawMany<StudentRow>();
        studentRow = rows[0];
      }

      if (!studentRow && report.student_id) {
        const rows = await this.studentRepo
          .createQueryBuilder('s')
          .leftJoin('classes', 'c', 'c.id = s.class_id')
          .select([
            's.student_name AS student_name',
            's.student_id AS student_id',
            's.class_id AS class_id',
            'c.class_name AS class_name',
          ])
          .where('s.student_id = :studentCode', { studentCode: report.student_id })
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
          report.student_id,
      );
      const fallbackClassName = this.toStringOrNull(
        rawReport['className'] ??
          rawReport['class_name'] ??
          rawReport['classname'] ??
          rawReport['classTitle'] ??
          rawReport['class'],
      );

      let simulationName = report.scenario_id;
      let simulationType: string | null = null;
      const reportDataPreview = (
        report.report_data !== null && report.report_data !== undefined
          ? report.report_data
          : report
      ) as Record<string, unknown>;
      try {
        const scenarios = (await this.tutorPatientService.getScenarios()) as BlobScenario[];
        const scenario = scenarios.find((s) => s.id === report.scenario_id);
        if (scenario) {
          simulationName = scenario.title ?? report.scenario_id;
          simulationType = scenario.department ?? scenario.learnerLevel ?? null;
        }
      } catch (err) {
        this.logger.warn(
          `[SimulationReport] Could not resolve simulation name: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      const rawData = reportDataPreview;

      let transcriptRawData: Record<string, unknown> | null = null;

      const transcriptId = this.toStringOrNull(
        rawData['transcriptId'] ??
          rawData['transcript_id'] ??
          rawData['transcriptFileId'] ??
          rawData['speechTranscriptId'] ??
          rawData['conversationId'] ??
          rawData['sessionId'],
      );

      if (transcriptId) {
        try {
          transcriptRawData = await this.tutorPatientService.getTranscriptById(transcriptId);
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
            const fetched = await this.tutorPatientService.getTranscriptById(candidate);
            if (fetched) {
              transcriptRawData = fetched;
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
        report.created_at ??
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
          report.student_name ??
          fallbackStudentName ??
          transcriptStudentName ??
          'Unknown',
        studentCode:
          studentRow?.student_id ??
          fallbackStudentCode ??
          transcriptStudentCode ??
          report.student_id ??
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

  async remapReportsUserId(
    fromUserId: string,
    newStudentCode: string,
  ): Promise<ServiceResponse<object>> {
    try {
      const normalise = (s: string): string => s.toUpperCase().replace(/[-_ ]/g, '');
      const normFrom = normalise(fromUserId);
      const all = (await this.tutorPatientService.getReports()) as Array<Record<string, unknown>>;

      let remapped = 0;
      const updated = all.map((r) => {
        const rawCode = (r['userId'] ?? r['student_id'] ?? r['studentId']) as string | undefined;
        if (rawCode && normalise(rawCode) === normFrom) {
          remapped++;
          return { ...r, userId: newStudentCode };
        }
        return r;
      });

      if (remapped === 0) {
        return {
          success: false,
          message: `No reports found with userId "${fromUserId}". Available: check GET /debug/blob-raw`,
          type: ErrorTypes.NOT_FOUND,
        };
      }

      await this.tutorPatientService.writeBlob('reports.json', updated);

      return {
        success: true,
        message: `Remapped ${remapped} report(s) from userId "${fromUserId}" → "${newStudentCode}"`,
        data: { remapped, fromUserId, newStudentCode },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Remap failed';
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  buildReportPdf(
    studentName: string,
    studentCode: string,
    reports: Array<Record<string, unknown>>,
  ): Buffer {
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
      const data = (r['report_data'] ?? r['reportData'] ?? r) as Record<string, unknown>;
      const scenarioId = (r['scenario_id'] ?? r['scenarioId'] ?? 'Unknown') as string;
      const scoreRaw = data['score'] ?? data['Score'];
      const score =
        typeof scoreRaw === 'string' || typeof scoreRaw === 'number' ? String(scoreRaw) : '-';
      const timeRaw = data['totalTimeSeconds'] ?? data['timeSpent'];
      const time =
        typeof timeRaw === 'string' || typeof timeRaw === 'number' ? String(timeRaw) : '-';
      const date = (r['created_at'] ?? data['createdAt'] ?? '-') as string;
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

      const reports = (data ?? []) as unknown as Array<Record<string, unknown>>;
      const pdf = this.buildReportPdf(studentName, studentCode, reports);

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

      await this.mailService.sendMail({
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
      });

      return { success: true, message: SimulationReportConstants.MESSAGES.EMAIL_SENT, data: null };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : SimulationReportConstants.MESSAGES.EMAIL_FAILED;
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  async markAsViewed(id: string, educatorId: string): Promise<ServiceResponse<SimulationReport>> {
    try {
      const report = await this.reportRepo.findOne({ where: { id } });
      if (!report) {
        return {
          success: false,
          message: SimulationReportConstants.MESSAGES.NOT_FOUND,
          type: ErrorTypes.NOT_FOUND,
        };
      }

      if (!report.viewed_at) {
        await this.reportRepo.update(id, {
          viewed_at: new Date(),
          viewed_by: educatorId,
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

  async getAttentionMetadataByClass(
    classId: string,
  ): Promise<ServiceResponse<ClassAttentionMetadata>> {
    try {
      const rows = await this.reportRepo
        .createQueryBuilder('sr')
        .innerJoin('students', 's', 's.id = sr.student_id')
        .select('COUNT(sr.id)', 'report_count')
        .addSelect('COUNT(sr.id) FILTER (WHERE sr.viewed_at IS NULL)', 'unread_count')
        .where('s.class_id = :classId', { classId })
        .andWhere('s.is_active = :isActive', { isActive: true })
        .getRawMany<{ report_count: string; unread_count: string }>();

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
      const rows = await this.reportRepo
        .createQueryBuilder('sr')
        .innerJoin('students', 's', 'sr.student_id = s.id AND s.is_active = TRUE')
        .innerJoin('classes', 'c', 's.class_id = c.id')
        .select('s.class_id', 'class_id')
        .addSelect('COUNT(sr.id)', 'report_count')
        .addSelect('COUNT(sr.id) FILTER (WHERE sr.viewed_at IS NULL)', 'unread_count')
        .where('c.educator_id = :educatorId', { educatorId })
        .andWhere('c.is_active = :isActive', { isActive: true })
        .groupBy('s.class_id')
        .having('COUNT(sr.id) FILTER (WHERE sr.viewed_at IS NULL) > 0')
        .orderBy('unread_count', 'DESC')
        .getRawMany<{
          class_id: string;
          report_count: string;
          unread_count: string;
        }>();

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

  async updateReportStatusByStudentId(
    studentId?: string,
  ): Promise<ServiceResponse<Record<string, unknown>[]>> {
    try {
      const freshReports = await this.tutorPatientService.getReportsFresh();
      const reports = (freshReports as Array<Record<string, unknown>>) ?? [];
      const reportsSourceMessage = this.tutorPatientService.getReportsSourceMessage();
      const freshData = await this.tutorPatientService.getFreshAllSimulationData();
      const scenarios = (freshData as Array<Record<string, unknown>>) ?? [];
      const simulationSourceMessage = this.tutorPatientService.getSimulationSourceMessage();

      if (studentId && reports.length > 0) {
        await this.notifyReportsForStudent(studentId, reports);
      }

      return {
        success: true,
        message: `${reportsSourceMessage} ${reports.length} report(s) loaded and ${simulationSourceMessage} ${scenarios.length} scenario(s) successfully.`,
        data: reports,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to refresh reports from blob';
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  private async notifyReportsForStudent(
    studentId: string,
    blobReports: Array<Record<string, unknown>>,
  ): Promise<void> {
    const trimmed = studentId.trim();
    if (!trimmed) return;

    const isValidUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      trimmed,
    );

    const student = await this.studentRepo.findOne({
      where: isValidUuid ? [{ id: trimmed }, { student_id: trimmed }] : [{ student_id: trimmed }],
      relations: ['class', 'educator'],
    });

    // Let notifyEducatorReportAvailable resolve educator via student, student.educator_id, or class.educator_id
    if (!student?.id) return;

    const normalise = (value: unknown): string =>
      typeof value === 'string' ? value.toUpperCase().replace(/[-_ ]/g, '') : '';
    const studentKeys = new Set(
      [student.id, student.student_id].filter(Boolean).map((v) => normalise(v)),
    );

    const matched = blobReports.filter((row) => {
      const code = row['userId'] ?? row['student_id'] ?? row['studentId'];
      return studentKeys.has(normalise(code));
    });

    for (const row of matched) {
      const scenarioIdRaw = row['scenario_id'] ?? row['scenarioId'] ?? row['scenarioID'];
      const scenarioId =
        typeof scenarioIdRaw === 'string' && scenarioIdRaw.trim() ? scenarioIdRaw.trim() : null;
      if (!scenarioId) continue;

      const nameRaw = row['student_name'] ?? row['studentName'] ?? row['userName'];
      const studentName =
        typeof nameRaw === 'string' && nameRaw.trim() ? nameRaw.trim() : undefined;

      await this.notifyEducatorReportAvailable(student.id, scenarioId, studentName, true);
    }
  }

  async updateSimulationFromBlob(): Promise<ServiceResponse<Record<string, unknown>[]>> {
    try {
      const timeout = new Promise<never>((_, reject) => {
        const t = setTimeout(
          () => reject(new Error('Request timed out fetching simulations from Blob Storage')),
          25_000,
        );
        t.unref();
      });
      const freshData = await Promise.race([
        this.tutorPatientService.getFreshAllSimulationData(),
        timeout,
      ]);
      const scenarios = (freshData as Array<Record<string, unknown>>) ?? [];
      const sourceMessage = this.tutorPatientService.getSimulationSourceMessage();

      return {
        success: true,
        message: `${sourceMessage} ${scenarios.length} scenario(s) loaded successfully.`,
        data: scenarios,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to refresh scenarios from blob';
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }
}
