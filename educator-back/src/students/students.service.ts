import { BadRequestException, Inject, Injectable, forwardRef } from '@nestjs/common';
import { Response } from 'express';
import { TokenService } from 'src/common/services/token.service';
import { LoggerService } from 'src/common/services';

import {
  CreateStudentDto,
  BulkCreateStudentDto,
  UpdateStudentDto,
  EmailReportDto,
  BatchEmailDto,
  ListStudentsReqDto,
  StudentLiteResDto,
  StudentSummaryResDto,
} from './dto/students.dto';

import { CommonStatus } from 'src/common/enums/status.enum';
import { BlobScenario, BulkUploadResult, ServiceResponse, StudentCsvRow } from 'src/common/types';
import { ErrorTypes, Messages } from 'src/common/utils/messages';
import { redactCode } from 'src/common/utils/redact.util';
import {
  resolveEducatorEmail,
  resolveEducatorStatus,
} from 'src/common/utils/educator-identity.util';
import { StudentConstants } from './students.constants';
import { ResponseResult } from 'src/common/class/response.class';
import {
  ICurrentUser,
  IPaginationMeta,
  ReportDetailWithStudentRow,
  StudentFilters,
  StudentSortOptions,
} from 'src/common/interfaces';
import { SUCCESS_MSG } from 'src/common/messages/success.message';
import { mapRowToReportFields } from 'src/common/utils/simulation-report.util';
import { buildPaginationMeta, getPagination } from 'src/common/utils/pagination.util';
import { handleError } from 'src/common/utils/common.util';
import { MailService } from '../mail/mail.service';
import { AutomationAccessService } from 'src/common/services/automation-access.service';
import { isAutomationOnlyRecord } from 'src/common/utils/automation-access.util';
import {
  StudentProfileResponse,
  StudentSimulationSummary,
} from './interfaces/student-profile.interface';
import { StudentLoginData } from './interfaces/student-profile.interface';
import {
  ReportModeType,
  RoleSlug,
  SimulationAttemptConstants,
  SimulationProgressStatus,
  TokenPurposeType,
  UserTokenType,
} from 'src/common/constants';
import { SIMULATION_PROGRESS_MSG } from 'src/common/messages/simulation-progress.message';
import { canForfeitSimulation } from 'src/common/utils/simulation-progress.util';
import { ClassSimulationService } from 'src/class-simulations/class-simulation.service';
import {
  Student,
  Class,
  Educator,
  User,
  SimulationV2,
  StudentSimulationProgress,
} from 'src/database/entities';
import {
  CLASS_REPOSITORY,
  CLASS_SIMULATION_REPOSITORY,
  EDUCATOR_REPOSITORY,
  SIMULATION_REPORT_REPOSITORY,
  SIMULATION_V2_REPOSITORY,
  STUDENT_REPOSITORY,
  STUDENT_SIMULATION_PROGRESS_REPOSITORY,
  USER_REPOSITORY,
} from 'src/database/tokens';
import {
  ClassRepository,
  ClassSimulationRepository,
  EducatorRepository,
  SimulationReportRepository,
  SimulationV2Repository,
  StudentRepository,
  StudentSimulationProgressRepository,
  UserRepository,
} from 'src/database/repositories';

const REPEAT_ALLOWED_STUDENT_CODES = new Set(['85170719']);
const EMAIL_WORKER_CONCURRENCY = 8;

@Injectable()
export class StudentsService {
  private isRepeatAllowedStudent(studentCode?: string | null): boolean {
    return !!studentCode && REPEAT_ALLOWED_STUDENT_CODES.has(studentCode);
  }

  private formatTimeRemaining(value?: string | null): string | undefined {
    if (!value) return value ?? undefined;
    const trimmed = value.trim();
    const match = trimmed.match(/^(\d+):(\d{2}):(\d{2})$/);
    if (!match) return trimmed;

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const hourLabel = hours === 1 ? 'hour' : 'hours';
    const minuteLabel = minutes === 1 ? 'minute' : 'minutes';

    return `${hours} ${hourLabel} ${minutes} ${minuteLabel}`;
  }

