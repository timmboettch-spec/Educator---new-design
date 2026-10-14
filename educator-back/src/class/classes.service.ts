import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { ServerResponse } from 'http';
import { Readable } from 'stream';
import { FindOptionsWhere, DataSource } from 'typeorm';
import { LoggerService } from 'src/common/services';

import {
  ClassDto,
  AttentionSummaryResDto,
  ListSchoolGroupsReqDto,
  ListClassesReqDto,
  SchoolGroupResDto,
  ClassSummaryResDto,
  ClassLiteResDto,
  SimulationsCompletedGraphReqDto,
  SimulationsCompletedGraphResDto,
  ClassStatusResDto,
  ActivityOverviewReqDto,
  ActivityOverviewResDto,
  CreateClassReqDto,
  CreateClassResDto,
  UpdateClassReqDto,
  UpdateClassResDto,
  ExportStudentCodesReqDto,
} from './dto';
import { CommonStatus } from 'src/common/enums/status.enum';
import { LmsType } from 'src/common/enums/lms.enum';
import { ServiceResponse } from 'src/common/types';
import { Messages, ErrorTypes } from 'src/common/utils/messages';
import { ResponseResult } from 'src/common/class/response.class';
import type {
  ClassDuplicateNameFilter,
  ClassFilters,
  ClassLinkageProvider,
  ClassLmsLinkage,
  ClassLmsLinkageSummary,
  ClassStudentCodesExportMeta,
  ICurrentUser,
} from 'src/common/interfaces';
import { SUCCESS_MSG } from 'src/common/messages/success.message';
import { handleError } from 'src/common/utils/common.util';
import { ClassResponseDto } from 'src/database/response-dto';

import { CreateStudentDto } from 'src/students/dto/students.dto';
import { ClassConstants, ClassSortField } from './constants';

// --- School-groups read model (GET /classes/schools, GET /classes/schools/:schoolId/classes) ---
import { IPaginationMeta } from 'src/common/interfaces/pagination.interface';
import { ERROR_MSG } from 'src/common/messages/error.message';
import { buildPaginationMeta, getPagination } from 'src/common/utils/pagination.util';
import { findAccessibleClassForEducator } from 'src/common/utils/class-access.util';
import { throwAppError } from 'src/common/utils/app-error';
import { ClassStudentCodesExportConstants, StudentCodesExportFormat } from 'src/common/constants';
import { buildAttachmentDisposition } from 'src/common/utils/csv.util';
import {
  buildStudentCodesCsv,
  buildStudentCodesFilename,
} from 'src/common/utils/student-codes-csv.util';
import { buildStudentCodesPdf } from 'src/common/utils/student-codes-pdf.util';
import { getUtcDateWindow } from 'src/common/utils/date-window.util';
import { resolveSimulationsCompletedGraphSince } from './utils/simulations-completed-graph-query.util';

import { ClassSimulationService } from 'src/class-simulations/class-simulation.service';
import { LmsProvisionService } from 'src/lms/services/lms-provision.service';
import { LmsAssignmentService } from 'src/lms/services/lms-assignment.service';
import { LmsConfigService } from 'src/lms/services/lms-config.service';

import { randomUUID } from 'crypto';
import {
  Class,
  Educator,
  Student,
  ClassSimulation,
  Simulation,
  LmsClassMapping,
  LmsStudentMapping,
  GoogleCourseMapping,
  GoogleCourseworkMapping,
} from 'src/database/entities';
import {
  CLASS_EDUCATOR_REPOSITORY,
  CLASS_REPOSITORY,
  EDUCATOR_REPOSITORY,
  EDUCATOR_SCHOOL_REPOSITORY,
  GOOGLE_COURSE_MAPPING_REPOSITORY,
  GOOGLE_STUDENT_MAPPING_REPOSITORY,
  LMS_CLASS_MAPPING_REPOSITORY,
  LMS_STUDENT_MAPPING_REPOSITORY,
  SIMULATION_REPORT_REPOSITORY,
  STUDENT_REPOSITORY,
} from 'src/database/tokens';
import {
  ClassEducatorRepository,
  ClassRepository,
  EducatorRepository,
  EducatorSchoolRepository,
  GoogleCourseMappingRepository,
  GoogleStudentMappingRepository,
  LmsClassMappingRepository,
  LmsStudentMappingRepository,
  SimulationReportRepository,
  StudentRepository,
} from 'src/database/repositories';

@Injectable()
export class ClassesService {
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

  constructor(
    private readonly classSimulationService: ClassSimulationService,
    @Inject(CLASS_REPOSITORY)
    private readonly classRepo: ClassRepository,
    @Inject(CLASS_EDUCATOR_REPOSITORY)
    private readonly classEducatorRepo: ClassEducatorRepository,
    @Inject(STUDENT_REPOSITORY)
    private readonly studentRepo: StudentRepository,
    @Inject(EDUCATOR_REPOSITORY)
    private readonly educatorRepo: EducatorRepository,
    @Inject(EDUCATOR_SCHOOL_REPOSITORY)
    private readonly educatorSchoolRepo: EducatorSchoolRepository,
    @Inject(GOOGLE_COURSE_MAPPING_REPOSITORY)
    private readonly googleCourseMappingRepo: GoogleCourseMappingRepository,
    @Inject(GOOGLE_STUDENT_MAPPING_REPOSITORY)
    private readonly googleStudentMappingRepo: GoogleStudentMappingRepository,
    @Inject(LMS_CLASS_MAPPING_REPOSITORY)
    private readonly lmsClassMappingRepo: LmsClassMappingRepository,
    @Inject(LMS_STUDENT_MAPPING_REPOSITORY)
    private readonly lmsStudentMappingRepo: LmsStudentMappingRepository,
    @Inject(SIMULATION_REPORT_REPOSITORY)
    private readonly simulationReportRepo: SimulationReportRepository,
    private readonly dataSource: DataSource,
    private readonly lmsProvisionService: LmsProvisionService,
    private readonly lmsConfigService: LmsConfigService,
    private readonly lmsAssignmentService: LmsAssignmentService,
    private readonly logger: LoggerService,
  ) {}

