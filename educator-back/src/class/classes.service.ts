import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, DataSource, Not } from 'typeorm';
import { Class } from './entity/class.entity';
import { ClassEducator } from './entity/class-educator.entity';
import { ClassDto, UpdateClassDto } from './dto/classes.dto';
import { CommonStatus } from 'src/common/enums/status.enum';
import { ServiceResponse } from 'src/common/types';
import { Messages, ErrorTypes } from 'src/common/utils/messages';
import { Educator } from '../educators/entity/educator.entity';
import { EducatorSchool } from '../educators/entity/educator-school.entity';
import { Student } from '../students/entity/students.entity';
import { CreateStudentDto } from 'src/students/dto/students.dto';
import { ClassConstants } from './classes.constants';
import { ClassSimulation } from 'src/class-simulations/entity/class-simulation.entity';
import { Simulation } from 'src/simulations/entity/simulation.entity';
import { ClassSimulationService } from 'src/class-simulations/class-simulation.service';
import { LmsProvisionService } from 'src/lms/services/lms-provision.service';
import { LmsClassMapping } from 'src/lms/entity/lms-class-mapping.entity';
import { LmsStudentMapping } from 'src/lms/entity/lms-student-mapping.entity';
import { SimulationReport } from 'src/simulation-reports/entity/simulation-report.entity';
import { randomUUID } from 'crypto';

@Injectable()
export class ClassesService {
  private readonly logger = new Logger(ClassesService.name);

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
    @InjectRepository(Class)
    private readonly classRepo: Repository<Class>,
    @InjectRepository(ClassEducator)
    private readonly classEducatorRepo: Repository<ClassEducator>,
    @InjectRepository(Student)
    private readonly studentRepo: Repository<Student>,
    @InjectRepository(Educator)
    private readonly educatorRepo: Repository<Educator>,
    @InjectRepository(ClassSimulation)
    private readonly classSimulationRepo: Repository<ClassSimulation>,
    @InjectRepository(EducatorSchool)
    private readonly educatorSchoolRepo: Repository<EducatorSchool>,
    private readonly dataSource: DataSource,
    private readonly lmsProvisionService: LmsProvisionService,
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

  async onModuleInit(): Promise<void> {
    await this.ensureColumn();
  }

  private async ensureColumn(): Promise<void> {
    await this.dataSource.query(`
    ALTER TABLE classes
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL;
  `);
    await this.dataSource.query(`ALTER TABLE classes ALTER COLUMN term DROP NOT NULL`);
    await this.dataSource.query(`ALTER TABLE classes ALTER COLUMN year DROP NOT NULL`);
  }

  /**
   * Add an educator to a class as a co-instructor via class_educators junction.
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
        await this.classEducatorRepo.save(existing);
        this.logger.log(
          `[ClassEducator] Updated educator=${educatorId} to primary for class=${classId}`,
        );
      }
      return;
    }

    const classEducator = this.classEducatorRepo.create({
      classId,
      educatorId,
      isPrimary,
    });

    await this.classEducatorRepo.save(classEducator);
    this.logger.log(
      `[ClassEducator] Added educator=${educatorId} to class=${classId} (primary=${isPrimary})`,
    );
  }

  /**
   * Check if an educator has access to a class (either as primary owner or co-instructor).
   */
  /** Primary owner on classes OR co-instructor via class_educators — EXISTS avoids join duplication. */
  private applyEducatorClassAccessFilter(
    qb: ReturnType<Repository<Class>['createQueryBuilder']>,
    educatorId: string,
  ): void {
    qb.andWhere(
      `(c.educator_id = :educatorId OR EXISTS (
        SELECT 1 FROM class_educators ce
        WHERE ce.class_id = c.id AND ce.educator_id = :educatorId
      ))`,
      { educatorId },
    );
  }

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
    // Check if educator is either primary owner OR co-instructor
    const clsQb = this.classRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.school', 'school')
      .where('c.id = :id', { id })
      .andWhere('c.is_active = true');
    this.applyEducatorClassAccessFilter(clsQb, educatorId);
    const cls = await clsQb.getOne();

    if (!cls) return null;

    // Classes without a school_id are always accessible (legacy data).
    if (!cls.school_id) return cls;

