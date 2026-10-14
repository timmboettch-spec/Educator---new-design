import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { ClsService } from 'nestjs-cls';
import { extractAccessToken } from '../utils/token-extractor.util';
import { TokenService } from '../services/token.service';
import { ClsUser } from '../interfaces';

/**
 * Opportunistically decodes the access token (cookie or Bearer header), if
 * present, and stores the user's email in CLS *before* Nest routing/guards
 * run. This lets per-request content checks (e.g. `AutomationAccessService`)
 * identify the caller even on `@Public()` routes, which the global `AuthGuard`
 * skips entirely.
 *
 * This never blocks the request and never grants access: an invalid,
 * missing, or expired token is silently ignored here. Actual authentication/
 * authorization is still enforced exclusively by the global `AuthGuard` (ADR-0005).
 */
@Injectable()
export class AutomationUserContextMiddleware implements NestMiddleware {
  constructor(
    private readonly cls: ClsService,
    private readonly tokenService: TokenService,
  ) {}

  /**
   * `async` because `TokenService.verifyToken` is async (it checks the token's `jti` against the
   * Redis blacklist). Nest awaits a middleware's returned promise before running the next one, so
   * `next()` is called once — here, after the CLS write — rather than racing it.
   */
  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    if (this.cls.isActive() && !this.cls.get<ClsUser>('user')) {
      const token = extractAccessToken(req);
      if (token) {
        try {
          const payload = await this.tokenService.verifyToken<{
            sub?: string;
            email?: string;
          }>(token);

          this.cls.set<ClsUser>('user', {
            userId: payload.sub ?? '',
            email: payload.email,
          });
        } catch {
          // Ignore — request proceeds unauthenticated for routes that allow it.
        }
      }
    }
    next();
  }
}
