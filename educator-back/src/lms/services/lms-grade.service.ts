import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { LmsAdapterFactory } from '../factories/lms-adapter.factory';
import { LmsConfigService } from './lms-config.service';
import { LmsAuthService } from './lms-auth.service';
import { LmsToolType, LmsType } from 'src/common/enums/lms.enum';
import {
  LMS_ASSIGNMENT_MAPPING_REPOSITORY,
  LMS_GRADE_SYNC_LOG_REPOSITORY,
} from 'src/database/tokens';
import {
  LmsAssignmentMappingRepository,
  LmsGradeSyncLogRepository,
} from 'src/database/repositories';
import { LmsGradeSyncLog } from 'src/database/entities';
import { assertLineItemUrlAllowed } from '../utils/lms-url.util';
import { isLineItemsCollectionUrl } from '../utils/lti-ags.util';
import { resolveLineItemUrlForScore } from '../utils/ags-line-item.util';
import { OutboundIntegration } from '../../common/constants';
import { LoggerService, OutboundHttpClient } from '../../common/services';
import { buildCanvasSubmissionLaunchUrl } from 'src/lti/utils/canvas-review-token.util';

export type SubmitScoreResult = {
  success: boolean;
  syncLogId: string;
  error?: string;
};

/** Shared service for LMS grade passback (Assignment & Grade Services). */
@Injectable()
export class LmsGradeService {
  constructor(
    private readonly lmsAdapterFactory: LmsAdapterFactory,
    private readonly lmsConfigService: LmsConfigService,
    private readonly lmsAuthService: LmsAuthService,
    @Inject(LMS_GRADE_SYNC_LOG_REPOSITORY)
    private readonly gradeSyncLogRepo: LmsGradeSyncLogRepository,
    @Inject(LMS_ASSIGNMENT_MAPPING_REPOSITORY)
    private readonly assignmentMappingRepo: LmsAssignmentMappingRepository,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
    private readonly outboundHttp: OutboundHttpClient,
  ) { }

  /** Last successfully posted score for this mapping/student, if any. */
  async getLastSuccessfulScore(mappingId: string, studentId: string): Promise<number | null> {
    return this.gradeSyncLogRepo.findLastSuccessfulScore(mappingId, studentId);
  }

  async findLatestSyncLogs(mappingIds: string[]): Promise<LmsGradeSyncLog[]> {
    return this.gradeSyncLogRepo.findLatestCompletedByMappingIds(mappingIds);
  }

