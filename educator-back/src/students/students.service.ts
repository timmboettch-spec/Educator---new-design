import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Student } from './entity/students.entity';
import {
  CreateStudentDto,
  BulkCreateStudentDto,
  UpdateStudentDto,
  EmailReportDto,
  BatchEmailDto,
} from './dto/students.dto';
import { Class } from '../class/entity/class.entity';
import { Educator } from '../educators/entity/educator.entity';
import { User } from '../users/entity/user.entity';
import { ClassSimulation } from '../class-simulations/entity/class-simulation.entity';
import { SimulationReport } from '../simulation-reports/entity/simulation-report.entity';
import { CommonStatus } from 'src/common/enums/status.enum';
import { BlobScenario, ServiceResponse } from 'src/common/types';
import { ErrorTypes, Messages } from 'src/common/utils/messages';
import { StudentConstants } from './students.constants';
import { MailService } from '../mail/mail.service';
import { TutorPatientService } from 'src/common/utils/tutor-patient.service';
import {
  StudentProfileResponse,
  StudentSimulationSummary,
} from './interfaces/student-profile.interface';
import { StudentLoginData } from './interfaces/student-profile.interface';
import { AuthConstants } from '../auth/auth.constants';
import { JwtPayload } from 'src/common/strategy/jwt.strategy.entity';
import { ClassSimulationService } from 'src/class-simulations/class-simulation.service';

const REPEAT_ALLOWED_STUDENT_CODES = new Set(['85170719']);
const EMAIL_WORKER_CONCURRENCY = 8;

