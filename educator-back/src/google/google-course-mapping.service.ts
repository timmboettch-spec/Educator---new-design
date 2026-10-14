import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Class, GoogleCourseMapping } from 'src/database/entities';
import {
  CLASS_EDUCATOR_REPOSITORY,
  CLASS_REPOSITORY,
  GOOGLE_COURSE_MAPPING_REPOSITORY,
  GOOGLE_STUDENT_MAPPING_REPOSITORY,
  STUDENT_REPOSITORY,
} from 'src/database/tokens';
import {
  ClassEducatorRepository,
  ClassRepository,
  GoogleCourseMappingRepository,
  GoogleStudentMappingRepository,
  StudentRepository,
} from 'src/database/repositories';
import { LoggerService } from 'src/common/services';
import { CommonStatus } from 'src/common/enums/status.enum';
import { ClassScopeConstants } from 'src/common/constants/class.constants';
import { GoogleConstants } from './google.constants';
import { GoogleClassroomService, GoogleClassroomCourse } from './google-classroom.service';
import { GoogleConnectionService } from './google-connection.service';
import { GoogleCourseworkService } from './google-coursework.service';
import { GoogleRosterSyncResult, GoogleRosterSyncService } from './google-roster-sync.service';

export interface GoogleCourseListItem extends GoogleClassroomCourse {
  linked: boolean;
  mappingId: string | null;
  classId: string | null;
  className: string | null;
  archived: boolean;
  lastRosterSyncedAt: string | null;
}

export interface GoogleCourseMappingDto {
  id: string;
  schoolId: string;
  classId: string;
  googleCourseId: string;
  googleCourseName: string | null;
  linkedByEducatorId: string | null;
  lastRosterSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GoogleProvisionItem {
  course: GoogleClassroomCourse;
  classId: string;
  className: string;
  linked: boolean;
  mappingId: string | null;
  isNew: boolean;
  archived: boolean;
  lastRosterSyncedAt: string | null;
}

export interface GoogleProvisionResult {
  schoolId: string;
  items: GoogleProvisionItem[];
  newCount: number;
  archivedMatchCount: number;
}

export interface GoogleArchivedClassItem {
  classId: string;
  className: string;
  googleCourseId: string | null;
  googleCourseName: string | null;
  courseExists: boolean | null;
  archivedAt: string | null;
}

export interface GoogleBulkLinkItemResult {
  googleCourseId: string;
  success: boolean;
  mapping?: GoogleCourseMappingDto;
  roster?: GoogleRosterSyncResult;
  error?: string;
}

export interface GoogleBulkLinkResult {
  schoolId: string;
  results: GoogleBulkLinkItemResult[];
}

@Injectable()
export class GoogleCourseMappingService {
  constructor(
    @Inject(GOOGLE_COURSE_MAPPING_REPOSITORY)
    private readonly mappingRepo: GoogleCourseMappingRepository,
    @Inject(CLASS_REPOSITORY)
    private readonly classRepo: ClassRepository,
    @Inject(CLASS_EDUCATOR_REPOSITORY)
    private readonly classEducatorRepo: ClassEducatorRepository,
    @Inject(GOOGLE_STUDENT_MAPPING_REPOSITORY)
    private readonly studentMappingRepo: GoogleStudentMappingRepository,
    @Inject(STUDENT_REPOSITORY)
    private readonly studentRepo: StudentRepository,
    private readonly connectionService: GoogleConnectionService,
    private readonly classroomService: GoogleClassroomService,
    private readonly courseworkService: GoogleCourseworkService,
    private readonly rosterSyncService: GoogleRosterSyncService,
    private readonly logger: LoggerService,
  ) { }

  async listCoursesForSchool(
    schoolId: string,
    educatorId: string,
  ): Promise<GoogleCourseListItem[]> {
    const accessToken = await this.connectionService.getValidAccessToken(schoolId, educatorId);
    const connection = await this.connectionService.resolveActiveConnectionIdentity(
      schoolId,
      educatorId,
    );

    let courses: GoogleClassroomCourse[];
    try {
      courses = await this.classroomService.listCourses(accessToken);
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        await this.connectionService.markConnectionNeedsReauth(schoolId, educatorId);
      }
      throw err;
    }

    courses = await this.filterCoursesVisibleToEducator(
      schoolId,
      educatorId,
      courses,
      connection?.googleAccountId ?? null,
    );

    const mappings = await this.mappingRepo.findBySchoolId(schoolId);
    const byCourseId = new Map(mappings.map((m) => [m.googleCourseId, m]));

