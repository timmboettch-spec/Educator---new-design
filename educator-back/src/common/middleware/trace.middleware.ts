import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { ClsService } from 'nestjs-cls';
import { requestDurationHistogram } from '../metrics/app.metrics';
import { LoggerService } from '../services';
import { ClsUser, RequestRoute } from '../interfaces';

/**
 * Runs at the Express layer (before Nest routing/guards/interceptors), so
 * `res.on('finish')` fires for every outcome — success, a thrown exception
 * turned into a response by the exception filter, a guard rejection
 * (401/403/429), or a 404 for an unmatched route. An interceptor-based
 * approach (RxJS `tap()`) only fires on the success path and never runs at
 * all for guard rejections or unmatched routes.
 */
@Injectable()
export class TraceMiddleware implements NestMiddleware {
  constructor(
    private readonly cls: ClsService,
    private readonly loggerService: LoggerService,
  ) { }

  use(req: Request, res: Response, next: NextFunction): void {
    const { method, url } = req;
    const startTime = Date.now();

    res.on('finish', () => {
      const statusCode = res.statusCode;
      const responseTime = Date.now() - startTime;
      const route = req.route as RequestRoute;
      const user = this.cls.get<ClsUser>('user');
      const userId = user?.userId ?? 'anonymous';

      requestDurationHistogram.observe(
        {
          method,
          path: route?.path ?? url,
          status: String(statusCode),
        },
        responseTime,
      );

      this.loggerService.logRequestTrace({
        method,
        url,
        userId,
        statusCode,
        responseTimeMs: responseTime,
        // requestBody: req.body as unknown,
        route: route?.path ?? url,
      });
    });

    next();
  }
}
