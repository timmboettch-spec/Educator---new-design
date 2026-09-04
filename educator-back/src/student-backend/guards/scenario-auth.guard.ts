import { type ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { EDUCATOR_JWT_STRATEGY_NAME } from './educator-jwt.strategy';

import type { Request } from 'express';
import { STUDENT_BACKEND_JWT_STRATEGY } from './jwt.strategy';

/**
 * Composite guard applied to Scenario-facing endpoints.
 *
 * Strategy order matters: `'educator-jwt'` is tried FIRST because both
 * strategies currently share the same HMAC secret in local/dev
 * environments — running the local `'jwt'` strategy first would
 * successfully verify the signature of a student token, then reject the
 * payload (no `userId` claim) with `UnauthorizedException`, which
 * short-circuits Passport before `'educator-jwt'` gets a chance to run.
 *
 * With educator-jwt first:
 *   - Student tokens (payload has `sub` + `role|type === 'student'`) match
 *     educator-jwt and never reach the local strategy.
 *   - Admin tokens (payload has `userId`) fail educator-jwt (discriminator
 *     mismatch) and then match the local `'jwt'` strategy.
 *
 * If both strategies fail, Passport responds with `401 Unauthorized`.
 */
@Injectable()
export class ScenarioAuthGuard extends AuthGuard([
  EDUCATOR_JWT_STRATEGY_NAME,
  STUDENT_BACKEND_JWT_STRATEGY,
]) {
  private static readonly logger = new Logger(ScenarioAuthGuard.name);

  canActivate(context: ExecutionContext) {
    // [AUTH_DEBUG] — log the incoming Authorization header shape + decoded
    // (unverified) payload so we can see exactly what the client sent.
    // TODO: remove this block once the student auth flow is confirmed working.
    const req = context.switchToHttp().getRequest<Request>();
    const authHeader = req.headers?.authorization ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    ScenarioAuthGuard.logger.warn(
      `[AUTH_DEBUG] ${req.method} ${req.url} hasBearer=${Boolean(token)} tokenLen=${token.length}`,
    );
    if (token) {
      const parts = token.split('.');
      if (parts.length === 3) {
        try {
          const header: unknown = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
          const payload: unknown = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
          ScenarioAuthGuard.logger.warn(`[AUTH_DEBUG] token.header=${JSON.stringify(header)}`);
          ScenarioAuthGuard.logger.warn(`[AUTH_DEBUG] token.payload=${JSON.stringify(payload)}`);
          ScenarioAuthGuard.logger.warn(
            `[AUTH_DEBUG] token.signature.first6=${parts[2].slice(0, 6)} last6=${parts[2].slice(-6)}`,
          );
        } catch (e) {
          ScenarioAuthGuard.logger.warn(
            `[AUTH_DEBUG] token decode failed: ${(e as Error).message}`,
          );
        }
      } else {
        ScenarioAuthGuard.logger.warn(
          `[AUTH_DEBUG] token does not have 3 parts (got ${parts.length})`,
        );
      }
    }
    return super.canActivate(context);
  }

  /**
   * Overrides Passport's default so a rejected request logs the failure
   * reason. During this debug window the logs are verbose; the safer
   * production version emits only `err.name` / `info.message`.
   */
  handleRequest<TUser = unknown>(err: unknown, user: TUser, info: unknown): TUser {
    if (err || !user) {
      // info is an array when multiple strategies are used (one entry per strategy).
      const infos: unknown[] = Array.isArray(info) ? info : [info];
      const formatInfo = (i: unknown): string => {
        if (!i) {
          return 'none';
        }
        const o = i as { name?: string; message?: string };
        const name = o.name ?? 'Info';
        const msg = o.message ?? (i as string);
        // Distinguish the two most common failure modes so the log is actionable:
        //   "invalid signature"  → JWT_SECRET does not match the signing key
        //   "jwt expired"        → token has expired
        //   "No auth token"      → Authorization header was missing entirely
        return `${name}: ${msg}`;
      };
      const errObj = err as { name?: string; message?: string } | undefined;
      ScenarioAuthGuard.logger.warn(
        `[AUTH_DEBUG] ScenarioAuthGuard REJECTED — ` +
          `err=${errObj ? `${errObj.name ?? 'Error'}: ${errObj.message ?? ''}` : 'none'} ` +
          `strategies=[${infos.map(formatInfo).join(' | ')}]`,
      );
      ScenarioAuthGuard.logger.warn(
        `[AUTH_DEBUG] HINT: if strategies shows "JsonWebTokenError: invalid signature" ` +
          `→ JWT_SECRET in this backend does not match the JWT_SECRET used by the Educator backend to sign the token.`,
      );
    } else {
      ScenarioAuthGuard.logger.warn(
        `[AUTH_DEBUG] ScenarioAuthGuard ACCEPTED user=${JSON.stringify(user)}`,
      );
    }
    return super.handleRequest(err, user, info, {} as ExecutionContext);
  }
}
