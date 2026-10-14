import { Inject, Injectable } from '@nestjs/common';
import { LmsSchoolConfig } from 'src/database/entities';
import {
  LMS_ASSIGNMENT_MAPPING_REPOSITORY,
  LMS_CLASS_MAPPING_REPOSITORY,
  LMS_GRADE_SYNC_LOG_REPOSITORY,
  LMS_STUDENT_MAPPING_REPOSITORY,
  SIMULATION_REPORT_REPOSITORY,
} from 'src/database/tokens';
import {
  LmsAssignmentMappingRepository,
  LmsClassMappingRepository,
  LmsGradeSyncLogRepository,
  LmsStudentMappingRepository,
  SimulationReportRepository,
} from 'src/database/repositories';
import { ClassesService } from 'src/class/classes.service';
import { LoggerService } from 'src/common/services';
import {
  extractAgsEndpoint,
  extractResourceLinkId,
  getLineItemUrl,
} from 'src/lms/utils/lti-ags.util';
import { extractLaunchCourseContext } from '../lti-launch-context.util';
import { extractForUserId, normalizeLineItemUrl } from '../utils/lti-submission-review.util';

export type SubmissionReviewFailureReason =
  | 'educators_only'
  | 'missing_for_user'
  | 'course_not_linked'
  | 'assignment_not_mapped'
  | 'student_not_mapped'
  | 'educator_unauthorized'
  | 'report_not_available'
  | 'school_mismatch';

export type SubmissionReviewResolveResult =
  | {
    ok: true;
    schoolId: string;
    classId: string;
    simulationId: string;
    studentCode: string;
    reportId: string;
    mappingId: string;
  }
  | {
    ok: false;
    reason: SubmissionReviewFailureReason;
    schoolId?: string | null;
    classId?: string | null;
    mappingId?: string | null;
  };

@Injectable()
export class LtiSubmissionReviewService {
  constructor(
    @Inject(LMS_CLASS_MAPPING_REPOSITORY)
    private readonly classMappingRepo: LmsClassMappingRepository,
    @Inject(LMS_ASSIGNMENT_MAPPING_REPOSITORY)
    private readonly assignmentMappingRepo: LmsAssignmentMappingRepository,
    @Inject(LMS_STUDENT_MAPPING_REPOSITORY)
    private readonly studentMappingRepo: LmsStudentMappingRepository,
    @Inject(LMS_GRADE_SYNC_LOG_REPOSITORY)
    private readonly gradeSyncLogRepo: LmsGradeSyncLogRepository,
    private readonly classesService: ClassesService,
    @Inject(SIMULATION_REPORT_REPOSITORY)
    private readonly simulationReportRepo: SimulationReportRepository,
    private readonly logger: LoggerService,
  ) { }