    const provisionedClasses = await this.classRepo.findGoogleClassroomOriginForSchool(schoolId);
    const provisionedByCourseId = new Map(
      provisionedClasses
        .filter((c) => c.google_course_id)
        .map((c) => [c.google_course_id as string, c]),
    );

    return courses.map((course) => {
      const mapping = byCourseId.get(course.id);
      const provisioned = provisionedByCourseId.get(course.id);
      const archived =
        provisioned?.origin === ClassScopeConstants.GOOGLE_CLASSROOM_ORIGIN &&
        provisioned.status === CommonStatus.ARCHIEVED;

      return {
        ...course,
        linked: Boolean(mapping),
        mappingId: mapping?.id ?? null,
        classId: mapping?.classId ?? provisioned?.id ?? null,
        className: provisioned?.class_name ?? null,
        archived: Boolean(archived),
        lastRosterSyncedAt: mapping?.lastRosterSyncedAt?.toISOString() ?? null,
      };
    });
  }

  /**
   * Unlinked courses: only when Google ownerId and the educator's googleAccountId
   * are both present and equal. Missing either side never reveals a course (no leak).
   * Linked courses: Google already returned the course (caller is a teacher there).
   * If they are not yet RW owner/co-instructor, auto-add them as co-instructor so
   * Connect / Re-sync surfaces already-linked co-taught courses without a manual DB row.
   */
  private async filterCoursesVisibleToEducator(
    schoolId: string,
    educatorId: string,
    courses: GoogleClassroomCourse[],
    googleAccountId: string | null,
  ): Promise<GoogleClassroomCourse[]> {
    const mappings = await this.mappingRepo.findBySchoolId(schoolId);
    const byCourseId = new Map(mappings.map((m) => [m.googleCourseId, m]));
    const accountId = googleAccountId?.trim() || null;
    const visible: GoogleClassroomCourse[] = [];

    for (const course of courses) {
      const mapping = byCourseId.get(course.id);
      if (mapping) {
        let accessible = await this.classRepo.findByIdWithSchoolForEducator(
          mapping.classId,
          educatorId,
        );
        if (!accessible) {
          accessible = await this.ensureCoInstructorForLinkedGoogleCourse({
            schoolId,
            classId: mapping.classId,
            educatorId,
            googleCourseId: course.id,
          });
        }
        if (accessible) {
          visible.push(course);
        }
        continue;
      }

      // Unlinked: require a positive owner match — never show when identity is unknown.
      const courseOwnerId = course.ownerId?.trim() || null;
      if (courseOwnerId && accountId && courseOwnerId === accountId) {
        visible.push(course);
      }
    }

    return visible;
  }

  /**
   * Google `listCourses` only returns courses where this account is a teacher.
   * For an already-linked course at this school, grant RW co-instructor access once.
   */
  private async ensureCoInstructorForLinkedGoogleCourse(params: {
    schoolId: string;
    classId: string;
    educatorId: string;
    googleCourseId: string;
  }): Promise<Class | null> {
    const classRow = await this.classRepo.findOne({
      where: { id: params.classId },
    });
    if (!classRow || classRow.school_id !== params.schoolId) {
      return null;
    }
    if (classRow.deleted_at) {
      return null;
    }

    const existing = await this.classEducatorRepo.findOne({
      where: { classId: params.classId, educatorId: params.educatorId },
    });
    if (!existing) {
      await this.classEducatorRepo.create({
        classId: params.classId,
        educatorId: params.educatorId,
        isPrimary: false,
      });
      this.logger.log(
        `[Google Course Mapping] auto co-instructor educator=${params.educatorId} ` +
        `class=${params.classId} googleCourse=${params.googleCourseId}`,
      );
    }

    return this.classRepo.findByIdWithSchoolForEducator(params.classId, params.educatorId);
  }

  async listMappings(
    schoolId: string,
    educatorId: string,
  ): Promise<GoogleCourseMappingDto[]> {
    const mappings = await this.mappingRepo.findBySchoolId(schoolId);
    const visible: GoogleCourseMappingDto[] = [];
    for (const mapping of mappings) {
      const accessible = await this.classRepo.findByIdWithSchoolForEducator(
        mapping.classId,
        educatorId,
      );
      if (accessible) {
        visible.push(this.sanitize(mapping));
      }
    }
    return visible;
  }

