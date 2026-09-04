import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { RATE_LIMIT_FALLBACK_RETRY_AFTER_SECONDS } from '../constants/throttle.constants';

interface ExceptionResponseBody {
  message?: string | string[];
  status?: string;
  data?: object | null;
}

interface RateLimitLikeBody {
  message?: string;
  retryAfter?: number;
  timestamp?: string;
}

const DEFAULT_RATE_LIMIT_MESSAGE = 'Too many requests. Please try again later.';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException | Error | null | undefined, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let exceptionResponse: unknown = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const res = exceptionResponse as ExceptionResponseBody;
        if (Array.isArray(res.message)) {
          message = res.message.join(', ');
        } else if (res.message) {
          message = res.message;
        }
      }
    } else {
      console.error(`[${request.method}] ${request.url} =>`, exception);
    }

    if (status === HttpStatus.TOO_MANY_REQUESTS) {
      const rateLimitBody =
        typeof exceptionResponse === 'object' && exceptionResponse !== null
          ? (exceptionResponse as RateLimitLikeBody)
          : null;

      const headerRetry = Number(response.getHeader('Retry-After'));
      const retryAfter =
        rateLimitBody?.retryAfter ??
        (Number.isFinite(headerRetry) && headerRetry > 0
          ? headerRetry
          : RATE_LIMIT_FALLBACK_RETRY_AFTER_SECONDS);

      if (!response.getHeader('Retry-After')) {
        response.setHeader('Retry-After', String(retryAfter));
      }

      response.status(status).json({
        success: false,
        statusCode: status,
        error: 'Too Many Requests',
        message: rateLimitBody?.message ?? message ?? DEFAULT_RATE_LIMIT_MESSAGE,
        retryAfter,
        timestamp: rateLimitBody?.timestamp ?? new Date().toISOString(),
      });
      return;
    }

    response.status(status).json({
      status: 'FAILED',
      message,
      data: null,
    });
  }
}
