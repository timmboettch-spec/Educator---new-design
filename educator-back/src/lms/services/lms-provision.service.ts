import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager } from 'typeorm';
import { LmsType } from 'src/common/enums/lms.enum';
import { MoodleAdapter } from '../adapters/moodle.adapter';
import { LmsAdapterFactory } from '../factories/lms-adapter.factory';
import { LmsClassMapping } from '../entity/lms-class-mapping.entity';
import { LmsSchoolConfig } from '../entity/lms-school-config.entity';
import { LmsStudentMapping } from '../entity/lms-student-mapping.entity';
import { Class } from 'src/class/entity/class.entity';
import { ClassEducator } from 'src/class/entity/class-educator.entity';
import { Educator } from 'src/educators/entity/educator.entity';
import { educatorBelongsToSchool } from 'src/educators/utils/educator-school.util';
import { Student } from 'src/students/entity/students.entity';
import { CommonStatus } from 'src/common/enums/status.enum';
import { LmsConfigStatus } from 'src/common/enums/lms.enum';
import { LmsRosterService } from './lms-roster.service';
import { resolveMoodleWsCredentials, mergeMoodleWsConfigFields } from '../utils/moodle-ws.util';

function normalizedUserIdSuffix(lmsUserId: string): string {
  const trimmed = String(lmsUserId ?? '').trim();
  if (/^\d+$/.test(trimmed)) {
    return String(Number(trimmed));
  }
  return trimmed;
}

function toLegacyMCode(classPrefix: string, lmsUserId: string): string {
  return `${classPrefix}-M${String(Number(lmsUserId)).padStart(5, '0')}`;
}

function generateStudentCode(classPrefix: string, lmsUserId: string): string {
  return `${classPrefix}-${normalizedUserIdSuffix(lmsUserId)}`;
}

function normalizeLmsUserIdKey(value: string): string {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    return '';
  }
  const urnMatch = trimmed.match(/\/user\/(\d+)\/?$/i);
  if (urnMatch) {
    return String(Number(urnMatch[1]));
  }
  return normalizedUserIdSuffix(trimmed);
}

interface ProvisionLearner {
  lmsUserId: string;
  fullname: string;
  email: string | null;
}

function randomClassCode(length = 8): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

@Injectable()
export class LmsProvisionService {
  private readonly logger = new Logger(LmsProvisionService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly rosterService: LmsRosterService,
    private readonly configService: ConfigService,
    private readonly lmsAdapterFactory: LmsAdapterFactory,
  ) {}

  /**
   * Check if a specific user is listed as an instructor in the course roster.
   * Used during LTI launch to verify educator has course instructor role.
   */
  async isUserInstructorInRoster(args: {
    nrpsUrl: string;
    lmsUserId: string;
    schoolId: string;
    lmsCourseId?: string;
  }): Promise<{ isInstructor: boolean; error: string | null }> {
    const { nrpsUrl, lmsUserId, schoolId, lmsCourseId } = args;

    if (!lmsUserId?.trim()) {
      return { isInstructor: false, error: 'Missing LMS user ID' };
    }

    const schoolConfig = await this.dataSource.manager.findOne(LmsSchoolConfig, {
      where: { schoolId, status: LmsConfigStatus.ACTIVE },
    });

    if (!schoolConfig) {
      return { isInstructor: false, error: 'No active LMS config for school' };
    }

    try {
      const roster = await this.rosterService.fetchRosterWithWsFallback(schoolConfig, nrpsUrl);

      const userMembership = roster.members.find(
        (m) => String(m.userId ?? '') === String(lmsUserId),
      );

      if (!userMembership) {
        this.logger.warn(
          `[LMS Provision] User ${lmsUserId} not found in roster for course ${lmsCourseId}`,
        );
        return { isInstructor: false, error: 'User not found in course roster' };
      }

      const isInstructor = this.isInstructorOrAdminRole(userMembership.roles);
      return { isInstructor, error: null };
    } catch (err) {
      this.logger.error(
        `[LMS Provision] Failed to check instructor status for user=${lmsUserId} course=${lmsCourseId}: ${(err as Error).message}`,
      );
      return { isInstructor: false, error: (err as Error).message };
    }
  }