    // Hide class if its school is currently inactive.
    if (cls.school && !cls.school.is_active) return null;

    // If a specific schoolId was supplied, it must match.
    if (schoolId && cls.school_id !== schoolId) return null;

    // Verify the educator is still assigned to this class's school.
    const assignment = await this.educatorSchoolRepo.findOne({
      where: { educator: { id: educatorId }, school: { id: cls.school_id } },
    });
    return assignment ? cls : null;
  }

  async verifyEducatorHasSchool(educatorId: string, schoolId: string): Promise<boolean> {
    const assignment = await this.educatorSchoolRepo.findOne({
      where: { educator: { id: educatorId }, school: { id: schoolId } },
    });
    return assignment !== null;
  }

  private async findDuplicateForUpdate(
    className: string,
    excludeId: string,
    educatorId: string,
  ): Promise<Class | null> {
    return this.classRepo.findOne({
      where: {
        class_name: className,
        id: Not(excludeId),
        educator: { id: educatorId },
        is_active: true,
      },
    });
  }

  private generateLmsClassId(): string {
    return randomUUID().replace(/-/g, '').substring(0, 8).toUpperCase();
  }

  private async loadUsedStudentCodes(): Promise<Set<string>> {
    const existingStudents =
      (await this.studentRepo
        .createQueryBuilder('s')
        .select('s.student_id', 'student_id')
        .where(`s.student_id IS NOT NULL AND s.student_id <> ''`)
        .getRawMany<{ student_id: string }>()) ?? [];

    return new Set(existingStudents.map((row) => row.student_id));
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
    const classMapping = await this.dataSource.manager.findOne(LmsClassMapping, {
      where: { lmsCourseId, schoolId },
    });

    if (classMapping && dto.nrpsUrl?.trim()) {
      classMapping.nrpsUrl = dto.nrpsUrl.trim();
      await this.dataSource.manager.save(LmsClassMapping, classMapping);
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

    const newStudents: Student[] = [];
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

      newStudents.push(
        this.studentRepo.create({
          student_id: studentCode,
          score: studentItem.score,
          attempt: studentItem.attempt,
          submission_date: studentItem.submission_date,
          status: CommonStatus.ACTIVE,
          class: linkedClass,
          educator,
          ...(linkedClass.school ? { school: linkedClass.school } : {}),
        }),
      );
    }

    if (newStudents.length > 0) {
      await this.studentRepo.save(newStudents);

      for (const studentItem of normalizedStudentsInput) {
        const rawId = String(studentItem.student_id ?? '').trim();
        if (rawId && !rawId.includes('-') && lmsClassIdPrefix) {
          const suffix = /^\d+$/.test(rawId) ? String(Number(rawId)) : rawId;
          const studentCode = `${lmsClassIdPrefix}-${suffix}`;
          const existingMapping = await this.dataSource.manager.findOne(LmsStudentMapping, {
            where: { lmsUserId: rawId, classId: linkedClass.id! },
          });
          if (!existingMapping) {
            await this.dataSource.manager.save(
              this.dataSource.manager.create(LmsStudentMapping, {
                schoolId,
                classId: linkedClass.id!,
                lmsUserId: rawId,
                studentCode,
              }),
            );
          }
        }
      }
    }

    linkedClass.total_no_of_students = existingStudents.length + newStudents.length;
    await this.classRepo.save(linkedClass);

    const refreshed = await this.classRepo.findOne({
      where: { id: linkedClass.id },
      relations: ['educator', 'students', 'school'],
    });

    return refreshed ?? linkedClass;
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
    const mapping = await this.dataSource.manager.findOne(LmsClassMapping, {
      where: { lmsCourseId, schoolId },
    });

    if (mapping) {
      const linkedClass = await this.classRepo.findOne({
        where: { id: mapping.classId },
      });
      if (!linkedClass || !linkedClass.is_active) {
        await this.dataSource.manager.delete(LmsStudentMapping, { classId: mapping.classId });
        await this.dataSource.manager.delete(LmsClassMapping, { id: mapping.id });
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

        const existingMapping = await this.dataSource.manager.findOne(LmsClassMapping, {
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
      const classEntity = this.classRepo.create({
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

      const saved = await this.classRepo.save(classEntity);
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
        const students: Student[] = normalizedStudentsInput.map((studentItem) => {
          const rawStudentId = String(studentItem.student_id ?? '').trim();
          const looksLikeStudentCode = rawStudentId.includes('-');
          const studentCode = looksLikeStudentCode
            ? rawStudentId
            : lmsClassIdPrefix && rawStudentId
              ? generateLmsStudentCode(lmsClassIdPrefix, rawStudentId)
              : generateUniqueStudentCode(saved.class_name ?? '', usedCodes, generatedInSession);

          if (usedCodes.has(studentCode) || generatedInSession.has(studentCode)) {
            throw new BadRequestException(`Duplicate generated student code: ${studentCode}`);
          }
          usedCodes.add(studentCode);
          generatedInSession.add(studentCode);

          const student: Partial<Student> = {
            student_id: studentCode,
            score: studentItem.score,
            attempt: studentItem.attempt,
            submission_date: studentItem.submission_date,
            status: CommonStatus.ACTIVE,
            class: saved,
            educator: educator,
            ...(saved.school ? { school: saved.school } : {}),
          };
          return this.studentRepo.create(student);
        });

        const savedStudents = await this.studentRepo.save(students);
        finalCount = savedStudents.length;
      } else if (dto.total_no_of_students) {
        const students: Student[] = [];

        for (let index = 0; index < dto.total_no_of_students; index++) {
          const studentCode = generateUniqueStudentCode(
            saved.class_name ?? '',
            usedCodes,
            generatedInSession,
          );
          const student: Partial<Student> = {
            student_id: studentCode,
            status: CommonStatus.ACTIVE,
            class: saved,
            educator: educator,
            ...(saved.school ? { school: saved.school } : {}),
          };

          students.push(this.studentRepo.create(student));
        }
        const savedStudents = await this.studentRepo.save(students);
        finalCount = savedStudents.length;
      }

      saved.total_no_of_students = finalCount;

      await this.classRepo.save(saved);

      if (lmsCourseId && schoolId) {
        try {
          let classMapping = await this.dataSource.manager.findOne(LmsClassMapping, {
            where: { lmsCourseId, schoolId },
          });
          if (!classMapping) {
            classMapping = this.dataSource.manager.create(LmsClassMapping, {
              schoolId,
              classId: saved.id!,
              lmsCourseId,
              lmsContextId: null,
              nrpsUrl: dto.nrpsUrl?.trim() ?? '',
            });
          } else {
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
          await this.dataSource.manager.save(LmsClassMapping, classMapping);

          for (const studentItem of normalizedStudentsInput) {
            const rawId = String(studentItem.student_id ?? '').trim();
            if (rawId && !rawId.includes('-') && lmsClassIdPrefix) {
              const suffix = /^\d+$/.test(rawId) ? String(Number(rawId)) : rawId;
              const studentCode = `${lmsClassIdPrefix}-${suffix}`;
              const existingMapping = await this.dataSource.manager.findOne(LmsStudentMapping, {
                where: { lmsUserId: rawId, classId: saved.id! },
              });
              if (!existingMapping) {
                await this.dataSource.manager.save(
                  this.dataSource.manager.create(LmsStudentMapping, {
                    schoolId,
                    classId: saved.id!,
                    lmsUserId: rawId,
                    studentCode,
                  }),
                );
              }
            }
          }
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
    const qb = this.classRepo
      .createQueryBuilder('c')
      .leftJoin('c.students', 'students')
      .addSelect([
        'students.id',
        'students.student_id',
        'students.status',
        'students.class_id',
        'students.educator_id',
        'students.school_id',
        'students.submission_date',
        'students.sims_completed',
        'students.time_spent',
        'students.time_remaining',
        'students.attempt',
        'students.score',
        'students.created_at',
        'students.updated_at',
        'students.is_active',
        'students.deleted_at',
      ])
      .leftJoinAndSelect('c.school', 'school')
      .where('c.is_active = true')
      .andWhere('(c.school_id IS NULL OR school.is_active = true)')
      .orderBy('c.created_at', 'DESC');
    this.applyEducatorClassAccessFilter(qb, educatorId);

    if (schoolId) {
      qb.andWhere('c.school_id = :schoolId', { schoolId });
    }

    const items = await qb.getMany();
    const classIds = items.map((c) => c.id!).filter(Boolean);
    const attentionMap = new Map<
      string,
      { reportCount: number; unreadReportCount: number; needsAttention: boolean }
    >();

    if (classIds.length > 0) {
      try {
        const attentionRows = await this.studentRepo
          .createQueryBuilder('s')
          .innerJoin(SimulationReport, 'sr', 'sr.student_id = s.id')
          .select('s.class_id', 'class_id')
          .addSelect('COUNT(sr.id)', 'report_count')
          .addSelect('COUNT(CASE WHEN sr.viewed_at IS NULL THEN sr.id END)', 'unread_count')
          .where('s.class_id IN (:...classIds)', { classIds })
          .andWhere('s.is_active = true')
          .groupBy('s.class_id')
          .getRawMany<{ class_id: string; report_count: string; unread_count: string }>();

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

    return {
      success: true,
      message: Messages.CLASS_FETCHED,
      data: items,
    };
  }

  async findOne(id: string, educatorId: string): Promise<ServiceResponse<Class>> {
    // Check if educator is either primary owner OR co-instructor
    const classQb = this.classRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.educator', 'educator')
      .leftJoinAndSelect('c.students', 'students')
      .where('c.id = :id', { id })
      .andWhere('c.is_active = true');
    this.applyEducatorClassAccessFilter(classQb, educatorId);
    const classEntity = await classQb.getOne();

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

    return {
      success: true,
      message: Messages.CLASS_FETCHED,
      data: classEntity,
    };
  }

  async update(classEntity: Class, dto: UpdateClassDto): Promise<ServiceResponse<Class>> {
    // Check for duplicate class name if class_name is being updated
    if (dto.class_name && dto.class_name !== classEntity.class_name) {
      const duplicateClass = await this.findDuplicateForUpdate(
        dto.class_name,
        classEntity.id!,
        classEntity.educator_id!,
      );
      if (duplicateClass) {
        return {
          success: false,
          message: Messages.CLASS_EXISTS,
          type: ErrorTypes.BAD_REQUEST,
        };
      }
    }

    classEntity.class_name = dto.class_name ?? classEntity.class_name;
    classEntity.term = dto.term ?? classEntity.term;
    classEntity.year = dto.year ?? classEntity.year;
    classEntity.start_date = dto.start_date ?? classEntity.start_date;
    classEntity.end_date = dto.end_date ?? classEntity.end_date;
    classEntity.status = dto.status ?? classEntity.status;
    if (dto.school_id !== undefined) {
      classEntity.school_id = dto.school_id;
      classEntity.school = { id: dto.school_id } as unknown as typeof classEntity.school;
    }

    const updated = await this.classRepo.save(classEntity);

    // Reload with school relation so the response includes school_name
    const updatedWithRelations = await this.classRepo.findOne({
      where: { id: updated.id },
      relations: ['school'],
    });

    return {
      success: true,
      message: Messages.CLASS_UPDATED,
      data: updatedWithRelations ?? updated,
    };
  }

  async remove(id: string): Promise<ServiceResponse<null>> {
    const classEntity = await this.classRepo.findOne({ where: { id } });
    if (!classEntity) {
      return {
        success: false,
        message: Messages.CLASS_NOT_FOUND,
        type: ErrorTypes.NOT_FOUND,
      };
    }

    // Refund unused AI seats before the transaction deactivates students/sims
    const educatorId = classEntity.educator_id ?? null;
    if (educatorId) {
      await this.classSimulationService.refundUnusedSeatsForClass(id, educatorId);
    }

    await this.dataSource.transaction(async (manager) => {
      const now = new Date();

      // CRITICAL: Delete LMS mappings to prevent orphaned references.
      // This ensures that when an educator re-launches the same LMS course,
      // the frontend/backend will create a fresh class instead of trying to
      // reactivate this soft-deleted one or getting blocked by stale mappings.
      await manager.delete(LmsStudentMapping, { classId: id });
      await manager.delete(LmsClassMapping, { classId: id });

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
      `[remove] Soft-deleted class ${id}, deleted LMS mappings, and soft-deleted ${classEntity.total_no_of_students ?? 0} students`,
    );

    return {
      success: true,
      message: Messages.CLASS_DELETED,
      data: null,
    };
  }
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
