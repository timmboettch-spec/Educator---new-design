import { Injectable, Logger } from '@nestjs/common';
import { LmsType } from 'src/common/enums/lms.enum';
import { LmsAdapter } from '../interfaces/lms.interfaces';
import { MoodleAdapter } from '../adapters/moodle.adapter';

/**
 * Factory for creating LMS adapters based on platform type.
 * Returns the appropriate adapter implementation for Moodle, Canvas, Blackboard, etc.
 */
@Injectable()
export class LmsAdapterFactory {
  private readonly logger = new Logger(LmsAdapterFactory.name);

  constructor(
    private readonly moodleAdapter: MoodleAdapter,
    // Canvas and Blackboard adapters will be injected here
    // private readonly canvasAdapter: CanvasAdapter,
    // private readonly blackboardAdapter: BlackboardAdapter,
  ) {}

  /**
   * Get the appropriate adapter for the given LMS type
   * @param lmsType - The LMS platform type (moodle, canvas, blackboard)
   * @returns The adapter implementation for that platform
   * @throws Error if the LMS type is not supported
   */
  getAdapter(lmsType: LmsType): LmsAdapter {
    this.logger.log(`Getting adapter for LMS type: ${lmsType}`);

    switch (lmsType) {
      case LmsType.MOODLE:
        return this.moodleAdapter;

      case LmsType.CANVAS:
        // return this.canvasAdapter;
        throw new Error('Canvas adapter not yet implemented');

      case LmsType.BLACKBOARD:
        // return this.blackboardAdapter;
        throw new Error('Blackboard adapter not yet implemented');

      default: {
        const unsupportedType = lmsType as string;
        this.logger.error(`Unsupported LMS type: ${unsupportedType}`);
        throw new Error(`Unsupported LMS type: ${unsupportedType}`);
      }
    }
  }
}