  private async runWithConcurrency<T>(
    items: T[],
    limit: number,
    worker: (item: T) => Promise<void>,
  ): Promise<void> {
    if (items.length === 0) return;
    const concurrency = Math.max(1, Math.floor(limit));
    const queue = [...items];
    const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) continue;
        await worker(item);
      }
    });
    await Promise.all(workers);
  }

  constructor(
    @Inject(STUDENT_REPOSITORY)
    private readonly studentRepo: StudentRepository,
    @Inject(CLASS_REPOSITORY)
    private readonly classRepo: ClassRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepository,
    @Inject(EDUCATOR_REPOSITORY)
    private readonly educatorRepo: EducatorRepository,
    @Inject(CLASS_SIMULATION_REPOSITORY)
    private readonly classSimulationRepo: ClassSimulationRepository,
    @Inject(SIMULATION_REPORT_REPOSITORY)
    private readonly simulationReportRepo: SimulationReportRepository,
    @Inject(SIMULATION_V2_REPOSITORY)
    private readonly simulationV2Repository: SimulationV2Repository,
    @Inject(STUDENT_SIMULATION_PROGRESS_REPOSITORY)
    private readonly simulationProgressRepo: StudentSimulationProgressRepository,
    private readonly mailerService: MailService,
    private readonly automationAccess: AutomationAccessService,
    @Inject(forwardRef(() => ClassSimulationService))
    private readonly classSimulationService: ClassSimulationService,
    private readonly tokenService: TokenService,
    private readonly logger: LoggerService,
  ) { }
  async findClassById(id: string): Promise<Class | null> {
    return this.classRepo.findOne({
      where: { id: id, is_active: true },
      relations: ['school'],
    });
  }

  async findUserById(id: string): Promise<User | null> {
    return this.userRepo.findOne({
      where: { id },
    });
  }

  async findAnyUserByEmail(email: string): Promise<'user' | 'educator' | null> {
    const normalizedEmail = email.trim().toLowerCase();

    const user = await this.userRepo.findOne({
      where: { email: normalizedEmail },
    });
    if (user) return 'user';

    const educator = await this.educatorRepo.findOne({
      where: { userRole: { user: { email: normalizedEmail } }, is_active: true },
    });
    if (educator) return 'educator';

    return null;
  }

  async findEducatorById(id: string): Promise<Educator | null> {
    return this.educatorRepo.findOne({
      where: { id, is_active: true },
      relations: ['userRole', 'userRole.role'],
    });
  }

  async findEducatorByStudentId(studentId: string): Promise<Educator | null> {
    const student = await this.studentRepo.findOne({
      where: {
        id: studentId,
        is_active: true,
      },
      relations: ['educator'],
    });
    return student?.educator ?? null;
  }

  async findById(id: string): Promise<Student | null> {
    return this.studentRepo.findOne({
      where: { id, is_active: true },
      relations: ['class', 'educator'],
    });
  }

  async findByStudentIdInClass(studentId: string, classId: string): Promise<Student | null> {
    return this.studentRepo.findOne({
      where: { student_id: studentId, class: { id: classId }, is_active: true },
    });
  }

  async findClassByStudentId(studentId: string): Promise<Class | null> {
    const student = await this.studentRepo.findOne({
      where: {
        id: studentId,
        is_active: true,
      },
      relations: ['class'],
    });

    return student?.class ?? null;
  }

  async create(
    dto: CreateStudentDto,
    classData: Class,
    educator: Educator,
  ): Promise<ServiceResponse<Student>> {
    try {
      if (classData.id && educator.id) {
        const alloc = await this.classSimulationService.allocateSeatsForNewStudents(
          classData.id,
          educator.id,
          1,
        );
        if (!alloc.success) {
          return { success: false, message: alloc.message!, type: alloc.type };
        }
      }

      const studentId = await this.generateUniqueStudentId(classData.class_name ?? '');

      const saved = await this.studentRepo.create({
        student_id: studentId,
        status: dto.status ?? CommonStatus.ACTIVE,
        score: dto.score,
        attempt: dto.attempt,
        sims_completed: dto.sims_completed,
        submission_date: dto.submission_date,
        time_spent: dto.time_spent,
        time_remaining: dto.time_remaining,
        class: classData,
        educator,
        ...(classData.school
          ? { school: classData.school }
          : classData.school_id
            ? { school: { id: classData.school_id } }
            : dto.school_id
              ? { school: { id: dto.school_id } }
              : {}),
      });

      return { success: true, message: Messages.STUDENT_CREATED, data: saved };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : StudentConstants.VALIDATION.CREATE_FAILED;
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  async bulkCreate(
    dto: BulkCreateStudentDto,
    classData: Class,
    educator: Educator,
  ): Promise<ServiceResponse<Student[]>> {
    const startTime = Date.now();
    try {
      const className = classData.class_name ?? '';
      const prefix = this.buildClassPrefix(className);

      this.logger.log(
        `[bulkCreate] Starting bulk creation of ${dto.count} students for class "${className}" (prefix: ${prefix}, classId: ${classData.id})`,
      );

      if (classData.id && educator.id && dto.count > 0) {
        const alloc = await this.classSimulationService.allocateSeatsForNewStudents(
          classData.id,
          educator.id,
          dto.count,
        );
        if (!alloc.success) {
          this.logger.warn(`[bulkCreate] Seat allocation failed: ${alloc.message}`);
          return { success: false, message: alloc.message!, type: alloc.type };
        }
      }

      const existing = await this.studentRepo.findAllNonEmptyStudentCodes();
      this.logger.log(
        `[bulkCreate] Found ${existing.length} existing student codes globally. Generating ${dto.count} unique codes in-memory with global uniqueness check.`,
      );

      const usedCodes = new Set(existing);
      const students: Partial<Student>[] = [];

      for (let i = 0; i < dto.count; i++) {
        const studentId = await this.generateUniqueStudentId(classData.class_name ?? '', usedCodes);
        students.push({
          student_id: studentId,
          status: CommonStatus.ACTIVE,
          class: classData,
          educator,
        });
      }

      const saved = await this.studentRepo.saveMany(students);
      const durationMs = Date.now() - startTime;
      this.logger.log(
        `[bulkCreate] Successfully created ${saved.length} students in ${durationMs}ms (1 code read + 1 batched insert).`,
      );

      return {
        success: true,
        message: `${saved.length} student(s) created successfully`,
        data: saved,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : StudentConstants.VALIDATION.BULK_CREATE_FAILED;
      this.logger.error(
        `[bulkCreate] Failed to bulk create students: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  async findAllByEducator(educatorId: string): Promise<ServiceResponse<string[]>> {
    try {
      const students = await this.studentRepo.find({
        where: { educator: { id: educatorId }, is_active: true },
        select: ['student_id'],
      });
      const ids = students.map((s) => s.student_id!).filter(Boolean);
      return { success: true, message: Messages.STUDENT_FETCHED, data: ids };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : StudentConstants.VALIDATION.FETCH_FAILED;
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  async findAll(): Promise<ServiceResponse<Student[]>> {
    try {
      const students = await this.studentRepo.find({
        relations: ['class', 'educator'],
        order: { id: 'DESC' },
        where: { is_active: true },
      });

      students.forEach((student) => {
        student.time_remaining = this.formatTimeRemaining(student.time_remaining);
      });

      return { success: true, message: Messages.STUDENT_FETCHED, data: students };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : StudentConstants.VALIDATION.FETCH_FAILED;
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  async findByClass(classId: string): Promise<ServiceResponse<Student[]>> {
    try {
      const students = await this.studentRepo.findActiveByClassWithClassAndEducator(classId);

      students.forEach((student) => {
        student.time_remaining = this.formatTimeRemaining(student.time_remaining);
      });

      return { success: true, message: Messages.STUDENT_FETCHED, data: students };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : StudentConstants.VALIDATION.FETCH_BY_CLASS_FAILED;
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  async findStudents(
    currentUser: ICurrentUser,
    dto: ListStudentsReqDto,
  ): Promise<ResponseResult<StudentSummaryResDto[] | StudentLiteResDto[], IPaginationMeta>> {
    try {
      const { page, pageSize, skip, take } = getPagination({
        page: dto.page,
        pageSize: dto.pageSize,
      });
      const filters: StudentFilters = {
        search: dto.search?.trim(),
        classIds: dto.classIds,
        schoolIds: dto.schoolIds,
        isActive: dto.isActive,
      };
      const sortDir: 'ASC' | 'DESC' = dto.sortBy
        ? ((dto.sortDir ?? 'asc').toUpperCase() as 'ASC' | 'DESC')
        : 'DESC';
      const sort = { field: dto.sortBy, dir: sortDir };
      const pagination = { skip, take };

      return dto.lite
        ? await this.findStudentsLite(currentUser, filters, sort, pagination, page, pageSize)
        : await this.findStudentsFull(currentUser, filters, sort, pagination, page, pageSize);
    } catch (error) {
      return handleError(error);
    }
  }

  private async findStudentsLite(
    currentUser: ICurrentUser,
    filters: StudentFilters,
    sort: StudentSortOptions,
    pagination: { skip: number; take: number },
    page: number,
    pageSize: number,
  ): Promise<ResponseResult<StudentLiteResDto[], IPaginationMeta>> {
    const { rows, total } = await this.studentRepo.findStudents(
      currentUser.educatorId as string,
      { ...filters, lite: true },
      sort,
      pagination,
    );
    const data: StudentLiteResDto[] = rows.map((row) => ({
      id: row.id,
      studentId: row.studentId,
      name: row.name,
    }));
    return new ResponseResult({
      message: SUCCESS_MSG.COMMON.FETCHED('Students'),
      data,
      meta: buildPaginationMeta(total, page, pageSize),
    });
  }

  private async findStudentsFull(
    currentUser: ICurrentUser,
    filters: StudentFilters,
    sort: StudentSortOptions,
    pagination: { skip: number; take: number },
    page: number,
    pageSize: number,
  ): Promise<ResponseResult<StudentSummaryResDto[], IPaginationMeta>> {
    const { rows, total } = await this.studentRepo.findStudents(
      currentUser.educatorId as string,
      { ...filters, lite: false },
      sort,
      pagination,
    );
    const data: StudentSummaryResDto[] = rows.map((row) => ({
      id: row.id,
      studentId: row.studentId,
      name: row.name,
      email: row.email,
      classId: row.classId,
      schoolId: row.schoolId,
      status: row.status,
      isActive: row.isActive,
      submissionDate: row.submissionDate,
      simsCompleted: row.simsCompleted,
      score: row.score,
      timeSpent: row.timeSpent,
      timeRemaining: row.timeRemaining,
      reportsCount: row.reportsCount,
      codeStatus: row.codeStatus,
    }));
    return new ResponseResult({
      message: SUCCESS_MSG.COMMON.FETCHED('Students'),
      data,
      meta: buildPaginationMeta(total, page, pageSize),
    });
  }

  async findOne(id: string): Promise<ServiceResponse<Student>> {
    try {
      const student = await this.studentRepo.findOne({
        where: { id, is_active: true },
        relations: ['class', 'educator'],
      });

      if (!student) {
        return { success: false, message: Messages.STUDENT_NOT_FOUND, type: ErrorTypes.NOT_FOUND };
      }

      student.time_remaining = this.formatTimeRemaining(student.time_remaining);

      return { success: true, message: Messages.STUDENT_FETCHED, data: student };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : StudentConstants.VALIDATION.FETCH_ONE_FAILED;
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  async update(
    student: Student,
    dto: UpdateStudentDto,
    userId: string,
  ): Promise<ServiceResponse<Student>> {
    try {
      if (!student || !student.id) {
        return { success: false, message: Messages.STUDENT_NOT_FOUND, type: ErrorTypes.NOT_FOUND };
      }
      const classData = await this.findClassByStudentId(student.id);

      if (!classData) {
        throw new BadRequestException(StudentConstants.VALIDATION.STUDENT_CLASS_MISSING);
      }
      const educator = await this.findEducatorByStudentId(student.id);
      if (!educator?.id) {
        throw new BadRequestException(StudentConstants.MESSAGES.EDUCATOR_NOT_FOUND);
      }
      if (educator && educator?.id !== userId) {
        throw new BadRequestException(StudentConstants.MESSAGES.NO_PERMISSION);
      }
      const updateData = Object.entries(dto).reduce<Partial<Student>>((acc, [key, value]) => {
        if (value !== undefined && value !== null) {
          (acc as Record<string, string | CommonStatus>)[key] = value as string | CommonStatus;
        }
        return acc;
      }, {});

      Object.assign(student, updateData);

      await this.studentRepo.update(student.id, student);
      return {
        success: true,
        message: Messages.STUDENT_UPDATED,
        data: student,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : StudentConstants.VALIDATION.UPDATE_FAILED;

      return {
        success: false,
        message,
        type: ErrorTypes.BAD_REQUEST,
      };
    }
  }

  async remove(student: Student, userId: string): Promise<ServiceResponse<null>> {
    try {
      if (!student || !student.id) {
        return { success: false, message: Messages.STUDENT_NOT_FOUND, type: ErrorTypes.NOT_FOUND };
      }
      const educator = await this.findEducatorByStudentId(student.id);
      if (!educator?.id) {
        throw new BadRequestException(StudentConstants.MESSAGES.EDUCATOR_NOT_FOUND);
      }
      if (educator.id !== userId) {
        throw new BadRequestException(StudentConstants.MESSAGES.NO_PERMISSION);
      }

      const classData = await this.findClassByStudentId(student.id);
      if (!classData) {
        throw new BadRequestException(StudentConstants.VALIDATION.STUDENT_CLASS_MISSING);
      }

      await this.classSimulationService.refundUnusedSeatsForStudent(student);

      student.is_active = false;
      student.deleted_at = new Date();
      student.status = CommonStatus.INACTIVE;
      await this.studentRepo.update(student.id, student);

      return { success: true, message: Messages.STUDENT_DELETED, data: null };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : StudentConstants.VALIDATION.DELETE_FAILED;
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  async updateStudentCode(student: Student): Promise<ServiceResponse<Student>> {
    try {
      if (!student.class) {
        return {
          success: false,
          message: Messages.STUDENT_CLASS_MISSING,
          type: ErrorTypes.BAD_REQUEST,
        };
      }

      student.student_id = await this.generateUniqueStudentId(student.class.class_name ?? '');
      await this.studentRepo.update(student.id as string, student);
      return { success: true, message: Messages.STUDENT_ID_GENERATED, data: student };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : StudentConstants.VALIDATION.UPDATE_CODE_FAILED;
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  async revokeCode(student: Student): Promise<ServiceResponse<Student>> {
    try {
      student.student_id = '';
      await this.studentRepo.update(student.id as string, student);
      return { success: true, message: Messages.STUDENT_CODE_REVOKED, data: student };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : StudentConstants.VALIDATION.UPDATE_CODE_FAILED;
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  async regenerateCode(student: Student): Promise<ServiceResponse<Student>> {
    try {
      if (!student.class) {
        return {
          success: false,
          message: Messages.STUDENT_CLASS_MISSING,
          type: ErrorTypes.BAD_REQUEST,
        };
      }

      student.student_id = await this.generateUniqueStudentId(student.class.class_name ?? '');
      await this.studentRepo.update(student.id as string, student);
      return { success: true, message: Messages.STUDENT_CODE_REGENERATED, data: student };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : StudentConstants.VALIDATION.UPDATE_CODE_FAILED;
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  private static readonly CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

  static readonly STUDENT_CODE_REGEX = /^[A-Z0-9]{3}-[A-Z0-9]{4}$/;

  private buildClassPrefix(className: string): string {
    const alphanum = className.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const prefix = alphanum.slice(0, 3).padEnd(3, 'X');
    return prefix;
  }

  private generateRandomSuffix(): string {
    const chars = StudentsService.CODE_CHARS;
    let result = '';
    for (let i = 0; i < 4; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    if (result.length !== 4) {
      throw new BadRequestException(
        `Internal error: generated suffix "${result}" is not exactly 4 characters.`,
      );
    }
    return result;
  }

  private async generateUniqueStudentId(
    className: string,
    existingCodes?: Set<string>,
  ): Promise<string> {
    const usedCodes =
      existingCodes ?? new Set(await this.studentRepo.findAllNonEmptyStudentCodes());
    const prefix = this.buildClassPrefix(className);

    for (let attempt = 0; attempt < 10_000; attempt++) {
      const candidate = `${prefix}-${this.generateRandomSuffix()}`;

      if (!StudentsService.STUDENT_CODE_REGEX.test(candidate)) {
        throw new BadRequestException(
          `Generated student code "${candidate}" does not match the required CCC-XXXX format ` +
          `(3-char prefix, hyphen, 4-char suffix). ` +
          `Please ensure the class name produces a valid 3-character prefix.`,
        );
      }

      if (!usedCodes.has(candidate)) {
        usedCodes.add(candidate);
        return candidate;
      } else {
        this.logger.debug(
          `[generateUniqueStudentId] Candidate collision "${candidate}" on attempt ${attempt + 1}. Retrying...`,
        );
      }
    }

    throw new BadRequestException(StudentConstants.VALIDATION.COLLISION_ERROR);
  }

  async importFromCsv(
    fileBuffer: Buffer,
    classData: Class,
    educator: Educator,
  ): Promise<ServiceResponse<BulkUploadResult>> {
    try {
      const text = fileBuffer.toString('utf-8');
      const lines = text.split(/\r?\n/).filter((l) => l.trim());

      if (lines.length < 2) {
        return {
          success: false,
          message: StudentConstants.VALIDATION.CSV_PARSE_FAILED,
          type: ErrorTypes.BAD_REQUEST,
        };
      }

      const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
      const { STUDENT_ID, STUDENT_NAME, EMAIL } = StudentConstants.CSV_HEADERS;

      if (!headers.includes(STUDENT_ID) || !headers.includes(STUDENT_NAME)) {
        return {
          success: false,
          message: StudentConstants.VALIDATION.CSV_PARSE_FAILED,
          type: ErrorTypes.BAD_REQUEST,
        };
      }

      const idIdx = headers.indexOf(STUDENT_ID);
      const nameIdx = headers.indexOf(STUDENT_NAME);
      const emailIdx = headers.indexOf(EMAIL);
      const rows = lines.slice(1);
      const seenIds = new Set<string>();
      const result: BulkUploadResult = {
        total: rows.length,
        inserted: 0,
        failedCount: 0,
        failed: [],
      };

      const candidates: { row: StudentCsvRow; index: number }[] = [];
      const errors = new Map<number, string>();
      const parsedRows = rows.map((line, index) => {
        const cols = line.split(',').map((c) => c.trim());
        const studentId = cols[idIdx] ?? '';
        const studentName = cols[nameIdx] ?? '';
        const email = emailIdx >= 0 ? (cols[emailIdx] ?? '') || null : null;
        const row: import('src/common/types').StudentCsvRow = {
          student_id: studentId,
          student_name: studentName,
          email,
          class_id: classData.id ?? '',
          user_id: educator.id ?? '',
        };

        if (!studentId || !studentName) {
          errors.set(index, StudentConstants.VALIDATION.MISSING_DATA);
        } else if (seenIds.has(studentId)) {
          errors.set(index, StudentConstants.VALIDATION.DUPLICATE_ID);
        } else {
          seenIds.add(studentId);
          candidates.push({ row, index });
        }
        return row;
      });

      const existingCodes = new Set(
        await this.studentRepo.findActiveCodesInClass(
          classData.id as string,
          candidates.map(({ row }) => row.student_id),
        ),
      );
      for (const { row, index } of candidates) {
        if (existingCodes.has(row.student_id)) {
          errors.set(index, StudentConstants.VALIDATION.STUDENT_EXISTS);
        }
      }

      // Every known per-row failure is decided above, so a write error here is a genuine
      // database problem: saveMany runs in one transaction and the whole request fails.
      const accepted = candidates.filter(({ index }) => !errors.has(index));
      if (accepted.length > 0) {
        await this.studentRepo.saveMany(
          accepted.map(({ row }) => ({
            student_id: row.student_id,
            student_name: row.student_name,
            email: row.email ?? undefined,
            status: CommonStatus.ACTIVE,
            class: classData,
            educator,
            ...(classData.school ? { school: classData.school } : {}),
          })),
        );
      }
      result.inserted = accepted.length;

      parsedRows.forEach((row, index) => {
        const error = errors.get(index);
        if (error) {
          result.failedCount++;
          result.failed.push({ row, error });
        }
      });

      return {
        success: true,
        message: `${result.inserted} student(s) imported successfully`,
        data: result,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : StudentConstants.VALIDATION.CSV_PARSE_FAILED;
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  async sendBatchEmail(
    dto: BatchEmailDto,
  ): Promise<ServiceResponse<{ sent: number; failed: number }>> {
    try {
      if (!dto.class_id) {
        return {
          success: false,
          message: StudentConstants.VALIDATION.CLASS_ID_REQUIRED,
          type: ErrorTypes.BAD_REQUEST,
        };
      }

      let students: Student[] = [];

      if (dto.student_id) {
        const student = await this.studentRepo.findOne({
          where: { id: dto.student_id, class: { id: dto.class_id } },
          relations: ['class'],
        });
        if (!student) {
          return {
            success: false,
            message: StudentConstants.VALIDATION.STUDENT_NOT_IN_CLASS,
            type: ErrorTypes.NOT_FOUND,
          };
        }
        students = [student];
      } else {
        students = await this.studentRepo.find({
          where: { class: { id: dto.class_id }, is_active: true },
          relations: ['class'],
        });
        if (!students.length) {
          return {
            success: false,
            message: StudentConstants.VALIDATION.STUDENT_NOT_FOUND,
            type: ErrorTypes.NOT_FOUND,
          };
        }
      }

      let sent = 0;
      let failed = 0;
      const errors: string[] = [];

      await this.runWithConcurrency(students, EMAIL_WORKER_CONCURRENCY, async (student) => {
        const recipientEmail = dto.email ?? dto.email ?? null;
        if (!recipientEmail) {
          failed++;
          return;
        }

        try {
          await this.mailerService.sendMail({
            to: recipientEmail,
            subject: dto.subject,
            template: 'batch-email',
            context: {
              subject: dto.subject,
              message: dto.message,
              studentName: dto.student_name ?? '-',
              className: student.class?.class_name ?? '-',
              accessCode: dto.accessCode ? (student.student_id ?? '-') : null,
            },
          });
          sent++;
        } catch (err) {
          failed++;
          errors.push(`${recipientEmail}: ${err instanceof Error ? err.message : String(err)}`);
        }
      });

      if (sent === 0) {
        return {
          success: false,
          message:
            errors.length > 0 ? errors.join(' | ') : StudentConstants.VALIDATION.EMAIL_FAILED_ALL,
          type: ErrorTypes.BAD_REQUEST,
        };
      }

      const successMsg = dto.student_id
        ? StudentConstants.MESSAGES.EMAIL_SENT_SINGLE
        : StudentConstants.MESSAGES.EMAIL_SENT_COUNT(sent);
      const failMsg = failed
        ? `${StudentConstants.MESSAGES.EMAIL_FAILED_COUNT(failed)}: ${errors.join(' | ')}`
        : '';

      return {
        success: true,
        message: `${successMsg}${failMsg}`,
        data: { sent, failed },
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : StudentConstants.VALIDATION.EMAIL_FAILED;
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  async sendEmailReport(
    dto: EmailReportDto,
  ): Promise<ServiceResponse<{ sent: number; failed: number }>> {
    try {
      if (!dto.class_id) {
        return {
          success: false,
          message: StudentConstants.VALIDATION.CLASS_ID_REQUIRED,
          type: ErrorTypes.BAD_REQUEST,
        };
      }

      type ResolvedReport = {
        studentName: string | null;
        scenarioId: string | null;
        reportData: Record<string, unknown>;
        createdAt: string | Date | null;
      };

      const fromRow = (r: ReportDetailWithStudentRow): ResolvedReport => ({
        studentName: r.studentName,
        scenarioId: r.scenarioId,
        reportData: mapRowToReportFields(r) as Record<string, unknown>,
        createdAt: r.createdAt,
      });

      const resolveByReportId = async (
        reportId: string,
      ): Promise<ServiceResponse<never> | ResolvedReport | null> => {
        const row = await this.simulationReportRepo.findDetailRowByIdOrReportId(reportId);
        if (!row) return null;
        if (dto.student_id && row.studentId !== dto.student_id) {
          return {
            success: false,
            message: 'Report does not belong to the specified student',
            type: ErrorTypes.FORBIDDEN,
          };
        }
        return fromRow(row);
      };

      let resolvedReport: ResolvedReport | null = null;

      if (dto.report_data && typeof dto.report_data === 'object') {
        const rd = dto.report_data;
        resolvedReport = {
          studentName:
            typeof (rd['student_name'] ?? rd['studentName']) === 'string'
              ? ((rd['student_name'] ?? rd['studentName']) as string)
              : null,
          scenarioId:
            typeof (rd['scenario_id'] ?? rd['scenarioId'] ?? rd['simulationId']) === 'string'
              ? ((rd['scenario_id'] ?? rd['scenarioId'] ?? rd['simulationId']) as string)
              : null,
          reportData: (rd['report_data'] ?? rd['reportData'] ?? rd) as Record<string, unknown>,
          createdAt:
            typeof (rd['created_at'] ?? rd['createdAt']) === 'string'
              ? ((rd['created_at'] ?? rd['createdAt']) as string)
              : null,
        };
      }

      for (const reportId of [dto.report_key, dto.report_id]) {
        if (resolvedReport || !reportId) continue;
        const result = await resolveByReportId(reportId);
        if (result && 'success' in result) return result;
        resolvedReport = result;
      }

      if (!resolvedReport && dto.student_id && dto.simulation_id) {
        const row = await this.simulationReportRepo.findReportDetailRowByStudentAndScenario(
          dto.student_id,
          dto.simulation_id,
        );
        if (row) resolvedReport = fromRow(row);
      }

      const isAssessment = dto.report_type === 'assessment';
      if (isAssessment && !resolvedReport && (dto.report_key ?? dto.report_id)) {
        return {
          success: false,
          message: 'The requested assessment report could not be found',
          type: ErrorTypes.NOT_FOUND,
        };
      }

      let students: Student[] = [];

      if (dto.student_id) {
        const student = await this.studentRepo.findOne({
          where: { id: dto.student_id, class: { id: dto.class_id }, is_active: true },
          relations: ['class', 'educator', 'educator.userRole', 'educator.userRole.user'],
        });
        if (!student) {
          return {
            success: false,
            message: StudentConstants.VALIDATION.STUDENT_NOT_IN_CLASS,
            type: ErrorTypes.NOT_FOUND,
          };
        }
        students = [student];
      } else {
        students = await this.studentRepo.find({
          where: { class: { id: dto.class_id }, is_active: true },
          relations: ['class', 'educator', 'educator.userRole', 'educator.userRole.user'],
        });
        if (!students.length) {
          return {
            success: false,
            message: StudentConstants.VALIDATION.STUDENT_NOT_FOUND,
            type: ErrorTypes.NOT_FOUND,
          };
        }
      }

      let sent = 0;
      let failed = 0;
      const errors: string[] = [];

      await Promise.all(
        students.map(async (student) => {
          const finalRecipient =
            (student.educator && resolveEducatorEmail(student.educator)) ??
            dto.email ??
            ((student.class as unknown as Record<string, unknown>)?.['educator_email'] as
              string | undefined) ??
            null;
          if (!finalRecipient) {
            failed++;
            return;
          }

          const rd = resolvedReport?.reportData ?? null;
          const rawScore = rd?.['score'] ?? rd?.['Score'];
          const scoreStr =
            typeof rawScore === 'number' || typeof rawScore === 'string'
              ? `${Number(rawScore).toFixed(2)}%`
              : null;

          const timeSecs = rd?.['totalTimeSeconds'];
          const timeSpentStr: string | null =
            typeof timeSecs === 'number'
              ? ((): string => {
                const h = Math.floor(timeSecs / 3600);
                const m = Math.floor((timeSecs % 3600) / 60);
                const s = timeSecs % 60;
                return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
              })()
              : typeof rd?.['timeSpent'] === 'string'
                ? rd['timeSpent']
                : null;

          const submissionDate =
            typeof rd?.['createdAt'] === 'string'
              ? rd['createdAt']
              : resolvedReport?.createdAt
                ? String(resolvedReport.createdAt)
                : null;

          const scenarioTitle =
            typeof rd?.['scenarioTitle'] === 'string'
              ? rd['scenarioTitle']
              : typeof rd?.['title'] === 'string'
                ? rd['title']
                : (resolvedReport?.scenarioId ?? null);

          const scoreContext = isAssessment
            ? (scoreStr ?? '-')
            : (scoreStr ??
              (dto.score != null ? `${Number(dto.score).toFixed(2)}%` : null) ??
              (student.score != null ? `${Number(student.score).toFixed(2)}%` : '-'));

          const timeSpentContext = isAssessment
            ? (timeSpentStr ?? '-')
            : (timeSpentStr ?? dto.time_spent ?? student.time_spent ?? '-');

          const submissionContext = isAssessment
            ? (submissionDate ?? '-')
            : (submissionDate ?? student.submission_date ?? '-');

          const scenarioTitleContext = isAssessment
            ? (scenarioTitle ?? '-')
            : (scenarioTitle ?? dto.scenario_title ?? '-');

          const fmtEmailDate = (val: unknown): string => {
            if (!val) return '-';
            const strVal =
              typeof val === 'string' ? val : typeof val === 'number' ? String(val) : null;
            if (strVal === null) return '-';
            try {
              const d = new Date(strVal);
              if (isNaN(d.getTime())) return strVal;
              return d.toLocaleString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });
            } catch {
              return strVal;
            }
          };

          const simulationStarted = fmtEmailDate(rd?.['scenarioStartTime']);
          const simulationSubmitted = fmtEmailDate(rd?.['scenarioEndTime']);
          const reportGenerated = fmtEmailDate(rd?.['createdAt'] ?? resolvedReport?.createdAt);
          const studentCode =
            typeof rd?.['userId'] === 'string' ? rd['userId'] : (student.student_id ?? '-');
          const isPractice = typeof rd?.['mode'] === 'string' ? rd['mode'] === 'Practice' : false;

          const ca = (rd?.['communicationAssessment'] ?? null) as Record<string, unknown> | null;
          const rub = (ca?.['rubrics'] ?? null) as Record<string, unknown> | null;

          const executiveSummary: string | null =
            typeof rub?.['overallSummary'] === 'string' && rub['overallSummary'].trim()
              ? rub['overallSummary']
              : typeof rd?.['summary'] === 'string' && rd['summary'].trim()
                ? rd['summary']
                : null;

          const toPointStr = (s: unknown): { point: string; example: string | null } => {
            if (typeof s === 'string') return { point: s, example: null };
            const obj = s as Record<string, unknown>;
            const point = typeof obj?.['point'] === 'string' ? obj['point'] : '';
            const example = typeof obj?.['example'] === 'string' ? obj['example'] : null;
            return { point, example };
          };

          const rubricItemsRaw = (rub?.['items'] ?? null) as Record<
            string,
            Record<string, unknown>
          > | null;
          const rubricItems = rubricItemsRaw
            ? Object.values(rubricItemsRaw).map((item) => {
              const sc = typeof item['score'] === 'number' ? item['score'] : null;
              const scoreLabel =
                sc === null
                  ? ''
                  : sc >= 80
                    ? 'EXCEPTIONAL'
                    : sc >= 50
                      ? 'MEETS EXPECTATION'
                      : 'NEEDS IMPROVEMENT';
              const scoreLabelColor =
                sc === null ? '#555' : sc >= 80 ? '#059669' : sc >= 50 ? '#2563eb' : '#dc2626';
              const weight = typeof item['weight'] === 'number' ? `${item['weight']}%` : null;
              const strengths = Array.isArray(item['strengths'])
                ? (item['strengths'] as unknown[]).map(toPointStr).filter((p) => p.point.trim())
                : [];
              const weaknesses = Array.isArray(item['weaknesses'])
                ? (item['weaknesses'] as unknown[]).map(toPointStr).filter((p) => p.point.trim())
                : [];
              const recommendations = Array.isArray(item['recommendations'])
                ? (item['recommendations'] as string[]).filter(
                  (r) => typeof r === 'string' && r.trim(),
                )
                : [];
              return {
                name:
                  typeof (item['name'] ?? item['subCategory']) === 'string'
                    ? ((item['name'] ?? item['subCategory']) as string)
                    : '-',
                weight,
                scoreLabel,
                scoreLabelColor,
                summary: typeof item['summary'] === 'string' ? item['summary'] : null,
                strengths,
                weaknesses,
                recommendations,
                hasStrengths: strengths.length > 0,
                hasWeaknesses: weaknesses.length > 0,
                hasRecommendations: recommendations.length > 0,
              };
            })
            : null;
          const hasRubrics = !!(rubricItemsRaw && Object.keys(rubricItemsRaw).length > 0);

          const overallStrengths = Array.isArray(rub?.['strengths'])
            ? (rub['strengths'] as unknown[]).map(toPointStr).filter((p) => p.point.trim())
            : [];
          const overallImprovements = Array.isArray(rub?.['improvements'])
            ? (rub['improvements'] as unknown[]).map(toPointStr).filter((p) => p.point.trim())
            : [];

          const debriefReflection =
            typeof rd?.['debriefReflection'] === 'string' && rd['debriefReflection'].trim()
              ? rd['debriefReflection']
              : null;
          const reportMode =
            typeof resolvedReport?.reportData?.['mode'] === 'string'
              ? resolvedReport.reportData['mode']
              : null;
          const pdfFilename = dto.pdf_base64
            ? `${reportMode?.toLowerCase() === 'practice' ? 'practice' : 'assessment'}-report-${student.student_id ?? student.id}.pdf`
            : `report_${student.student_id ?? student.id}.pdf`;
          const attachments = dto.sendPdf
            ? [
              {
                filename: pdfFilename,
                content: dto.pdf_base64
                  ? this.decodePdfBase64(dto.pdf_base64)
                  : isAssessment && resolvedReport
                    ? this.generateResolvedReportPdf(student, resolvedReport)
                    : resolvedReport
                      ? this.generateResolvedReportPdf(student, resolvedReport)
                      : this.generateStudentReportPdf(student),
                contentType: 'application/pdf',
              },
            ]
            : [];

          try {
            const assessmentContext = {
              message: dto.message,
              studentId: student.student_id ?? '-',
              studentCode,
              className: student.class?.class_name ?? '-',
              score: scoreContext,
              attempt: isAssessment
                ? (rd?.['attempt'] ?? rd?.['attemptNumber'] ?? dto.attempt ?? '-')
                : (dto.attempt ?? student.attempt ?? '-'),
              simsCompleted: isAssessment
                ? (rd?.['simsCompleted'] ?? dto.sims_completed ?? '-')
                : (dto.sims_completed ?? student.sims_completed ?? '-'),
              timeSpent: timeSpentContext,
              timeRemaining: student.time_remaining ?? '-',
              submissionDate: submissionContext,
              scenarioTitle: scenarioTitleContext,
              scenarioId: resolvedReport?.scenarioId ?? '-',
              mode:
                typeof rd?.['mode'] === 'string'
                  ? rd['mode']
                  : dto.report_type === 'assessment'
                    ? 'Assessment'
                    : '-',
              isPractice,
              simulationStarted,
              simulationSubmitted,
              reportGenerated,
              executiveSummary,
              hasRubrics,
              rubricItems,
              hasOverallStrengths: overallStrengths.length > 0,
              overallStrengths,
              hasOverallImprovements: overallImprovements.length > 0,
              overallImprovements,
              debriefReflection,
              feedback:
                typeof rd?.['feedback'] === 'string'
                  ? rd['feedback']
                  : typeof rd?.['assessmentFeedback'] === 'string'
                    ? rd['assessmentFeedback']
                    : null,
              categories: ((): { name: unknown; score: string; passed: boolean | null }[] | null => {
                const cats = rd?.['categories'] ?? rd?.['grading'] ?? rd?.['categoryBreakdown'];
                if (!Array.isArray(cats)) return null;
                return (cats as Record<string, unknown>[]).map((c) => ({
                  name: c['name'] ?? c['category'] ?? c['label'] ?? '-',
                  score:
                    c['score'] != null &&
                      (typeof c['score'] === 'string' || typeof c['score'] === 'number')
                      ? String(c['score'])
                      : '-',
                  passed:
                    typeof c['passed'] === 'boolean'
                      ? c['passed']
                      : typeof c['status'] === 'string'
                        ? c['status'].toLowerCase() === 'pass' ||
                        c['status'].toLowerCase() === 'passed'
                        : null,
                }));
              })(),
            };

            await this.mailerService.sendMail(
              dto.html
                ? {
                  to: finalRecipient,
                  subject: dto.subject,
                  html: dto.html,
                  attachments,
                }
                : isAssessment
                  ? {
                    to: finalRecipient,
                    subject: dto.subject,
                    template: 'assessment-report',
                    context: assessmentContext,
                    attachments,
                  }
                  : {
                    to: finalRecipient,
                    subject: dto.subject,
                    template: 'email-report',
                    context: assessmentContext,
                    attachments,
                  },
            );
            sent++;
          } catch (err) {
            failed++;
            errors.push(`${finalRecipient}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }),
      );

      if (sent === 0) {
        return {
          success: false,
          message:
            errors.length > 0 ? errors.join(' | ') : StudentConstants.VALIDATION.EMAIL_FAILED_ALL,
          type: ErrorTypes.BAD_REQUEST,
        };
      }

      const successMsg = dto.student_id
        ? StudentConstants.MESSAGES.EMAIL_SENT_SINGLE
        : StudentConstants.MESSAGES.EMAIL_SENT_COUNT(sent);
      const failMsg = failed
        ? `${StudentConstants.MESSAGES.EMAIL_FAILED_COUNT(failed)}: ${errors.join(' | ')}`
        : '';

      return {
        success: true,
        message: `${successMsg}${failMsg}`,
        data: { sent, failed },
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : StudentConstants.VALIDATION.EMAIL_FAILED;
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  /** See simulation.service.ts's identical helper for why this mapping is needed. */
  private toBlobScenario(sim: SimulationV2): BlobScenario {
    const learningObjective = Array.isArray(sim.learningObjective)
      ? sim.learningObjective.join('\n')
      : sim.learningObjective;

    return {
      ...sim,
      id: sim.id,
      unitId: sim.unitId ?? '',
      learningObjective,
    } as unknown as BlobScenario;
  }

  private toSimulationSummary(
    simulation: BlobScenario,
    assignment: {
      start_date?: string | null;
      end_date?: string | null;
      due_date?: string | null;
    } | null,
    progress?: StudentSimulationProgress,
  ): StudentSimulationSummary {
    const sim = simulation as BlobScenario & Record<string, unknown>;
    const learningObjectives = simulation.learningObjective
      ? simulation.learningObjective
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
      : [];

    return {
      id: simulation.id,
      title: simulation.title,
      description: simulation.description ?? '',
      avatarEnabled: simulation.avatarEnabled ?? false,
      avatarId: simulation.avatarId ?? null,
      StartDate: assignment?.start_date ?? null,
      EndDate: assignment?.end_date ?? null,
      DueDate: assignment?.due_date ?? null,
      modes: ['Assessment', 'Practice'],
      canForfeit: canForfeitSimulation(progress),
      attemptCount: progress?.assessmentAttemptsCount ?? 0,
      maxAttempts: SimulationAttemptConstants.MAX_ASSESSMENT_ATTEMPTS,
      estimatedDuration: simulation.estimatedDuration ?? null,
      timeAllotment: simulation.studentBriefing?.timeAllotment ?? null,
      learningObjectives,
      keyTopics: sim['topicsAddressed'] ?? simulation.learningObjectiveCard ?? null,
      briefing: simulation.enableStudentBriefing ? (simulation.studentBriefing ?? null) : null,
      sbar: simulation.sbar ?? null,
      requiredEquipment: {
        additional: sim['additionalEquipment'] ?? null,
        optional: sim['optionalEquipment'] ?? null,
        setupNotes: sim['setupNotes'] ?? null,
      },
      department: simulation.department ?? null,
      productName: (simulation.productSetup as { title?: string } | undefined)?.title ?? null,
    };
  }

  async lookupByCode(studentCode: string): Promise<ServiceResponse<StudentProfileResponse>> {
    try {
      this.logger.log(`[lookupByCode] Looking up student with code: ${redactCode(studentCode)}`);

      const student = await this.studentRepo.findOne({
        where: { student_id: studentCode, is_active: true },
        relations: [
          'class',
          'class.educator',
          'class.educator.userRole',
          'class.educator.userRole.user',
          'educator',
          'educator.userRole',
          'educator.userRole.user',
        ],
      });

      this.logger.log(
        `[lookupByCode] DB result: ${student ? `found (id=${student.id}, is_active=${student.is_active}, class_id=${student.class?.id ?? 'NULL'})` : 'NOT FOUND'}`,
      );

      if (!student || Boolean(student.deleted_at) || student.is_active === false) {
        this.logger.warn(`[lookupByCode] No student found for code: ${redactCode(studentCode)}`);
        return {
          success: false,
          message: StudentConstants.VALIDATION.STUDENT_NOT_FOUND,
          type: ErrorTypes.NOT_FOUND,
        };
      }

      const educator = student.educator ?? student.class?.educator;
      if (educator && (educator.is_active === false || Boolean(educator.deleted_at))) {
        this.logger.warn(
          `[lookupByCode] Educator is deleted/deactivated for code: ${redactCode(studentCode)}`,
        );
        return {
          success: false,
          message: StudentConstants.VALIDATION.CLASS_INACTIVE,
          type: ErrorTypes.UNAUTHORIZED,
        };
      }

      if (educator && resolveEducatorStatus(educator) === CommonStatus.INACTIVE) {
        this.logger.warn(
          `[lookupByCode] Educator is inactive for code: ${redactCode(studentCode)}`,
        );
        return {
          success: false,
          message: StudentConstants.VALIDATION.EDUCATOR_INACTIVE,
          type: ErrorTypes.UNAUTHORIZED,
        };
      }

      this.logger.log(
        `[lookupByCode] Class status: is_active=${student.class?.is_active}, status=${student.class?.status}, student.is_active=${student.is_active}, student.status=${student.status}`,
      );

      if (
        student.class?.is_active === false ||
        Boolean(student.class?.deleted_at) ||
        student.class?.status === CommonStatus.INACTIVE ||
        student.class?.status === CommonStatus.ARCHIEVED ||
        student.class?.status === CommonStatus.ARCHIVED ||
        student.status === CommonStatus.INACTIVE ||
        student.status === CommonStatus.ARCHIEVED ||
        student.status === CommonStatus.ARCHIVED
      ) {
        this.logger.warn(
          `[lookupByCode] Student or class is inactive for code: ${redactCode(studentCode)}`,
        );
        const isDraft =
          student.class?.status === CommonStatus.DRAFT || student.status === CommonStatus.DRAFT;
        const isArchived =
          student.class?.status === CommonStatus.ARCHIEVED ||
          student.status === CommonStatus.ARCHIEVED;
        const message = isDraft
          ? StudentConstants.VALIDATION.CLASS_DRAFT
          : isArchived
            ? StudentConstants.VALIDATION.CLASS_ARCHIVED
            : StudentConstants.VALIDATION.CLASS_INACTIVE;
        return {
          success: false,
          message,
          type: ErrorTypes.UNAUTHORIZED,
        };
      }

      if (!student.class?.id) {
        this.logger.warn(
          `[lookupByCode] Student has no class assigned for code: ${redactCode(studentCode)}`,
        );
        return {
          success: false,
          message: StudentConstants.VALIDATION.STUDENT_CLASS_MISSING,
          type: ErrorTypes.BAD_REQUEST,
        };
      }

      const classSimulations = await this.classSimulationRepo.find({
        where: { class_id: student.class.id, is_active: true },
      });

      this.logger.log(
        `[lookupByCode] classSimulations found: ${classSimulations.length} for class_id: ${student.class.id}`,
      );

      const allSimulationRows = await this.simulationV2Repository.find();
      const simulations = allSimulationRows.map((s) => this.toBlobScenario(s));

      // The automation-only simulation is filtered out of the list above for
      // non-tester sessions (incl. this student session) — for the tester's
      // dedicated automation student codes, add it back so a real
      // class_simulations assignment/dates (set via Class Management) match.
      const isAutomationStudent = this.automationAccess.isAutomationStudentCode(studentCode);
      const automationScenario = isAutomationStudent
        ? (allSimulationRows.find((s) =>
          isAutomationOnlyRecord(s as unknown as Record<string, unknown>),
        ) ?? null)
        : null;
      if (automationScenario && !simulations.some((s) => s.id === automationScenario.id)) {
        simulations.push(this.toBlobScenario(automationScenario));
      }

      if (!simulations || simulations.length === 0) {
        this.logger.warn(
          `[lookupByCode] No simulations found for student code: ${redactCode(studentCode)}`,
        );
      } else {
        this.logger.debug(`[lookupByCode] Retrieved ${simulations.length} simulations`);
        // Log first simulation details to check data completeness
        const firstSim = simulations[0];
        this.logger.debug(
          `[lookupByCode] First simulation sample: id=${firstSim?.id}, hasLearningObjective=${!!firstSim?.learningObjective}, hasStudentBriefing=${!!firstSim?.studentBriefing}, hasSbar=${!!firstSim?.sbar}`,
        );
      }

      const simulationResponses: StudentSimulationSummary[] = classSimulations.flatMap(
        (assignment) => {
          const simulation = simulations.find((s) => s.id === assignment.simulation_id);

          if (!simulation) {
            return [];
          }

          return [this.toSimulationSummary(simulation, assignment)];
        },
      );

      // Fallback only if the automation-only simulation has no real
      // class_simulations row for this class — synthetic always-open window
      // (today → +1 year) so it still appears rather than being missing.
      if (automationScenario && !simulationResponses.some((s) => s.id === automationScenario.id)) {
        const today = new Date();
        const oneYearOut = new Date(today);
        oneYearOut.setFullYear(oneYearOut.getFullYear() + 1);
        const toDateOnly = (d: Date): string => d.toISOString().slice(0, 10);

        simulationResponses.push(
          this.toSimulationSummary(this.toBlobScenario(automationScenario), {
            start_date: toDateOnly(today),
            end_date: toDateOnly(oneYearOut),
            due_date: toDateOnly(oneYearOut),
          }),
        );
      }

      this.logger.log(
        `[lookupByCode] classSimulations found: ${classSimulations.length} for class_id: ${student.class.id}`,
      );

      // A student without a Student Code gets no Attempts, so the lookup never scans every report.
      const reports =
        student.id && student.student_id
          ? await this.simulationReportRepo.findAttemptRowsByStudentId(student.id)
          : [];

      return {
        success: true,
        message: Messages.STUDENT_FETCHED,
        data: {
          simulations: simulationResponses,
          reports,
        },
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : StudentConstants.VALIDATION.FETCH_ONE_FAILED;
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  async studentLogin(
    studentId: string,
    res: Response,
    ltiLaunchContext?: { simulationId?: string; resourceLinkId?: string; classId?: string },
  ): Promise<ServiceResponse<StudentLoginData>> {
    try {
      this.logger.log(`[studentLogin] Login attempt for student_id: ${redactCode(studentId)}`);

      const student = await this.studentRepo.findOne({
        where: { student_id: studentId, is_active: true },
        relations: [
          'class',
          'class.educator',
          'class.educator.userRole',
          'class.educator.userRole.user',
          'educator',
          'educator.userRole',
          'educator.userRole.user',
        ],
      });

      this.logger.log(
        `[studentLogin] DB result: ${student ? `found (id=${student.id}, is_active=${student.is_active}, class_id=${student.class?.id ?? 'NULL'})` : 'NOT FOUND'}`,
      );

      if (!student || Boolean(student.deleted_at) || student.is_active === false) {
        this.logger.warn(
          `[studentLogin] No student found for student_id: ${redactCode(studentId)}`,
        );
        return {
          success: false,
          message: StudentConstants.VALIDATION.STUDENT_ID_NOT_FOUND,
          type: ErrorTypes.NOT_FOUND,
        };
      }

      const educator = student.educator ?? student.class?.educator;
      if (educator && (educator.is_active === false || Boolean(educator.deleted_at))) {
        this.logger.warn(
          `[studentLogin] Educator is deleted/deactivated for student_id: ${redactCode(studentId)}`,
        );
        return {
          success: false,
          message: StudentConstants.VALIDATION.CLASS_INACTIVE,
          type: ErrorTypes.BAD_REQUEST,
        };
      }

      if (educator && resolveEducatorStatus(educator) === CommonStatus.INACTIVE) {
        this.logger.warn(
          `[studentLogin] Educator is inactive for student_id: ${redactCode(studentId)}`,
        );
        return {
          success: false,
          message: StudentConstants.VALIDATION.EDUCATOR_INACTIVE,
          type: ErrorTypes.BAD_REQUEST,
        };
      }

      this.logger.log(
        `[studentLogin] Class status: is_active=${student.class?.is_active}, status=${student.class?.status}, student.is_active=${student.is_active}, student.status=${student.status}`,
      );

      if (
        student.class?.is_active === false ||
        Boolean(student.class?.deleted_at) ||
        student.class?.status === CommonStatus.INACTIVE ||
        student.class?.status === CommonStatus.ARCHIEVED ||
        student.class?.status === CommonStatus.ARCHIVED ||
        student.class?.status === CommonStatus.DRAFT ||
        student.status === CommonStatus.INACTIVE ||
        student.status === CommonStatus.DRAFT ||
        student.status === CommonStatus.ARCHIEVED ||
        student.status === CommonStatus.ARCHIVED
      ) {
        this.logger.warn(
          `[studentLogin] Student or class is inactive for student_id: ${redactCode(studentId)}`,
        );
        const isDraft =
          student.class?.status === CommonStatus.DRAFT || student.status === CommonStatus.DRAFT;
        const isArchived =
          student.class?.status === CommonStatus.ARCHIEVED ||
          student.class?.status === CommonStatus.ARCHIVED ||
          student.status === CommonStatus.ARCHIEVED ||
          student.status === CommonStatus.ARCHIVED;
        const message = isDraft
          ? StudentConstants.VALIDATION.CLASS_DRAFT
          : isArchived
            ? StudentConstants.VALIDATION.CLASS_ARCHIVED
            : StudentConstants.VALIDATION.CLASS_INACTIVE;
        return {
          success: false,
          message,
          type: ErrorTypes.BAD_REQUEST,
        };
      }

      this.logger.log(`[studentLogin] Login successful for student_id: ${redactCode(studentId)}`);

      const studentTokens = this.tokenService.generateTokens({
        sub: student.student_id ?? student.id,
        studentId: student.id,
        user_id: student.id,
        student_id: student.student_id ?? null,
        type: UserTokenType.STUDENT,
        purpose: TokenPurposeType.ACCESS,
        roles: [RoleSlug.STUDENT],
        ltiLaunch: ltiLaunchContext,
      });
      const accessToken = studentTokens.access_token;
      this.tokenService.setAuthCookies(res, {
        access_token: studentTokens.access_token,
        expires_in: studentTokens.expires_in,
      });

      return {
        success: true,
        message: StudentConstants.MESSAGES.LOGIN_SUCCESS,
        data: {
          id: student.id,
          student_id: student.student_id,
          status: student.status,
          class_id: student.class?.id,
          class_name: student.class?.class_name,
          type: UserTokenType.STUDENT,
          access_token: accessToken,
          token_type: 'Bearer',
        },
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : StudentConstants.VALIDATION.FETCH_ONE_FAILED;
      this.logger.error(
        `[studentLogin] Error for student_id: ${redactCode(studentId)} => ${message}`,
      );
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  async getSimulationsByCode(
    studentCode: string,
  ): Promise<ServiceResponse<StudentProfileResponse>> {
    this.logger.log(
      `[getSimulationsByCode] Fetching simulations for student code: ${redactCode(studentCode)}`,
    );
    return this.lookupByCode(studentCode);
  }

  async startAssessment(
    studentId: string,
    scenarioId: string,
    mode: 'Assessment' | 'Practice' = 'Assessment',
  ): Promise<ServiceResponse<null>> {
    try {
      const student = await this.studentRepo.findOne({ where: { id: studentId } });
      const isRepeatAllowedStudent = this.isRepeatAllowedStudent(student?.student_id);
      const progress = await this.simulationProgressRepo.findByStudentAndScenarioId(
        studentId,
        scenarioId,
      );

      if (progress && !isRepeatAllowedStudent) {
        const rejection = this.resolveStartRejection(progress, mode);
        if (rejection) {
          return { success: false, message: rejection, type: ErrorTypes.BAD_REQUEST };
        }
      }
      return {
        success: true,
        message: StudentConstants.MESSAGES.ASSESSMENT_CAN_PROCEED,
        data: null,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : StudentConstants.VALIDATION.FETCH_ONE_FAILED;
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  /** The i18n key explaining why this launch is refused, or null when the student may start. */
  private resolveStartRejection(
    progress: StudentSimulationProgress,
    mode: 'Assessment' | 'Practice',
  ): string | null {
    if (progress.status === SimulationProgressStatus.FORFEITED) {
      return SIMULATION_PROGRESS_MSG.ASSESSMENT_FORFEITED;
    }
    if (progress.status === SimulationProgressStatus.COMPLETED) {
      return SIMULATION_PROGRESS_MSG.SIMULATION_COMPLETED;
    }
    if (
      mode === String(ReportModeType.ASSESSMENT) &&
      progress.assessmentAttemptsCount >= SimulationAttemptConstants.MAX_ASSESSMENT_ATTEMPTS
    ) {
      return SIMULATION_PROGRESS_MSG.ASSESSMENT_ATTEMPT_LIMIT_REACHED;
    }
    return null;
  }

  private generateResolvedReportPdf(
    student: Student,
    resolved: {
      studentName: string | null;
      scenarioId: string | null;
      reportData: Record<string, unknown>;
      createdAt: string | Date | null;
    },
  ): Buffer {
    const rd = resolved.reportData;

    const rawScore = rd['score'] ?? rd['Score'];
    const score =
      typeof rawScore === 'number' || typeof rawScore === 'string'
        ? `${Number(rawScore).toFixed(2)}%`
        : student.score != null
          ? `${Number(student.score).toFixed(2)}%`
          : '-';

    const timeSecs = rd['totalTimeSeconds'];
    const timeSpent =
      typeof timeSecs === 'number'
        ? ((): string => {
          const h = Math.floor(timeSecs / 3600);
          const m = Math.floor((timeSecs % 3600) / 60);
          const s = timeSecs % 60;
          return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        })()
        : typeof rd['timeSpent'] === 'string'
          ? rd['timeSpent']
          : (student.time_spent ?? '-');

    const submissionDate =
      typeof rd['createdAt'] === 'string'
        ? rd['createdAt']
        : resolved.createdAt
          ? String(resolved.createdAt)
          : (student.submission_date ?? '-');

    const scenarioTitle =
      typeof rd['scenarioTitle'] === 'string'
        ? rd['scenarioTitle']
        : typeof rd['title'] === 'string'
          ? rd['title']
          : (resolved.scenarioId ?? '-');

    const mode = typeof rd['mode'] === 'string' ? rd['mode'] : '-';

    const lines = [
      `%PDF-1.4`,
      `1 0 obj<</Type /Catalog /Pages 2 0 R>>endobj`,
      `2 0 obj<</Type /Pages /Kids [3 0 R] /Count 1>>endobj`,
      `3 0 obj<</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]`,
      `/Contents 4 0 R /Resources <</Font <</F1 <</Type /Font /Subtype /Type1 /BaseFont /Helvetica>>>>>>>>endobj`,
      `4 0 obj<</Length 400>>`,
      `stream`,
      `BT /F1 14 Tf 50 750 Td (Assessment Report) Tj`,
      `0 -20 Td (Student ID: ${student.student_id ?? '-'}) Tj`,
      `0 -20 Td (Class: ${student.class?.class_name ?? '-'}) Tj`,
      `0 -20 Td (Scenario: ${scenarioTitle}) Tj`,
      `0 -20 Td (Mode: ${mode}) Tj`,
      `0 -20 Td (Score: ${score}) Tj`,
      `0 -20 Td (Time Spent: ${timeSpent}) Tj`,
      `0 -20 Td (Submission Date: ${submissionDate}) Tj ET`,
      `endstream endobj`,
      `xref trailer <</Root 1 0 R>> %%EOF`,
    ];
    return Buffer.from(lines.join('\n'), 'utf-8');
  }

  private normalizeBase64String(value: string): string {
    const commaIndex = value.indexOf(',');
    const raw = commaIndex >= 0 ? value.slice(commaIndex + 1) : value;
    return raw.replace(/\s+/g, '');
  }

  private decodePdfBase64(value: string): Buffer {
    const normalized = this.normalizeBase64String(value);
    if (!normalized.startsWith('JVBERi0')) {
      throw new Error('Invalid PDF base64 payload');
    }
    return Buffer.from(normalized, 'base64');
  }

  private generateStudentReportPdf(student: Student): Buffer {
    const lines = [
      `%PDF-1.4`,
      `1 0 obj<</Type /Catalog /Pages 2 0 R>>endobj`,
      `2 0 obj<</Type /Pages /Kids [3 0 R] /Count 1>>endobj`,
      `3 0 obj<</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]`,
      `/Contents 4 0 R /Resources <</Font <</F1 <</Type /Font /Subtype /Type1 /BaseFont /Helvetica>>>>>>>>endobj`,
      `4 0 obj<</Length 300>>`,
      `stream`,
      `BT /F1 14 Tf 50 750 Td (Student Report) Tj`,
      `0 -20 Td (Student ID: ${student.student_id ?? '-'}) Tj`,
      `0 -20 Td (Class: ${student.class?.class_name ?? '-'}) Tj`,
      `0 -20 Td (Score: ${student.score ?? '-'}) Tj`,
      `0 -20 Td (Attempt: ${student.attempt ?? '-'}) Tj`,
      `0 -20 Td (Sims Completed: ${student.sims_completed ?? '-'}) Tj`,
      `0 -20 Td (Time Spent: ${student.time_spent ?? '-'}) Tj`,
      `0 -20 Td (Submission Date: ${student.submission_date ?? '-'}) Tj ET`,
      `endstream endobj`,
      `xref trailer <</Root 1 0 R>> %%EOF`,
    ];
    return Buffer.from(lines.join('\n'), 'utf-8');
  }
}
