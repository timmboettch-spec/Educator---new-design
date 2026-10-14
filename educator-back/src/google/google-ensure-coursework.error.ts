import { UnauthorizedException } from '@nestjs/common';

/**
 * Raised when auto-creating Classroom CourseWork during grade passback fails.
 * `retriable` distinguishes auth/config failures from transient API errors.
 */
export class GoogleEnsureCourseworkError extends Error {
  readonly code = 'ensure_coursework_failed' as const;
  readonly retriable: boolean;

  constructor(
    message: string,
    options?: { retriable?: boolean; cause?: unknown },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'GoogleEnsureCourseworkError';
    this.retriable = options?.retriable ?? true;
  }

  static fromUnknown(err: unknown): GoogleEnsureCourseworkError {
    if (err instanceof GoogleEnsureCourseworkError) {
      return err;
    }
    if (err instanceof UnauthorizedException) {
      return new GoogleEnsureCourseworkError(
        err.message || 'ensure_coursework_failed',
        { retriable: false, cause: err },
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    return new GoogleEnsureCourseworkError(message || 'ensure_coursework_failed', {
      retriable: true,
      cause: err,
    });
  }
}
