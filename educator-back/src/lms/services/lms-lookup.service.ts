import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { StudentProfileLookup } from '../interfaces/lms.interfaces';
import { LoggerService } from '../../common/services';
import { LmsConfigService } from './lms-config.service';
import { LmsConnectService } from './lms-connect.service';
import { LmsRosterService } from './lms-roster.service';

import { CommonStatus } from 'src/common/enums/status.enum';
import { redactCode, redactCodes } from 'src/common/utils/redact.util';
import { Class } from 'src/database/entities';
import {
  CLASS_REPOSITORY,
  EDUCATOR_REPOSITORY,
  LMS_CLASS_MAPPING_REPOSITORY,
  LMS_STUDENT_MAPPING_REPOSITORY,
  STUDENT_REPOSITORY,
} from 'src/database/tokens';
import {
  ClassRepository,
  EducatorRepository,
  LmsClassMappingRepository,
  LmsStudentMappingRepository,
  StudentRepository,
} from 'src/database/repositories';

export interface LmsClassStudentLookupResult {
  studentCode: string | null;
  classFound: boolean;
  classId?: string | null;
}

export interface StudentLaunchResolution {
  schoolId: string | null;
  studentCode: string | null;
  courseScopedClassFound: boolean;
  classId?: string | null;
}

