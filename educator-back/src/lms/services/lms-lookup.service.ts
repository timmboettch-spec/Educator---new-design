import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { LmsStudentMapping } from '../entity/lms-student-mapping.entity';
import { LmsClassMapping } from '../entity/lms-class-mapping.entity';
import { StudentProfileLookup } from '../interfaces/lms.interfaces';
import { LmsConfigService } from './lms-config.service';
import { LmsConnectService } from './lms-connect.service';
import { LmsRosterService } from './lms-roster.service';
import { Student } from 'src/students/entity/students.entity';
import { Class } from 'src/class/entity/class.entity';
import { CommonStatus } from 'src/common/enums/status.enum';
import { Educator } from 'src/educators/entity/educator.entity';

export interface LmsClassStudentLookupResult {
  studentCode: string | null;
  classFound: boolean;
}

export interface StudentLaunchResolution {
  schoolId: string | null;
  studentCode: string | null;
  courseScopedClassFound: boolean;
}

@Injectable()
export class LmsLookupService {
  private readonly logger = new Logger(LmsLookupService.name);

  private normalizeLmsClassId(rawClassId: string): string {
    const raw = String(rawClassId ?? '').trim();
    if (!raw) return '';

    let hash = 0;
    const seeded = `LMS:${raw}`;
    for (let i = 0; i < seeded.length; i++) {
      hash = (hash * 33 + seeded.charCodeAt(i)) >>> 0;
    }

    let out = hash.toString(36).toUpperCase().padStart(6, '0').slice(-6);
    if (!/[A-Z]/.test(out)) {
      out = `A${out.slice(1)}`;
    }
    return out;
  }

