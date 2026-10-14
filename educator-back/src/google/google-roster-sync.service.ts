import { createHash } from 'crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { LoggerService } from 'src/common/services';
import { CommonStatus } from 'src/common/enums/status.enum';
import {
  CLASS_REPOSITORY,
  GOOGLE_COURSE_MAPPING_REPOSITORY,
  GOOGLE_STUDENT_MAPPING_REPOSITORY,
  STUDENT_REPOSITORY,
} from 'src/database/tokens';
import {
  ClassRepository,
  GoogleCourseMappingRepository,
  GoogleStudentMappingRepository,
  StudentRepository,
} from 'src/database/repositories';
import { GoogleCourseMapping, GoogleStudentMapping, Student } from 'src/database/entities';
import { GoogleConstants } from './google.constants';
import { GoogleClassroomRosterStudent, GoogleClassroomService } from './google-classroom.service';
import { GoogleConnectionService } from './google-connection.service';

export type GoogleRosterSyncResult = {
  mappingId: string;
  classId: string;
  googleCourseId: string;
  lastRosterSyncedAt: string;
  added: number;
  reactivated: number;
  deactivated: number;
  unchanged: number;
  total: number;
};

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    typeof error.driverError === 'object' &&
    error.driverError !== null &&
    (error.driverError as { code?: string }).code === '23505'
  );
}

@Injectable()
export class GoogleRosterSyncService {
  constructor(
    @Inject(GOOGLE_COURSE_MAPPING_REPOSITORY)
    private readonly courseMappingRepo: GoogleCourseMappingRepository,
    @Inject(GOOGLE_STUDENT_MAPPING_REPOSITORY)
    private readonly studentMappingRepo: GoogleStudentMappingRepository,
    @Inject(STUDENT_REPOSITORY)
    private readonly studentRepo: StudentRepository,
    @Inject(CLASS_REPOSITORY)
    private readonly classRepo: ClassRepository,
    private readonly connectionService: GoogleConnectionService,
    private readonly classroomService: GoogleClassroomService,
    private readonly dataSource: DataSource,
    private readonly logger: LoggerService,
  ) {}

  async syncLinkedCourse(params: {
    schoolId: string;
    mappingId: string;
    educatorId: string;
  }): Promise<GoogleRosterSyncResult> {
    const mapping = await this.courseMappingRepo.findOne({
      where: { id: params.mappingId, schoolId: params.schoolId },
    });
    if (!mapping) {
      throw new NotFoundException(GoogleConstants.MESSAGES.MAPPING_NOT_FOUND);
    }

    const classData = await this.classRepo.findActiveByIdWithSchoolForEducator(
      mapping.classId,
      params.educatorId,
    );
    if (!classData?.id || !classData.educator_id || classData.school_id !== params.schoolId) {
      throw new NotFoundException(GoogleConstants.MESSAGES.CLASS_NOT_FOUND);
    }

    const accessToken = await this.connectionService.getValidAccessToken(
      params.schoolId,
      classData.educator_id,
    );
    const roster = await this.fetchRosterOrReauth(
      params.schoolId,
      classData.educator_id,
      accessToken,
      mapping.googleCourseId,
    );

    const existingMappings = await this.studentMappingRepo.findByClassId(classData.id);
    const byGoogleUserId = new Map(
      existingMappings.map((row) => [row.googleUserId, row] as const),
    );
    const byEmail = new Map<string, GoogleStudentMapping>();
    for (const row of existingMappings) {
      const email = row.googleEmail?.trim().toLowerCase();
      if (email && !byEmail.has(email)) {
        byEmail.set(email, row);
      }
    }

    const liveGoogleUserIds = new Set<string>();
    let added = 0;
    let reactivated = 0;
    let unchanged = 0;

    // Match LTI NRPS provision: import roster without seat checks; Avatar/AI seats
    // are validated when the educator assigns an AI simulation to the class.
    for (const googleStudent of roster) {
      liveGoogleUserIds.add(googleStudent.googleUserId);

      const matched = this.matchExistingMapping(googleStudent, byGoogleUserId, byEmail);
      if (matched) {
        const outcome = await this.upsertExistingStudent(matched, googleStudent, mapping);
        if (outcome === 'reactivated') {
          reactivated += 1;
        } else {
          unchanged += 1;
        }
        this.indexMapping(matched, byGoogleUserId, byEmail);
        continue;
      }

      await this.createStudentAndMapping({
        mapping,
        classId: classData.id,
        educatorId: classData.educator_id,
        schoolId: params.schoolId,
        googleStudent,
        byGoogleUserId,
        byEmail,
      });
      added += 1;
    }

    const deactivated = await this.deactivateMissingGoogleStudents(
      existingMappings,
      liveGoogleUserIds,
    );

    mapping.lastRosterSyncedAt = new Date();
    await this.courseMappingRepo.save(mapping);

    this.logger.log(
      `[Google Roster] course=${mapping.googleCourseId} class=${classData.id} added=${added} reactivated=${reactivated} deactivated=${deactivated} unchanged=${unchanged}`,
    );

    return {
      mappingId: mapping.id,
      classId: classData.id,
      googleCourseId: mapping.googleCourseId,
      lastRosterSyncedAt: mapping.lastRosterSyncedAt.toISOString(),
      added,
      reactivated,
      deactivated,
      unchanged,
      total: roster.length,
    };
  }

