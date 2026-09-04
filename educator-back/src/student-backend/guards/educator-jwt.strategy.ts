import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import {
  ExtractJwt,
  Strategy,
  type StrategyOptionsWithRequest,
  type VerifiedCallback,
} from 'passport-jwt';

import type { Request } from 'express';

/**
 * Name used by Passport / `AuthGuard(...)` to reference this strategy.
 * Kept as a constant so consumers (guards, tests) cannot drift out of sync.
 */
export const EDUCATOR_JWT_STRATEGY_NAME = 'educator-jwt';

/**
 * Shape of the JWT payload issued by the Educator backend after a successful
 * student login. Kept as a strict interface so downstream handlers get typed
 * `request.user` access without any `any` casts.
 *
 * The Educator backend may discriminate the token flavour via either a
 * `type` or `role` claim (older deployments use `role`) — both are
 * accepted so long as the value is `'student'`.
 */
export interface EducatorJwtPayload {
  /** Subject — the student code (e.g. `"11683005"`). */
  sub: string;
  /** Internal student record id (opaque). */
  studentId?: string;
  /** Optional class assignment id. */
  classId?: string;
  /** Token type discriminator. `'student'` accepted here or on `role`. */
  type?: string;
  /** Alternate discriminator used by some Educator backend versions. */
  role?: string;
  /** Standard JWT claims (populated by the signer). */
  iat?: number;
  exp?: number;
}

/**
 * Resolves the HMAC signing secret shared with the Educator backend. The
 * value MUST be provided via the `JWT_SECRET` environment
 * variable — there is no fallback so a mis-configured environment fails
 * closed at boot instead of silently accepting attacker-forged tokens.
 */
export function getEducatorJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) {
    throw new Error(
      'JWT_SECRET is not configured. Set it in the environment (must match the Educator backend signing key) before starting the backend.',
    );
  }
  return secret;
}

/**
 * Passport strategy that trusts JWTs issued by the Educator backend.
 *
 * - Signature is verified with a shared HMAC secret sourced from
 *   `JWT_SECRET` (documented in `backend/.env.example`).
 * - Only tokens whose `type` or `role` claim is `"student"` are accepted
 *   so admin / internal tokens from other systems cannot be replayed
 *   against scenario endpoints.
 * - Missing / malformed / expired tokens surface as `401 Unauthorized`
 *   automatically via Passport (no custom code required).
 */
@Injectable()
export class EducatorJwtStrategy extends PassportStrategy(Strategy, EDUCATOR_JWT_STRATEGY_NAME) {
  private static readonly logger = new Logger(EducatorJwtStrategy.name);

  constructor() {
    const secret = getEducatorJwtSecret();
    EducatorJwtStrategy.logger.warn(
      `[AUTH_DEBUG] EducatorJwtStrategy init — JWT_SECRET len=${secret.length} first6=${secret.slice(0, 6)}`,
    );

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      // secretOrKeyProvider is called once per request, letting us log
      // exactly which secret is used at the moment of signature verification.
      // If validate() is never reached after this logs, the signature itself
      // is invalid (wrong secret).
      secretOrKeyProvider: (_req: Request, _rawJwtToken: string, done: VerifiedCallback) => {
        EducatorJwtStrategy.logger.warn(
          `[AUTH_DEBUG] EducatorJwtStrategy secretOrKeyProvider called — using JWT_SECRET len=${secret.length} first6=${secret.slice(0, 6)}`,
        );
        done(null, secret);
      },
      // Reject expired tokens (default passport-jwt behaviour, made explicit).
      ignoreExpiration: false,
      passReqToCallback: false,
    } as unknown as StrategyOptionsWithRequest);
  }

  validate(payload: EducatorJwtPayload): EducatorJwtPayload | null {
    // [AUTH_DEBUG] — expose the full payload the educator strategy sees so
    // we can compare it against the discriminator check below.
    // TODO: remove once student auth flow is confirmed working.
    // If this line is reached, signature verification PASSED.
    // If you see secretOrKeyProvider logged but NOT this line, the secret is wrong.
    EducatorJwtStrategy.logger.warn(
      `[AUTH_DEBUG] EducatorJwtStrategy.validate REACHED — signature OK. payload=${JSON.stringify(payload)}`,
    );

    if (!payload) {
      EducatorJwtStrategy.logger.warn(
        '[AUTH_DEBUG] educator-jwt: payload is falsy — returning null (Passport will try next strategy)',
      );
      // Return null (soft fail) so Passport falls through to the next strategy
      // instead of short-circuiting with 401. This allows admin tokens that
      // passed signature verification to be picked up by the local jwt strategy.
      return null;
    }

    const discriminator = payload.type ?? payload.role;
    if (discriminator !== 'student') {
      EducatorJwtStrategy.logger.warn(
        `[AUTH_DEBUG] educator-jwt: type|role !== 'student' (got type=${String(payload.type)} role=${String(payload.role)}) — returning null so jwt strategy can handle admin tokens`,
      );
      // Not a student token — return null (soft fail) so Passport tries the
      // local 'jwt' strategy next. Admin tokens signed with JWT_SECRET will
      // fail educator-jwt signature check and never reach here; this branch
      // only fires when both backends share the same secret.
      return null;
    }
    if (!payload.sub) {
      EducatorJwtStrategy.logger.warn(
        '[AUTH_DEBUG] educator-jwt: sub claim missing — returning null (Passport will try next strategy)',
      );
      return null;
    }

    EducatorJwtStrategy.logger.warn(
      `[AUTH_DEBUG] EducatorJwtStrategy.validate ACCEPTED sub=${payload.sub}`,
    );

    // Normalise so downstream guards can rely on `user.type === 'student'`.
    return { ...payload, type: 'student' };
  }
}