  constructor(
    @InjectRepository(LmsStudentMapping)
    private readonly studentMappingRepo: Repository<LmsStudentMapping>,
    private readonly configService: LmsConfigService,
    private readonly connectService: LmsConnectService,
    private readonly rosterService: LmsRosterService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Resolve student code and school for LTI student launch when multiple schools share one tool.
   * Tries course-scoped lookup across all candidate schools before school-wide fallbacks.
   */
  async resolveStudentCodeForLaunch(args: {
    lmsUserId: string;
    launchCourseIds: string[];
    schoolIds: string[];
  }): Promise<StudentLaunchResolution> {
    const lmsUserId = args.lmsUserId?.trim();
    const launchCourseIds = args.launchCourseIds
      .map((id) => String(id ?? '').trim())
      .filter(Boolean);
    const schoolIds = Array.from(new Set(args.schoolIds.map((id) => id.trim()).filter(Boolean)));

    if (!lmsUserId || schoolIds.length === 0) {
      return { schoolId: null, studentCode: null, courseScopedClassFound: false };
    }

    let courseScopedClassFound = false;

    if (launchCourseIds.length > 0) {
      const courseLookupPairs = schoolIds.flatMap((schoolId) =>
        launchCourseIds.map((courseId) => ({ schoolId, courseId })),
      );
      const courseLookups = await Promise.all(
        courseLookupPairs.map(async ({ schoolId, courseId }) => ({
          schoolId,
          courseId,
          lookup: await this.findStudentCodeByLmsClassAndUserId(lmsUserId, courseId, schoolId),
        })),
      );

      for (const { schoolId, lookup } of courseLookups) {
        if (lookup.classFound) {
          courseScopedClassFound = true;
        }
        if (lookup.studentCode) {
          return {
            schoolId,
            studentCode: lookup.studentCode,
            courseScopedClassFound: true,
          };
        }
      }
    }

    const schoolFallbacks = await Promise.all(
      schoolIds.map(async (schoolId) => {
        let studentCode = await this.ensureMappedStudentAccount(lmsUserId, schoolId, {
          createStudentIfMissing: false,
        });
        if (studentCode) {
          return { schoolId, studentCode };
        }

        studentCode = await this.findStudentByConstructedCode(lmsUserId, schoolId);
        if (studentCode) {
          return { schoolId, studentCode };
        }

        studentCode = await this.findStudentCodeByLmsUserIdInSchool(lmsUserId, schoolId);
        return { schoolId, studentCode };
      }),
    );

    for (const schoolId of schoolIds) {
      const match = schoolFallbacks.find(
        (entry) => entry.schoolId === schoolId && entry.studentCode,
      );
      if (match?.studentCode) {
        return {
          schoolId: match.schoolId,
          studentCode: match.studentCode,
          courseScopedClassFound,
        };
      }
    }

    return { schoolId: null, studentCode: null, courseScopedClassFound };
  }

  async lookupStudentProfile(
    schoolId: string,
    classId: string,
    studentCode: string,
  ): Promise<StudentProfileLookup> {
    const mapping = await this.studentMappingRepo.findOne({
      where: { schoolId, classId, studentCode },
    });

    if (!mapping) {
      throw new NotFoundException(`No LMS mapping found for student code ${studentCode}`);
    }

    const config = await this.configService.getBySchoolId(schoolId);
    const classMapping = await this.connectService.getClassMapping(classId);
    const roster = await this.rosterService.fetchRoster(config, classMapping.nrpsUrl);

    const member = roster.members.find((entry) => entry.userId === mapping.lmsUserId);

    if (!config.sharePii || !member?.name) {
      return {
        studentCode,
        name: null,
        email: null,
        piiAvailable: false,
        mode: 'student_code_only',
      };
    }

    return {
      studentCode,
      name: member.name,
      email: member.email,
      piiAvailable: true,
      mode: 'full',
    };
  }

  async findStudentCodeByLmsUserId(lmsUserId: string, schoolId: string): Promise<string | null> {
    const mapping = await this.studentMappingRepo.findOne({
      where: { lmsUserId, schoolId },
    });
    return mapping?.studentCode ?? null;
  }

  async findStudentByConstructedCode(lmsUserId: string, schoolId: string): Promise<string | null> {
    if (!lmsUserId || !schoolId) return null;

    const lmsIdNumeric = String(Number(lmsUserId));

    const classes = await this.dataSource
      .getRepository(Class)
      .createQueryBuilder('c')
      .innerJoin('c.educator', 'e')
      .innerJoin('e.school', 'sch')
      .where('sch.id = :schoolId', { schoolId })
      .andWhere('c.lms_class_id IS NOT NULL')
      .andWhere("c.lms_class_id <> ''")
      .andWhere('c.is_active = true')
      .getMany();

    this.logger.debug(
      `[findStudentByConstructedCode] Checking ${classes.length} LMS-linked classes for lmsUserId: ${lmsUserId}`,
    );

    for (const cls of classes) {
      const prefix = (cls.lms_class_id ?? '').trim();
      if (!prefix) continue;

      const candidateCode = `${prefix}-${lmsIdNumeric}`;
      const student = await this.dataSource.manager.findOne(Student, {
        where: { student_id: candidateCode, is_active: true },
      });

      if (student?.student_id) {
        this.logger.log(
          `[findStudentByConstructedCode] Matched student code: ${student.student_id} (class: ${cls.id})`,
        );

        try {
          const existingMapping = await this.studentMappingRepo.findOne({
            where: { lmsUserId, schoolId },
          });
          if (!existingMapping) {
            await this.studentMappingRepo.save({
              schoolId,
              classId: cls.id!,
              lmsUserId,
              studentCode: student.student_id,
            });
          }
        } catch {
          // mapping save is best-effort; don't fail the launch
        }
        return student.student_id;
      }
    }

    this.logger.warn(
      `[findStudentByConstructedCode] No student found by constructed code for lmsUserId: ${lmsUserId}, school: ${schoolId}`,
    );
    return null;
  }

  async findActiveClassByLmsCourseId(lmsCourseId: string, schoolId: string): Promise<Class | null> {
    if (!lmsCourseId || !schoolId) {
      return null;
    }

    const classMapping = await this.dataSource.manager.findOne(LmsClassMapping, {
      where: {
        lmsCourseId: String(lmsCourseId),
        schoolId,
      },
    });

    if (classMapping?.classId) {
      const mappedClass = await this.dataSource.manager.findOne(Class, {
        where: {
          id: classMapping.classId,
          is_active: true,
        },
      });
      if (mappedClass) {
        return mappedClass;
      }
    }

    return this.dataSource
      .getRepository(Class)
      .createQueryBuilder('c')
      .innerJoin('c.educator', 'e')
      .innerJoin('e.school', 'sch')
      .where('sch.id = :schoolId', { schoolId })
      .andWhere('c.lms_class_reference = :lmsCourseId', {
        lmsCourseId: String(lmsCourseId),
      })
      .andWhere('c.is_active = true')
      .orderBy('c.updated_at', 'DESC')
      .addOrderBy('c.created_at', 'DESC')
      .getOne();
  }

  async findStudentCodeByLmsClassAndUserId(
    lmsUserId: string,
    lmsCourseId: string,
    schoolId: string,
  ): Promise<LmsClassStudentLookupResult> {
    const emptyResult: LmsClassStudentLookupResult = {
      studentCode: null,
      classFound: false,
    };

    if (!lmsUserId || !lmsCourseId) {
      this.logger.debug(
        `[findStudentCodeByLmsClassAndUserId] Missing lmsUserId or lmsCourseId for school ${schoolId}`,
      );
      return emptyResult;
    }

    this.logger.log(
      `[findStudentCodeByLmsClassAndUserId] Searching for student - lmsUserId: ${lmsUserId}, lmsCourseId: ${lmsCourseId}, school: ${schoolId}`,
    );

    try {
      const classMapping = await this.dataSource.manager.findOne(LmsClassMapping, {
        where: {
          lmsCourseId: String(lmsCourseId),
          schoolId,
        },
      });

      let classData: Class | null = null;
      let classResolvedViaMapping = false;

      if (classMapping?.classId) {
        classData = await this.dataSource.manager.findOne(Class, {
          where: {
            id: classMapping.classId,
            is_active: true,
          },
        });
        if (classData) {
          classResolvedViaMapping = true;
        }
      }

      if (!classData) {
        classData = await this.dataSource
          .getRepository(Class)
          .createQueryBuilder('c')
          .innerJoin('c.educator', 'e')
          .innerJoin('e.school', 'sch')
          .where('sch.id = :schoolId', { schoolId })
          .andWhere('c.lms_class_reference = :lmsCourseId', {
            lmsCourseId: String(lmsCourseId),
          })
          .andWhere('c.is_active = true')
          .orderBy('c.updated_at', 'DESC')
          .addOrderBy('c.created_at', 'DESC')
          .getOne();
      }

      this.logger.debug(
        `[findStudentCodeByLmsClassAndUserId] Class resolved ${
          classData ? (classResolvedViaMapping ? 'via mapping' : 'via lms_class_reference') : 'none'
        }: ${classData?.id ?? 'none'}`,
      );

      if (!classData?.id) {
        this.logger.warn(
          `[findStudentCodeByLmsClassAndUserId] No class resolved for lmsCourseId: ${lmsCourseId}, school: ${schoolId}`,
        );
        return emptyResult;
      }

      this.logger.log(
        `[findStudentCodeByLmsClassAndUserId] Resolved class for lmsCourseId ${lmsCourseId}: ${classData.id}`,
      );

      const mapping = await this.dataSource.manager.findOne(LmsStudentMapping, {
        where: {
          classId: classData.id,
          lmsUserId: String(lmsUserId),
        },
      });

      if (mapping?.studentCode) {
        this.logger.log(
          `[findStudentCodeByLmsClassAndUserId] Found mapping: ${mapping.studentCode}`,
        );
        return {
          studentCode: mapping.studentCode,
          classFound: true,
        };
      }

      const numericUserId = /^\d+$/.test(String(lmsUserId))
        ? String(Number(lmsUserId))
        : String(lmsUserId);
      const suffix = `-${numericUserId}`;

      const activeStudents = await this.dataSource.manager.find(Student, {
        where: {
          class: { id: classData.id },
          is_active: true,
        },
      });

      const activeMatch = activeStudents.find((student) =>
        (student.student_id ?? '').endsWith(suffix),
      );

      if (activeMatch?.student_id) {
        this.logger.log(
          `[findStudentCodeByLmsClassAndUserId] Found active student by suffix match: ${activeMatch.student_id}`,
        );
        return {
          studentCode: activeMatch.student_id,
          classFound: true,
        };
      }

      const inactiveStudents = await this.dataSource.manager.find(Student, {
        where: {
          class: { id: classData.id },
          is_active: false,
        },
      });

      const inactiveMatch = inactiveStudents.find((student) =>
        (student.student_id ?? '').endsWith(suffix),
      );

      if (inactiveMatch?.student_id) {
        inactiveMatch.is_active = true;
        inactiveMatch.deleted_at = null;
        inactiveMatch.status = CommonStatus.ACTIVE;
        await this.dataSource.manager.save(Student, inactiveMatch);
        this.logger.log(
          `[findStudentCodeByLmsClassAndUserId] Reactivated inactive student by suffix match: ${inactiveMatch.student_id}`,
        );
        return {
          studentCode: inactiveMatch.student_id,
          classFound: true,
        };
      }

      this.logger.warn(
        `[findStudentCodeByLmsClassAndUserId] No student found for lmsUserId: ${lmsUserId} in class: ${classData.id}`,
      );

      return {
        studentCode: null,
        classFound: true,
      };
    } catch (error) {
      this.logger.error(
        `[findStudentCodeByLmsClassAndUserId] Error: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );

      return emptyResult;
    }
  }

  async findStudentCodeByLmsUserIdInSchool(
    lmsUserId: string,
    schoolId: string,
  ): Promise<string | null> {
    if (!lmsUserId || !schoolId) {
      return null;
    }

    const numeric = Number(lmsUserId);
    const hasNumeric = Number.isFinite(numeric);
    const normalizedNumeric = hasNumeric ? String(numeric) : '';
    const trimmedRaw = String(lmsUserId).trim();

    const suffixes = new Set<string>();
    if (trimmedRaw) {
      suffixes.add(`-${trimmedRaw}`);
    }
    if (normalizedNumeric) {
      suffixes.add(`-${normalizedNumeric}`);
      suffixes.add(`-M${normalizedNumeric.padStart(5, '0')}`);
    }

    if (suffixes.size === 0) {
      return null;
    }

    const params: Record<string, string> = { schoolId };
    const predicates: string[] = [];
    let index = 0;
    for (const suffix of suffixes) {
      const key = `suffix${index}`;
      predicates.push(`s.student_id LIKE :${key}`);
      params[key] = `%${suffix}`;
      index += 1;
    }

    const whereSuffix = `(${predicates.join(' OR ')})`;

    const activeMatch = await this.dataSource
      .getRepository(Student)
      .createQueryBuilder('s')
      .innerJoinAndSelect('s.class', 'c')
      .innerJoin('s.educator', 'e')
      .innerJoin('e.school', 'sch')
      .where('sch.id = :schoolId', { schoolId })
      .andWhere('s.is_active = true')
      .andWhere(whereSuffix, params)
      .orderBy('s.updated_at', 'DESC')
      .addOrderBy('s.created_at', 'DESC')
      .getOne();

    if (activeMatch?.student_id) {
      try {
        const existingM = await this.studentMappingRepo.findOne({ where: { lmsUserId, schoolId } });
        if (!existingM && activeMatch.class?.id) {
          await this.studentMappingRepo.save({
            schoolId,
            classId: activeMatch.class.id,
            lmsUserId,
            studentCode: activeMatch.student_id,
          });
        }
      } catch {
        /* best-effort */
      }
      this.logger.log(
        `[findStudentCodeByLmsUserIdInSchool] Matched active student by suffix: ${activeMatch.student_id} (school: ${schoolId})`,
      );
      return activeMatch.student_id;
    }

    const inactiveMatch = await this.dataSource
      .getRepository(Student)
      .createQueryBuilder('s')
      .innerJoinAndSelect('s.class', 'c')
      .innerJoin('s.educator', 'e')
      .innerJoin('e.school', 'sch')
      .where('sch.id = :schoolId', { schoolId })
      .andWhere(whereSuffix, params)
      .orderBy('s.updated_at', 'DESC')
      .addOrderBy('s.created_at', 'DESC')
      .getOne();

    if (!inactiveMatch?.student_id) {
      this.logger.warn(
        `[findStudentCodeByLmsUserIdInSchool] No student found by suffix for lmsUserId: ${lmsUserId}, school: ${schoolId}`,
      );
      return null;
    }

    if (!inactiveMatch.is_active) {
      inactiveMatch.is_active = true;
      inactiveMatch.deleted_at = null;
      inactiveMatch.status = CommonStatus.ACTIVE;
      await this.dataSource.manager.save(Student, inactiveMatch);
    }

    try {
      const existingM = await this.studentMappingRepo.findOne({ where: { lmsUserId, schoolId } });
      if (!existingM && inactiveMatch.class?.id) {
        await this.studentMappingRepo.save({
          schoolId,
          classId: inactiveMatch.class.id,
          lmsUserId,
          studentCode: inactiveMatch.student_id,
        });
      }
    } catch {
      /* best-effort */
    }
    this.logger.log(
      `[findStudentCodeByLmsUserIdInSchool] Matched inactive student by suffix and reactivated: ${inactiveMatch.student_id} (school: ${schoolId})`,
    );
    return inactiveMatch.student_id;
  }

  async findStudentCodeByLmsUserIdGlobally(
    lmsUserId: string,
    schoolIdForMapping?: string,
  ): Promise<string | null> {
    if (!lmsUserId) {
      return null;
    }

    const numeric = Number(lmsUserId);
    const hasNumeric = Number.isFinite(numeric);
    const normalizedNumeric = hasNumeric ? String(numeric) : '';
    const trimmedRaw = String(lmsUserId).trim();

    const suffixes = new Set<string>();
    if (trimmedRaw) {
      suffixes.add(`-${trimmedRaw}`);
    }
    if (normalizedNumeric) {
      suffixes.add(`-${normalizedNumeric}`);
      suffixes.add(`-M${normalizedNumeric.padStart(5, '0')}`);
    }

    if (suffixes.size === 0) {
      return null;
    }

    const params: Record<string, string> = {};
    const predicates: string[] = [];
    let index = 0;
    for (const suffix of suffixes) {
      const key = `globalSuffix${index}`;
      predicates.push(`s.student_id LIKE :${key}`);
      params[key] = `%${suffix}`;
      index += 1;
    }
    const whereSuffix = `(${predicates.join(' OR ')})`;

    const activeMatches = await this.dataSource
      .getRepository(Student)
      .createQueryBuilder('s')
      .innerJoinAndSelect('s.class', 'c')
      .where('s.is_active = true')
      .andWhere(whereSuffix, params)
      .orderBy('s.updated_at', 'DESC')
      .addOrderBy('s.created_at', 'DESC')
      .getMany();

    const distinctActiveCodes = Array.from(
      new Set(activeMatches.map((s) => s.student_id).filter((v): v is string => !!v)),
    );

    if (distinctActiveCodes.length === 1) {
      const selected = activeMatches.find((s) => s.student_id === distinctActiveCodes[0]);
      if (selected?.student_id) {
        if (schoolIdForMapping && selected.class?.id) {
          try {
            const existingM = await this.studentMappingRepo.findOne({
              where: { lmsUserId, schoolId: schoolIdForMapping },
            });
            if (!existingM) {
              await this.studentMappingRepo.save({
                schoolId: schoolIdForMapping,
                classId: selected.class.id,
                lmsUserId,
                studentCode: selected.student_id,
              });
            }
          } catch {
            /* best-effort */
          }
        }
        this.logger.log(
          `[findStudentCodeByLmsUserIdGlobally] Matched unique active student by suffix: ${selected.student_id}`,
        );
        return selected.student_id;
      }
    }

    if (distinctActiveCodes.length > 1) {
      this.logger.warn(
        `[findStudentCodeByLmsUserIdGlobally] Ambiguous active matches for lmsUserId: ${lmsUserId}; candidates: ${distinctActiveCodes.join(', ')}`,
      );
      return null;
    }

    const allMatches = await this.dataSource
      .getRepository(Student)
      .createQueryBuilder('s')
      .innerJoinAndSelect('s.class', 'c')
      .where(whereSuffix, params)
      .orderBy('s.updated_at', 'DESC')
      .addOrderBy('s.created_at', 'DESC')
      .getMany();

    const distinctAllCodes = Array.from(
      new Set(allMatches.map((s) => s.student_id).filter((v): v is string => !!v)),
    );

    if (distinctAllCodes.length !== 1) {
      if (distinctAllCodes.length > 1) {
        this.logger.warn(
          `[findStudentCodeByLmsUserIdGlobally] Ambiguous inactive/global matches for lmsUserId: ${lmsUserId}; candidates: ${distinctAllCodes.join(', ')}`,
        );
      } else {
        this.logger.warn(
          `[findStudentCodeByLmsUserIdGlobally] No student found by global suffix for lmsUserId: ${lmsUserId}`,
        );
      }
      return null;
    }

    const selected = allMatches.find((s) => s.student_id === distinctAllCodes[0]);
    if (!selected?.student_id) {
      return null;
    }

    if (!selected.is_active) {
      selected.is_active = true;
      selected.deleted_at = null;
      selected.status = CommonStatus.ACTIVE;
      await this.dataSource.manager.save(Student, selected);
    }

    if (schoolIdForMapping && selected.class?.id) {
      try {
        const existingM = await this.studentMappingRepo.findOne({
          where: { lmsUserId, schoolId: schoolIdForMapping },
        });
        if (!existingM) {
          await this.studentMappingRepo.save({
            schoolId: schoolIdForMapping,
            classId: selected.class.id,
            lmsUserId,
            studentCode: selected.student_id,
          });
        }
      } catch {
        /* best-effort */
      }
    }
    this.logger.log(
      `[findStudentCodeByLmsUserIdGlobally] Matched unique student by global suffix: ${selected.student_id}`,
    );
    return selected.student_id;
  }

  async ensureMappedStudentAccount(
    lmsUserId: string,
    schoolId: string,
    options?: { createStudentIfMissing?: boolean },
  ): Promise<string | null> {
    const createStudentIfMissing = options?.createStudentIfMissing ?? true;

    let mapping = await this.studentMappingRepo.findOne({
      where: { lmsUserId, schoolId },
    });

    if (!mapping) {
      const educatorIds = (
        await this.dataSource.manager.find(Educator, {
          where: { school: { id: schoolId } },
          select: ['id'],
          relations: ['school'],
        })
      )
        .map((e) => e.id)
        .filter(Boolean);

      if (educatorIds.length > 0) {
        mapping = await this.studentMappingRepo
          .createQueryBuilder('m')
          .where('m.lms_user_id = :lmsUserId', { lmsUserId })
          .andWhere('m.school_id IN (:...educatorIds)', { educatorIds })
          .orderBy('m.updated_at', 'DESC')
          .getOne();

        if (mapping) {
          mapping.schoolId = schoolId;
          await this.studentMappingRepo.save(mapping);
        }
      }
    }

    if (!mapping) {
      return null;
    }

    const lmsIdNumericStr = String(Number(lmsUserId));
    const normalizeLegacyCode = (code: string | undefined): string | null => {
      if (!code) return null;
      const trimmed = code.trim();
      const mMatch = /^([A-Z0-9]{6,8})-M0*(\d+)$/i.exec(trimmed);
      if (mMatch) {
        return `${mMatch[1].toUpperCase()}-${String(Number(mMatch[2]))}`;
      }

      if (/^[A-Z0-9]{6,8}$/i.test(trimmed)) {
        return `${trimmed.toUpperCase()}-${lmsIdNumericStr}`;
      }

      return null;
    };

    const normalizedMappedCode = normalizeLegacyCode(mapping.studentCode);
    if (normalizedMappedCode && normalizedMappedCode !== mapping.studentCode) {
      const oldCode = mapping.studentCode;
      const existingNormalizedGlobal = await this.dataSource.manager.findOne(Student, {
        where: { student_id: normalizedMappedCode },
        relations: ['class', 'educator'],
      });

      if (existingNormalizedGlobal) {
        if (!existingNormalizedGlobal.is_active) {
          existingNormalizedGlobal.is_active = true;
          existingNormalizedGlobal.deleted_at = null;
          existingNormalizedGlobal.status = CommonStatus.ACTIVE;
          await this.dataSource.manager.save(Student, existingNormalizedGlobal);
        }
        mapping.studentCode = normalizedMappedCode;
        await this.studentMappingRepo.save(mapping);
        return normalizedMappedCode;
      }

      const legacyStudent = await this.dataSource.manager.findOne(Student, {
        where: { student_id: oldCode },
      });
      if (legacyStudent) {
        legacyStudent.student_id = normalizedMappedCode;
        await this.dataSource.manager.save(Student, legacyStudent);
      }

      mapping.studentCode = normalizedMappedCode;
      await this.studentMappingRepo.save(mapping);
    }

    const activeStudent = await this.dataSource.manager.findOne(Student, {
      where: {
        student_id: mapping.studentCode,
        is_active: true,
      },
    });
    if (activeStudent) {
      return mapping.studentCode;
    }

    const existingStudent = await this.dataSource.manager.findOne(Student, {
      where: { student_id: mapping.studentCode },
      relations: ['class', 'educator'],
    });

    if (existingStudent) {
      existingStudent.is_active = true;
      existingStudent.deleted_at = null;
      existingStudent.status = CommonStatus.ACTIVE;
      await this.dataSource.manager.save(Student, existingStudent);
      return mapping.studentCode;
    }

    const classStudents = await this.dataSource.manager.find(Student, {
      where: { class: { id: mapping.classId }, is_active: true },
    });

    const lmsIdNumeric = String(Number(lmsUserId));
    const suffixNew = `-${lmsIdNumeric}`;
    const suffixLegacy = `-M${String(Number(lmsUserId)).padStart(5, '0')}`;
    const bySuffix = classStudents.find(
      (s) =>
        (s.student_id ?? '').endsWith(suffixNew) || (s.student_id ?? '').endsWith(suffixLegacy),
    );

    if (bySuffix?.student_id) {
      mapping.studentCode = bySuffix.student_id;
      await this.studentMappingRepo.save(mapping);
      return bySuffix.student_id;
    }

    if (!createStudentIfMissing) {
      return null;
    }

    const classData = await this.dataSource.manager.findOne(Class, {
      where: { id: mapping.classId, is_active: true },
      relations: ['educator'],
    });

    if (!classData?.educator) {
      return mapping.studentCode;
    }

    const student = this.dataSource.manager.create(Student, {
      student_id: mapping.studentCode,
      student_name: undefined,
      email: undefined,
      status: CommonStatus.ACTIVE,
      is_active: true,
      class: classData,
      educator: classData.educator,
    });
    await this.dataSource.manager.save(Student, student);

    classData.total_no_of_students = (classData.total_no_of_students ?? 0) + 1;
    await this.dataSource.manager.save(Class, classData);

    return mapping.studentCode;
  }
}
