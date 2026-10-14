import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from 'src/common/services';
import {
  CLASS_REPOSITORY,
  CLASS_SIMULATION_REPOSITORY,
  GOOGLE_COURSE_MAPPING_REPOSITORY,
  GOOGLE_COURSEWORK_MAPPING_REPOSITORY,
  SIMULATION_REPOSITORY,
} from 'src/database/tokens';
import {
  ClassRepository,
  ClassSimulationRepository,
  GoogleCourseMappingRepository,
  GoogleCourseworkMappingRepository,
  SimulationRepository,
} from 'src/database/repositories';
import { GoogleCourseworkMapping } from 'src/database/entities';
import { GoogleClassroomService } from './google-classroom.service';
import { GoogleConnectionService } from './google-connection.service';
import { GoogleConstants } from './google.constants';

export type EnsureGoogleCourseWorkParams = {
  classId: string;
  schoolId?: string | null;
  /**
   * Class-simulation row id when assigning from Class Management / sync.
   * Existing assign/sync callers always pass a non-null id.
   * Null is only for auto-creation on first grade passback when CourseWork
   * was never created at assign time (see GoogleGradePassbackService.submitScore).
   */
  classSimulationId: string | null;
  simulationId: string;
  title: string;
  description?: string;
  dueDate?: string;
};

export type SyncGoogleCourseWorkResult = {
  classId: string;
  attempted: number;
  created: number;
  skipped: number;
  failed: number;
};

@Injectable()
export class GoogleCourseworkService {
  constructor(
    @Inject(GOOGLE_COURSE_MAPPING_REPOSITORY)
    private readonly courseMappingRepo: GoogleCourseMappingRepository,
    @Inject(GOOGLE_COURSEWORK_MAPPING_REPOSITORY)
    private readonly courseworkMappingRepo: GoogleCourseworkMappingRepository,
    @Inject(CLASS_SIMULATION_REPOSITORY)
    private readonly classSimulationRepo: ClassSimulationRepository,
    @Inject(SIMULATION_REPOSITORY)
    private readonly simulationRepo: SimulationRepository,
    @Inject(CLASS_REPOSITORY)
    private readonly classRepo: ClassRepository,
    private readonly classroomService: GoogleClassroomService,
    private readonly connectionService: GoogleConnectionService,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  private async resolveOwnerEducatorId(classId: string): Promise<string | null> {
    const classData = await this.classRepo.findOne({
      where: { id: classId },
      select: { id: true, educator_id: true },
    });
    return classData?.educator_id?.trim() || null;
  }

  /**
   * If the class is linked to a Google course, create Classroom CourseWork for the
   * assigned simulation (idempotent per class + simulation). Failures are logged
   * by the caller; this method may throw for auth/API errors.
   */
  async ensureCourseWorkForAssignment(
    params: EnsureGoogleCourseWorkParams,
  ): Promise<GoogleCourseworkMapping | null> {
    const simulationId = params.simulationId.trim();
    if (!simulationId) return null;

    const existing = await this.courseworkMappingRepo.findByClassAndSimulation(
      params.classId,
      simulationId,
    );
    if (existing) {
      return existing;
    }

    const courseMap = await this.courseMappingRepo.findByClassId(params.classId);
    if (!courseMap) {
      return null;
    }

    const ownerEducatorId = await this.resolveOwnerEducatorId(params.classId);
    if (!ownerEducatorId) {
      return null;
    }

    const accessToken = await this.connectionService.getValidAccessToken(
      courseMap.schoolId,
      ownerEducatorId,
    );
    const apiBaseRaw = (
      this.configService.get<string>('app.apiBaseUrl') ||
      this.configService.get<string>('app.appUrl') ||
      process.env.API_BASE_URL ||
      process.env.APP_URL ||
      'http://localhost:3000'
    ).replace(/\/+$/, '');
    const apiRoot = apiBaseRaw.endsWith('/api') ? apiBaseRaw : `${apiBaseRaw}/api`;
    // One Classroom material for everyone: backend routes teachers → educator portal
    // and learners → student auto-login (GC cannot show different materials per role).
    const launchLink =
      `${apiRoot}/auth/google/classroom/launch` +
      `?simulationId=${encodeURIComponent(simulationId)}` +
      `&googleCourseId=${encodeURIComponent(courseMap.googleCourseId)}`;

    const launchDescription =
      'Click Open Simulation. Teachers open the educator portal; students open the student app (same button — Google signs you in and routes by account).';
    const simBlurb = params.description?.trim();
    const description = simBlurb
      ? `${launchDescription}\n\n${simBlurb}`
      : launchDescription;

    try {
      const courseWork = await this.classroomService.createCourseWork(
        accessToken,
        courseMap.googleCourseId,
        {
          title: params.title.trim() || simulationId,
          description,
          launchLink,
          maxPoints: 100,
          dueDate: this.parseDueDate(params.dueDate),
        },
      );

      try {
        return await this.courseworkMappingRepo.create({
          schoolId: courseMap.schoolId,
          classId: params.classId,
          classSimulationId: params.classSimulationId,
          simulationId,
          googleCourseId: courseMap.googleCourseId,
          googleCourseworkId: courseWork.id,
          title: courseWork.title,
          alternateLink: courseWork.alternateLink,
        });
      } catch (err) {
        // Race: another assign may have inserted the unique (class, simulation) row.
        const raced = await this.courseworkMappingRepo.findByClassAndSimulation(
          params.classId,
          simulationId,
        );
        if (raced) return raced;

        try {
          await this.classroomService.deleteCourseWork(
            accessToken,
            courseMap.googleCourseId,
            courseWork.id,
          );
        } catch (cleanupErr) {
          this.logger.warn(
            `[Google CourseWork] compensate-delete failed class=${params.classId} sim=${simulationId} coursework=${courseWork.id}: ${
              cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)
            }`,
          );
        }
        throw err;
      }
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        await this.connectionService.markConnectionNeedsReauth(
          courseMap.schoolId,
          ownerEducatorId,
        );
      }
      this.logger.warn(
        `[Google CourseWork] ensure failed for class ${params.classId} sim ${simulationId}: ${
          err instanceof Error ? err.message : GoogleConstants.MESSAGES.COURSEWORK_CREATE_FAILED
        }`,
      );
      throw err;
    }
  }

