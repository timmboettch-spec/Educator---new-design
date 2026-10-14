import { ClsService } from 'nestjs-cls';
import { Logger } from '@nestjs/common';

const ABORT_CONTROLLER_KEY = 'abortController';

export class AbortSignalUtil {
  private static readonly logger = new Logger(AbortSignalUtil.name);

  static storeAbortController(cls: ClsService, controller: AbortController): void {
    try {
      cls.set(ABORT_CONTROLLER_KEY, controller);
    } catch (error) {
      this.logger.debug(
        `Failed to store AbortController in cls context: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  static getAbortSignal(cls: ClsService): AbortSignal | undefined {
    try {
      const controller = cls.get<AbortController>(ABORT_CONTROLLER_KEY);
      return controller?.signal;
    } catch (error) {
      return undefined;
    }
  }

  static isAborted(cls: ClsService): boolean {
    return this.getAbortSignal(cls)?.aborted ?? false;
  }

  static combineAbortSignals(...signals: (AbortSignal | undefined)[]): AbortSignal | undefined {
    const validSignals = signals.filter((s): s is AbortSignal => s !== undefined);

    if (validSignals.length === 0) {
      return undefined;
    }

    if (validSignals.length === 1) {
      return validSignals[0];
    }

    return AbortSignal.any(validSignals);
  }

  static getAbortReason(signal: AbortSignal | undefined): string {
    if (!signal?.aborted) {
      return '';
    }

    if (signal.reason instanceof Error) {
      return signal.reason.message;
    }

    return String(signal.reason) || 'Operation aborted';
  }
}
