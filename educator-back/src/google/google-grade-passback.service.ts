import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { LoggerService } from 'src/common/services';
import { Schools, Student } from 'src/database/entities';
import {
  CLASS_REPOSITORY,
  GOOGLE_COURSE_MAPPING_REPOSITORY,
  GOOGLE_COURSEWORK_MAPPING_REPOSITORY,
  GOOGLE_GRADE_SYNC_LOG_REPOSITORY,
  GOOGLE_STUDENT_MAPPING_REPOSITORY,
} from 'src/database/tokens';
import {
  ClassRepository,
  GoogleCourseMappingRepository,
  GoogleCourseworkMappingRepository,
  GoogleGradeSyncLogRepository,
  GoogleStudentMappingRepository,
} from 'src/database/repositories';
import { GoogleClassroomService } from './google-classroom.service';
import { GoogleConnectionService } from './google-connection.service';
import { GoogleCourseworkService } from './google-coursework.service';
import { GoogleEnsureCourseworkError } from './google-ensure-coursework.error';
import { GoogleConstants } from './google.constants';

export type GoogleSubmitScoreResult = {
  success: boolean;
  syncLogId: string | null;
  skipped?: boolean;
  error?: string;
  /** Present when error is typed (e.g. ensure_coursework_failed). */
  retriable?: boolean;
};

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    typeof error.driverError === 'object' &&
    error.driverError !== null &&
    (error.driverError as { code?: string }).code === '23505'
  );
}

/**
 * Submits the best Assessment score to a linked Google Classroom CourseWork
 * using the school educator OAuth token (same trigger as LTI AGS passback).
 */
@Injectable()
export class GoogleGradePassbackService {
  constructor(
    @Inject(GOOGLE_COURSE_MAPPING_REPOSITORY)
    private readonly courseMappingRepo: GoogleCourseMappingRepository,
    @Inject(GOOGLE_COURSEWORK_MAPPING_REPOSITORY)
    private readonly courseworkMappingRepo: GoogleCourseworkMappingRepository,
    @Inject(GOOGLE_STUDENT_MAPPING_REPOSITORY)
    private readonly studentMappingRepo: GoogleStudentMappingRepository,
    @Inject(GOOGLE_GRADE_SYNC_LOG_REPOSITORY)
    private readonly gradeSyncLogRepo: GoogleGradeSyncLogRepository,
    @Inject(CLASS_REPOSITORY)
    private readonly classRepo: ClassRepository,
    private readonly classroomService: GoogleClassroomService,
    private readonly connectionService: GoogleConnectionService,
    private readonly courseworkService: GoogleCourseworkService,
    private readonly dataSource: DataSource,
    private readonly logger: LoggerService,
  ) {}

  async getLastSuccessfulScore(
    courseworkMappingId: string,
    studentId: string,
  ): Promise<number | null> {
    return this.gradeSyncLogRepo.findLastSuccessfulScore(courseworkMappingId, studentId);
  }