@Injectable()
export class LmsLookupService {
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
    @Inject(LMS_STUDENT_MAPPING_REPOSITORY)
    private readonly studentMappingRepo: LmsStudentMappingRepository,
    @Inject(LMS_CLASS_MAPPING_REPOSITORY)
    private readonly classMappingRepo: LmsClassMappingRepository,
    @Inject(STUDENT_REPOSITORY)
    private readonly studentRepo: StudentRepository,
    @Inject(CLASS_REPOSITORY)
    private readonly classRepo: ClassRepository,
    @Inject(EDUCATOR_REPOSITORY)
    private readonly educatorRepo: EducatorRepository,
    private readonly configService: LmsConfigService,
    private readonly connectService: LmsConnectService,
    private readonly rosterService: LmsRosterService,
    private readonly logger: LoggerService,
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
            classId: lookup.classId ?? null,
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
          classId: null, // School-wide fallback doesn't have class context
        };
      }
    }

    return { schoolId: null, studentCode: null, courseScopedClassFound, classId: null };
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

    const config = await this.configService.getActiveBySchoolId(schoolId);
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

    const classes = await this.classRepo.findLmsLinkedActiveForSchool(schoolId);

    this.logger.debug(
      `[findStudentByConstructedCode] Checking ${classes.length} LMS-linked classes for lmsUserId: ${lmsUserId}`,
    );

    for (const cls of classes) {
      const prefix = (cls.lms_class_id ?? '').trim();
      if (!prefix) continue;

      const candidateCode = `${prefix}-${lmsIdNumeric}`;
      const student = await this.studentRepo.findOne({
        where: { student_id: candidateCode, is_active: true },
      });

      if (student?.student_id) {
        this.logger.log(
          `[findStudentByConstructedCode] Matched student code: ${redactCode(student.student_id)} (class: ${cls.id})`,
        );

        try {
          const existingMapping = await this.studentMappingRepo.findOne({
            where: { lmsUserId, schoolId },
          });
          if (!existingMapping) {
            await this.studentMappingRepo.create({
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

    const classMapping = await this.classMappingRepo.findOne({
      where: {
        lmsCourseId: String(lmsCourseId),
        schoolId,
      },
    });

    if (classMapping?.classId) {
      const mappedClass = await this.classRepo.findOne({
        where: {
          id: classMapping.classId,
          is_active: true,
        },
      });
      if (mappedClass) {
        return mappedClass;
      }
    }

    return this.classRepo.findActiveByLmsCourseReferenceForSchool(String(lmsCourseId), schoolId);
  }

  /**
   * Resolve RW class for Deep Linking by LMS course id.
   * Prefers the session school, then falls back across schools on the same issuer.
   */
  async resolveClassForDeepLinking(args: {
    lmsCourseIds: string[];
    issuer: string;
    preferredSchoolId?: string;
  }): Promise<{ rwClass: Class; schoolId: string } | null> {
    const courseIds = [...new Set(args.lmsCourseIds.map((id) => String(id).trim()).filter(Boolean))];
    if (courseIds.length === 0) {
      return null;
    }

    if (args.preferredSchoolId) {
      for (const courseId of courseIds) {
        const rwClass = await this.findActiveClassByLmsCourseId(courseId, args.preferredSchoolId);
        if (rwClass) {
          return { rwClass, schoolId: args.preferredSchoolId };
        }
      }
    }

    const issuerSchoolIds = new Set(
      (await this.configService.listEducatorConfigsByIssuer(args.issuer))
        .map((config) => config.schoolId?.trim())
        .filter((schoolId): schoolId is string => Boolean(schoolId)),
    );

    for (const courseId of courseIds) {
      const mappings = await this.classMappingRepo.findByLmsCourseId(courseId);
      for (const mapping of mappings) {
        if (!issuerSchoolIds.has(mapping.schoolId)) {
          continue;
        }
        const rwClass = await this.classRepo.findOne({
          where: { id: mapping.classId, is_active: true },
        });
        if (rwClass) {
          this.logger.log(
            `[resolveClassForDeepLinking] Matched courseId=${courseId} to classId=${rwClass.id} schoolId=${mapping.schoolId}`,
          );
          return { rwClass, schoolId: mapping.schoolId };
        }
      }

      for (const schoolId of issuerSchoolIds) {
        const rwClass = await this.classRepo.findActiveByLmsCourseReferenceForSchool(
          courseId,
          schoolId,
        );
        if (rwClass) {
          this.logger.log(
            `[resolveClassForDeepLinking] Matched courseId=${courseId} via lms_class_reference classId=${rwClass.id} schoolId=${schoolId}`,
          );
          return { rwClass, schoolId };
        }
      }
    }

    return null;
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
      const classMapping = await this.classMappingRepo.findOne({
        where: {
          lmsCourseId: String(lmsCourseId),
          schoolId,
        },
      });

      let classData: Class | null = null;
      let classResolvedViaMapping = false;

      if (classMapping?.classId) {
        classData = await this.classRepo.findOne({
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
        classData = await this.classRepo.findActiveByLmsCourseReferenceForSchool(
          String(lmsCourseId),
          schoolId,
        );
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

      const mapping = await this.studentMappingRepo.findOne({
        where: {
          classId: classData.id,
          lmsUserId: String(lmsUserId),
        },
      });

      if (mapping?.studentCode) {
        this.logger.log(
          `[findStudentCodeByLmsClassAndUserId] Found mapping: ${redactCode(mapping.studentCode)}`,
        );
        return {
          studentCode: mapping.studentCode,
          classFound: true,
          classId: classData.id,
        };
      }

      const numericUserId = /^\d+$/.test(String(lmsUserId))
        ? String(Number(lmsUserId))
        : String(lmsUserId);
      const suffix = `-${numericUserId}`;

      const activeStudents = await this.studentRepo.find({
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
          `[findStudentCodeByLmsClassAndUserId] Found active student by suffix match: ${redactCode(activeMatch.student_id)}`,
        );
        return {
          studentCode: activeMatch.student_id,
          classFound: true,
          classId: classData.id,
        };
      }

      const inactiveStudents = await this.studentRepo.find({
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
        await this.studentRepo.create(inactiveMatch);
        this.logger.log(
          `[findStudentCodeByLmsClassAndUserId] Reactivated inactive student by suffix match: ${redactCode(inactiveMatch.student_id)}`,
        );
        return {
          studentCode: inactiveMatch.student_id,
          classFound: true,
          classId: classData.id,
        };
      }

      this.logger.warn(
        `[findStudentCodeByLmsClassAndUserId] No student found for lmsUserId: ${lmsUserId} in class: ${classData.id}`,
      );

      return {
        studentCode: null,
        classFound: true,
        classId: classData.id,
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

    const suffixList = Array.from(suffixes);

    const activeMatch = await this.studentRepo.findActiveBySuffixInSchool(schoolId, suffixList);

    if (activeMatch?.student_id) {
      try {
        const existingM = await this.studentMappingRepo.findOne({ where: { lmsUserId, schoolId } });
        if (!existingM && activeMatch.class?.id) {
          await this.studentMappingRepo.create({
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
        `[findStudentCodeByLmsUserIdInSchool] Matched active student by suffix: ${redactCode(activeMatch.student_id)} (school: ${schoolId})`,
      );
      return activeMatch.student_id;
    }

    const inactiveMatch = await this.studentRepo.findBySuffixInSchool(schoolId, suffixList);

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
      await this.studentRepo.create(inactiveMatch);
    }

    try {
      const existingM = await this.studentMappingRepo.findOne({ where: { lmsUserId, schoolId } });
      if (!existingM && inactiveMatch.class?.id) {
        await this.studentMappingRepo.create({
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
      `[findStudentCodeByLmsUserIdInSchool] Matched inactive student by suffix and reactivated: ${redactCode(inactiveMatch.student_id)} (school: ${schoolId})`,
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

    const suffixList = Array.from(suffixes);

    const activeMatches = await this.studentRepo.findActiveBySuffixGlobal(suffixList);

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
              await this.studentMappingRepo.create({
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
          `[findStudentCodeByLmsUserIdGlobally] Matched unique active student by suffix: ${redactCode(selected.student_id)}`,
        );
        return selected.student_id;
      }
    }

    if (distinctActiveCodes.length > 1) {
      this.logger.warn(
        `[findStudentCodeByLmsUserIdGlobally] Ambiguous active matches for lmsUserId: ${lmsUserId}; candidates: ${redactCodes(distinctActiveCodes)}`,
      );
      return null;
    }

    const allMatches = await this.studentRepo.findBySuffixGlobal(suffixList);

    const distinctAllCodes = Array.from(
      new Set(allMatches.map((s) => s.student_id).filter((v): v is string => !!v)),
    );

    if (distinctAllCodes.length !== 1) {
      if (distinctAllCodes.length > 1) {
        this.logger.warn(
          `[findStudentCodeByLmsUserIdGlobally] Ambiguous inactive/global matches for lmsUserId: ${lmsUserId}; candidates: ${redactCodes(distinctAllCodes)}`,
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
      await this.studentRepo.create(selected);
    }

    if (schoolIdForMapping && selected.class?.id) {
      try {
        const existingM = await this.studentMappingRepo.findOne({
          where: { lmsUserId, schoolId: schoolIdForMapping },
        });
        if (!existingM) {
          await this.studentMappingRepo.create({
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
      `[findStudentCodeByLmsUserIdGlobally] Matched unique student by global suffix: ${redactCode(selected.student_id)}`,
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
        await this.educatorRepo.find({
          where: { school: { id: schoolId } },
          select: ['id'],
          relations: ['school'],
        })
      )
        .map((e) => e.id)
        .filter(Boolean);

      if (educatorIds.length > 0) {
        mapping = await this.studentMappingRepo.findLatestByLmsUserIdAndSchoolIds(
          lmsUserId,
          educatorIds,
        );

        if (mapping) {
          mapping.schoolId = schoolId;
          await this.studentMappingRepo.create(mapping);
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
      const existingNormalizedGlobal = await this.studentRepo.findOne({
        where: { student_id: normalizedMappedCode },
        relations: ['class', 'educator'],
      });

      if (existingNormalizedGlobal) {
        if (!existingNormalizedGlobal.is_active) {
          existingNormalizedGlobal.is_active = true;
          existingNormalizedGlobal.deleted_at = null;
          existingNormalizedGlobal.status = CommonStatus.ACTIVE;
          await this.studentRepo.create(existingNormalizedGlobal);
        }
        mapping.studentCode = normalizedMappedCode;
        await this.studentMappingRepo.create(mapping);
        return normalizedMappedCode;
      }

      const legacyStudent = await this.studentRepo.findOne({
        where: { student_id: oldCode },
      });
      if (legacyStudent) {
        legacyStudent.student_id = normalizedMappedCode;
        await this.studentRepo.create(legacyStudent);
      }

      mapping.studentCode = normalizedMappedCode;
      await this.studentMappingRepo.create(mapping);
    }

    const activeStudent = await this.studentRepo.findOne({
      where: {
        student_id: mapping.studentCode,
        is_active: true,
      },
    });
    if (activeStudent) {
      return mapping.studentCode;
    }

    const existingStudent = await this.studentRepo.findOne({
      where: { student_id: mapping.studentCode },
      relations: ['class', 'educator'],
    });

    if (existingStudent) {
      existingStudent.is_active = true;
      existingStudent.deleted_at = null;
      existingStudent.status = CommonStatus.ACTIVE;
      await this.studentRepo.create(existingStudent);
      return mapping.studentCode;
    }

    const classStudents = await this.studentRepo.find({
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
      await this.studentMappingRepo.create(mapping);
      return bySuffix.student_id;
    }

    if (!createStudentIfMissing) {
      return null;
    }

    const classData = await this.classRepo.findOne({
      where: { id: mapping.classId, is_active: true },
      relations: ['educator'],
    });

    if (!classData?.educator) {
      return mapping.studentCode;
    }

    await this.studentRepo.create({
      student_id: mapping.studentCode,
      student_name: undefined,
      email: undefined,
      status: CommonStatus.ACTIVE,
      is_active: true,
      class: classData,
      educator: classData.educator,
    });

    classData.total_no_of_students = (classData.total_no_of_students ?? 0) + 1;
    await this.classRepo.create(classData);

    return mapping.studentCode;
  }
}
