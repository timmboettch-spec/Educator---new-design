import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { QueryFailedError } from 'typeorm';
import { DbErrorConstants } from '../constants/db-error.constants';
import { RATE_LIMIT_FALLBACK_RETRY_AFTER_SECONDS } from '../constants/throttle.constants';
import {
  IPostgresDriverError,
  IRateLimitExceptionBody,
  IResolvedError,
} from '../interfaces/exception-filter.interface';
import {
  IApiResponseBody,
  IBulkOperationErrorDetail,
  IValidationErrorDetail,
} from '../interfaces/response.interface';
import { ERROR_MSG } from '../messages/error.message';
import { decodeI18nKey } from '../utils/i18n-key.util';
import { LoggerService } from '../services';
import { ValidationException } from '../exceptions/validation.exception';
import { BulkOperationException } from '../exceptions/bulk-operation.exception';

/**
 * The application's sole exception filter, registered globally as an `APP_FILTER` in
 * `AppModule` — covers every route in both the root app and `src/student-backend`.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly i18n: I18nService,
    private readonly logger: LoggerService,
  ) {}

  private translate(
    key: string,
    lang: string | undefined,
    args?: Record<string, string | number>,
  ): string {
    return this.i18n.t(key, { lang, args });
  }

  catch(exception: Error, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const lang = I18nContext.current()?.lang;

    if (exception instanceof ThrottlerException) {
      this.handleThrottlerException(exception, response, lang);
      return;
    }

    const { status, message, error } = this.resolve(exception, lang);

    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error({
        topic: 'HttpExceptionFilter',
        subTopic: 'catch',
        operation: 'unhandled-exception',
        refData: { method: request.method, url: request.url },
        error: exception,
      });
    }

    const body: IApiResponseBody<null> = { message, data: null, meta: null, error };
    response.status(status).json(body);
  }

  private resolve(exception: Error, lang: string | undefined): IResolvedError {
    if (exception instanceof QueryFailedError) {
      return this.resolveDbError(exception as QueryFailedError<Error>, lang);
    }

    if (exception instanceof ValidationException) {
      return this.resolveValidationError(exception, lang);
    }

    if (exception instanceof BulkOperationException) {
      return this.resolveBulkOperationError(exception as BulkOperationException, lang);
    }

    if (exception instanceof HttpException) {
      return this.resolveHttpException(exception, lang);
    }

    const message = this.translate(ERROR_MSG.SERVER.INTERNAL_SERVER, lang);
    return { status: HttpStatus.INTERNAL_SERVER_ERROR, message, error: null };
  }

  private resolveDbError(exception: QueryFailedError, lang: string | undefined): IResolvedError {
    const driverError = exception.driverError as IPostgresDriverError | undefined;
    const table = driverError?.table ?? 'Record';

    if (driverError?.code === DbErrorConstants.PG_UNIQUE_VIOLATION) {
      const { key, args } = decodeI18nKey(ERROR_MSG.DB.DUPLICATE_ENTRY(table));
      const message = this.translate(key, lang, args);
      return { status: HttpStatus.CONFLICT, message, error: null };
    }

    if (driverError?.code === DbErrorConstants.PG_FOREIGN_KEY_VIOLATION) {
      const { key, args } = decodeI18nKey(ERROR_MSG.DB.FK_CONSTRAINT);
      const message = this.translate(key, lang, args);
      return { status: HttpStatus.BAD_REQUEST, message, error: null };
    }

    if (driverError?.code === DbErrorConstants.PG_CHECK_VIOLATION) {
      const message = this.translate(ERROR_MSG.DB.INVALID_REQUEST, lang);
      return { status: HttpStatus.BAD_REQUEST, message, error: null };
    }

    const message = this.translate(ERROR_MSG.SERVER.INTERNAL_SERVER, lang);
    return { status: HttpStatus.INTERNAL_SERVER_ERROR, message, error: null };
  }

  /** Per-field constraint failures from `createValidationPipe` — `error` is a field-keyed object. */
  private resolveValidationError(
    exception: ValidationException,
    lang: string | undefined,
  ): IResolvedError {
    const error: IValidationErrorDetail = {};

    exception.details.forEach((detail, index) => {
      const { key, args } = decodeI18nKey(detail.message);
      // i18n-keyed messages name their own field; legacy plain-string messages
      // fall back to the DTO property the constraint failed on.
      const field =
        (typeof args?.key === 'string' ? args.key : undefined) ?? detail.field ?? `field_${index}`;
      error[field] = this.translate(key, lang, args);
    });

    return {
      status: HttpStatus.BAD_REQUEST,
      message: this.translate(ERROR_MSG.COMMON.VALIDATION_ERROR, lang),
      error,
    };
  }

  /** A refused all-or-nothing bulk operation — `error` carries every record's outcome, messages translated. */
  private resolveBulkOperationError(
    exception: BulkOperationException,
    lang: string | undefined,
  ): IResolvedError {
    const translateKey = (raw: string): string => {
      const { key, args } = decodeI18nKey(raw);
      return this.translate(key, lang, args);
    };

    const error: IBulkOperationErrorDetail = {
      ...exception.detail,
      results: exception.detail.results.map((result) =>
        result.message ? { ...result, message: translateKey(result.message) } : result,
      ),
    };

    return { status: exception.getStatus(), message: translateKey(exception.message), error };
  }

  /** Any other `HttpException` (business-rule errors included) — `error` is always null. */
  private resolveHttpException(exception: HttpException, lang: string | undefined): IResolvedError {
    const status = exception.getStatus();
    const response = exception.getResponse();
    const responseMessage =
      typeof response === 'object' && response !== null
        ? (response as { message?: unknown }).message
        : undefined;
    const rawMessage =
      typeof response === 'string'
        ? response
        : typeof responseMessage === 'string'
          ? responseMessage
          : exception.message;

    const { key, args } = decodeI18nKey(rawMessage);
    const message = this.translate(key, lang, args);

    return { status, message, error: null };
  }

  /** Rate-limit rejections — `meta` carries the retry hint alongside the standard envelope. */
  private handleThrottlerException(
    exception: ThrottlerException,
    response: Response,
    lang: string | undefined,
  ): void {
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();
    const rateLimitBody: IRateLimitExceptionBody | null =
      typeof exceptionResponse === 'object' && exceptionResponse !== null
        ? exceptionResponse
        : null;

    const headerRetryAfter = Number(response.getHeader('Retry-After'));
    const retryAfter =
      rateLimitBody?.retryAfter ??
      (Number.isFinite(headerRetryAfter) && headerRetryAfter > 0
        ? headerRetryAfter
        : RATE_LIMIT_FALLBACK_RETRY_AFTER_SECONDS);

    if (!response.getHeader('Retry-After')) {
      response.setHeader('Retry-After', String(retryAfter));
    }

    const body: IApiResponseBody<null, { retryAfter: number; timestamp: string }> = {
      message: this.translate(ERROR_MSG.COMMON.TOO_MANY_REQUESTS, lang),
      data: null,
      meta: {
        retryAfter,
        timestamp: rateLimitBody?.timestamp ?? new Date().toISOString(),
      },
      error: null,
    };

    response.status(status).json(body);
  }
}
