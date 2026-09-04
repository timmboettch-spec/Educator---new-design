import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
  RequestTimeoutException,
} from '@nestjs/common';
import { Request } from 'express';
import {
  Observable,
  TimeoutError,
  catchError,
  throwError,
  timeout,
} from 'rxjs';
import {
  timeoutCounter,
  requestDurationHistogram,
} from '../metrics/app.metrics';

export const API_TIMEOUT_MS = Number(process.env.API_TIMEOUT_MS) || 60_000;

interface RequestRoute {
  path?: string;
}

@Injectable()
export class RequestTimeoutInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestTimeoutInterceptor.name);

  intercept<T>(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<T> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<Request>();
    const start = Date.now();

    return next.handle().pipe(
      timeout(API_TIMEOUT_MS),
      catchError((error: unknown) => {
        const elapsed = Date.now() - start;

        if (error instanceof TimeoutError) {
          const route = req.route as RequestRoute;
          const path = route.path ?? req.path;

          timeoutCounter.inc({
            method: req.method,
            path,
          });

          this.logger.warn(
            `Request timed out after ${elapsed}ms — ${req.method} ${req.originalUrl}`,
          );

          return throwError(
            () =>
              new RequestTimeoutException(
                `Request timed out after ${API_TIMEOUT_MS}ms`,
              ),
          );
        }

        return throwError(() => error);
      }),
    );
  }
}