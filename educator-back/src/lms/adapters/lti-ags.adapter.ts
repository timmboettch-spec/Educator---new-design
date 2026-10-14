import { Injectable } from '@nestjs/common';
import { LmsSchoolConfig } from 'src/database/entities';
import { OutboundIntegration } from '../../common/constants';
import { LoggerService, OutboundHttpClient } from '../../common/services';
import { buildAgsScoreUrl } from '../utils/lms-url.util';

const CANVAS_SUBMISSION_CLAIM = 'https://canvas.instructure.com/lti/submission';

export type SendGradeOptions = {
  canvasSubmissionLaunchUrl?: string;
};

/**
 * IMS LTI Assignment & Grade Services 2.0 score submission.
 * Shared across LTI LMS platforms — Moodle, Canvas, etc.
 */
@Injectable()
export class LtiAgsAdapter {
  constructor(
    private readonly logger: LoggerService,
    private readonly outboundHttp: OutboundHttpClient,
  ) {}

  async sendGrade(
    _config: LmsSchoolConfig,
    lineItemUrl: string,
    userId: string,
    scoreGiven: number,
    accessToken: string,
    scoreMaximum = 100,
    options?: SendGradeOptions,
  ): Promise<void> {
    const scorePayload: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      scoreGiven,
      scoreMaximum,
      activityProgress: 'Completed',
      gradingProgress: 'FullyGraded',
      userId,
    };

    const launchUrl = options?.canvasSubmissionLaunchUrl?.trim();
    if (launchUrl) {
      scorePayload[CANVAS_SUBMISSION_CLAIM] = {
        new_submission: true,
        submission_type: 'basic_lti_launch',
        submission_data: launchUrl,
      };
    }

    const scoreUrl = buildAgsScoreUrl(lineItemUrl);

    // Not retried on timeout: the score POST is non-idempotent and may already have landed (ADR-0011).
    const response = await this.outboundHttp.fetch(OutboundIntegration.Lms, scoreUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/vnd.ims.lis.v1.score+json',
      },
      body: JSON.stringify(scorePayload),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`LTI AGS score POST failed (${response.status}): ${body}`);
    }

    this.logger.log(
      `[LtiAgsAdapter] AGS score ${scoreGiven}/${scoreMaximum} sent for user ${userId} to ${lineItemUrl}` +
        (launchUrl ? ' (with Canvas LTI submission launch)' : ''),
    );
  }
}
