import { Injectable, Logger } from '@nestjs/common';
import { LmsAdapterFactory } from '../factories/lms-adapter.factory';
import { LmsConfigService } from './lms-config.service';
import { LmsAuthService } from './lms-auth.service';
import { LmsToolType } from 'src/common/enums/lms.enum';

/**
 * Shared service for LMS grade passback (Assignment & Grade Services).
 * Delegates to platform-specific adapters for actual grade submission.
 *
 */
@Injectable()
export class LmsGradeService {
  private readonly logger = new Logger(LmsGradeService.name);

  constructor(
    private readonly lmsAdapterFactory: LmsAdapterFactory,
    private readonly lmsConfigService: LmsConfigService,
    private readonly lmsAuthService: LmsAuthService,
  ) {}

  /**
   * Send a grade to the LMS gradebook (AGS)
   * @param schoolId - School ID
   * @param lineItemUrl - AGS lineitem URL from LTI launch
   * @param lmsUserId - LMS user ID (student)
   * @param score - Score to send (0-100)
   * @param toolType - Educator or student tool
   * @throws Error if grade passback is not supported for this LMS
   */
  async sendGrade(
    schoolId: string,
    lineItemUrl: string,
    lmsUserId: string,
    score: number,
    toolType: LmsToolType = LmsToolType.EDUCATOR,
  ): Promise<void> {
    const config = await this.lmsConfigService.getBySchoolId(schoolId, toolType);
    const accessToken = await this.lmsAuthService.getAccessToken(config);
    const adapter = this.lmsAdapterFactory.getAdapter(config.lmsType);

    if (!adapter.sendGrade) {
      this.logger.warn(`Grade passback not implemented for ${config.lmsType}`);
      throw new Error(`Grade passback not supported for ${config.lmsType}`);
    }

    await adapter.sendGrade(config, lineItemUrl, lmsUserId, score, accessToken);
    this.logger.log(
      `Sent grade ${score} for user ${lmsUserId} to ${config.lmsType} (lineItem: ${lineItemUrl})`,
    );
  }

  /**
   * TODO: Add batch grade submission
   * TODO: Add grade retrieval (read from LMS)
   * TODO: Add lineitem management (create/update/delete gradebook columns)
   */
}
