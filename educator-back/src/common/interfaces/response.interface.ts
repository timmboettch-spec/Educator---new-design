import { HttpStatus } from '@nestjs/common';

/** Per-field validation failures, keyed by field name with the translated message as the value. */
export type IValidationErrorDetail = Record<string, string>;

/**
 * One class-validator constraint failure, paired with the DTO property path it
 * came from (dotted for nested objects, e.g. `address.city`). Produced by
 * `createValidationPipe`'s `exceptionFactory` so `HttpExceptionFilter` can key
 * the `error` object by real field name even for DTOs whose messages are plain
 * strings rather than `key|argsJSON` i18n keys.
 */
export interface IValidationMessageDetail {
  field: string;
  message: string;
}

/** One record's outcome in a bulk operation; `message`, when set, is an i18n key until the edge. */
export interface IBulkOperationResultItem {
  message?: string;
}

/** `error` body of a refused all-or-nothing bulk operation — every record's outcome, not just the failures. */
export interface IBulkOperationErrorDetail<T extends IBulkOperationResultItem = IBulkOperationResultItem> {
  total: number;
  failed: number;
  results: T[];
}

export interface IResponse<T, M extends object = object> {
  message?: string;
  data?: T;
  /** Sibling of `data`, not nested inside it — e.g. pagination info for a list endpoint. */
  meta?: M;
  statusCode?: HttpStatus;
}

export interface IApiResponseBody<T, M extends object = object> {
  message: string;
  data: T | null;
  meta: M | null;
  /**
   * A simple message string for any non-validation error; a field-keyed object for a validation
   * error; per-record outcomes for a refused bulk operation; null on success.
   */
  error: string | IValidationErrorDetail | IBulkOperationErrorDetail | null;
}

