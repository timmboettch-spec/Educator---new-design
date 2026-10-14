import { LoggerService } from 'src/common/services';
import { throwAppError } from 'src/common/utils/app-error';
import { ErrorTypes, Messages } from 'src/common/utils/messages';

/**
 * Run one Redis operation for the LTI handoff.
 *
 * A Redis outage is infrastructure, not a bad request: without this the failure
 * surfaces as a 500 on login, or — worse — as the 400 "invalid or expired code"
 * on exchange, which reads to the caller as a fine launch that simply timed out.
 */
export async function runLtiStorageOp<T>(
  logger: LoggerService,
  operation: string,
  op: () => Promise<T>,
): Promise<T> {
  try {
    return await op();
  } catch (err) {
    logger.error(
      `[LTI Storage] ${operation} failed: ${err instanceof Error ? err.message : 'unknown error'}`,
    );
    throwAppError(Messages.LTI_STORAGE_UNAVAILABLE, ErrorTypes.SERVICE_UNAVAILABLE);
  }
}
