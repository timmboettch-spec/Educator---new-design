import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { AuthService } from '../modules/auth/auth.service';

import type { Request } from 'express';

interface JwtPayload {
  userId: string;
}

export const STUDENT_BACKEND_JWT_STRATEGY = 'student-backend-jwt';

/**
 * Resolves the HMAC signing secret used by the local admin/instructor JWT
 * flow. The value MUST be provided via the `JWT_SECRET` environment
 * variable — there is no fallback so a mis-configured environment fails
 * closed at boot instead of silently accepting attacker-forged tokens.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) {
    throw new Error(
      'JWT_SECRET is not configured. Set it in the environment (e.g. `openssl rand -hex 32`) before starting the backend.',
    );
  }
  return secret;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, STUDENT_BACKEND_JWT_STRATEGY) {
  constructor(private authService: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: getJwtSecret(),
      passReqToCallback: true,
    });
  }

  validate(request: Request, payload: JwtPayload) {
    // JWT signature already verified by Passport using secretOrKey
    // No Redis validation — trust the JWT signature alone
    JwtStrategy.debugLogger.warn(
      `[AUTH_DEBUG] JwtStrategy.validate payload=${JSON.stringify(payload)}`,
    );

    if (!payload.userId) {
      // Local jwt strategy only handles admin/instructor tokens (payload has userId).
      // Educator-issued student tokens use `sub` instead and are handled by
      // educator-jwt. Return null (soft fail) so Passport doesn't short-circuit
      // when this strategy is tried after educator-jwt already accepted the token.
      JwtStrategy.debugLogger.warn(
        '[AUTH_DEBUG] jwt: no userId in payload (educator/student token) — returning null',
      );
      return null;
    }

    // Return payload directly without Redis validation
    return payload;
  }

  private static readonly debugLogger = new Logger(JwtStrategy.name);
}