  async submitScore(params: {
    studentId: string;
    scenarioId: string;
    scoreGiven: number;
    scoreMaximum?: number;
  }): Promise<GoogleSubmitScoreResult> {
    const studentId = params.studentId.trim();
    const scenarioId = params.scenarioId.trim();
    const scoreMaximum = params.scoreMaximum ?? 100;
    const overallScore = Number(params.scoreGiven);

    if (!studentId || !scenarioId || !Number.isFinite(overallScore)) {
      return { success: false, syncLogId: null, skipped: true, error: 'invalid_params' };
    }

    const student = await this.dataSource.getRepository(Student).findOne({
      where: { id: studentId },
      relations: ['class'],
    });
    const classId = student?.class?.id;
    if (!classId) {
      this.logger.warn(`[Google Grade Passback] Student ${studentId} has no class; skipping`);
      return { success: false, syncLogId: null, skipped: true, error: 'no_class' };
    }

    const courseMap = await this.courseMappingRepo.findByClassId(classId);
    if (!courseMap) {
      this.logger.log(
        `[Google Grade Passback] No linked Google course for class=${classId}; skipping`,
      );
      return { success: false, syncLogId: null, skipped: true, error: 'no_course_link' };
    }

    // Same school flag as HTTP GC routes — do not call Classroom when disabled.
    const school = await this.dataSource.manager.findOne(Schools, {
      where: { id: courseMap.schoolId },
    });
    if (!school || school.google_classroom_enabled !== true) {
      this.logger.warn(
        `[Google Grade Passback] Google Classroom disabled or school missing (${courseMap.schoolId}); skipping`,
      );
      return { success: false, syncLogId: null, skipped: true, error: 'feature_disabled' };
    }

    const studentCode = student?.student_id?.trim();
    const studentMapping =
      (await this.studentMappingRepo.findByClassAndStudentId(classId, studentId)) ||
      (studentCode
        ? await this.studentMappingRepo.findByClassAndStudentCode(classId, studentCode)
        : null);
    if (!studentMapping?.googleUserId) {
      this.logger.warn(
        `[Google Grade Passback] No Google roster mapping for student=${studentId} class=${classId}; skipping`,
      );
      return { success: false, syncLogId: null, skipped: true, error: 'no_student_mapping' };
    }

    let courseworkMapping = await this.courseworkMappingRepo.findByClassAndSimulation(
      classId,
      scenarioId,
    );
    if (!courseworkMapping) {
      // Course linked but CourseWork missing — create on first completion.
      // classSimulationId is null here only for this auto-create path; assign/sync pass a real id.
      try {
        courseworkMapping = await this.courseworkService.ensureCourseWorkForAssignment({
          classId,
          schoolId: courseMap.schoolId,
          classSimulationId: null,
          simulationId: scenarioId,
          title: scenarioId,
        });
      } catch (err) {
        const wrapped = GoogleEnsureCourseworkError.fromUnknown(err);
        this.logger.error(
          `[Google Grade Passback] ensureCourseWork failed class=${classId} sim=${scenarioId} retriable=${wrapped.retriable}: ${wrapped.message}`,
        );
        return {
          success: false,
          syncLogId: null,
          error: wrapped.code,
          retriable: wrapped.retriable,
        };
      }
    }

    if (!courseworkMapping?.googleCourseworkId) {
      this.logger.warn(
        `[Google Grade Passback] No coursework mapping for class=${classId} sim=${scenarioId}; skipping`,
      );
      return { success: false, syncLogId: null, skipped: true, error: 'no_coursework' };
    }

    const lastSuccessfulScore = await this.getLastSuccessfulScore(courseworkMapping.id, studentId);
    const scoreToSend =
      lastSuccessfulScore === null ? overallScore : Math.max(overallScore, lastSuccessfulScore);

    if (lastSuccessfulScore !== null && scoreToSend <= lastSuccessfulScore) {
      this.logger.log(
        `[Google Grade Passback] Skipping — score ${scoreToSend} <= last successful ${lastSuccessfulScore} for student ${studentId}`,
      );
      return { success: true, syncLogId: null, skipped: true };
    }

    const logEntry = this.gradeSyncLogRepo.create({
      courseworkMappingId: courseworkMapping.id,
      studentId,
      googleUserId: studentMapping.googleUserId,
      scoreGiven: scoreToSend,
      scoreMaximum,
      status: 'pending',
      attemptedAt: new Date(),
    });
    try {
      await this.gradeSyncLogRepo.save(logEntry);
    } catch (err) {
      // Partial unique index on (coursework, student) WHERE status='pending'.
      if (isUniqueViolation(err)) {
        this.logger.warn(
          `[Google Grade Passback] Concurrent pending sync for student=${studentId} coursework=${courseworkMapping.id}; skipping duplicate`,
        );
        return {
          success: true,
          syncLogId: null,
          skipped: true,
          error: 'concurrent_pending',
        };
      }
      throw err;
    }

    try {
      const classRow = await this.classRepo.findOne({
        where: { id: classId },
        select: { id: true, educator_id: true },
      });
      const ownerEducatorId = classRow?.educator_id?.trim() || null;
      if (!ownerEducatorId) {
        throw new Error('Class owner missing for Google Classroom token');
      }
      const accessToken = await this.connectionService.getValidAccessToken(
        courseworkMapping.schoolId,
        ownerEducatorId,
      );

      const submissions = await this.classroomService.listStudentSubmissions(
        accessToken,
        courseworkMapping.googleCourseId,
        courseworkMapping.googleCourseworkId,
        studentMapping.googleUserId,
      );
      const submission = submissions[0];
      if (!submission?.id) {
        throw new Error(GoogleConstants.MESSAGES.GRADE_SUBMISSION_NOT_FOUND);
      }

      await this.classroomService.patchStudentSubmission(
        accessToken,
        courseworkMapping.googleCourseId,
        courseworkMapping.googleCourseworkId,
        submission.id,
        { assignedGrade: scoreToSend, draftGrade: scoreToSend },
      );

      await this.classroomService.returnStudentSubmission(
        accessToken,
        courseworkMapping.googleCourseId,
        courseworkMapping.googleCourseworkId,
        submission.id,
      );

      await this.gradeSyncLogRepo.update(logEntry.id, {
        status: 'sent',
        completedAt: new Date(),
        errorMessage: null,
      });

      this.logger.log(
        `[Google Grade Passback] Submitted score ${scoreToSend} for student ${studentId} (syncLogId=${logEntry.id})`,
      );
      return { success: true, syncLogId: logEntry.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (err instanceof UnauthorizedException) {
        const classRow = await this.classRepo.findOne({
          where: { id: classId },
          select: { id: true, educator_id: true },
        });
        const ownerEducatorId = classRow?.educator_id?.trim();
        if (ownerEducatorId) {
          await this.connectionService.markConnectionNeedsReauth(
            courseworkMapping.schoolId,
            ownerEducatorId,
          );
        }
      }
      await this.gradeSyncLogRepo.update(logEntry.id, {
        status: 'failed',
        completedAt: new Date(),
        errorMessage: message.slice(0, 2000),
      });
      this.logger.error(
        `[Google Grade Passback] Failed for student=${studentId} sim=${scenarioId}: ${message}`,
      );
      return { success: false, syncLogId: logEntry.id, error: message };
    }
  }
}
