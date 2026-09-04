import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { ClsService } from 'nestjs-cls';
import { Request, Response } from 'express';
import { requestDurationHistogram } from '../metrics/app.metrics';

interface ClsUser {
  userId: string;
  email?: string;
}

interface RequestRoute {
  path?: string;
}

@Injectable()
export class AuditLoggerInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLoggerInterceptor.name);

  constructor(private readonly cls: ClsService) { }

  intercept<T>(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<T> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const { method, url } = request;
    const user = this.cls.get<ClsUser>('user');
    const userId = user?.userId ?? 'anonymous';
    const startTime = Date.now();

    return next.handle().pipe(
      tap(() => {
        const statusCode = response.statusCode;
        const responseTime = Date.now() - startTime;

        const route = request.route as RequestRoute;

        requestDurationHistogram.observe(
          {
            method,
            path: route.path ?? url,
            status: String(statusCode),
          },
          responseTime,
        );

        this.logger.log({
          message: 'Audit Log',
          method,
          url,
          userId,
          statusCode,
          responseTime: `${responseTime}ms`,
        });
      }),
    );
  }
}