  /**
   * Fetch Google courses (read-only scan, no class creation). Classes are now
   * created JIT when the educator links a course for the first time.
   */
  async provisionCoursesForSchool(params: {
    schoolId: string;
    educatorId: string;
  }): Promise<GoogleProvisionResult> {
    const accessToken = await this.connectionService.getValidAccessToken(
      params.schoolId,
      params.educatorId,
    );
    const connection = await this.connectionService.resolveActiveConnectionIdentity(
      params.schoolId,
      params.educatorId,
    );

    let courses: GoogleClassroomCourse[];
    try {
      courses = await this.classroomService.listCourses(accessToken);
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        await this.connectionService.markConnectionNeedsReauth(
          params.schoolId,
          params.educatorId,
        );
      }
      throw err;
    }

    courses = await this.filterCoursesVisibleToEducator(
      params.schoolId,
      params.educatorId,
      courses,
      connection?.googleAccountId ?? null,
    );

    const mappings = await this.mappingRepo.findBySchoolId(params.schoolId);
    const mappingByCourseId = new Map(mappings.map((m) => [m.googleCourseId, m]));

    const items: GoogleProvisionItem[] = [];
    let archivedMatchCount = 0;

    for (const course of courses) {
      const existing = await this.classRepo.findBySchoolAndGoogleCourseId(
        params.schoolId,
        course.id,
      );
      const mapping = mappingByCourseId.get(course.id) ?? null;
      const isArchived =
        existing?.origin === ClassScopeConstants.GOOGLE_CLASSROOM_ORIGIN &&
        existing.status === CommonStatus.ARCHIEVED;

      if (existing?.id) {
        if (isArchived) {
          archivedMatchCount += 1;
        }
        items.push({
          course,
          classId: existing.id,
          className: existing.class_name ?? course.name,
          linked: Boolean(mapping),
          mappingId: mapping?.id ?? null,
          isNew: false,
          archived: Boolean(isArchived),
          lastRosterSyncedAt: mapping?.lastRosterSyncedAt?.toISOString() ?? null,
        });
      } else {
        // No class exists yet — will be created on first link.
        items.push({
          course,
          classId: null as never,
          className: course.name,
          linked: false,
          mappingId: null,
          isNew: false,
          archived: false,
          lastRosterSyncedAt: null,
        });
      }
    }

