import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  RequestTimeoutException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { Request } from 'express';
import { Observable, TimeoutError, catchError, throwError, timeout } from 'rxjs';
import { timeoutCounter } from '../metrics/app.metrics';
import { LoggerService } from '../services';
import { AbortSignalUtil } from '../utils/abort-signal.util';

interface RequestRoute {
  path?: string;
}

@Injectable()
export class RequestTimeoutInterceptor implements NestInterceptor {
  private readonly apiTimeoutMs: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
    private readonly cls: ClsService,
  ) {
    this.apiTimeoutMs = this.configService.get<number>('app.apiTimeoutMs') ?? 60_000;
  }

  intercept<T>(context: ExecutionContext, next: CallHandler<T>): Observable<T> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<Request>();
    const start = Date.now();
    const abortController = new AbortController();
    AbortSignalUtil.storeAbortController(this.cls, abortController);

    const requestWithSignal = req as Request & { abortSignal: AbortSignal };
    requestWithSignal.abortSignal = abortController.signal;

    const timeoutHandle = setTimeout(() => {
      abortController.abort(new Error('Request timeout'));
    }, this.apiTimeoutMs);

    return next.handle().pipe(
      timeout(this.apiTimeoutMs),
      catchError((error: unknown) => {
        clearTimeout(timeoutHandle);
        const elapsed = Date.now() - start;

        if (error instanceof TimeoutError) {
          const route = req.route as RequestRoute;
          const path = route.path ?? req.path;

          timeoutCounter.inc({
            method: req.method,
            path,
          });

          this.logger.warn(
            `Request timed out after ${elapsed}ms — ${req.method} ${req.originalUrl} (AbortSignal sent to underlying operations)`,
          );

          return throwError(
            () => new RequestTimeoutException(`Request timed out after ${this.apiTimeoutMs}ms`),
          );
        }

        return throwError(() => error);
      }),
    );
  }
}