  private async enrichStudentsFromLmsRoster(classes: Class[], educatorId: string): Promise<void> {
    if (!classes.length) {
      return;
    }

    try {
      const mapped = await this.lmsProvisionService.getMappedClasses(educatorId);
      if (!mapped.classes.length) {
        return;
      }

      const detailsByClassId = new Map<
        string,
        Map<string, { name: string | null; email: string | null }>
      >();
      for (const c of mapped.classes) {
        const byCode = new Map<string, { name: string | null; email: string | null }>();
        for (const s of c.students) {
          byCode.set(String(s.studentCode ?? ''), {
            name: s.studentName ?? null,
            email: s.email ?? null,
          });
        }
        detailsByClassId.set(String(c.classId), byCode);
      }

      for (const classEntity of classes) {
        const detailMap = detailsByClassId.get(String(classEntity.id ?? ''));
        if (!detailMap || !Array.isArray(classEntity.students)) {
          continue;
        }

        classEntity.students = classEntity.students.map((student) => {
          const key = String(student.student_id ?? '');
          const live = detailMap.get(key);
          if (!live) {
            return student;
          }

          const name = live.name ?? null;
          const email = live.email ?? null;

          const studentView = student as unknown as Record<string, unknown>;
          studentView['studentName'] = name;
          studentView['student_name'] = name;
          studentView['email'] = email;
          studentView['student_email'] = email;
          return student;
        });
      }
    } catch (err) {
      this.logger.warn(
        `LMS roster enrichment skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async enrichClassesWithLmsLinkage(classes: Class[]): Promise<void> {
    for (const classEntity of classes) {
      (classEntity as unknown as Record<string, unknown>)['lms_linkage'] = null;
    }

    const classIds = classes
      .map((c) => c.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    if (!classIds.length) {
      return;
    }

    try {
      const rows: Array<{
        class_id: string;
        lms_course_id: string | null;
        lms_type: string | null;
        google_course_id: string | null;
        google_course_name: string | null;
      }> = await this.dataSource.query(
        `SELECT c.id AS class_id,
                lcm.lms_course_id,
                lsc.lms_type,
                gcm.google_course_id,
                gcm.google_course_name
         FROM classes c
         LEFT JOIN lms_class_mapping lcm ON lcm.class_id = c.id
         LEFT JOIN lms_school_config lsc
           ON lsc.school_id = c.school_id AND lsc.tool_type = 'educator'
         LEFT JOIN google_course_mappings gcm ON gcm.class_id = c.id
         WHERE c.id = ANY($1::uuid[])
           AND (lcm.id IS NOT NULL OR gcm.id IS NOT NULL)`,
        [classIds],
      );

      const byClassId = new Map<string, ClassLmsLinkageSummary>();
      for (const row of rows) {
        byClassId.set(
          row.class_id,
          row.lms_course_id
            ? {
                provider: (row.lms_type as ClassLinkageProvider) ?? 'lms',
                courseId: row.lms_course_id,
                courseName: null,
              }
            : {
                provider: LmsType.GOOGLE_CLASSROOM,
                courseId: row.google_course_id as string,
                courseName: row.google_course_name,
              },
        );
      }

      for (const classEntity of classes) {
        (classEntity as unknown as Record<string, unknown>)['lms_linkage'] =
          byClassId.get(classEntity.id as string) ?? null;
      }
    } catch (err) {
      this.logger.warn(
        `LMS linkage enrichment skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async enrichStudentsFromGoogleRoster(classes: Class[]): Promise<void> {
    if (!classes.length) {
      return;
    }

    const classIds = classes
      .map((c) => c.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    if (!classIds.length) {
      return;
    }

    try {
      const rows: Array<{
        class_id: string;
        student_id: string | null;
        student_code: string | null;
        google_name: string | null;
        google_email: string | null;
      }> = await this.dataSource.query(
        `SELECT class_id, student_id, student_code, google_name, google_email
         FROM google_student_mappings
         WHERE class_id = ANY($1::uuid[])`,
        [classIds],
      );

      if (!rows.length) {
        return;
      }

      const byClass = new Map<string, Map<string, { name: string | null; email: string | null }>>();
      for (const row of rows) {
        const classKey = String(row.class_id ?? '');
        if (!byClass.has(classKey)) {
          byClass.set(classKey, new Map());
        }
        const detail = {
          name: row.google_name?.trim() || null,
          email: row.google_email?.trim() || null,
        };
        const map = byClass.get(classKey)!;
        if (row.student_id) {
          map.set(String(row.student_id), detail);
        }
        if (row.student_code) {
          map.set(String(row.student_code), detail);
        }
      }

      for (const classEntity of classes) {
        const detailMap = byClass.get(String(classEntity.id ?? ''));
        if (!detailMap || !Array.isArray(classEntity.students)) {
          continue;
        }

        classEntity.students = classEntity.students.map((student) => {
          const byUuid = student.id ? detailMap.get(String(student.id)) : undefined;
          const byCode = student.student_id ? detailMap.get(String(student.student_id)) : undefined;
          const live = byUuid ?? byCode;
          if (!live) {
            return student;
          }

          const studentView = student as unknown as Record<string, unknown>;
          const existingName =
            (typeof studentView['student_name'] === 'string' &&
              studentView['student_name'].trim()) ||
            (typeof studentView['studentName'] === 'string' && studentView['studentName'].trim()) ||
            '';
          if (!existingName && live.name) {
            studentView['student_name'] = live.name;
            studentView['studentName'] = live.name;
          }
          const existingEmail =
            (typeof studentView['email'] === 'string' && studentView['email'].trim()) ||
            (typeof studentView['student_email'] === 'string' &&
              studentView['student_email'].trim()) ||
            '';
          if (!existingEmail && live.email) {
            studentView['email'] = live.email;
            studentView['student_email'] = live.email;
          }
          return student;
        });
      }
    } catch (err) {
      this.logger.warn(
        `Google Classroom roster enrichment skipped: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * Add an educator to a class as a co-instructor via class_educators junctions.
   * If the educator is already associated, this is a no-op.
   * Used during LTI launch to ensure all course instructors can access the class.
   */
  async addEducatorToClass(classId: string, educatorId: string, isPrimary = false): Promise<void> {
    const existing = await this.classEducatorRepo.findOne({
      where: { classId, educatorId },
    });

    if (existing) {
      if (isPrimary && !existing.isPrimary) {
        existing.isPrimary = true;
        await this.classEducatorRepo.create(existing);
        this.logger.log(
          `[ClassEducator] Updated educator=${educatorId} to primary for class=${classId}`,
        );
      }
      return;
    }

    await this.classEducatorRepo.create({
      classId,
      educatorId,
      isPrimary,
    });
    this.logger.log(
      `[ClassEducator] Added educator=${educatorId} to class=${classId} (primary=${isPrimary})`,
    );
  }

  /**
   * Check if an educator has access to a class (either as primary owner or co-instructor).
   */
  async canEducatorAccessClass(classId: string, educatorId: string): Promise<boolean> {
    const classEntity = await this.classRepo.findOne({
      where: { id: classId, is_active: true },
      relations: ['educator'],
    });

    if (!classEntity) {
      return false;
    }

    if (classEntity.educator_id === educatorId) {
      return true;
    }

    const classEducator = await this.classEducatorRepo.findOne({
      where: { classId, educatorId },
    });

    return !!classEducator;
  }

  async findByCriteria(
    name: string,
    term: string | undefined,
    year: string | undefined,
    educatorId: string,
    schoolId?: string,
  ): Promise<Class | null> {
    const where: FindOptionsWhere<Class> = {
      class_name: name,
      educator: { id: educatorId },
      is_active: true,
    };
    if (term) where.term = term;
    if (year) where.year = year;
    if (schoolId) where.school = { id: schoolId };
    return this.classRepo.findOne({ where });
  }

  async findEducatorById(id: string): Promise<Educator | null> {
    return this.educatorRepo.findOne({
      where: { id, is_active: true },
      relations: ['admin', 'school'],
    });
  }

  async countStudentsByClassId(classId: string): Promise<number> {
    return this.studentRepo.count({
      where: { class: { id: classId }, is_active: true },
    });
  }

  async findClassByIdWithEducator(
    id: string,
    educatorId: string,
    schoolId?: string,
  ): Promise<Class | null> {
    return findAccessibleClassForEducator(
      this.classRepo,
      this.educatorSchoolRepo,
      id,
      educatorId,
      schoolId,
    );
  }

  async verifyEducatorHasSchool(educatorId: string, schoolId: string): Promise<boolean> {
    const assignment = await this.educatorSchoolRepo.findOne({
      where: { educator: { id: educatorId }, school: { id: schoolId } },
    });
    return assignment !== null;
  }

  /** Maps a `Class` entity to the camelCase database response DTO — see class.dto.ts for why
   * this can't just `implements Class` (the entity itself is snake_case). */
  private toClassResDto(classEntity: Class): ClassResponseDto {
    return {
      classId: classEntity.id!,
      lmsClassId: classEntity.lms_class_id,
      lmsClassReference: classEntity.lms_class_reference,
      origin: classEntity.origin,
      googleCourseId: classEntity.google_course_id,
      className: classEntity.class_name!,
      educatorId: classEntity.educator_id,
      schoolId: classEntity.school_id,
      term: classEntity.term,
      year: classEntity.year,
      status: classEntity.status,
      totalNoOfStudents: classEntity.total_no_of_students,
      startDate: classEntity.start_date!,
      endDate: classEntity.end_date!,
      createdAt: classEntity.created_at!,
      updatedAt: classEntity.updated_at!,
      isActive: classEntity.is_active,
      deletedAt: classEntity.deleted_at,
    };
  }

  private assertValidDateRange(startDate?: string, endDate?: string): void {
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      throw new BadRequestException(ERROR_MSG.COMMON.INVALID_DATE_RANGE('startDate', 'endDate'));
    }
  }

  /**
   * Consolidated duplicate-name check for `createClass`/`update`, replacing the controller-side
   * `assertNoDuplicateClassByName` for these two rebuilt endpoints (that method stays in the
   * controller, unchanged, for `createBulk`). Preserves the same LMS-course-reference carve-out:
   * same name allowed when both sides have different `lmsCourseId`s.
   */
  private async assertNoDuplicateClassName(
    filter: ClassDuplicateNameFilter,
    incomingLmsCourseId?: string,
  ): Promise<void> {
    const existingClass = await this.classRepo.findActiveClassByName(filter);
    if (!existingClass) {
      return;
    }

    const incomingCourseId = incomingLmsCourseId?.trim();
    const existingCourseRef = existingClass.lms_class_reference?.trim();
    if (incomingCourseId && existingCourseRef && incomingCourseId !== existingCourseRef) {
      return;
    }

    throw new BadRequestException(ERROR_MSG.DB.DUPLICATE_ENTRY('Class name'));
  }

  /**
   * New-pattern create, rebuilt per the class-create/edit rework: validates name/dates/status,
   * then delegates the actual persistence + LMS/student-provisioning work to the untouched
   * legacy `create()` below (still relied on as-is by `createBulk` in the controller) rather
   * than duplicating its ~800 lines of LMS dedup/relaunch and student-code logic.
   */
  async createClass(
    currentUser: ICurrentUser,
    dto: CreateClassReqDto,
  ): Promise<ResponseResult<CreateClassResDto>> {
    try {
      const educator = await this.findEducatorById(currentUser.educatorId as string);
      if (!educator) {
        throw new NotFoundException(ERROR_MSG.DB.NOT_FOUND('Educator'));
      }

      if (dto.schoolId) {
        const hasSchool = await this.verifyEducatorHasSchool(
          currentUser.educatorId as string,
          dto.schoolId,
        );
        if (!hasSchool) {
          throw new ForbiddenException(ERROR_MSG.COMMON.FORBIDDEN);
        }
      }

      this.assertValidDateRange(dto.startDate, dto.endDate);

      if (dto.students?.length && dto.totalNoOfStudents) {
        throw new BadRequestException(ClassConstants.VALIDATION.STUDENTS_CONFLICT);
      }

      await this.assertNoDuplicateClassName(
        {
          className: dto.className,
          educatorId: currentUser.educatorId as string,
          term: dto.term,
          year: dto.year,
          schoolId: dto.schoolId,
        },
        dto.lmsCourseId,
      );

      const legacyDto: ClassDto = {
        class_name: dto.className.trim(),
        term: dto.term,
        year: dto.year,
        start_date: dto.startDate,
        end_date: dto.endDate,
        status: dto.status,
        school_id: dto.schoolId,
        total_no_of_students: dto.totalNoOfStudents,
        students: dto.students,
        lmsCourseId: dto.lmsCourseId,
        nrpsUrl: dto.nrpsUrl,
      };

      const result = await this.create(legacyDto, educator, dto.students ?? []);
      if (!result.success) {
        throw new BadRequestException(result.message ?? ERROR_MSG.COMMON.BAD_REQUEST);
      }

      return new ResponseResult({
        message: SUCCESS_MSG.COMMON.CREATED('Class'),
        data: this.toClassResDto(result.data!),
      });
    } catch (error) {
      return handleError(error);
    }
  }

  private generateLmsClassId(): string {
    return randomUUID().replace(/-/g, '').substring(0, 8).toUpperCase();
  }

  private async loadUsedStudentCodes(): Promise<Set<string>> {
    const codes = await this.studentRepo.findAllNonEmptyStudentCodes();
    return new Set(codes);
  }

  async validateRosterCodes(studentCodes: string[]): Promise<
    ServiceResponse<{
      valid: boolean;
      count: number;
      duplicateCodes?: string[];
      invalidCodes?: string[];
    }>
  > {
    if (!Array.isArray(studentCodes) || studentCodes.length === 0) {
      return {
        success: false,
        message: 'No student codes provided',
        type: ErrorTypes.BAD_REQUEST,
      };
    }

    const cleanedCodes = studentCodes
      .map((c) => (typeof c === 'string' ? c.trim() : ''))
      .filter((c) => c.length > 0);

    if (cleanedCodes.length === 0) {
      return {
        success: false,
        message: 'No valid student codes provided',
        type: ErrorTypes.BAD_REQUEST,
      };
    }

    // 1. Check format: student codes must contain both letters and numbers
    const invalidFormatCodes = cleanedCodes.filter((c) => !isValidStudentCodeFormat(c));
    if (invalidFormatCodes.length > 0) {
      return {
        success: false,
        message: ClassConstants.VALIDATION.INVALID_STUDENT_CODE_FORMAT(invalidFormatCodes),
        type: ErrorTypes.BAD_REQUEST,
        data: {
          valid: false,
          count: cleanedCodes.length,
          invalidCodes: invalidFormatCodes,
        },
      };
    }

    // 2. Check for duplicate codes within the uploaded file itself
    const seenUpper = new Set<string>();
    const fileDuplicates = new Set<string>();
    for (const code of cleanedCodes) {
      const upper = code.toUpperCase();
      if (seenUpper.has(upper)) {
        fileDuplicates.add(code);
      } else {
        seenUpper.add(upper);
      }
    }

    // 3. Check for duplicate codes that already exist in the database
    const existingInDb = await this.studentRepo.findExistingStudentCodes(cleanedCodes);
    const existingDbUpper = new Set(existingInDb.map((c) => c.toUpperCase()));

    // Collect all duplicate codes preserving casing
    const allDuplicatesSet = new Set<string>();
    for (const code of cleanedCodes) {
      if (fileDuplicates.has(code) || existingDbUpper.has(code.toUpperCase())) {
        allDuplicatesSet.add(code);
      }
    }

    if (allDuplicatesSet.size > 0) {
      const duplicateCodes = Array.from(allDuplicatesSet);
      return {
        success: false,
        message: ClassConstants.VALIDATION.USED_STUDENT_CODES(duplicateCodes),
        type: ErrorTypes.BAD_REQUEST,
        data: {
          valid: false,
          count: cleanedCodes.length,
          duplicateCodes,
        },
      };
    }

    return {
      success: true,
      message: 'All student codes are valid',
      data: {
        valid: true,
        count: cleanedCodes.length,
      },
    };
  }

  /**
   * When an LTI relaunch hits an existing mapping for this educator, refresh nrpsUrl
   * and merge any newly rostered students instead of returning stale class data.
   */
  private async syncExistingLmsLinkedClass(
    linkedClass: Class,
    dto: ClassDto,
    educator: Educator,
    studentsInput: CreateStudentDto[],
    lmsCourseId: string,
    schoolId: string,
  ): Promise<Class> {
    const normalizedStudentsInput = Array.isArray(studentsInput) ? studentsInput : [];
    const classMapping = await this.lmsClassMappingRepo.findOne({
      where: { lmsCourseId, schoolId },
    });

    if (classMapping && dto.nrpsUrl?.trim()) {
      classMapping.nrpsUrl = dto.nrpsUrl.trim();
      await this.lmsClassMappingRepo.create(classMapping);
    }

    const usedCodes = await this.loadUsedStudentCodes();
    const generatedInSession = new Set<string>();
    const lmsClassIdPrefix = String(linkedClass.lms_class_id ?? '').trim();
    const existingStudents = await this.studentRepo.find({
      where: { class: { id: linkedClass.id }, is_active: true },
    });
    const existingCodes = new Set(
      existingStudents.map((student) => String(student.student_id ?? '').trim()).filter(Boolean),
    );

    const newStudents: Partial<Student>[] = [];
    for (const studentItem of normalizedStudentsInput) {
      const rawStudentId = String(studentItem.student_id ?? '').trim();
      if (!rawStudentId) {
        continue;
      }

      const looksLikeStudentCode = rawStudentId.includes('-');
      const studentCode = looksLikeStudentCode
        ? rawStudentId
        : lmsClassIdPrefix && rawStudentId
          ? generateLmsStudentCode(lmsClassIdPrefix, rawStudentId)
          : generateUniqueStudentCode(linkedClass.class_name ?? '', usedCodes, generatedInSession);

      if (existingCodes.has(studentCode)) {
        continue;
      }

      if (usedCodes.has(studentCode) || generatedInSession.has(studentCode)) {
        throw new BadRequestException(`Duplicate generated student code: ${studentCode}`);
      }
      usedCodes.add(studentCode);
      generatedInSession.add(studentCode);
      existingCodes.add(studentCode);

      newStudents.push({
        student_id: studentCode,
        score: studentItem.score,
        attempt: studentItem.attempt,
        submission_date: studentItem.submission_date,
        status: CommonStatus.ACTIVE,
        class: linkedClass,
        educator,
        ...(linkedClass.school ? { school: linkedClass.school } : {}),
      });
    }

    if (newStudents.length > 0) {
      await this.studentRepo.saveMany(newStudents);

      await this.saveLmsStudentMappings(
        normalizedStudentsInput,
        lmsClassIdPrefix,
        linkedClass.id!,
        schoolId,
      );
    }

    linkedClass.total_no_of_students = existingStudents.length + newStudents.length;
    await this.classRepo.create(linkedClass);

    const refreshed = await this.classRepo.findOne({
      where: { id: linkedClass.id },
      relations: ['educator', 'students', 'school'],
    });

    return refreshed ?? linkedClass;
  }

  /**
   * Build every LMS student mapping row in memory and write them in one conflict-ignoring
   * insert; the (class, LMS user) and (class, student code) unique indexes make re-syncs idempotent.
   */
  private async saveLmsStudentMappings(
    studentsInput: CreateStudentDto[],
    lmsClassIdPrefix: string,
    classId: string,
    schoolId: string,
  ): Promise<void> {
    if (!lmsClassIdPrefix) return;
    const mappings: Partial<LmsStudentMapping>[] = [];
    for (const studentItem of studentsInput) {
      const rawId = String(studentItem.student_id ?? '').trim();
      if (rawId && !rawId.includes('-')) {
        const suffix = /^\d+$/.test(rawId) ? String(Number(rawId)) : rawId;
        mappings.push({
          schoolId,
          classId,
          lmsUserId: rawId,
          studentCode: `${lmsClassIdPrefix}-${suffix}`,
        });
      }
    }
    await this.lmsStudentMappingRepo.insertManyIgnoreConflicts(mappings);
  }

  /**
   * Drop LMS links that still point at a soft-deleted (or missing) class so a relaunch
   * can create a fresh class + mapping instead of getting stuck on stale rows.
   */
  private async releaseStaleLmsCourseLink(
    lmsCourseId: string,
    schoolId: string,
    educatorId: string,
  ): Promise<void> {
    const mapping = await this.lmsClassMappingRepo.findOne({
      where: { lmsCourseId, schoolId },
    });

    if (mapping) {
      const linkedClass = await this.classRepo.findOne({
        where: { id: mapping.classId },
      });
      if (!linkedClass || !linkedClass.is_active) {
        await this.lmsStudentMappingRepo.delete({ classId: mapping.classId });
        await this.lmsClassMappingRepo.delete({ id: mapping.id });
        this.logger.log(
          `[releaseStaleLmsCourseLink] Removed stale mapping for course ${lmsCourseId} (class ${mapping.classId})`,
        );
      }
    }

    await this.dataSource.manager
      .createQueryBuilder()
      .update(Class)
      .set({ lms_class_reference: null })
      .where('educator_id = :educatorId', { educatorId })
      .andWhere('school_id = :schoolId', { schoolId })
      .andWhere('lms_class_reference = :lmsCourseId', { lmsCourseId })
      .andWhere('is_active = false')
      .execute();
  }

  async create(
    dto: ClassDto,
    educator: Educator,
    studentsInput: CreateStudentDto[] = [],
  ): Promise<ServiceResponse<Class>> {
    if (!dto.class_name) {
      return {
        success: false,
        message: ClassConstants.VALIDATION.NAME_REQUIRED,
        type: ErrorTypes.BAD_REQUEST,
      };
    }
    try {
      const lmsCourseId = dto.lmsCourseId?.trim();
      const schoolId = dto.school_id ?? educator.school?.id;
      if (lmsCourseId && schoolId) {
        await this.releaseStaleLmsCourseLink(lmsCourseId, schoolId, educator.id);

        const existingMapping = await this.lmsClassMappingRepo.findOne({
          where: { lmsCourseId, schoolId },
        });
        if (existingMapping) {
          const linkedClass = await this.classRepo.findOne({
            where: { id: existingMapping.classId, is_active: true },
            relations: ['school', 'educator'],
          });
          if (linkedClass) {
            if (linkedClass.educator?.id === educator.id) {
              this.logger.log(
                `[create] Moodle course ${lmsCourseId} already linked to class ${linkedClass.id}; syncing roster/nrpsUrl`,
              );
              const syncedClass = await this.syncExistingLmsLinkedClass(
                linkedClass,
                dto,
                educator,
                studentsInput,
                lmsCourseId,
                schoolId,
              );
              return {
                success: true,
                message: Messages.CLASS_EXISTS,
                data: syncedClass,
              };
            }

            this.logger.warn(
              `[create] Moodle course ${lmsCourseId} is linked to active class ${linkedClass.id} owned by educator ${linkedClass.educator?.id}`,
            );
            return {
              success: false,
              message: ClassConstants.VALIDATION.LMS_COURSE_LINKED_TO_OTHER_EDUCATOR,
              type: ErrorTypes.BAD_REQUEST,
            };
          }
        }
      }

      const lmsClassId = this.generateLmsClassId();
      const saved = await this.classRepo.create({
        lms_class_id: lmsClassId,
        lms_class_reference: dto.lmsCourseId,
        class_name: dto.class_name,
        term: dto.term,
        year: dto.year,
        status: dto.status ?? CommonStatus.ACTIVE,
        is_active: true,
        deleted_at: null,
        start_date: dto.start_date,
        end_date: dto.end_date,
        total_no_of_students: 0,
        educator,
        ...(dto.school_id ? { school: { id: dto.school_id } } : {}),
      });
      // Reload with school relation so students inherit the correct school
      const savedWithSchool = await this.classRepo.findOne({
        where: { id: saved.id },
        relations: ['school'],
      });
      if (savedWithSchool?.school) saved.school = savedWithSchool.school;
      let finalCount = 0;

      const normalizedStudentsInput = Array.isArray(studentsInput) ? studentsInput : [];
      const usedCodes = await this.loadUsedStudentCodes();
      const generatedInSession = new Set<string>();
      const lmsClassIdPrefix = String(saved.lms_class_id ?? '').trim();

      if (normalizedStudentsInput.length > 0) {
        const explicitCodes = normalizedStudentsInput
          .map((studentItem) => String(studentItem.student_id ?? '').trim())
          .filter((code) => code.length > 0);

        if (explicitCodes.length > 0) {
          if (!lmsCourseId) {
            const invalidCodes = explicitCodes.filter((c) => !isValidStudentCodeFormat(c));
            if (invalidCodes.length > 0) {
              throw new BadRequestException(
                ClassConstants.VALIDATION.INVALID_STUDENT_CODE_FORMAT(invalidCodes),
              );
            }
          }

          const seen = new Set<string>();
          const dupes = new Set<string>();
          for (const code of explicitCodes) {
            const upper = code.toUpperCase();
            if (seen.has(upper)) {
              dupes.add(code);
            } else {
              seen.add(upper);
            }
          }

          const existingInDb = await this.studentRepo.findExistingStudentCodes(explicitCodes);
          for (const dbCode of existingInDb) {
            dupes.add(dbCode);
          }

          if (dupes.size > 0) {
            throw new BadRequestException(
              ClassConstants.VALIDATION.USED_STUDENT_CODES(Array.from(dupes)),
            );
          }
        }

        const students: Partial<Student>[] = normalizedStudentsInput.map((studentItem) => {
          const rawStudentId = String(studentItem.student_id ?? '').trim();
          let studentCode: string;
          if (lmsCourseId) {
            const looksLikeStudentCode = rawStudentId.includes('-');
            studentCode = looksLikeStudentCode
              ? rawStudentId
              : lmsClassIdPrefix && rawStudentId
                ? generateLmsStudentCode(lmsClassIdPrefix, rawStudentId)
                : generateUniqueStudentCode(saved.class_name ?? '', usedCodes, generatedInSession);
          } else {
            studentCode = rawStudentId
              ? rawStudentId
              : generateUniqueStudentCode(saved.class_name ?? '', usedCodes, generatedInSession);
          }

          if (usedCodes.has(studentCode) || generatedInSession.has(studentCode)) {
            throw new BadRequestException(
              ClassConstants.VALIDATION.USED_STUDENT_CODES([studentCode]),
            );
          }
          usedCodes.add(studentCode);
          generatedInSession.add(studentCode);

          return {
            student_id: studentCode,
            score: studentItem.score,
            attempt: studentItem.attempt,
            submission_date: studentItem.submission_date,
            status: CommonStatus.ACTIVE,
            class: saved,
            educator: educator,
            ...(saved.school ? { school: saved.school } : {}),
          };
        });

        const savedStudents = await this.studentRepo.saveMany(students);
        finalCount = savedStudents.length;
      } else if (dto.total_no_of_students) {
        const students: Partial<Student>[] = [];

        for (let index = 0; index < dto.total_no_of_students; index++) {
          const studentCode = generateUniqueStudentCode(
            saved.class_name ?? '',
            usedCodes,
            generatedInSession,
          );

          students.push({
            student_id: studentCode,
            status: CommonStatus.ACTIVE,
            class: saved,
            educator: educator,
            ...(saved.school ? { school: saved.school } : {}),
          });
        }
        const savedStudents = await this.studentRepo.saveMany(students);
        finalCount = savedStudents.length;
      }

      saved.total_no_of_students = finalCount;

      await this.classRepo.create(saved);

      if (lmsCourseId && schoolId) {
        try {
          const classMapping = await this.lmsClassMappingRepo.findOne({
            where: { lmsCourseId, schoolId },
          });
          if (classMapping) {
            const priorClass = await this.classRepo.findOne({
              where: { id: classMapping.classId, is_active: true },
              relations: ['educator'],
            });
            if (priorClass && priorClass.educator?.id && priorClass.educator.id !== educator.id) {
              throw new BadRequestException(
                ClassConstants.VALIDATION.LMS_COURSE_LINKED_TO_OTHER_EDUCATOR,
              );
            }

            classMapping.classId = saved.id!;
            if (dto.nrpsUrl?.trim()) {
              classMapping.nrpsUrl = dto.nrpsUrl.trim();
            }
          }
          await this.lmsClassMappingRepo.create(
            classMapping ?? {
              schoolId,
              classId: saved.id!,
              lmsCourseId,
              lmsContextId: null,
              nrpsUrl: dto.nrpsUrl?.trim() ?? '',
            },
          );

          await this.saveLmsStudentMappings(
            normalizedStudentsInput,
            lmsClassIdPrefix,
            saved.id!,
            schoolId,
          );
        } catch (mappingErr) {
          this.logger.warn(
            `LMS mapping save skipped: ${mappingErr instanceof Error ? mappingErr.message : String(mappingErr)}`,
          );
        }
      }

      const savedWithRelations = await this.classRepo.findOne({
        where: { id: saved.id },
        relations: ['educator', 'students', 'school'],
      });

      return {
        success: true,
        message: Messages.CLASS_CREATED,
        data: savedWithRelations!,
      };
    } catch (error) {
      this.logger.error(
        `Failed to create class: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        success: false,
        message:
          error instanceof Error ? error.message : ClassConstants.VALIDATION.PROCESSING_FAILED,
        type: ErrorTypes.BAD_REQUEST,
      };
    }
  }

  async findAll(educatorId: string, schoolId?: string): Promise<ServiceResponse<Class[]>> {
    // Query for classes where educator is either primary owner OR co-instructor via class_educators
    const items = await this.classRepo.findAllActiveForEducator(educatorId, schoolId);
    const classIds = items.map((c) => c.id!).filter(Boolean);
    const attentionMap = new Map<
      string,
      { reportCount: number; unreadReportCount: number; needsAttention: boolean }
    >();

    if (classIds.length > 0) {
      try {
        const attentionRows =
          await this.simulationReportRepo.getAttentionCountsByClassIds(classIds);

        for (const row of attentionRows) {
          const reportCount = parseInt(row.report_count, 10);
          const unreadReportCount = parseInt(row.unread_count, 10);
          attentionMap.set(row.class_id, {
            reportCount,
            unreadReportCount,
            needsAttention: reportCount > 0 && unreadReportCount > 0,
          });
        }
      } catch (err) {
        this.logger.warn(
          `Could not fetch attention metadata (columns may not exist yet): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    // Batch-load all class simulations in a single query instead of N separate calls.
    const simsMap =
      classIds.length > 0
        ? await this.classSimulationService.findByClassIdsBatch(classIds)
        : new Map<string, Simulation[]>();

    for (const classEntity of items) {
      classEntity.students = classEntity.students?.filter((s) => s.is_active) ?? [];
      classEntity.students.forEach((student) => {
        student.time_remaining = this.formatTimeRemaining(student.time_remaining);
      });
      classEntity.total_no_of_students = classEntity.students.length;
      classEntity.sims = (simsMap.get(classEntity.id!) ?? []) as unknown as Simulation[];

      const meta = attentionMap.get(classEntity.id!) ?? {
        reportCount: 0,
        unreadReportCount: 0,
        needsAttention: false,
      };
      (classEntity as unknown as Record<string, unknown>)['reportCount'] = meta.reportCount;
      (classEntity as unknown as Record<string, unknown>)['unreadReportCount'] =
        meta.unreadReportCount;
      (classEntity as unknown as Record<string, unknown>)['needsAttention'] = meta.needsAttention;
      // Flatten school_name so the frontend can display it without an extra join
      if (classEntity.school?.school_name) {
        (classEntity as unknown as Record<string, unknown>)['school_name'] =
          classEntity.school.school_name;
      }
    }

    await this.enrichStudentsFromLmsRoster(items, educatorId);
    await this.enrichStudentsFromGoogleRoster(items);
    await this.enrichClassesWithLmsLinkage(items);

    return {
      success: true,
      message: Messages.CLASS_FETCHED,
      data: items,
    };
  }

  async getAttentionSummary(
    currentUser: ICurrentUser,
    schoolId?: string,
  ): Promise<ResponseResult<AttentionSummaryResDto>> {
    try {
      const educatorId = currentUser.educatorId as string;
      const [totalClasses, classesNeedingAttention, unreadReportRows, noStudents, noAssignedSims] =
        await Promise.all([
          this.classRepo.countActiveForEducator(educatorId, schoolId),
          this.classRepo.countActiveNeedingAttentionForEducator(educatorId, schoolId),
          this.simulationReportRepo.getAttentionCountsByEducator(educatorId, schoolId),
          this.classRepo.countActiveWithNoStudentsForEducator(educatorId, schoolId),
          this.classRepo.countActiveWithNoAssignedSimsForEducator(educatorId, schoolId),
        ]);

      return new ResponseResult({
        message: SUCCESS_MSG.COMMON.FETCHED('Classes'),
        data: {
          totalClasses,
          classesNeedingAttention,
          unreadReports: unreadReportRows.length,
          noStudents,
          noAssignedSims,
        },
      });
    } catch (error) {
      return handleError(error);
    }
  }

  async getActivityOverview(
    currentUser: ICurrentUser,
    dto: ActivityOverviewReqDto,
  ): Promise<ResponseResult<ActivityOverviewResDto>> {
    try {
      const { todayStr, windowEndStr } = getUtcDateWindow(
        ClassConstants.ACTIVITY_OVERVIEW.CLOSING_SOON_WINDOW_DAYS,
      );

      const counts = await this.classRepo.getActivityOverviewCounts(
        currentUser.educatorId as string,
        todayStr,
        windowEndStr,
        ClassConstants.ACTIVITY_OVERVIEW.AVATAR_NEAR_LIMIT_THRESHOLD_MINUTES,
        dto.school_id,
      );

      return new ResponseResult({
        message: SUCCESS_MSG.COMMON.FETCHED('Activity Overview'),
        data: counts,
      });
    } catch (error) {
      return handleError(error);
    }
  }

  async findOne(id: string, educatorId: string): Promise<ServiceResponse<Class>> {
    // Check if educator is either primary owner OR co-instructor
    const classEntity = await this.classRepo.findActiveByIdWithEducatorAndStudentsForEducator(
      id,
      educatorId,
    );

    if (!classEntity) {
      return {
        success: false,
        message: Messages.CLASS_NOT_FOUND,
        type: ErrorTypes.NOT_FOUND,
      };
    }

    classEntity.students = classEntity.students?.filter((s) => s.is_active) ?? [];
    classEntity.students.forEach((student) => {
      student.time_remaining = this.formatTimeRemaining(student.time_remaining);
    });
    classEntity.total_no_of_students = classEntity.students.length;

    await this.enrichStudentsFromLmsRoster([classEntity], educatorId);
    await this.enrichStudentsFromGoogleRoster([classEntity]);

    return {
      success: true,
      message: Messages.CLASS_FETCHED,
      data: classEntity,
    };
  }

  /**
   * External course + per-simulation assignment linkage for one class, from whichever
   * integration the class was linked through: LTI (Moodle/Canvas) or Google Classroom.
   * `provider: null` covers manual, unlinked and unreachable classes alike, so the UI hides
   * the panel — never a 403, which the frontend interceptor turns into a logout.
   */
  async getClassLmsLinkage(
    classId: string,
    educatorId: string,
  ): Promise<ServiceResponse<ClassLmsLinkage>> {
    const unlinked: ClassLmsLinkage = { provider: null, course: null, assignments: [] };

    try {
      const classEntity = await findAccessibleClassForEducator(
        this.classRepo,
        this.educatorSchoolRepo,
        classId,
        educatorId,
      );
      if (!classEntity) {
        return { success: true, message: Messages.CLASS_FETCHED, data: unlinked };
      }

      const [ltiMapping, googleCourse] = await Promise.all([
        this.lmsClassMappingRepo.findOne({ where: { classId } }),
        this.dataSource.manager.findOne(GoogleCourseMapping, { where: { classId } }),
      ]);

      if (ltiMapping) {
        const [config, mappings] = await Promise.all([
          classEntity.school_id
            ? this.lmsConfigService.getOptionalBySchoolId(classEntity.school_id)
            : null,
          this.lmsAssignmentService.findByClass(classId),
        ]);

        return {
          success: true,
          message: Messages.CLASS_FETCHED,
          data: {
            provider: config?.lmsType ?? 'lms',
            // Only the AGS line-item API URL is stored, and Canvas/Moodle course URLs differ
            // in shape, so there is nothing safe to deep-link to yet.
            course: { id: ltiMapping.lmsCourseId, name: null, url: null },
            assignments: mappings.flatMap((mapping) =>
              mapping.simulationId
                ? [
                    {
                      simulationId: mapping.simulationId,
                      label: mapping.lmsLineItemLabel,
                      url: null,
                    },
                  ]
                : [],
            ),
          },
        };
      }

      if (googleCourse) {
        const coursework = await this.dataSource.manager.find(GoogleCourseworkMapping, {
          where: { classId },
        });

        return {
          success: true,
          message: Messages.CLASS_FETCHED,
          data: {
            provider: LmsType.GOOGLE_CLASSROOM,
            course: {
              id: googleCourse.googleCourseId,
              name: googleCourse.googleCourseName,
              url: null,
            },
            assignments: coursework.map((mapping) => ({
              simulationId: mapping.simulationId,
              label: mapping.title,
              url: mapping.alternateLink,
            })),
          },
        };
      }

      return { success: true, message: Messages.CLASS_FETCHED, data: unlinked };
    } catch (error) {
      this.logger.error(
        `[Class LMS Linkage] Failed to load linkage for class ${classId}: ${(error as Error).message}`,
        (error as Error).stack,
      );
      return { success: true, message: Messages.CLASS_FETCHED, data: unlinked };
    }
  }

  /**
   * New-pattern update, rebuilt per the class-create/edit rework. No other caller depends on
   * the old `(classEntity, dto)` signature (confirmed: only the PUT /classes/:id handler used
   * it), so this is a straightforward in-place rewrite rather than a delegation like `createClass`.
   */
  async update(
    currentUser: ICurrentUser,
    classId: string,
    dto: UpdateClassReqDto,
  ): Promise<ResponseResult<UpdateClassResDto>> {
    try {
      const classEntity = await this.findClassByIdWithEducator(
        classId,
        currentUser.educatorId as string,
      );
      if (!classEntity) {
        throw new NotFoundException(ERROR_MSG.DB.NOT_FOUND('Class'));
      }

      if (dto.schoolId && dto.schoolId !== classEntity.school_id) {
        const hasSchool = await this.verifyEducatorHasSchool(
          currentUser.educatorId as string,
          dto.schoolId,
        );
        if (!hasSchool) {
          throw new ForbiddenException(ERROR_MSG.COMMON.FORBIDDEN);
        }
      }

      this.assertValidDateRange(
        dto.startDate ?? classEntity.start_date,
        dto.endDate ?? classEntity.end_date,
      );

      const trimmedClassName = dto.className?.trim();
      if (trimmedClassName && trimmedClassName !== classEntity.class_name) {
        await this.assertNoDuplicateClassName({
          className: trimmedClassName,
          educatorId: classEntity.educator_id!,
          term: dto.term ?? classEntity.term,
          year: dto.year ?? classEntity.year,
          schoolId: dto.schoolId ?? classEntity.school_id,
          excludeClassId: classEntity.id,
        });
      }

      classEntity.class_name = trimmedClassName ?? classEntity.class_name;
      classEntity.term = dto.term ?? classEntity.term;
      classEntity.year = dto.year ?? classEntity.year;
      classEntity.start_date = dto.startDate ?? classEntity.start_date;
      classEntity.end_date = dto.endDate ?? classEntity.end_date;
      classEntity.status = dto.status ?? classEntity.status;
      if (dto.schoolId !== undefined) {
        classEntity.school_id = dto.schoolId;
        classEntity.school = { id: dto.schoolId } as unknown as typeof classEntity.school;
      }

      const updated = await this.classRepo.create(classEntity);

      // Reload with school relation so the response includes school_name
      const updatedWithRelations = await this.classRepo.findOne({
        where: { id: updated.id },
        relations: ['school'],
      });

      return new ResponseResult({
        message: SUCCESS_MSG.COMMON.UPDATED('Class'),
        data: this.toClassResDto(updatedWithRelations ?? updated),
      });
    } catch (error) {
      return handleError(error);
    }
  }

  /**
   * Streams the class's student codes as a CSV (class header block + `Student Code, Student Name`
   * table) or a PDF (branded heading + Student Name / Student Code table), per `dto.format`. Only the class access check runs before the response starts; a miss is a 404 so
   * other educators' class ids aren't confirmed. Student rows are then pulled batch by batch as
   * the client reads.
   */
  async exportStudentCodes(
    currentUser: ICurrentUser,
    classId: string,
    dto: ExportStudentCodesReqDto,
  ): Promise<StreamableFile> {
    try {
      // A user with both roles who is logged in as another role has no educatorId, so block them.
      const educatorId = currentUser.educatorId;
      if (!educatorId) throwAppError(ERROR_MSG.COMMON.FORBIDDEN, ErrorTypes.FORBIDDEN);

      // Same access check as `update`/`remove`: owner or co-instructor, school still active,
      // and the educator still assigned to that school.
      const classEntity = await this.findClassByIdWithEducator(classId, educatorId);
      if (!classEntity) throwAppError(ERROR_MSG.DB.NOT_FOUND('Class'), ErrorTypes.NOT_FOUND);

      const format = dto.format ?? ClassStudentCodesExportConstants.DEFAULT_FORMAT;
      const isPdf = format === StudentCodesExportFormat.PDF;
      const { CONTENT_TYPE, EXTENSION, BATCH_SIZE } = isPdf
        ? ClassStudentCodesExportConstants.FORMATS.PDF
        : ClassStudentCodesExportConstants.FORMATS.CSV;

      const meta: ClassStudentCodesExportMeta = {
        className: classEntity.class_name ?? '',
        schoolName: classEntity.school?.school_name ?? '',
        startDate: classEntity.start_date ?? '',
        endDate: classEntity.end_date ?? '',
      };
      const batches = this.studentRepo.iterateStudentCodesByClass(educatorId, classId, BATCH_SIZE);
      const content = isPdf
        ? buildStudentCodesPdf(meta, batches)
        : buildStudentCodesCsv(meta, batches);

      const file = new StreamableFile(Readable.from(content, { objectMode: false }), {
        type: CONTENT_TYPE,
        disposition: buildAttachmentDisposition(
          buildStudentCodesFilename(classEntity.class_name, EXTENSION),
        ),
      });
      // Nest's default handler calls `res.end()` once headers are out, which hands the browser a
      // cleanly terminated but truncated file. Destroying the socket makes the download fail visibly.
      file.setErrorHandler((err, res) => {
        this.logger.error(
          `[exportStudentCodes] ${format} stream failed for class ${classId}: ${err.message}`,
          err.stack,
        );
        if (res.destroyed) return;
        if (res instanceof ServerResponse) {
          res.destroy(err);
          return;
        }
        res.end();
      });

      this.logger.log(
        `[exportStudentCodes] Educator ${educatorId} exporting student codes (${format}) for class ${classId}`,
      );
      return file;
    } catch (error) {
      return handleError(error);
    }
  }

  /**
   * New-pattern delete, rebuilt per the same class-row-action rework as `createClass`/`update`.
   * No other caller depends on the old `(id)` signature (confirmed: only the DELETE
   * /classes/:id handler used it), so this is a straightforward in-place rewrite. The
   * ownership/co-teacher check now happens once via `findClassByIdWithEducator` — the
   * controller previously did that check itself and then handed the id to this method,
   * which re-fetched the (already-known-owned) entity with a second, unscoped `findOne`.
   */
  async remove(currentUser: ICurrentUser, classId: string): Promise<ResponseResult<null>> {
    try {
      const classEntity = await this.findClassByIdWithEducator(
        classId,
        currentUser.educatorId as string,
      );
      if (!classEntity) {
        throw new NotFoundException(ERROR_MSG.DB.NOT_FOUND('Class'));
      }

      const id = classEntity.id!;

      // Refund unused AI seats before the transaction deactivates students/sims
      const educatorId = classEntity.educator_id ?? null;
      if (educatorId) {
        await this.classSimulationService.refundUnusedSeatsForClass(id, educatorId);
      }

      await this.dataSource.transaction(async (manager) => {
        const now = new Date();

        // CRITICAL: Delete LMS and Google Classroom mappings to prevent orphaned references.
        // This ensures that when an educator re-launches the same LMS course or re-syncs
        // Google Classroom, the frontend/backend will create a fresh class instead of
        // trying to reactivate this soft-deleted one or getting blocked by stale mappings.
        await manager.delete(LmsStudentMapping, { classId: id });
        await manager.delete(LmsClassMapping, { classId: id });

        // Delete Google Classroom mappings (course and student mappings)
        await this.googleStudentMappingRepo.deleteByClassId(id);
        await this.googleCourseMappingRepo.deleteByClassId(id);

        await manager.update(
          ClassSimulation,
          { class_id: id, is_active: true },
          { is_active: false, deleted_at: now },
        );

        // Soft-delete active students only; preserve timestamps for already-inactive rows.
        const students = await manager.find(Student, {
          where: { class: { id }, is_active: true },
        });

        if (students.length > 0) {
          for (const student of students) {
            student.is_active = false;
            student.deleted_at = now;
            student.status = CommonStatus.INACTIVE;
          }
          await manager.save(Student, students);
        }

        // Soft-delete the class itself and clear LMS reference so relaunch won't match stale rows
        classEntity.is_active = false;
        classEntity.deleted_at = now;
        classEntity.status = CommonStatus.INACTIVE;
        await manager.save(Class, classEntity);
        await manager
          .createQueryBuilder()
          .update(Class)
          .set({ lms_class_reference: null as unknown as string })
          .where('id = :id', { id })
          .execute();
      });

      this.logger.log(
        `[remove] Soft-deleted class ${id}, deleted LMS/Google mappings, and soft-deleted ${classEntity.total_no_of_students ?? 0} students`,
      );

      return new ResponseResult({
        message: SUCCESS_MSG.COMMON.DELETED('Class'),
        data: null,
      });
    } catch (error) {
      return handleError(error);
    }
  }

  // --- School-groups read model (GET /classes/schools, GET /classes) ---

  /** Splits the `school_id` query filter into real school UUIDs and the `unassigned` sentinel. */
  private splitSchoolIds(schoolId?: string[]): {
    schoolIds?: string[];
    includeUnassigned: boolean;
  } {
    if (!schoolId?.length) {
      return { schoolIds: undefined, includeUnassigned: false };
    }
    const includeUnassigned = schoolId.includes(ClassConstants.UNASSIGNED_SCHOOL_SENTINEL);
    const schoolIds = schoolId.filter((id) => id !== ClassConstants.UNASSIGNED_SCHOOL_SENTINEL);
    return { schoolIds: schoolIds.length ? schoolIds : undefined, includeUnassigned };
  }

  /** Rejects a class start/end date filter range whose start falls after its end. */
  private assertValidClassDateRange(startDateFrom?: string, endDateTo?: string): void {
    if (startDateFrom && endDateTo && startDateFrom > endDateTo) {
      throwAppError(ERROR_MSG.COMMON.VALIDATION_ERROR);
    }
  }

  /** Rejects a class list whose "ends on or after" date falls after its "ends on or before" date. */
  private assertValidClassEndDateRange(endDateFrom?: string, endDateTo?: string): void {
    if (endDateFrom && endDateTo && endDateFrom > endDateTo) {
      throwAppError(ERROR_MSG.COMMON.INVALID_DATE_RANGE('endDateFrom', 'endDateTo'));
    }
  }

  async findSchoolGroups(
    currentUser: ICurrentUser,
    dto: ListSchoolGroupsReqDto,
  ): Promise<ResponseResult<SchoolGroupResDto[], IPaginationMeta>> {
    try {
      this.assertValidClassDateRange(dto.classStartDateFrom, dto.classEndDateTo);

      const { page, pageSize, skip, take } = getPagination({
        page: dto.page,
        pageSize: dto.pageSize,
      });
      const { schoolIds, includeUnassigned } = this.splitSchoolIds(dto.schoolId);

      const { rows, total } = await this.classRepo.findSchoolGroupsForEducator(
        currentUser.educatorId as string,
        {
          schoolName: dto.schoolName?.trim(),
          className: dto.className?.trim(),
          classIds: dto.classId,
          schoolIds,
          includeUnassigned,
          measure: dto.measure,
          classStatuses: dto.classStatus,
          classStartDateFrom: dto.classStartDateFrom,
          classEndDateTo: dto.classEndDateTo,
        },
        { skip, take },
      );

      const data: SchoolGroupResDto[] = rows.map((row) => ({
        schoolId: row.schoolId,
        schoolName:
          row.schoolId === null ? ClassConstants.UNASSIGNED_SCHOOL_LABEL : (row.schoolName ?? ''),
        classCount: row.classCount,
      }));

      return new ResponseResult({
        message: SUCCESS_MSG.COMMON.FETCHED('School groups'),
        data,
        meta: buildPaginationMeta(total, page, pageSize),
      });
    } catch (error) {
      return handleError(error);
    }
  }

  async findClasses(
    currentUser: ICurrentUser,
    dto: ListClassesReqDto & { lite: true },
  ): Promise<ResponseResult<ClassLiteResDto[], IPaginationMeta>>;
  async findClasses(
    currentUser: ICurrentUser,
    dto: ListClassesReqDto & { lite?: false | undefined },
  ): Promise<ResponseResult<ClassSummaryResDto[], IPaginationMeta>>;
  async findClasses(
    currentUser: ICurrentUser,
    dto: ListClassesReqDto,
  ): Promise<ResponseResult<ClassSummaryResDto[] | ClassLiteResDto[], IPaginationMeta>>;
  async findClasses(
    currentUser: ICurrentUser,
    dto: ListClassesReqDto,
  ): Promise<ResponseResult<ClassSummaryResDto[] | ClassLiteResDto[], IPaginationMeta>> {
    try {
      this.assertValidClassDateRange(dto.startDateFrom, dto.endDateTo);
      this.assertValidClassEndDateRange(dto.endDateFrom, dto.endDateTo);

      const { page, pageSize, skip, take } = getPagination({
        page: dto.page,
        pageSize: dto.pageSize,
      });
      const { schoolIds, includeUnassigned } = this.splitSchoolIds(dto.schoolIds);
      const sortDir: 'ASC' | 'DESC' = dto.sortBy
        ? ((dto.sortDir ?? 'asc').toUpperCase() as 'ASC' | 'DESC')
        : 'ASC';
      const filters = {
        search: dto.search?.trim(),
        classIds: dto.classId,
        statuses: dto.status,
        startDateFrom: dto.startDateFrom,
        endDateTo: dto.endDateTo,
        endDateFrom: dto.endDateFrom,
        schoolIds,
        includeUnassigned,
        measure: dto.measure,
      };
      const sort = { field: dto.sortBy, dir: sortDir };
      const pagination = { skip, take };

      return dto.lite
        ? await this.findClassesLite(currentUser, filters, sort, pagination, page, pageSize)
        : await this.findClassesFull(currentUser, filters, sort, pagination, page, pageSize);
    } catch (error) {
      return handleError(error);
    }
  }

  /** `dto.lite` branch of `findClasses` — id, class name, dates and status only. */
  private async findClassesLite(
    currentUser: ICurrentUser,
    filters: ClassFilters,
    sort: { field?: ClassSortField; dir: 'ASC' | 'DESC' },
    pagination: { skip: number; take: number },
    page: number,
    pageSize: number,
  ): Promise<ResponseResult<ClassLiteResDto[], IPaginationMeta>> {
    const { rows, total } = await this.classRepo.findClasses(
      currentUser.educatorId as string,
      { ...filters, lite: true },
      sort,
      pagination,
    );
    const data: ClassLiteResDto[] = rows.map((row) => ({
      classId: row.id,
      className: row.className,
      startDate: row.startDate,
      endDate: row.endDate,
      status: row.status,
    }));
    return new ResponseResult({
      message: SUCCESS_MSG.COMMON.FETCHED('Classes'),
      data,
      meta: buildPaginationMeta(total, page, pageSize),
    });
  }

  /** Full branch of `findClasses`. */
  private async findClassesFull(
    currentUser: ICurrentUser,
    filters: ClassFilters,
    sort: { field?: ClassSortField; dir: 'ASC' | 'DESC' },
    pagination: { skip: number; take: number },
    page: number,
    pageSize: number,
  ): Promise<ResponseResult<ClassSummaryResDto[], IPaginationMeta>> {
    const { rows, total } = await this.classRepo.findClasses(
      currentUser.educatorId as string,
      { ...filters, lite: false },
      sort,
      pagination,
    );
    const data: ClassSummaryResDto[] = rows.map((row) => ({
      classId: row.id,
      className: row.className,
      startDate: row.startDate,
      endDate: row.endDate,
      studentsCount: row.studentsCount,
      simsCount: row.simsCount,
      reportsCount: row.reportsCount,
      unreadReportsCount: row.unreadReportsCount,
      status: row.status,
    }));
    return new ResponseResult({
      message: SUCCESS_MSG.COMMON.FETCHED('Classes'),
      data,
      meta: buildPaginationMeta(total, page, pageSize),
    });
  }

  async getSimulationsCompletedGraph(
    currentUser: ICurrentUser,
    dto: SimulationsCompletedGraphReqDto,
  ): Promise<ResponseResult<SimulationsCompletedGraphResDto>> {
    try {
      const { byMonth, byMonthSeries, bySchool, byClass, byStudent } =
        await this.simulationReportRepo.getSimulationsCompletedGraph(
          currentUser.educatorId as string,
          {
            studentIds: dto.studentIds,
            classIds: dto.classIds,
            schoolIds: dto.schoolIds,
            forSchool: dto.forSchool,
            forClass: dto.forClass,
            compareBy: dto.compareBy,
            since: resolveSimulationsCompletedGraphSince(dto.months, dto.allTime),
          },
        );

      return new ResponseResult({
        message: SUCCESS_MSG.COMMON.FETCHED('Completion trend'),
        data: { byMonth, byMonthSeries, bySchool, byClass, byStudent },
      });
    } catch (error) {
      return handleError(error);
    }
  }

  getClassStatuses(): Promise<ResponseResult<ClassStatusResDto>> {
    try {
      return Promise.resolve(
        new ResponseResult({
          message: SUCCESS_MSG.COMMON.FETCHED('Class statuses'),
          data: { statuses: ClassConstants.VALID_STATUSES },
        }),
      );
    } catch (error) {
      return handleError(error);
    }
  }
}

export function isValidStudentCodeFormat(code: string): boolean {
  const trimmed = typeof code === 'string' ? code.trim() : '';
  if (!trimmed) return false;
  // Must be exactly 8 characters: 3 characters, hyphen, 4 characters (e.g., SSS-R12C)
  if (!/^[a-zA-Z0-9]{3}-[a-zA-Z0-9]{4}$/.test(trimmed)) return false;
  // Must contain only alphabet and number combination (both letters and numbers required)
  return /[a-zA-Z]/.test(trimmed) && /[0-9]/.test(trimmed);
}

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const STUDENT_CODE_FORMAT_REGEX = /^[A-Z0-9]{3}-[A-Z0-9]{4}$/;

function normalizeLmsUserIdSuffix(raw: string): string {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return '';
  if (/^\d+$/.test(trimmed)) {
    return String(Number(trimmed));
  }
  return trimmed;
}

function buildClassPrefix(className: string): string {
  const alphanum = className.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return alphanum.slice(0, 3).padEnd(3, 'X');
}
function generateRandomSuffix(): string {
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return result;
}

function generateUniqueStudentCode(
  className: string,
  usedCodes: Set<string>,
  generatedInSession: Set<string>,
): string {
  const prefix = buildClassPrefix(className);

  for (let attempt = 0; attempt < 10_000; attempt++) {
    const candidate = `${prefix}-${generateRandomSuffix()}`;

    if (!STUDENT_CODE_FORMAT_REGEX.test(candidate)) {
      throw new BadRequestException(ClassConstants.VALIDATION.CODE_FORMAT_INVALID);
    }

    if (!usedCodes.has(candidate) && !generatedInSession.has(candidate)) {
      generatedInSession.add(candidate);
      usedCodes.add(candidate);
      return candidate;
    }
  }

  throw new BadRequestException(ClassConstants.VALIDATION.CODE_GEN_FAILED);
}

function generateLmsStudentCode(lmsClassId: string, lmsUserId: string): string {
  const prefix = String(lmsClassId ?? '').trim();
  const suffix = normalizeLmsUserIdSuffix(lmsUserId);
  if (!prefix || !suffix) {
    throw new BadRequestException(
      'Invalid LMS class_id or LMS user id for student code generation',
    );
  }
  return `${prefix}-${suffix}`;
}