    return {
      schoolId: params.schoolId,
      items,
      newCount: 0, // Always 0 — provision no longer creates classes.
      archivedMatchCount,
    };
  }

  async listArchivedGoogleClasses(
    schoolId: string,
    educatorId: string,
  ): Promise<GoogleArchivedClassItem[]> {
    const archived = await this.classRepo.findArchivedGoogleClassroomForSchool(schoolId);
    let courseIds = new Set<string>();
    try {
      const accessToken = await this.connectionService.getValidAccessToken(schoolId, educatorId);
      const courses = await this.classroomService.listCourses(accessToken);
      courseIds = new Set(courses.map((c) => c.id));
    } catch {
      // OAuth disconnected or expired — still return archived rows without courseExists.
    }

    return archived
      .filter((cls): cls is Class & { id: string } => Boolean(cls.id))
      .filter((cls) => cls.educator_id === educatorId)
      .map((cls) => ({
        classId: cls.id,
        className: cls.class_name ?? '',
        googleCourseId: cls.google_course_id ?? null,
        googleCourseName: null,
        courseExists: cls.google_course_id
          ? Boolean(cls.google_course_id && courseIds.has(cls.google_course_id))
          : null,
        archivedAt: cls.updated_at?.toISOString() ?? null,
      }));
  }

  async linkCourse(params: {
    schoolId: string;
    googleCourseId: string;
    googleCourseName: string;
    googleCourseSection?: string | null;
    googleCourseOwnerId?: string | null;
    educatorId: string;
    syncRoster?: boolean;
  }): Promise<{ mapping: GoogleCourseMappingDto; roster: GoogleRosterSyncResult | null }> {
    // Ensure this educator still has a usable Google connection before linking.
    const accessToken = await this.connectionService.getValidAccessToken(
      params.schoolId,
      params.educatorId,
    );

    const googleCourseId = params.googleCourseId.trim();

    // Check if this course is already linked by another educator at this school (co-instructor case).
    const existingForCourse = await this.mappingRepo.findBySchoolAndGoogleCourseId(
      params.schoolId,
      googleCourseId,
    );

    // New links require the caller to own the Google course (co-teachers use already-linked classes).
    if (!existingForCourse) {
      await this.assertCallerOwnsGoogleCourse({
        schoolId: params.schoolId,
        educatorId: params.educatorId,
        googleCourseId,
        accessToken,
      });
    }

    // Find or create the app class for this Google course.
    let classEntity = await this.classRepo.findBySchoolAndGoogleCourseId(
      params.schoolId,
      googleCourseId,
    );

    // Check for soft-deleted class (from Class Management deletion, not unlink).
    // Classes use @DeleteDateColumn — plain findOne excludes deleted_at rows.
    if (!classEntity) {
      const deletedClass = await this.classRepo.findSoftDeletedBySchoolAndGoogleCourseId(
        params.schoolId,
        googleCourseId,
      );

      if (deletedClass?.deleted_at) {
        // Restore soft-deleted class (relink after class deletion).
        const deletedClassId = deletedClass.id;
        if (!deletedClassId) {
          throw new NotFoundException(GoogleConstants.MESSAGES.CLASS_NOT_FOUND);
        }
        await this.classRepo.update(deletedClassId, {
          is_active: true,
          deleted_at: null,
          status: CommonStatus.ACTIVE,
        });
        deletedClass.is_active = true;
        deletedClass.deleted_at = null;
        deletedClass.status = CommonStatus.ACTIVE;
        classEntity = deletedClass;
      }
    }

    if (!classEntity) {
      // First link — create the class now.
      classEntity = await this.createGoogleClassroomClass({
        schoolId: params.schoolId,
        educatorId: params.educatorId,
        course: {
          id: googleCourseId,
          name: params.googleCourseName,
          section: params.googleCourseSection ?? null,
        },
      });
    } else if (classEntity.status === CommonStatus.ARCHIEVED) {
      // Reactivate archived Google-origin class (relink after unlink).
      const archivedClassId = classEntity.id;
      if (!archivedClassId) {
        throw new NotFoundException(GoogleConstants.MESSAGES.CLASS_NOT_FOUND);
      }
      await this.classRepo.update(archivedClassId, { status: CommonStatus.ACTIVE });
      classEntity.status = CommonStatus.ACTIVE;
    }

    const classId = classEntity.id;
    if (!classId) {
      throw new NotFoundException(GoogleConstants.MESSAGES.CLASS_NOT_FOUND);
    }

    // Ensure this educator has access to the class (owner or co-instructor).
    const accessible = await this.classRepo.findByIdWithSchoolForEducator(
      classId,
      params.educatorId,
    );
    if (!accessible) {
      // Grant co-instructor access to an already-linked class.
      await this.ensureCoInstructorForLinkedGoogleCourse({
        schoolId: params.schoolId,
        classId,
        educatorId: params.educatorId,
        googleCourseId,
      });
    }

    // Create or update the mapping.
    let mapping: GoogleCourseMapping;

    const existingForClass = await this.mappingRepo.findByClassId(classId);
    if (existingForClass && existingForClass.googleCourseId === googleCourseId) {
      // Already linked — update metadata (relink case).
      existingForClass.googleCourseName = params.googleCourseName?.trim() || existingForClass.googleCourseName;
      existingForClass.linkedByEducatorId = params.educatorId;
      mapping = await this.mappingRepo.save(existingForClass);
    } else if (existingForCourse) {
      // Co-instructor linking the same course — reuse existing mapping.
      existingForCourse.googleCourseName = params.googleCourseName?.trim() || existingForCourse.googleCourseName;
      existingForCourse.linkedByEducatorId = params.educatorId;
      mapping = await this.mappingRepo.save(existingForCourse);
    } else {
      // Create new mapping.
      try {
        mapping = await this.mappingRepo.create({
          schoolId: params.schoolId,
          classId,
          googleCourseId,
          googleCourseName: params.googleCourseName?.trim() || null,
          linkedByEducatorId: params.educatorId,
        });
      } catch (err) {
        this.logger.warn(
          `[Google Course Mapping] link failed for school ${params.schoolId}: ${err instanceof Error ? err.message : 'unknown'}`,
        );
        throw new BadRequestException(GoogleConstants.MESSAGES.COURSE_LINK_FAILED);
      }
    }

    await this.safeSyncCourseWork(mapping.classId);

    let roster: GoogleRosterSyncResult | null = null;
    if (params.syncRoster !== false) {
      roster = await this.safeSyncRoster({
        schoolId: params.schoolId,
        mappingId: mapping.id,
        educatorId: params.educatorId,
      });
    }

    const mappingDto = this.sanitize(mapping);
    if (roster?.lastRosterSyncedAt) {
      mappingDto.lastRosterSyncedAt = roster.lastRosterSyncedAt;
    }

    return { mapping: mappingDto, roster };
  }

  async bulkLinkCourses(params: {
    schoolId: string;
    educatorId: string;
    courses: Array<{
      googleCourseId: string;
      googleCourseName: string;
      googleCourseSection?: string | null;
      googleCourseOwnerId?: string | null;
    }>;
  }): Promise<GoogleBulkLinkResult> {
    const results: GoogleBulkLinkItemResult[] = [];

    for (const course of params.courses) {
      const trimmed = course.googleCourseId.trim();
      if (!trimmed) continue;

      try {
        const { mapping, roster } = await this.linkCourse({
          schoolId: params.schoolId,
          googleCourseId: trimmed,
          googleCourseName: course.googleCourseName,
          googleCourseSection: course.googleCourseSection,
          googleCourseOwnerId: course.googleCourseOwnerId,
          educatorId: params.educatorId,
          syncRoster: true,
        });

        results.push({
          googleCourseId: trimmed,
          success: true,
          mapping,
          roster: roster ?? undefined,
        });
      } catch (err) {
        results.push({
          googleCourseId: trimmed,
          success: false,
          error: err instanceof Error ? err.message : GoogleConstants.MESSAGES.COURSE_LINK_FAILED,
        });
      }
    }

    return { schoolId: params.schoolId, results };
  }

  async unlinkMapping(
    schoolId: string,
    mappingId: string,
    educatorId: string,
  ): Promise<{ deleted: boolean }> {
    const mapping = await this.mappingRepo.findOne({
      where: { id: mappingId, schoolId },
    });
    if (!mapping) {
      throw new NotFoundException(GoogleConstants.MESSAGES.MAPPING_NOT_FOUND);
    }

    const classData = await this.classRepo.findOne({ where: { id: mapping.classId } });
    if (!classData?.educator_id || classData.educator_id !== educatorId) {
      throw new ForbiddenException(GoogleConstants.MESSAGES.UNLINK_OWNER_ONLY);
    }

    const studentMappings = await this.studentMappingRepo.findByClassId(mapping.classId);
    for (const row of studentMappings) {
      await this.studentRepo.update(row.studentId, {
        is_active: false,
        deleted_at: new Date(),
        status: CommonStatus.INACTIVE,
      });
    }
    await this.studentMappingRepo.deleteByClassId(mapping.classId);
    await this.courseworkService.deleteCourseWorkForClass(mapping.classId);

    const deleted = await this.mappingRepo.deleteByIdAndSchoolId(mappingId, schoolId);
    if (!deleted) {
      throw new NotFoundException(GoogleConstants.MESSAGES.MAPPING_NOT_FOUND);
    }

    await this.archiveGoogleOriginClassIfNeeded(mapping.classId);
    return { deleted: true };
  }

  /**
   * Called before OAuth disconnect for one educator: unlink mappings and archive
   * google_classroom-origin classes owned by that educator at the school.
   */
  async archiveGoogleClassesForEducator(
    schoolId: string,
    educatorId: string,
  ): Promise<{
    unlinked: number;
    archived: number;
  }> {
    const ownedClasses = await this.classRepo.findGoogleClassroomOriginForSchoolAndEducator(
      schoolId,
      educatorId,
    );
    const ownedClassIds = new Set(ownedClasses.map((c) => c.id).filter(Boolean));

    const mappings = await this.mappingRepo.findBySchoolId(schoolId);
    let unlinked = 0;
    for (const mapping of mappings) {
      if (!ownedClassIds.has(mapping.classId)) continue;
      try {
        await this.unlinkMapping(schoolId, mapping.id, educatorId);
        unlinked += 1;
      } catch (err) {
        this.logger.warn(
          `[Google Course Mapping] disconnect unlink failed for mapping ${mapping.id}: ${err instanceof Error ? err.message : 'unknown'
          }`,
        );
      }
    }

    let archived = 0;
    for (const cls of ownedClasses) {
      if (!cls.id) continue;
      if (cls.status === CommonStatus.ARCHIEVED) continue;
      await this.classRepo.update(cls.id, { status: CommonStatus.ARCHIEVED });
      archived += 1;
    }

    return { unlinked, archived };
  }

  private async archiveGoogleOriginClassIfNeeded(classId: string): Promise<void> {
    const classData = await this.classRepo.findOne({ where: { id: classId } });
    if (!classData?.id) return;
    if (classData.origin !== ClassScopeConstants.GOOGLE_CLASSROOM_ORIGIN) return;
    if (classData.status === CommonStatus.ARCHIEVED) return;
    await this.classRepo.update(classData.id, { status: CommonStatus.ARCHIEVED });
  }

  /**
   * New course links are owner-only in Google Classroom. Co-teachers may operate on
   * already-linked classes (roster/coursework) but cannot create the first mapping.
   */
  private async assertCallerOwnsGoogleCourse(params: {
    schoolId: string;
    educatorId: string;
    googleCourseId: string;
    accessToken: string;
  }): Promise<void> {
    const connection = await this.connectionService.resolveActiveConnectionIdentity(
      params.schoolId,
      params.educatorId,
    );
    const accountId = connection?.googleAccountId?.trim() || null;
    if (!accountId) {
      throw new ForbiddenException(GoogleConstants.MESSAGES.LINK_OWNER_ONLY);
    }

    let course: GoogleClassroomCourse;
    try {
      course = await this.classroomService.getCourse(params.accessToken, params.googleCourseId);
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        await this.connectionService.markConnectionNeedsReauth(
          params.schoolId,
          params.educatorId,
        );
      }
      throw err;
    }

    const courseOwnerId = course.ownerId?.trim() || null;
    if (!courseOwnerId || courseOwnerId !== accountId) {
      throw new ForbiddenException(GoogleConstants.MESSAGES.LINK_OWNER_ONLY);
    }
  }

  private async createGoogleClassroomClass(params: {
    schoolId: string;
    educatorId: string;
    course: Pick<GoogleClassroomCourse, 'id' | 'name' | 'section'>;
  }): Promise<Class> {
    const className = await this.resolveUniqueClassName(
      params.course.name,
      params.course.id,
      params.educatorId,
    );
    const today = new Date();
    const end = new Date(today);
    end.setFullYear(end.getFullYear() + 1);

    const toDateOnly = (d: Date) => d.toISOString().slice(0, 10);

    return this.classRepo.create({
      lms_class_id: randomUUID().replace(/-/g, '').substring(0, 8).toUpperCase(),
      class_name: className,
      term: params.course.section ?? undefined,
      year: String(today.getFullYear()),
      status: CommonStatus.ACTIVE,
      is_active: true,
      deleted_at: null,
      start_date: toDateOnly(today),
      end_date: toDateOnly(end),
      total_no_of_students: 0,
      origin: ClassScopeConstants.GOOGLE_CLASSROOM_ORIGIN,
      google_course_id: params.course.id,
      educator: { id: params.educatorId } as never,
      school: { id: params.schoolId } as never,
    });
  }

  private async resolveUniqueClassName(
    baseName: string,
    googleCourseId: string,
    educatorId: string,
  ): Promise<string> {
    const trimmed = (baseName || 'Google Classroom').trim() || 'Google Classroom';
    const collision = await this.classRepo.findOne({
      where: {
        class_name: trimmed,
        educator: { id: educatorId },
        is_active: true,
      },
    });
    if (!collision) return trimmed;
    const suffix = googleCourseId.slice(-6);
    return `${trimmed} (${suffix})`;
  }

  private async safeSyncCourseWork(classId: string): Promise<void> {
    try {
      await this.courseworkService.syncCourseWorkForClass(classId);
    } catch (err) {
      this.logger.warn(
        `[Google Course Mapping] coursework sync after link failed for class ${classId}: ${err instanceof Error ? err.message : 'unknown'
        }`,
      );
    }
  }

  private async safeSyncRoster(params: {
    schoolId: string;
    mappingId: string;
    educatorId: string;
  }): Promise<GoogleRosterSyncResult | null> {
    try {
      return await this.rosterSyncService.syncLinkedCourse(params);
    } catch (err) {
      this.logger.warn(
        `[Google Course Mapping] roster sync after link failed for mapping ${params.mappingId}: ${err instanceof Error ? err.message : 'unknown'
        }`,
      );
      return null;
    }
  }

  private sanitize(mapping: GoogleCourseMapping): GoogleCourseMappingDto {
    return {
      id: mapping.id,
      schoolId: mapping.schoolId,
      classId: mapping.classId,
      googleCourseId: mapping.googleCourseId,
      googleCourseName: mapping.googleCourseName,
      linkedByEducatorId: mapping.linkedByEducatorId,
      lastRosterSyncedAt: mapping.lastRosterSyncedAt?.toISOString() ?? null,
      createdAt: mapping.createdAt.toISOString(),
      updatedAt: mapping.updatedAt.toISOString(),
    };
  }
}
