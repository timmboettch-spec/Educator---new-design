import { HttpStatus } from '@nestjs/common';
import { IBulkOperationErrorDetail, IValidationErrorDetail } from './response.interface';

/** The subset of a `pg` driver error `HttpExceptionFilter` reads off a TypeORM `QueryFailedError`. */
export interface IPostgresDriverError {
  code?: string;
  table?: string;
  constraint?: string;
}

/** A thrown exception resolved into the pieces of the `{ message, data, meta, error }` envelope. */
export interface IResolvedError {
  status: HttpStatus;
  message: string;
  error: string | IValidationErrorDetail | IBulkOperationErrorDetail | null;
}

/** The shape a throttler rejection may carry on its exception response body. */
export interface IRateLimitExceptionBody {
  message?: string;
  retryAfter?: number;
  timestamp?: string;
}