@Injectable()
export class StudentsService {
  private readonly logger = new Logger(StudentsService.name);

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
    @InjectRepository(Student)
    private readonly studentRepo: Repository<Student>,
    private readonly mailerService: MailService,
    private readonly dataSource: DataSource,
    private readonly tutorPatientService: TutorPatientService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly classSimulationService: ClassSimulationService,
  ) { }
  async findClassById(id: string): Promise<Class | null> {
    return this.studentRepo.manager.findOne(Class, {
      where: { id: id, is_active: true },
      relations: ['school'],
    });
  }

  async findUserById(id: string): Promise<User | null> {
    return this.studentRepo.manager.findOne(User, {
      where: { id },
      relations: ['role'],
    });
  }

  async findAnyUserByEmail(email: string): Promise<'user' | 'educator' | null> {
    const normalizedEmail = email.trim().toLowerCase();

    const user = await this.studentRepo.manager.findOne(User, {
      where: { email: normalizedEmail },
    });
    if (user) return 'user';

    const educator = await this.studentRepo.manager.findOne(Educator, {
      where: { email: normalizedEmail, is_active: true },
    });
    if (educator) return 'educator';

    return null;
  }

  async findEducatorById(id: string): Promise<Educator | null> {
    return this.studentRepo.manager.findOne(Educator, {
      where: { id, is_active: true },
      relations: ['role'],
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

      const student = this.studentRepo.create({
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

      const saved = await this.studentRepo.save(student);

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
    try {
      if (classData.id && educator.id && dto.count > 0) {
        const alloc = await this.classSimulationService.allocateSeatsForNewStudents(
          classData.id,
          educator.id,
          dto.count,
        );
        if (!alloc.success) {
          return { success: false, message: alloc.message!, type: alloc.type };
        }
      }

      const existing = await this.studentRepo
        .createQueryBuilder('s')
        .select('s.student_id', 'student_id')
        .where(`s.student_id IS NOT NULL AND s.student_id <> ''`)
        .getRawMany<{ student_id: string }>();

      const usedCodes = new Set(existing.map((r) => r.student_id));
      const students: Student[] = [];

      for (let i = 0; i < dto.count; i++) {
        // pass usedCodes so generateUniqueStudentId skips its own DB query each iteration
        const studentId = await this.generateUniqueStudentId(classData.class_name ?? '', usedCodes);
        usedCodes.add(studentId);
        students.push(
          this.studentRepo.create({
            student_id: studentId,
            status: CommonStatus.ACTIVE,
            class: classData,
            educator,
          }),
        );
      }

      const saved = await this.studentRepo.save(students);
      return {
        success: true,
        message: `${saved.length} student(s) created successfully`,
        data: saved,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : StudentConstants.VALIDATION.BULK_CREATE_FAILED;
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
      const students = await this.studentRepo
        .createQueryBuilder('s')
        .leftJoin('s.school', 'school')
        .leftJoinAndSelect('s.class', 'cls')
        .leftJoinAndSelect('s.educator', 'educator')
        .where('s.class_id = :classId', { classId })
        .andWhere('s.is_active = true')
        .andWhere('(s.school_id IS NULL OR school.is_active = true)')
        .orderBy('s.id', 'DESC')
        .getMany();

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

  async update(student: Student, dto: UpdateStudentDto, userId: string): Promise<ServiceResponse<Student>> {
    try {
      if (!student || !student.id) {
        return { success: false, message: Messages.STUDENT_NOT_FOUND, type: ErrorTypes.NOT_FOUND };
      }
      const classData = await this.findClassByStudentId(student.id);

      if (!classData) {
        throw new BadRequestException(
          StudentConstants.VALIDATION.STUDENT_CLASS_MISSING,
        );
      }
      const educator = await this.findEducatorByStudentId(student.id)
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

      const updated = await this.studentRepo.save(student);

      return {
        success: true,
        message: Messages.STUDENT_UPDATED,
        data: updated,
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
      await this.studentRepo.save(student);

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
      const updated = await this.studentRepo.save(student);
      return { success: true, message: Messages.STUDENT_ID_GENERATED, data: updated };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : StudentConstants.VALIDATION.UPDATE_CODE_FAILED;
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  async revokeCode(student: Student): Promise<ServiceResponse<Student>> {
    try {
      student.student_id = '';
      const updated = await this.studentRepo.save(student);
      return { success: true, message: Messages.STUDENT_CODE_REVOKED, data: updated };
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
      const updated = await this.studentRepo.save(student);
      return { success: true, message: Messages.STUDENT_CODE_REGENERATED, data: updated };
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
    let usedCodes: Set<string>;
    if (existingCodes) {
      usedCodes = existingCodes;
    } else {
      const existing = await this.studentRepo
        .createQueryBuilder('s')
        .select('s.student_id', 'student_id')
        .where(`s.student_id IS NOT NULL AND s.student_id <> ''`)
        .getRawMany<{ student_id: string }>();
      usedCodes = new Set(existing.map((r) => r.student_id));
    }
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
        return candidate;
      }
    }

    throw new BadRequestException(StudentConstants.VALIDATION.COLLISION_ERROR);
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

      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const normaliseCode = (s?: string | null): string =>
        s ? s.toUpperCase().replace(/[-_ ]/g, '') : '';

      const checkBlobOwnership = async (
        blobRecord: Record<string, unknown>,
      ): Promise<ServiceResponse<never> | null> => {
        if (!dto.student_id) return null;
        const ownerCode = (blobRecord['userId'] ??
          blobRecord['studentId'] ??
          blobRecord['student_id'] ??
          blobRecord['user_id']) as string | undefined;
        if (!ownerCode) return null;
        const rows: { student_id: string | null }[] = await this.dataSource.query(
          `SELECT student_id FROM students WHERE id = $1 LIMIT 1`,
          [dto.student_id],
        );
        if (normaliseCode(rows[0]?.student_id) !== normaliseCode(ownerCode)) {
          return {
            success: false,
            message: 'Report does not belong to the specified student',
            type: ErrorTypes.FORBIDDEN,
          };
        }
        return null;
      };

      const fromBlob = (r: Record<string, unknown>): ResolvedReport => {
        const rd = (r['report_data'] ?? r['reportData'] ?? r) as Record<string, unknown>;
        return {
          studentName:
            typeof (r['student_name'] ?? r['studentName'] ?? rd['studentName']) === 'string'
              ? ((r['student_name'] ?? r['studentName'] ?? rd['studentName']) as string)
              : null,
          scenarioId:
            typeof (r['scenario_id'] ?? r['scenarioId'] ?? r['simulationId']) === 'string'
              ? ((r['scenario_id'] ?? r['scenarioId'] ?? r['simulationId']) as string)
              : null,
          reportData: rd,
          createdAt:
            typeof (r['created_at'] ?? r['createdAt'] ?? rd['createdAt']) === 'string'
              ? ((r['created_at'] ?? r['createdAt'] ?? rd['createdAt']) as string)
              : null,
        };
      };

      const fromDb = (r: SimulationReport): ResolvedReport => ({
        studentName: r.student_name,
        scenarioId: r.scenario_id,
        reportData: (r.report_data ?? {}) as Record<string, unknown>,
        createdAt: r.created_at,
      });

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

      if (!resolvedReport && dto.report_key) {
        const allBlob = (await this.tutorPatientService.getReports()) as Array<
          Record<string, unknown>
        >;
        const match = allBlob.find((r) => {
          const rid = (r['id'] ?? r['key'] ?? r['reportId'] ?? r['report_id']) as
            string | undefined;
          return rid === dto.report_key;
        });
        if (match) {
          const ownerErr = await checkBlobOwnership(match);
          if (ownerErr) return ownerErr;
          resolvedReport = fromBlob(match);
        }
      }

      if (!resolvedReport && dto.report_id) {
        const simRepo = this.dataSource.getRepository(SimulationReport);
        if (UUID_RE.test(dto.report_id)) {
          const dbRow = await simRepo.findOne({ where: { id: dto.report_id } });
          if (dbRow) {
            if (dto.student_id && dbRow.student_id !== dto.student_id) {
              return {
                success: false,
                message: 'Report does not belong to the specified student',
                type: ErrorTypes.FORBIDDEN,
              };
            }
            resolvedReport = fromDb(dbRow);
          }
        }
        if (!resolvedReport) {
          const allBlob = (await this.tutorPatientService.getReports()) as Array<
            Record<string, unknown>
          >;
          const match = allBlob.find((r) => {
            const rid = (r['id'] ?? r['key'] ?? r['reportId'] ?? r['report_id']) as
              string | undefined;
            return rid === dto.report_id;
          });
          if (match) {
            const ownerErr = await checkBlobOwnership(match);
            if (ownerErr) return ownerErr;
            resolvedReport = fromBlob(match);
          }
        }
      }

      if (!resolvedReport && dto.student_id && dto.simulation_id) {
        const simRepo = this.dataSource.getRepository(SimulationReport);
        const dbRow = await simRepo.findOne({
          where: { student_id: dto.student_id, scenario_id: dto.simulation_id },
        });
        if (dbRow) resolvedReport = fromDb(dbRow);
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
          relations: ['class', 'educator'],
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
          relations: ['class', 'educator'],
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
            student.educator?.email ??
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

  async lookupByCode(studentCode: string): Promise<ServiceResponse<StudentProfileResponse>> {
    try {
      this.logger.log(`[lookupByCode] Looking up student with code: ${studentCode}`);

      const student = await this.studentRepo.findOne({
        where: { student_id: studentCode, is_active: true },
        relations: ['class'],
      });

      this.logger.log(
        `[lookupByCode] DB result: ${student ? `found (id=${student.id}, is_active=${student.is_active}, class_id=${student.class?.id ?? 'NULL'})` : 'NOT FOUND'}`,
      );

      if (!student) {
        this.logger.warn(`[lookupByCode] No student found for code: ${studentCode}`);
        return {
          success: false,
          message: StudentConstants.VALIDATION.STUDENT_NOT_FOUND,
          type: ErrorTypes.NOT_FOUND,
        };
      }

      this.logger.log(
        `[lookupByCode] Class status: is_active=${student.class?.is_active}, status=${student.class?.status}, student.is_active=${student.is_active}, student.status=${student.status}`,
      );

      if (
        student.class?.is_active === false ||
        student.class?.status === CommonStatus.INACTIVE ||
        student.class?.status === CommonStatus.ARCHIEVED ||
        student.is_active === false ||
        student.status === CommonStatus.INACTIVE ||
        student.status === CommonStatus.ARCHIEVED
      ) {
        this.logger.warn(`[lookupByCode] Student or class is inactive for code: ${studentCode}`);
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
          type: ErrorTypes.BAD_REQUEST,
        };
      }

      if (!student.class?.id) {
        this.logger.warn(`[lookupByCode] Student has no class assigned for code: ${studentCode}`);
        return {
          success: false,
          message: StudentConstants.VALIDATION.STUDENT_CLASS_MISSING,
          type: ErrorTypes.BAD_REQUEST,
        };
      }

      const classSimulations = await this.studentRepo.manager.find(ClassSimulation, {
        where: { class_id: student.class.id, is_active: true },
      });

      this.logger.log(
        `[lookupByCode] classSimulations found: ${classSimulations.length} for class_id: ${student.class.id}`,
      );

      const simulations = (await this.tutorPatientService.getFreshScenarios()) as BlobScenario[];

      if (!simulations || simulations.length === 0) {
        this.logger.warn(
          `[lookupByCode] No simulations found from blob storage for student code: ${studentCode}`,
        );
      } else {
        this.logger.debug(
          `[lookupByCode] Retrieved ${simulations.length} simulations from blob storage`,
        );
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

          const sim = simulation as BlobScenario & Record<string, unknown>;
          const learningObjectives = simulation.learningObjective
            ? simulation.learningObjective
              .split('\n')
              .map((s) => s.trim())
              .filter(Boolean)
            : [];

          return [
            {
              id: simulation.id,
              title: simulation.title,
              description: simulation.description ?? '',
              avatarEnabled: simulation.avatarEnabled ?? false,
              StartDate: assignment.start_date ?? null,
              EndDate: assignment.end_date ?? null,
              DueDate: assignment.due_date ?? null,
              modes: ['Assessment', 'Practice'],
              estimatedDuration: simulation.estimatedDuration ?? null,
              timeAllotment: simulation.studentBriefing?.timeAllotment ?? null,
              learningObjectives,
              keyTopics:
                (sim['topicsAddressed'] as string | undefined) ??
                simulation.learningObjectiveCard ??
                null,
              briefing: simulation.enableStudentBriefing
                ? (simulation.studentBriefing ?? null)
                : null,
              sbar: simulation.sbar ?? null,
              requiredEquipment: {
                additional: (sim['additionalEquipment'] as string | undefined) ?? null,
                optional: (sim['optionalEquipment'] as string | undefined) ?? null,
                setupNotes: (sim['setupNotes'] as string | undefined) ?? null,
              },
              department: simulation.department ?? null,
              productName:
                (simulation.productSetup as { title?: string } | undefined)?.title ?? null,
            },
          ];
        },
      );

      this.logger.log(
        `[lookupByCode] classSimulations found: ${classSimulations.length} for class_id: ${student.class.id}`,
      );

      const dbReports: SimulationReport[] = student.id
        ? await this.studentRepo.manager.find(SimulationReport, {
          where: { student_id: student.id },
        })
        : [];

      const blobResult = student.student_id
        ? await this.tutorPatientService.getReportsByStudentIdsFresh([student.student_id])
        : { matched: await this.tutorPatientService.getReports(), isMatch: false };

      const normalisedBlob = (blobResult.matched as Array<Record<string, unknown>>).map(
        (r) => ({ ...r, student_id: student.id }) as unknown as SimulationReport,
      );

      const seen = new Set(dbReports.map((r) => `${r.student_id}__${r.scenario_id}`));
      const uniqueBlob = normalisedBlob.filter((r) => {
        const raw = r as unknown as Record<string, unknown>;
        const sid = (raw['scenario_id'] ?? raw['scenarioId'] ?? '') as string;
        return !seen.has(`${student.id}__${sid}`);
      });
      const reports = [...dbReports, ...uniqueBlob];
      const assessmentAttemptCounts = new Map<string, number>();
      for (const report of reports) {
        const raw = report as unknown as Record<string, unknown>;
        const scenarioId = (raw['scenario_id'] ?? raw['scenarioId'] ?? '') as string;
        if (!scenarioId) continue;
        const reportData = (raw['report_data'] ?? {}) as Record<string, unknown>;
        const modeRaw = (raw['mode'] ??
          raw['simulationMode'] ??
          raw['attemptMode'] ??
          reportData['mode'] ??
          reportData['simulationMode'] ??
          reportData['attemptMode']) as string | undefined;

        if (typeof modeRaw === 'string' && modeRaw.toLowerCase() === 'practice') {
          continue;
        }

        assessmentAttemptCounts.set(scenarioId, (assessmentAttemptCounts.get(scenarioId) ?? 0) + 1);
      }

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

  async studentLogin(studentId: string): Promise<ServiceResponse<StudentLoginData>> {
    try {
      this.logger.log(`[studentLogin] Login attempt for student_id: ${studentId}`);

      const student = await this.studentRepo.findOne({
        where: { student_id: studentId, is_active: true },
        relations: ['class'],
      });

      this.logger.log(
        `[studentLogin] DB result: ${student ? `found (id=${student.id}, is_active=${student.is_active}, class_id=${student.class?.id ?? 'NULL'})` : 'NOT FOUND'}`,
      );

      if (!student) {
        this.logger.warn(`[studentLogin] No student found for student_id: ${studentId}`);
        return {
          success: false,
          message: StudentConstants.VALIDATION.STUDENT_ID_NOT_FOUND,
          type: ErrorTypes.NOT_FOUND,
        };
      }

      this.logger.log(
        `[studentLogin] Class status: is_active=${student.class?.is_active}, status=${student.class?.status}, student.is_active=${student.is_active}, student.status=${student.status}`,
      );

      if (
        student.class?.is_active === false ||
        student.class?.status === CommonStatus.INACTIVE ||
        student.class?.status === CommonStatus.ARCHIEVED ||
        student.class?.status === CommonStatus.DRAFT ||
        student.is_active === false ||
        student.status === CommonStatus.INACTIVE ||
        student.status === CommonStatus.DRAFT ||
        student.status === CommonStatus.ARCHIEVED
      ) {
        this.logger.warn(
          `[studentLogin] Student or class is inactive for student_id: ${studentId}`,
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
          type: ErrorTypes.BAD_REQUEST,
        };
      }

      this.logger.log(`[studentLogin] Login successful for student_id: ${studentId}`);

      const expiresIn =
        this.configService.get<string>('JWT_EXPIRES_IN') ?? AuthConstants.DEFAULT_JWT_EXPIRES;

      const accessToken = this.jwtService.sign(
        {
          sub: student.student_id ?? student.id,
          user_id: student.id,
          student_id: student.student_id ?? null,
          type: AuthConstants.TOKEN_TYPE.STUDENT,
          roles: ['Student'],
        } as JwtPayload,
        { expiresIn: expiresIn as '1d' },
      );

      return {
        success: true,
        message: StudentConstants.MESSAGES.LOGIN_SUCCESS,
        data: {
          id: student.id,
          student_id: student.student_id,
          status: student.status,
          class_id: student.class?.id,
          class_name: student.class?.class_name,
          type: AuthConstants.TOKEN_TYPE.STUDENT,
          access_token: accessToken,
          token_type: 'Bearer',
        },
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : StudentConstants.VALIDATION.FETCH_ONE_FAILED;
      this.logger.error(`[studentLogin] Error for student_id: ${studentId} => ${message}`);
      return { success: false, message, type: ErrorTypes.BAD_REQUEST };
    }
  }

  async getSimulationsByCode(
    studentCode: string,
  ): Promise<ServiceResponse<StudentProfileResponse>> {
    this.logger.log(`[getSimulationsByCode] Fetching simulations for student code: ${studentCode}`);
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
      const reports = await this.studentRepo.manager.find(SimulationReport, {
        where: { student_id: studentId, scenario_id: scenarioId },
      });
      const assessmentCompleted = reports.some((r) => {
        const raw = r as unknown as Record<string, unknown>;
        const data = (raw['report_data'] ?? {}) as Record<string, unknown>;
        return raw['mode'] === 'Assessment' || data['mode'] === 'Assessment';
      });

      if (assessmentCompleted && !isRepeatAllowedStudent) {
        const message =
          mode === 'Practice'
            ? StudentConstants.VALIDATION.PRACTICE_NOT_ALLOWED
            : StudentConstants.VALIDATION.ASSESSMENT_ALREADY_COMPLETED;
        return {
          success: false,
          message,
          type: ErrorTypes.BAD_REQUEST,
        };
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
