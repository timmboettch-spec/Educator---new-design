import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { REDIRECT_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ResponseResult } from '../class/response.class';
import { IApiResponseBody } from '../interfaces/response.interface';
import { decodeI18nKey } from '../utils/i18n-key.util';

/**
 * Global response wrapper (`APP_INTERCEPTOR` in `AppModule`) covering every route in both the
 * root app and `src/student-backend`. Normalizes the handler's return value into the unified
 * `{ message, data, meta, error }` envelope:
 *  - `ResponseResult` (already-migrated controllers) — enveloped.
 *  - Any other body — returned exactly as the handler produced it.
 *
 * Skipped entirely for cases with no plain JSON success body to envelope: non-HTTP contexts
 * (e.g. WebSocket gateways), `@Redirect()` routes, a raw (non-`passthrough`) `@Res()` handler,
 * and `StreamableFile` bodies.
 */
@Injectable()
export class ResponseInterceptor<T, M extends object = object>
  implements
  NestInterceptor<T | ResponseResult<T, M> | StreamableFile, IApiResponseBody<T, M> | StreamableFile> {
  constructor(
    private readonly i18n: I18nService,
    private readonly reflector: Reflector,
  ) { }

  intercept(
    context: ExecutionContext,
    next: CallHandler<T | ResponseResult<T, M> | StreamableFile>,
  ): Observable<IApiResponseBody<T, M> | StreamableFile> {
    if (context.getType() !== 'http') {
      return next.handle() as Observable<IApiResponseBody<T, M> | StreamableFile>;
    }

    const response = context.switchToHttp().getResponse<Response>();
    this.guardAgainstDoubleSend(response); // A Response with passthrough and res.send()
    const i18nContext = I18nContext.current();
    const isRedirect = !!this.reflector.get<{ url: string; statusCode?: number } | undefined>(
      REDIRECT_METADATA,
      context.getHandler(),
    );

    return next.handle().pipe(
      map((body) => {
        // Binary/streamed responses (e.g. a CSV export) manage their own headers/status.
        if (body instanceof StreamableFile) {
          return body;
        }


        // `@Redirect()` routes return `{ url, statusCode }`, which Nest's router reads directly —
        // enveloping it here would hide the `url` Nest needs.
        if (isRedirect) {
          return body as unknown as IApiResponseBody<T, M>;
        }

        // A raw (non-`passthrough`) `@Res()` handler already sent the response.
        if (response.headersSent) {
          return body as unknown as IApiResponseBody<T, M>;
        }

        // Only already-migrated `ResponseResult` bodies get enveloped; anything else is the
        // handler's own payload and is returned untouched.
        if (!(body instanceof ResponseResult)) {
          return body as unknown as IApiResponseBody<T, M>;
        }

        const result = body;

        // `result.statusCode` is only ever set on an already-migrated `ResponseResult`; anything
        // else keeps whatever `response.statusCode` Nest (or a handler) already set.
        response.status(result.statusCode ?? response.statusCode);

        return {
          data: result.data ?? null,
          message: this.translateMessage(result.message, i18nContext),
          meta: result.meta ?? null,
          error: null,
        };
      }),
    );
  }

  /**
   * With `@Res({ passthrough: true })`, Nest still runs its own `apply()`/`reply()` step after
   * this interceptor, even if the handler already ended the response itself (e.g. a manual
   * `res.redirect()`). That second `send`/`json` call would otherwise throw on the already-ended
   * response, so patch both to no-op once headers are sent — regardless of which `@Res()` mode
   * the route uses, or whether the handler or `ResponseInterceptor` itself sent first.
   */
  private guardAgainstDoubleSend(response: Response): void {
    type SendOrJson = (body?: unknown) => Response;

    const guard = (method: 'send' | 'json'): void => {
      if (typeof response[method] !== 'function') {
        return;
      }

      const original = response[method].bind(response) as SendOrJson;
      response[method] = ((body?: unknown): Response =>
        response.headersSent ? response : original(body)) as Response[typeof method];
    };

    guard('send');
    guard('json');
  }

  /** Translates a message key via i18n, defaulting to the generic success message when none is set. */
  private translateMessage(message: string | undefined, i18nContext?: I18nContext<unknown>): string {
    if (!message) {
      return this.i18n.t('success.COMMON.OK', { lang: i18nContext?.lang });
    }

    const { key, args } = decodeI18nKey(message);
    return this.i18n.t(key, { lang: i18nContext?.lang, args });
  }
}