  provisionFromLtiLogin(
    educatorId: string,
    lmsCourseId: string,
    launchSchoolId?: string,
    nrpsUrl?: string,
    launchIssuer?: string,
    launchUserId?: string,
  ): void {
    setImmediate(() => {
      void this.doProvision(
        educatorId,
        lmsCourseId,
        launchSchoolId,
        nrpsUrl,
        launchIssuer,
        launchUserId,
      ).catch((err: Error) => {
        this.logger.error(
          `[LMS Provision] FAILED educator=${educatorId} course=${lmsCourseId}: ${err.message}`,
          err.stack,
        );
      });
    });
  }

  async provisionFromLiveClasses(
    educatorId: string,
    lmsCourseId: string,
    launchSchoolId?: string,
    nrpsUrl?: string,
    launchIssuer?: string,
    launchUserId?: string,
  ): Promise<void> {
    await this.doProvision(
      educatorId,
      lmsCourseId,
      launchSchoolId,
      nrpsUrl,
      launchIssuer,
      launchUserId,
    );
  }

  private resolveProvisionSchoolId(educator: Educator, launchSchoolId?: string): string | null {
    const fromLaunch = launchSchoolId?.trim();
    if (fromLaunch) {
      if (!educatorBelongsToSchool(educator, fromLaunch)) {
        this.logger.warn(
          `[LMS Provision] Educator ${educator.id} is not assigned to school ${fromLaunch}`,
        );
        return null;
      }
      return fromLaunch;
    }
    return educator.school?.id ?? null;
  }