  async submitScore(params: {
    mappingId: string;
    schoolId: string;
    lineItemUrl: string;
    lmsUserId: string;
    scoreGiven: number;
    scoreMaximum: number;
    studentId: string;
    lineItemLabel?: string | null;
    lmsResourceLinkId?: string | null;
    reportBlobId?: string | null;
    /** Portal student code — required for Canvas SpeedGrader report deep link. */
    studentCode?: string | null;
  }): Promise<SubmitScoreResult> {
    const {
      mappingId,
      schoolId,
      lineItemUrl,
      lmsUserId,
      scoreGiven,
      scoreMaximum,
      studentId,
      lineItemLabel,
      lmsResourceLinkId,
      reportBlobId,
      studentCode,
    } = params;

    const trimmedReportBlobId =
      typeof reportBlobId === 'string' && reportBlobId.trim() ? reportBlobId.trim() : null;

    const logEntry = this.gradeSyncLogRepo.create({
      mappingId,
      studentId,
      lmsUserId,
      scoreGiven,
      scoreMaximum,
      reportBlobId: trimmedReportBlobId,
      status: 'pending',
      attemptedAt: new Date(),
    });

    await this.gradeSyncLogRepo.save(logEntry);

    try {
      const mapping = await this.assignmentMappingRepo.findOne({
        where: { id: mappingId },
      });
      if (!mapping) {
        throw new Error(`Assignment mapping ${mappingId} not found`);
      }

      const config = await this.lmsConfigService.resolveOAuthConfigForClient(
        schoolId,
        mapping.lmsClientId,
        LmsToolType.STUDENT,
      );

      // Gate collection/direct URLs before resolveLineItemUrlForScore may fetch or POST to them.
      assertLineItemUrlAllowed(lineItemUrl, config);

      const lineItemAccessToken = isLineItemsCollectionUrl(lineItemUrl)
        ? await this.lmsAuthService.getAccessTokenForLineItems(config)
        : await this.lmsAuthService.getAccessTokenForGradePassback(config);

      const resolvedLineItemUrl = await resolveLineItemUrlForScore({
        lineItemUrl,
        accessToken: lineItemAccessToken,
        label: lineItemLabel ?? mapping.lmsLineItemLabel,
        resourceLinkId: lmsResourceLinkId ?? mapping.lmsResourceLinkId,
        scoreMaximum,
        fetchFn: (url, init) => this.outboundHttp.fetch(OutboundIntegration.Lms, url, init),
      });

      assertLineItemUrlAllowed(resolvedLineItemUrl, config);

      if (resolvedLineItemUrl !== mapping.lmsLineItemUrl) {
        mapping.lmsLineItemUrl = resolvedLineItemUrl;
        await this.assignmentMappingRepo.save(mapping);
      }

      const accessToken = await this.lmsAuthService.getAccessTokenForGradePassback(config);
      const agsAdapter = this.lmsAdapterFactory.getGradePassbackAdapter(config.lmsType);
      const canvasSubmissionLaunchUrl =
        config.lmsType === LmsType.CANVAS
          ? await this.resolveCanvasSubmissionLaunchUrl({
            classId: mapping.classId,
            simulationId: mapping.simulationId ?? '',
            studentCode: studentCode?.trim() || null,
            reportId: trimmedReportBlobId,
          })
          : undefined;
      await agsAdapter.sendGrade(
        config,
        resolvedLineItemUrl,
        lmsUserId,
        scoreGiven,
        accessToken,
        scoreMaximum,
        canvasSubmissionLaunchUrl
          ? { canvasSubmissionLaunchUrl }
          : undefined,
      );

      await this.gradeSyncLogRepo.update(logEntry.id, {
        status: 'sent',
        completedAt: new Date(),
      });

      this.logger.log(
        `[AGS] Sent grade ${scoreGiven}/${scoreMaximum} for user ${lmsUserId} to ${config.lmsType}`,
      );

      return { success: true, syncLogId: logEntry.id };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await this.gradeSyncLogRepo.update(logEntry.id, {
        status: 'failed',
        errorMessage,
        completedAt: new Date(),
      });

      this.logger.error(
        `[AGS] Failed to send grade for user ${lmsUserId}: ${errorMessage}`,
        err instanceof Error ? err.stack : undefined,
      );

      return { success: false, syncLogId: logEntry.id, error: errorMessage };
    }
  }

  /**
   * Canvas SpeedGrader opens this URL for the scored submission. Embed a signed
   * `rw_review` token so the educator handoff can deep-link to `/report-detail`
   * even when Canvas omits the LTI `for_user` claim.
   */
  private async resolveCanvasSubmissionLaunchUrl(args: {
    classId: string;
    simulationId: string;
    studentCode: string | null;
    reportId: string | null;
  }): Promise<string | undefined> {
    const apiBase =
      this.configService.get<string>('app.apiBaseUrl')?.trim() ||
      this.configService.get<string>('API_BASE_URL')?.trim() ||
      '';
    if (!apiBase) {
      this.logger.warn(
        '[AGS] Skipping Canvas submission launch extension — API_BASE_URL is not configured',
      );
      return undefined;
    }

    const secret =
      this.configService.get<string>('jwt.accessSecret')?.trim() ||
      this.configService.get<string>('JWT_SECRET')?.trim() ||
      '';
    const classId = args.classId?.trim() || '';
    const simulationId = (args.simulationId ?? '').trim();
    const studentCode = args.studentCode?.trim() || '';
    const reportId = args.reportId?.trim() || '';

    if (!secret || !classId || !simulationId || !studentCode || !reportId) {
      this.logger.warn(
        '[AGS] Canvas submission launch URL without rw_review — missing secret or report context ' +
        `(class=${Boolean(classId)} sim=${Boolean(simulationId)} studentCode=${Boolean(studentCode)} report=${Boolean(reportId)})`,
      );
      return `${apiBase.replace(/\/$/, '')}/api/lti/launch`;
    }

    try {
      return await buildCanvasSubmissionLaunchUrl({
        apiBaseUrl: apiBase,
        secret,
        claims: { classId, studentCode, simulationId, reportId },
      });
    } catch (err) {
      this.logger.warn(
        `[AGS] Failed to sign Canvas review token: ${err instanceof Error ? err.message : String(err)}`,
      );
      return `${apiBase.replace(/\/$/, '')}/api/lti/launch`;
    }
  }
}
