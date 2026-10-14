import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ALLOW_ROLE_SELECTION_TOKEN_KEY } from '../decorators/allow-role-selection-token.decorator';
import { SERVICE_AUTH_KEY } from '../decorators/service-auth.decorator';
import { ROLES_KEY } from '../decorators/required-roles.decorator';
import { RoleSlug, TokenPurposeType } from '../constants';
import { extractAccessToken } from '../utils/token-extractor.util';
import { mapUserTokenTypeToRoleSlugs } from '../utils/user-token-type.util';
import { AUTH_MSG } from '../messages/auth.message';
import { ERROR_MSG } from '../messages/error.message';
import { AuthService } from 'src/auth/auth.service';
import { ClsService } from 'nestjs-cls';
import { LoggerService } from '../services';
import { AuthenticatedRequest } from '../interfaces';

/**
 * The single default-deny authentication and authorization gate (ADR-0005), registered once as an
 * `APP_GUARD` in `AppModule`. Checks, in order:
 *
 * 1. `@Public()` on the route or controller → allow, without touching the token.
 * 2. Extract the token from the request (cookie-first, `Authorization: Bearer` fallback) → 401
 *    when absent.
 * 3. `AuthService.validateUserToken` verifies signature/expiry/blacklist and re-checks the
 *    account and its active roles → 401 on any failure; the result becomes `request.user`.
 * 4. A `purpose: 'login'` token → 401 unless the route is `@AllowRoleSelectionToken()`.
 * 5. `@RequiredRoles(...)` (route-level replaces controller-level) → any-of against the token's
 *    selected role (`type`, mapped to a `RoleSlug`), otherwise 403. Per ADR-0006 the account's
 *    full `roles[]` is deliberately never read here.
 * 6. Allow.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
    private readonly clsService: ClsService,
    private readonly logger: LoggerService
  ) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.getMetadata<boolean>(IS_PUBLIC_KEY, context)) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    // A machine caller on a route marked @ServiceAuth(). Checked BEFORE the token path: a
    // service caller has no token `type`, so a @RequiredRoles route would reject it. On a bad
    // key, fall through — the decorator ADDS a way in, it does not replace the session one.
    if (this.getMetadata<boolean>(SERVICE_AUTH_KEY, context) && this.hasValidServiceKey(request)) {
      return true;
    }

    await this.authenticate(request);

    const user = request.user;
    this.assertPurposeAllowed(context, user?.purpose);
    this.assertRolesAllowed(context, user?.type ? mapUserTokenTypeToRoleSlugs(user.type) : []);
    return true;
  }

  /**
   * Constant-time comparison against `AVATAR_SERVICE_KEY`. Lengths are compared first because
   * `timingSafeEqual` throws on a mismatch. An unset key refuses everyone rather than matching
   * an empty header.
   */
  private hasValidServiceKey(request: AuthenticatedRequest): boolean {
    const expected = process.env.AVATAR_SERVICE_KEY ?? '';
    if (!expected) return false;

    const header = request.headers['x-service-key'];
    const presented = Array.isArray(header) ? header[0] : header;
    if (typeof presented !== 'string' || presented.length === 0) return false;

    const a = Buffer.from(presented);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    if (!timingSafeEqual(a, b)) {
      this.logger.warn('[AuthGuard] Rejected an invalid service key');
      return false;
    }
    return true;
  }

  /**
   * Pulls the token off the request, verifies it, and populates `request.user` with the
   * caller's `ICurrentUser`.
   */
  private async authenticate(request: AuthenticatedRequest): Promise<void> {
    try {
      const token = extractAccessToken(request);
      if (!token) {
        throw new UnauthorizedException(ERROR_MSG.COMMON.UNAUTHORIZED);
      }

      request.user = await this.authService.validateUserToken(token);

      // Expose the authenticated user to request-scoped code (logging, audit) via CLS.
      if (this.clsService.isActive()) {
        this.clsService.set('user', request.user);
      }
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }

      throw new UnauthorizedException(ERROR_MSG.COMMON.UNAUTHORIZED);
    }
  }

  /**
   * A `purpose: 'login'` token proves the account's credentials but not which of its roles the
   * caller is acting as. Only routes explicitly marked `@AllowRoleSelectionToken()` accept it.
   */
  private assertPurposeAllowed(context: ExecutionContext, purpose?: string): void {
    if (purpose !== TokenPurposeType.LOGIN) return;
    if (this.getMetadata<boolean>(ALLOW_ROLE_SELECTION_TOKEN_KEY, context)) return;

    throw new UnauthorizedException(AUTH_MSG.ROLE_SELECTION_REQUIRED);
  }

  private assertRolesAllowed(context: ExecutionContext, userRoles: string[]): void {
    const requiredRoles = this.getMetadata<RoleSlug[]>(ROLES_KEY, context);
    if (!requiredRoles || requiredRoles.length === 0) return;
    if (requiredRoles.some((role) => userRoles.includes(role))) return;

    throw new ForbiddenException(ERROR_MSG.COMMON.FORBIDDEN);
  }

  private getMetadata<T>(key: string, context: ExecutionContext): T | undefined {
    return this.reflector.getAllAndOverride<T>(key, [context.getHandler(), context.getClass()]);
  }
}