  private async doProvision(
    educatorId: string,
    lmsCourseId: string,
    launchSchoolId?: string,
    nrpsUrl?: string,
    launchIssuer?: string,
    launchUserId?: string,
  ): Promise<void> {
    if (!lmsCourseId) {
      return;
    }
    const { educator, classData, classMapping } = await this.dataSource.transaction(
      async (manager) => {
        const educator = await manager.findOne(Educator, {
          where: { id: educatorId },
          relations: ['school', 'schoolAssignments', 'schoolAssignments.school'],
        });
        if (!educator) {
          return { educator: null, classData: null, classMapping: null };
        }
        const schoolId = this.resolveProvisionSchoolId(educator, launchSchoolId);
        if (!schoolId) {
          if (launchSchoolId?.trim()) {
            throw new ForbiddenException('Educator is not assigned to the requested school');
          }
          return { educator: null, classData: null, classMapping: null };
        }

        await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
          `lms-provision:${schoolId}:${lmsCourseId}`,
        ]);

        const classMapping = await manager.findOne(LmsClassMapping, {
          where: { lmsCourseId: lmsCourseId, schoolId },
        });

        let classData: Class | null = null;

        if (!classMapping) {
          this.logger.warn(
            `[LMS Provision] No class mapping found for LMS course ${lmsCourseId}. Skipping provisioning.`,
          );

          return {
            educator: null,
            classData: null,
            classMapping: null,
          };
        }

        const existing = await manager.findOne(Class, {
          where: { id: classMapping.classId },
          relations: ['educator'],
        });

        if (!existing) {
          this.logger.warn(
            `[LMS Provision] Mapping exists but class ${classMapping.classId} was not found. Skipping provisioning.`,
          );

          return {
            educator: null,
            classData: null,
            classMapping: null,
          };
        }

        if (!existing.is_active || existing.deleted_at) {
          this.logger.warn(
            `[LMS Provision] Class ${existing.id} is deleted/inactive for LMS course ${lmsCourseId}. Skipping roster sync until class is recreated.`,
          );
          return {
            educator: null,
            classData: null,
            classMapping: null,
          };
        }

        classData = existing;

        if (nrpsUrl && classMapping.nrpsUrl !== nrpsUrl) {
          classMapping.nrpsUrl = nrpsUrl;
          await manager.save(classMapping);
        }

        // Add educator to class_educators junction if not already present
        // This allows co-instructors to access the same class
        const classEducatorExists = await manager.findOne(ClassEducator, {
          where: { classId: existing.id, educatorId },
        });

        if (!classEducatorExists) {
          await manager.save(ClassEducator, {
            classId: existing.id,
            educatorId,
            isPrimary: existing.educator_id === educatorId,
          });
          this.logger.log(
            `[LMS Provision] Added educator=${educatorId} to class=${existing.id} as co-instructor`,
          );
        }

        return { educator, classData, classMapping };
      },
    );

    if (!educator || !classData) return;
    const schoolId = this.resolveProvisionSchoolId(educator, launchSchoolId);
    if (!schoolId) {
      return;
    }

    const resolvedNrpsUrl = nrpsUrl || classMapping?.nrpsUrl || '';
    // Get school config to check sharePii setting
    let schoolConfig: LmsSchoolConfig | null = null;
    if (schoolId) {
      schoolConfig = await this.dataSource.manager.findOne(LmsSchoolConfig, {
        where: { schoolId, status: LmsConfigStatus.ACTIVE },
      });
    }
    const sharePii = schoolConfig?.sharePii ?? false;

    const rosterResult = await this.fetchRosterStudents({
      nrpsUrl: resolvedNrpsUrl,
      lmsCourseId,
      classMapping,
      schoolId,
      launchIssuer,
      launchUserId,
    });

    if (!rosterResult.success) {
      this.logger.warn(
        `[LMS Provision] Roster fetch failed for course=${lmsCourseId}. Provisioning skipped.`,
      );
      return;
    }

    const lmsStudents = rosterResult.learners;

    this.logger.log(
      `[LMS Provision] course=${lmsCourseId} class=${classData.id} fetchedStudents=${lmsStudents.length} sharePii=${sharePii}`,
    );

    const classPrefix = classData.lms_class_id ?? randomClassCode();
    if (!classData.lms_class_id) {
      classData.lms_class_id = classPrefix;
      await this.dataSource.manager.save(Class, classData);
    }

    let newStudentCount = 0;
    let reactivatedCount = 0;
    let deactivatedCount = 0;

    await this.dataSource.transaction(async (manager) => {
      deactivatedCount = await this.deactivateNonLearners(manager, classData.id!, lmsStudents);

      for (const u of lmsStudents) {
        if (!u.lmsUserId) continue;

        const normalizedCode = generateStudentCode(classPrefix, u.lmsUserId);
        const legacyCode = toLegacyMCode(classPrefix, u.lmsUserId);

        const existingMapping = await manager.findOne(LmsStudentMapping, {
          where: { classId: classData.id!, lmsUserId: u.lmsUserId },
        });
        if (existingMapping) {
          if (existingMapping.studentCode !== normalizedCode) {
            const oldCode = existingMapping.studentCode;
            const oldLegacyCode = legacyCode;

            const studentToUpdate = await manager.findOne(Student, {
              where: [
                { student_id: oldCode, class: { id: classData.id! } },
                { student_id: oldLegacyCode, class: { id: classData.id! } },
              ],
            });

            if (studentToUpdate) {
              studentToUpdate.student_id = normalizedCode;
              await manager.save(Student, studentToUpdate);
            }

            existingMapping.studentCode = normalizedCode;
            await manager.save(LmsStudentMapping, existingMapping);
          }

          const mappedStudent = await manager.findOne(Student, {
            where: [
              { student_id: normalizedCode, class: { id: classData.id! } },
              { student_id: legacyCode, class: { id: classData.id! } },
            ],
          });

          if (!mappedStudent) {
            const student = manager.create(Student, {
              student_id: normalizedCode,
              student_name: sharePii ? u.fullname || undefined : undefined,
              email: sharePii ? (u.email ?? undefined) : undefined,
              status: CommonStatus.ACTIVE,
              class: classData,
              educator,
            });
            await manager.save(Student, student);
            newStudentCount++;
          } else if (!mappedStudent.is_active) {
            mappedStudent.is_active = true;
            mappedStudent.deleted_at = null;
            mappedStudent.status = CommonStatus.ACTIVE;
            if (mappedStudent.student_id !== normalizedCode) {
              mappedStudent.student_id = normalizedCode;
            }
            await manager.save(Student, mappedStudent);
            reactivatedCount += 1;
          }
          continue;
        }

        const studentCode = normalizedCode;

        const student = manager.create(Student, {
          student_id: studentCode,
          student_name: sharePii ? u.fullname || undefined : undefined,
          email: sharePii ? (u.email ?? undefined) : undefined,
          status: CommonStatus.ACTIVE,
          class: classData,
          educator,
        });
        await manager.save(Student, student);

        await manager.save(
          manager.create(LmsStudentMapping, {
            schoolId,
            classId: classData.id!,
            lmsUserId: u.lmsUserId,
            studentCode,
          }),
        );

        newStudentCount++;
      }

      if (newStudentCount > 0) {
        classData.total_no_of_students = (classData.total_no_of_students ?? 0) + newStudentCount;
        await manager.save(Class, classData);
      }
    });

    if (deactivatedCount > 0 || reactivatedCount > 0 || newStudentCount > 0) {
      this.logger.log(
        `[LMS Provision] course=${lmsCourseId} class=${classData.id} deactivated=${deactivatedCount} reactivated=${reactivatedCount} added=${newStudentCount}`,
      );
    }
  }

  private buildLiveLearnerIdSet(learners: ProvisionLearner[]): Set<string> {
    const ids = new Set<string>();
    for (const learner of learners) {
      const raw = String(learner.lmsUserId ?? '').trim();
      if (raw) {
        ids.add(raw);
      }
      const normalized = normalizeLmsUserIdKey(raw);
      if (normalized) {
        ids.add(normalized);
      }
    }
    return ids;
  }

  private isLiveLearner(lmsUserId: string, liveLearnerIds: Set<string>): boolean {
    const raw = String(lmsUserId ?? '').trim();
    if (!raw) {
      return false;
    }
    const normalized = normalizeLmsUserIdKey(raw);
    return liveLearnerIds.has(raw) || (!!normalized && liveLearnerIds.has(normalized));
  }

  private async deactivateNonLearners(
    manager: EntityManager,
    classId: string,
    liveLearners: ProvisionLearner[],
  ): Promise<number> {
    const liveLearnerIds = this.buildLiveLearnerIdSet(liveLearners);
    const mappings = await manager.find(LmsStudentMapping, {
      where: { classId },
    });

    let deactivatedCount = 0;
    for (const mapping of mappings) {
      const rawLmsUserId = String(mapping.lmsUserId ?? '').trim();
      if (!rawLmsUserId || this.isLiveLearner(rawLmsUserId, liveLearnerIds)) {
        continue;
      }

      const studentCode = String(mapping.studentCode ?? '').trim();
      if (!studentCode) {
        continue;
      }

      const student = await manager.findOne(Student, {
        where: { student_id: studentCode, class: { id: classId }, is_active: true },
      });
      if (!student) {
        continue;
      }

      student.is_active = false;
      student.deleted_at = new Date();
      student.status = CommonStatus.INACTIVE;
      await manager.save(Student, student);
      deactivatedCount += 1;
    }

    return deactivatedCount;
  }

  private async fetchRosterStudents(args: {
    nrpsUrl: string;
    lmsCourseId: string;
    classMapping?: LmsClassMapping;
    schoolId?: string;
    launchIssuer?: string;
    launchUserId?: string;
  }): Promise<{ learners: ProvisionLearner[]; success: boolean }> {
    const { nrpsUrl, lmsCourseId, classMapping, schoolId, launchUserId } = args;

    let schoolConfig: LmsSchoolConfig | null = null;
    if (schoolId?.trim()) {
      schoolConfig = await this.dataSource.manager.findOne(LmsSchoolConfig, {
        where: { schoolId: schoolId.trim(), status: LmsConfigStatus.ACTIVE },
      });
    }

    const credentials = resolveMoodleWsCredentials(
      mergeMoodleWsConfigFields(classMapping, schoolConfig),
      this.configService.get<string>('MOODLE_URL', ''),
      this.configService.get<string>('MOODLE_WS_TOKEN', ''),
    );

    this.logger.debug(
      `[LMS Provision] fetchRosterStudents course=${lmsCourseId} schoolId=${schoolId} hasNrpsUrl=${!!nrpsUrl} hasSchoolConfig=${!!schoolConfig} hasWsCredentials=${!!credentials}`,
    );

    if (nrpsUrl?.trim() && schoolConfig) {
      try {
        const roster = await this.rosterService.fetchRosterWithWsFallback(schoolConfig, nrpsUrl);
        let students = roster.members
          .filter((m) => this.isLearner(m.roles))
          .map((m) => ({
            lmsUserId: String(m.userId ?? ''),
            fullname: String(m.name ?? ''),
            email: m.email ?? null,
          }))
          .filter((m) => !!m.lmsUserId);

        if (!students.length && roster.members.length) {
          const inferred = roster.members
            .filter((m) => !this.isInstructorOrAdminRole(m.roles))
            .map((m) => ({
              lmsUserId: String(m.userId ?? ''),
              fullname: String(m.name ?? ''),
              email: m.email ?? null,
            }))
            .filter((m) => !!m.lmsUserId);

          if (inferred.length) {
            students = inferred;
          }
        }

        students = students.filter((m) => m.lmsUserId !== launchUserId);

        this.logger.log(
          `[LMS Provision] Roster fetched via NRPS/WS: ${students.length} learner(s)`,
        );
        return { learners: students, success: true };
      } catch (err) {
        this.logger.warn(
          `[LMS Provision] NRPS/WS fetch failed: ${(err as Error).message}. Falling back to Moodle Web Services.`,
        );
      }
    }

    if (!credentials) {
      this.logger.warn(
        `[LMS Provision] Cannot fetch roster via WS: missing lmsBaseUrl or lmsApiToken for course=${lmsCourseId}. Set lms_base_url and lms_api_token in lms_school_config for school ${schoolId}.`,
      );
      return { learners: [], success: false };
    }

    try {
      const wsRoster = await this.getMoodleAdapter().getEnrolledStudents(
        credentials.moodleUrl,
        credentials.wsToken,
        Number(lmsCourseId),
      );

      const students = wsRoster.students
        .map((u) => ({
          lmsUserId: String(u.id),
          fullname: u.fullname || '',
          email: u.email || null,
        }))
        .filter((u) => !!u.lmsUserId && u.lmsUserId !== launchUserId);

      if (students.length) {
        this.logger.log(
          `[LMS Provision] Roster fetched via Moodle WS: ${students.length} students for course=${lmsCourseId}`,
        );
      } else {
        this.logger.warn(
          `[LMS Provision] Moodle WS returned 0 student/learner matches for course=${lmsCourseId}`,
        );
      }

      return { learners: students, success: true };
    } catch (err) {
      this.logger.error(
        `[LMS Provision] Moodle WS fetch exception for course=${lmsCourseId}: ${(err as Error).message}`,
      );
      return { learners: [], success: false };
    }
  }

  private getMoodleAdapter(): MoodleAdapter {
    return this.lmsAdapterFactory.getAdapter(LmsType.MOODLE) as MoodleAdapter;
  }

  private isInstructorOrAdminRole(roles: string[]): boolean {
    const normalizedRoles = roles.map((role) => role.toLowerCase());
    return normalizedRoles.some(
      (role) =>
        role.includes('instructor') ||
        role.includes('teacher') ||
        role.includes('administrator') ||
        role.includes('admin') ||
        role.includes('faculty') ||
        role.includes('manager'),
    );
  }

  private isLearner(roles: string[]): boolean {
    const normalizedRoles = roles.map((role) => role.toLowerCase());

    const hasLearnerOrStudent = normalizedRoles.some(
      (role) =>
        role.includes('learner') ||
        role.includes('student') ||
        role.endsWith('#student') ||
        role.endsWith('/student') ||
        role === 'student',
    );

    const hasInstructorOrAdmin = normalizedRoles.some(
      (role) =>
        role.includes('instructor') || role.includes('administrator') || role.includes('admin'),
    );

    return hasLearnerOrStudent && !hasInstructorOrAdmin;
  }

  async getMappedClasses(educatorId: string): Promise<{
    classes: Array<{
      classId: string;
      className: string;
      term: string | null;
      year: string | null;
      startDate: string | null;
      endDate: string | null;
      status: string;
      lmsCourseId: string;
      nrpsUrl: string | null;
      students: Array<{
        id: string;
        studentCode: string;
        lmsUserId: string | null;
        studentName: string | null;
        email: string | null;
        status: string;
        is_active: boolean;
      }>;
    }>;
    total: number;
  }> {
    const rows = await this.dataSource
      .createQueryBuilder()
      .select([
        'c.id AS class_id',
        'c.lms_class_id AS lms_class_id',
        'c.class_name AS class_name',
        'c.term AS term',
        'c.year AS year',
        'c.start_date AS start_date',
        'c.end_date AS end_date',
        'c.status AS status',
        'm.lms_course_id AS lms_course_id',
        'm.school_id AS school_id',
        'm.nrps_url AS nrps_url',
      ])
      .from('classes', 'c')
      .innerJoin('lms_class_mapping', 'm', 'm.class_id = c.id')
      .where('c.educator_id = :educatorId', { educatorId })
      .andWhere('c.is_active = true')
      .getRawMany<{
        class_id: string;
        lms_class_id: string | null;
        class_name: string;
        term: string | null;
        year: string | null;
        start_date: string | null;
        end_date: string | null;
        status: string;
        lms_course_id: string;
        school_id: string;
        nrps_url: string;
      }>();

    const studentRepo = this.dataSource.getRepository(Student);

    const classes = await Promise.all(
      rows.map(async (row) => {
        const students = await studentRepo.find({
          where: { class: { id: row.class_id } },
        });

        const mappings = await this.dataSource.getRepository(LmsStudentMapping).find({
          where: { classId: row.class_id },
        });
        const lmsUserIdByStudentCode = new Map<string, string>();
        const classPrefix = String(row.lms_class_id ?? '').trim();
        for (const mapping of mappings) {
          const rawLmsUserId = String(mapping.lmsUserId ?? '').trim();
          if (!rawLmsUserId) continue;

          const normalizedLmsUserId = normalizeLmsUserIdKey(rawLmsUserId);
          const normalizedCode = String(mapping.studentCode ?? '').trim();
          if (normalizedCode) {
            lmsUserIdByStudentCode.set(normalizedCode, rawLmsUserId);
          }

          if (classPrefix) {
            const expectedNormalizedCode = generateStudentCode(classPrefix, rawLmsUserId);
            const expectedLegacyCode = toLegacyMCode(classPrefix, rawLmsUserId);
            lmsUserIdByStudentCode.set(expectedNormalizedCode, rawLmsUserId);
            lmsUserIdByStudentCode.set(expectedLegacyCode, rawLmsUserId);
          }

          if (normalizedLmsUserId && normalizedLmsUserId !== rawLmsUserId && classPrefix) {
            lmsUserIdByStudentCode.set(
              generateStudentCode(classPrefix, normalizedLmsUserId),
              rawLmsUserId,
            );
            lmsUserIdByStudentCode.set(
              toLegacyMCode(classPrefix, normalizedLmsUserId),
              rawLmsUserId,
            );
          }
        }

        const rosterByUserId = new Map<string, { name: string | null; email: string | null }>();
        if (row.school_id && row.nrps_url) {
          const config = await this.dataSource.manager.findOne(LmsSchoolConfig, {
            where: { schoolId: row.school_id, status: LmsConfigStatus.ACTIVE },
          });

          if (config) {
            try {
              const roster = await this.rosterService.fetchRoster(config, row.nrps_url);
              for (const member of roster.members) {
                const rawUserId = String(member.userId ?? '').trim();
                const normalizedUserId = normalizeLmsUserIdKey(rawUserId);
                const profile = {
                  name: member.name ?? null,
                  email: member.email ?? null,
                };
                if (rawUserId) {
                  rosterByUserId.set(rawUserId, profile);
                }
                if (normalizedUserId) {
                  rosterByUserId.set(normalizedUserId, profile);
                }
              }
            } catch {
              const credentials = resolveMoodleWsCredentials(config);
              if (credentials) {
                try {
                  const wsProfiles = await this.getMoodleAdapter().fetchMemberProfilesFromWs(
                    credentials,
                    row.lms_course_id,
                  );
                  for (const [userId, profile] of wsProfiles.entries()) {
                    rosterByUserId.set(userId, profile);
                  }
                } catch {
                  // Fall back to null display values when both roster and WS fail
                }
              }
            }
          }
        }

        return {
          classId: row.class_id,
          className: row.class_name,
          term: row.term,
          year: row.year,
          startDate: row.start_date,
          endDate: row.end_date,
          status: row.status,
          lmsCourseId: row.lms_course_id,
          nrpsUrl: row.nrps_url,
          students: students.map((s) => {
            const code = s.student_id ?? '';
            const lmsUserId = lmsUserIdByStudentCode.get(code) ?? null;
            const rosterEntry = lmsUserId
              ? (rosterByUserId.get(lmsUserId) ??
                rosterByUserId.get(normalizeLmsUserIdKey(lmsUserId)) ??
                null)
              : null;
            return {
              id: s.id ?? '',
              studentCode: code,
              lmsUserId: lmsUserId ?? null,
              studentName: rosterEntry?.name ?? null,
              email: rosterEntry?.email ?? null,
              status: s.status ?? 'ACTIVE',
              is_active: s.is_active ?? true,
            };
          }),
        };
      }),
    );

    return { classes, total: classes.length };
  }

  private async createClass(
    manager: EntityManager,
    educator: Educator,
    courseTitle: string,
  ): Promise<Class> {
    const now = new Date();
    const startDate = now.toISOString().split('T')[0];
    const endDate = `${now.getFullYear()}-12-31`;
    const classData = manager.create(Class, {
      class_name: courseTitle || 'LMS Class',
      term: String(now.getFullYear()),
      year: String(now.getFullYear()),
      status: CommonStatus.ACTIVE,
      total_no_of_students: 0,
      educator,
      start_date: startDate,
      end_date: endDate,
      is_active: true,
    });
    const saved = await manager.save(Class, classData);
    if (!saved.lms_class_id) {
      saved.lms_class_id = randomClassCode();
      return manager.save(Class, saved);
    }
    return saved;
  }
}