  /**
   * Authorize a verified submission-review launch and locate the student report.
   * Uses only verified claims + mapping tables — never query-string IDs.
   */
  async resolveReviewLaunch(args: {
    payload: Record<string, unknown>;
    lmsConfig: LmsSchoolConfig;
    educatorId: string;
    educatorSchoolIds: string[];
  }): Promise<SubmissionReviewResolveResult> {
    const { payload, lmsConfig, educatorId, educatorSchoolIds } = args;
    const schoolId = lmsConfig.schoolId?.trim() || null;

    if (!schoolId || !educatorSchoolIds.includes(schoolId)) {
      return { ok: false, reason: 'school_mismatch', schoolId };
    }

    const forUserId = extractForUserId(payload);
    if (!forUserId) {
      return { ok: false, reason: 'missing_for_user', schoolId };
    }

    const courseContext = extractLaunchCourseContext(payload);
    const lmsCourseId = courseContext.courseId?.trim();
    if (!lmsCourseId) {
      return { ok: false, reason: 'course_not_linked', schoolId };
    }

    const classMapping = await this.classMappingRepo.findOne({
      where: { lmsCourseId: String(lmsCourseId), schoolId },
    });
    if (!classMapping?.classId) {
      this.logger.warn(
        `[SubmissionReview] No class mapping for course=${lmsCourseId} school=${schoolId}`,
      );
      return { ok: false, reason: 'course_not_linked', schoolId };
    }

    const classId = classMapping.classId;
    const canAccess = await this.classesService.canEducatorAccessClass(classId, educatorId);
    if (!canAccess) {
      this.logger.warn(
        `[SubmissionReview] Educator ${educatorId} not authorized for class=${classId}`,
      );
      return { ok: false, reason: 'educator_unauthorized', schoolId, classId };
    }

    const agsEndpoint = extractAgsEndpoint(payload);
    const lineItemUrl = getLineItemUrl(agsEndpoint);
    const resourceLinkId = extractResourceLinkId(payload);

    const assignmentMapping = await this.findAssignmentMapping({
      classId,
      schoolId,
      lineItemUrl,
      resourceLinkId,
    });

    if (!assignmentMapping?.simulationId) {
      this.logger.warn(
        `[SubmissionReview] No assignment mapping for class=${classId} lineItem=${lineItemUrl ?? '(none)'} resourceLink=${resourceLinkId ?? '(none)'}`,
      );
      return {
        ok: false,
        reason: 'assignment_not_mapped',
        schoolId,
        classId,
        mappingId: assignmentMapping?.id ?? null,
      };
    }

    const studentMapping = await this.studentMappingRepo.findOne({
      where: { classId, lmsUserId: forUserId, schoolId },
    });
    if (!studentMapping?.studentCode) {
      this.logger.warn(
        `[SubmissionReview] No student mapping for class=${classId} lmsUserId=(redacted)`,
      );
      return {
        ok: false,
        reason: 'student_not_mapped',
        schoolId,
        classId,
        mappingId: assignmentMapping.id,
      };
    }

    const reportId =
      (await this.findReportIdViaGradeSyncLog(
        assignmentMapping.id,
        forUserId,
        studentMapping.studentCode,
        assignmentMapping.simulationId,
      )) ??
      (await this.simulationReportRepo.findLatestReportIdByStudentCodeAndScenario(
        studentMapping.studentCode,
        assignmentMapping.simulationId,
      ));

    if (!reportId) {
      return {
        ok: false,
        reason: 'report_not_available',
        schoolId,
        classId,
        mappingId: assignmentMapping.id,
      };
    }

    this.logger.log(
      `[SubmissionReview] Resolved review school=${schoolId} class=${classId} mapping=${assignmentMapping.id} simulation=${assignmentMapping.simulationId} outcome=ok`,
    );

    return {
      ok: true,
      schoolId,
      classId,
      simulationId: assignmentMapping.simulationId,
      studentCode: studentMapping.studentCode,
      reportId,
      mappingId: assignmentMapping.id,
    };
  }

  /** Public review launch URL embedded in Canvas AGS score extensions (not a bare report URL). */
  buildReviewLaunchUrl(apiPublicBaseUrl: string): string {
    const base = apiPublicBaseUrl.replace(/\/$/, '');
    return `${base}/api/lti/launch`;
  }

  private async findAssignmentMapping(args: {
    classId: string;
    schoolId: string;
    lineItemUrl: string | null;
    resourceLinkId: string | null;
  }) {
    const { classId, schoolId, lineItemUrl, resourceLinkId } = args;

    if (resourceLinkId) {
      const byResource = await this.assignmentMappingRepo.findOne({
        where: { classId, lmsResourceLinkId: resourceLinkId },
      });
      if (byResource) {
        return byResource;
      }
    }

    if (lineItemUrl) {
      const normalizedTarget = normalizeLineItemUrl(lineItemUrl);
      const candidates = await this.assignmentMappingRepo.find({
        where: { classId, schoolId },
      });
      const byLineItem = candidates.find(
        (row) => normalizeLineItemUrl(row.lmsLineItemUrl) === normalizedTarget,
      );
      if (byLineItem) {
        return byLineItem;
      }

      // Collection URL vs item URL: match by prefix when LMS sends the specific item.
      const byPrefix = candidates.find((row) => {
        const stored = normalizeLineItemUrl(row.lmsLineItemUrl);
        return (
          normalizedTarget.startsWith(stored) ||
          stored.startsWith(normalizedTarget) ||
          normalizedTarget.includes(stored) ||
          stored.includes(normalizedTarget)
        );
      });
      if (byPrefix) {
        return byPrefix;
      }
    }

    return null;
  }

  /** Prefer the report the grade-sync log recorded, when it still belongs to this student/simulation. */
  private async findReportIdViaGradeSyncLog(
    mappingId: string,
    lmsUserId: string,
    studentCode: string,
    simulationId: string,
  ): Promise<string | null> {
    const sync = await this.gradeSyncLogRepo.findLatestSentForMappingAndLmsUser(
      mappingId,
      lmsUserId,
    );
    const storedReportId = sync?.reportBlobId?.trim();
    if (!sync || !storedReportId) {
      return null;
    }

    const verified = await this.simulationReportRepo.isReportOfStudentCodeAndScenario(
      storedReportId,
      studentCode,
      simulationId.trim(),
    );
    if (!verified) {
      return null;
    }
    this.logger.log(
      `[SubmissionReview] Resolved report from grade-sync log ${sync.id} reportId=${storedReportId}`,
    );
    return storedReportId;
  }
}
