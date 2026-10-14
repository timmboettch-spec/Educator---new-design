import { Injectable } from '@nestjs/common';
import { LmsType } from 'src/common/enums/lms.enum';
import { LmsAdapter } from '../interfaces/lms.interfaces';
import { CanvasAdapter } from '../adapters/canvas.adapter';
import { LtiAgsAdapter } from '../adapters/lti-ags.adapter';
import { MoodleAdapter } from '../adapters/moodle.adapter';
import { LoggerService } from '../../common/services';

/**
 * Factory for creating LMS adapters based on platform type.
 * Returns the appropriate adapter implementation for Moodle, Canvas, etc.
 */
@Injectable()
export class LmsAdapterFactory {
  constructor(
    private readonly moodleAdapter: MoodleAdapter,
    private readonly canvasAdapter: CanvasAdapter,
    private readonly ltiAgsAdapter: LtiAgsAdapter,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Default adapter for platform-agnostic LTI flows (e.g. NRPS) when school config is unavailable.
   */
  getDefaultAdapter(): LmsAdapter {
    return this.moodleAdapter;
  }

  /**
   * Get the appropriate adapter for the given LMS type
   * @param lmsType - The LMS platform type (moodle, canvas, google_classroom)
   * @returns The adapter implementation for that platform
   * @throws Error if the LMS type is not supported
   */
  /** Returns null instead of throwing when the LMS type has no adapter yet. */
  tryGetAdapter(lmsType: LmsType): LmsAdapter | null {
    try {
      return this.getAdapter(lmsType);
    } catch {
      return null;
    }
  }

  /**
   * Platform-agnostic AGS adapter for grade passback.
   * Shared across LTI platforms (Moodle, Canvas).
   */
  getGradePassbackAdapter(lmsType: LmsType): LtiAgsAdapter {
    switch (lmsType) {
      case LmsType.MOODLE:
      case LmsType.CANVAS:
        return this.ltiAgsAdapter;

      default: {
        const unsupportedType = lmsType as string;
        throw new Error(`Grade passback not supported for ${unsupportedType}`);
      }
    }
  }

  getAdapter(lmsType: LmsType): LmsAdapter {
    this.logger.log(`Getting adapter for LMS type: ${lmsType}`);

    switch (lmsType) {
      case LmsType.MOODLE:
        return this.moodleAdapter;

      case LmsType.CANVAS:
        return this.canvasAdapter;

      default: {
        const unsupportedType = lmsType as string;
        this.logger.error(`Unsupported LMS type: ${unsupportedType}`);
        throw new Error(`Unsupported LMS type: ${unsupportedType}`);
      }
    }
  }
}