  /**
   * Backfill Classroom CourseWork for every active simulation already on a linked class.
   * Idempotent — skips sims that already have a google_coursework_mappings row.
   */
  async syncCourseWorkForClass(classId: string): Promise<SyncGoogleCourseWorkResult> {
    const result: SyncGoogleCourseWorkResult = {
      classId,
      attempted: 0,
      created: 0,
      skipped: 0,
      failed: 0,
    };

    const courseMap = await this.courseMappingRepo.findByClassId(classId);
    if (!courseMap) {
      return result;
    }

    const classSims = await this.classSimulationRepo.find({
      where: { class_id: classId, is_active: true },
    });
    const activeSimIds = new Set(
      classSims
        .map((s) => s.simulation_id?.trim())
        .filter((id): id is string => Boolean(id)),
    );

    // Remove Classroom assignments for sims that are no longer active on the class.
    const existingMappings = await this.courseworkMappingRepo.findByClassId(classId);
    const ownerEducatorId = await this.resolveOwnerEducatorId(classId);
    for (const mapping of existingMappings) {
      if (activeSimIds.has(mapping.simulationId)) continue;
      try {
        if (!ownerEducatorId) {
          throw new Error('Class owner missing for Google CourseWork token');
        }
        const accessToken = await this.connectionService.getValidAccessToken(
          mapping.schoolId,
          ownerEducatorId,
        );
        await this.classroomService.deleteCourseWork(
          accessToken,
          mapping.googleCourseId,
          mapping.googleCourseworkId,
        );
        await this.courseworkMappingRepo.deleteById(mapping.id);
        this.logger.log(
          `[Google CourseWork] removed orphan coursework class=${classId} sim=${mapping.simulationId}`,
        );
      } catch (err) {
        result.failed += 1;
        this.logger.warn(
          `[Google CourseWork] orphan delete failed class=${classId} sim=${mapping.simulationId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    for (const classSim of classSims) {
      result.attempted += 1;
      const simulationId = classSim.simulation_id?.trim();
      if (!simulationId) {
        result.skipped += 1;
        continue;
      }

      const existing = await this.courseworkMappingRepo.findByClassAndSimulation(
        classId,
        simulationId,
      );
      if (existing) {
        result.skipped += 1;
        continue;
      }

      const simulation = await this.simulationRepo.findOne({ where: { id: simulationId } });
      try {
        const created = await this.ensureCourseWorkForAssignment({
          classId,
          schoolId: courseMap.schoolId,
          classSimulationId: classSim.id,
          simulationId,
          title: simulation?.title?.trim() || simulationId,
          description: simulation?.description ?? undefined,
          dueDate: classSim.due_date,
        });
        if (created) {
          result.created += 1;
        } else {
          result.skipped += 1;
        }
      } catch (err) {
        result.failed += 1;
        this.logger.warn(
          `[Google CourseWork] sync item failed class=${classId} sim=${simulationId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    this.logger.log(
      `[Google CourseWork] sync class=${classId} attempted=${result.attempted} created=${result.created} skipped=${result.skipped} failed=${result.failed}`,
    );
    return result;
  }

  /**
   * Sync CourseWork for every class linked under a school.
   */
  async syncCourseWorkForSchool(schoolId: string): Promise<SyncGoogleCourseWorkResult[]> {
    const mappings = await this.courseMappingRepo.findBySchoolId(schoolId);
    const results: SyncGoogleCourseWorkResult[] = [];
    for (const mapping of mappings) {
      results.push(await this.syncCourseWorkForClass(mapping.classId));
    }
    return results;
  }

  /**
   * Delete every Classroom CourseWork row for a class (used before unlinking a course).
   */
  async deleteCourseWorkForClass(classId: string): Promise<void> {
    const mappings = await this.courseworkMappingRepo.findByClassId(classId);
    for (const mapping of mappings) {
      await this.deleteCourseWorkForAssignment({
        classId,
        simulationId: mapping.simulationId,
      });
    }
  }

  /**
   * Delete Classroom CourseWork for a removed class-simulation assignment (non-blocking caller).
   */
  async deleteCourseWorkForAssignment(params: {
    classId: string;
    simulationId: string;
  }): Promise<boolean> {
    const simulationId = params.simulationId.trim();
    if (!simulationId) return false;

    const mapping = await this.courseworkMappingRepo.findByClassAndSimulation(
      params.classId,
      simulationId,
    );
    if (!mapping) {
      return false;
    }

    try {
      const ownerEducatorId = await this.resolveOwnerEducatorId(params.classId);
      if (!ownerEducatorId) {
        throw new Error('Class owner missing for Google CourseWork token');
      }
      const accessToken = await this.connectionService.getValidAccessToken(
        mapping.schoolId,
        ownerEducatorId,
      );
      await this.classroomService.deleteCourseWork(
        accessToken,
        mapping.googleCourseId,
        mapping.googleCourseworkId,
      );
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        const ownerEducatorId = await this.resolveOwnerEducatorId(params.classId);
        if (ownerEducatorId) {
          await this.connectionService.markConnectionNeedsReauth(
            mapping.schoolId,
            ownerEducatorId,
          );
        }
      }
      this.logger.warn(
        `[Google CourseWork] delete failed class=${params.classId} sim=${simulationId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw err;
    }

    await this.courseworkMappingRepo.deleteById(mapping.id);
    return true;
  }

  private parseDueDate(rawDate?: string): Date | null {
    if (!rawDate) return null;
    const trimmed = rawDate.trim();
    if (!trimmed || trimmed.includes('undefined')) return null;

    const mmddyyyy = /^(\d{2})-(\d{2})-(\d{4})$/;
    const match = trimmed.match(mmddyyyy);
    if (match) {
      const month = Number(match[1]);
      const day = Number(match[2]);
      const year = Number(match[3]);
      const parsed = new Date(year, month - 1, day);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(trimmed)) return null;
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
}