  async syncAllLinkedCoursesForSchool(
    schoolId: string,
    educatorId: string,
  ): Promise<GoogleRosterSyncResult[]> {
    const mappings = await this.courseMappingRepo.findBySchoolId(schoolId);
    const results: GoogleRosterSyncResult[] = [];
    for (const mapping of mappings) {
      // Only sync classes this educator can access (owner or co-instructor).
      // Skipping avoids aborting the whole school sync on another educator's mapping.
      const accessible = await this.classRepo.findActiveByIdWithSchoolForEducator(
        mapping.classId,
        educatorId,
      );
      if (!accessible) {
        continue;
      }
      results.push(
        await this.syncLinkedCourse({
          schoolId,
          mappingId: mapping.id,
          educatorId,
        }),
      );
    }
    return results;
  }

  private async fetchRosterOrReauth(
    schoolId: string,
    ownerEducatorId: string,
    accessToken: string,
    googleCourseId: string,
  ): Promise<GoogleClassroomRosterStudent[]> {
    try {
      return await this.classroomService.fetchRoster(accessToken, googleCourseId);
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        await this.connectionService.markConnectionNeedsReauth(schoolId, ownerEducatorId);
      }
      throw err;
    }
  }

  private matchExistingMapping(
    googleStudent: GoogleClassroomRosterStudent,
    byGoogleUserId: Map<string, GoogleStudentMapping>,
    byEmail: Map<string, GoogleStudentMapping>,
  ): GoogleStudentMapping | null {
    const byId = byGoogleUserId.get(googleStudent.googleUserId);
    if (byId) {
      return byId;
    }
    const email = googleStudent.googleEmail?.trim().toLowerCase();
    if (!email) {
      return null;
    }
    return byEmail.get(email) ?? null;
  }

  private async upsertExistingStudent(
    mapping: GoogleStudentMapping,
    googleStudent: GoogleClassroomRosterStudent,
    courseMapping: GoogleCourseMapping,
  ): Promise<'reactivated' | 'unchanged'> {
    mapping.googleUserId = googleStudent.googleUserId;
    mapping.googleEmail = googleStudent.googleEmail;
    mapping.googleName = googleStudent.googleName;
    mapping.googleCourseId = courseMapping.googleCourseId;
    await this.studentMappingRepo.save(mapping);

    const student = await this.studentRepo.findOne({ where: { id: mapping.studentId } });
    if (!student?.id) {
      return 'unchanged';
    }

    if (!student.is_active) {
      await this.studentRepo.update(student.id, {
        is_active: true,
        deleted_at: null,
        status: CommonStatus.ACTIVE,
      });
      return 'reactivated';
    }

    return 'unchanged';
  }

  private async createStudentAndMapping(params: {
    mapping: GoogleCourseMapping;
    classId: string;
    educatorId: string;
    schoolId: string;
    googleStudent: GoogleClassroomRosterStudent;
    byGoogleUserId: Map<string, GoogleStudentMapping>;
    byEmail: Map<string, GoogleStudentMapping>;
  }): Promise<void> {
    const studentCode = await this.nextStudentCode(params.googleStudent.googleUserId);

    try {
      // Student + mapping in one transaction so a unique-constraint race cannot
      // leave an orphaned students row without a google_student_mappings row.
      const created = await this.dataSource.transaction(async (manager) => {
        const existing = await manager.findOne(GoogleStudentMapping, {
          where: {
            classId: params.classId,
            googleUserId: params.googleStudent.googleUserId,
          },
        });
        if (existing) {
          return existing;
        }

        const student = await manager.save(
          manager.create(Student, {
            student_id: studentCode,
            status: CommonStatus.ACTIVE,
            is_active: true,
            deleted_at: null,
            class: { id: params.classId },
            educator: { id: params.educatorId },
            school: { id: params.schoolId },
          }),
        );
        if (!student.id) {
          throw new BadRequestException(GoogleConstants.MESSAGES.ROSTER_STUDENT_CREATE_FAILED);
        }

        return manager.save(
          manager.create(GoogleStudentMapping, {
            schoolId: params.schoolId,
            classId: params.classId,
            googleCourseId: params.mapping.googleCourseId,
            googleUserId: params.googleStudent.googleUserId,
            googleEmail: params.googleStudent.googleEmail,
            googleName: params.googleStudent.googleName,
            studentId: student.id,
            studentCode,
          }),
        );
      });

      this.indexMapping(created, params.byGoogleUserId, params.byEmail);
    } catch (err) {
      if (isUniqueViolation(err)) {
        const raced = await this.studentMappingRepo.findByClassAndGoogleUserId(
          params.classId,
          params.googleStudent.googleUserId,
        );
        if (raced) {
          this.indexMapping(raced, params.byGoogleUserId, params.byEmail);
          return;
        }
      }
      throw err;
    }
  }

  private async deactivateMissingGoogleStudents(
    existingMappings: GoogleStudentMapping[],
    liveGoogleUserIds: Set<string>,
  ): Promise<number> {
    let deactivated = 0;
    for (const mapping of existingMappings) {
      if (liveGoogleUserIds.has(mapping.googleUserId)) {
        continue;
      }

      const student = await this.studentRepo.findOne({ where: { id: mapping.studentId } });
      if (!student?.id || !student.is_active) {
        continue;
      }

      await this.studentRepo.update(student.id, {
        is_active: false,
        deleted_at: new Date(),
        status: CommonStatus.INACTIVE,
      });
      deactivated += 1;
    }
    return deactivated;
  }

  private indexMapping(
    mapping: GoogleStudentMapping,
    byGoogleUserId: Map<string, GoogleStudentMapping>,
    byEmail: Map<string, GoogleStudentMapping>,
  ): void {
    byGoogleUserId.set(mapping.googleUserId, mapping);
    const email = mapping.googleEmail?.trim().toLowerCase();
    if (email) {
      byEmail.set(email, mapping);
    }
  }

  private async nextStudentCode(googleUserId: string): Promise<string> {
    const digest = createHash('sha256').update(googleUserId).digest('hex').toUpperCase();
    for (let size = 8; size <= 16; size += 4) {
      const candidate = `GC-${digest.slice(0, size)}`;
      const existing = await this.studentRepo.findExistingStudentCodes([candidate]);
      if (existing.length === 0) {
        return candidate;
      }
    }
    return `GC-${digest.slice(0, 12)}${Date.now().toString(36).toUpperCase().slice(-4)}`;
  }
}
