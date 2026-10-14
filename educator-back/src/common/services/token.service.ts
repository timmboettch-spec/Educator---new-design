// token.service.ts

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { randomUUID } from 'crypto';
import { RedisService } from 'src/redis/redis.service';
import { COOKIE_KEYS, CookieSameSite, Env, TokenBlacklistConstants } from '../constants';
import { AuthTokens, TokenPayload } from '../interfaces';
import { ERROR_MSG } from '../messages/error.message';

@Injectable()
export class TokenService {
  private nodeEnv: Env;
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    this.nodeEnv = this.configService.get<Env>('app.nodeEnv') as Env;
  }

  /**
   * Single source of truth for token generation.
   * Used by signup, signin, refresh, and any other token-issuing endpoint.
   */
  generateTokens(payload: TokenPayload, expiry?: number): AuthTokens {
    const accessExpiresIn = expiry ?? this.configService.get<number>('jwt.accessExpiresIn') ?? 900; // 15 min default

    // `jti` identifies this token for blacklisting (see `blackListToken`/`isBlackListed`).
    const access_token = this.jwtService.sign({ ...payload, jti: randomUUID() }, {
      secret: this.configService.get<string>('jwt.accessSecret'),
      expiresIn: accessExpiresIn,
    });

    return {
      access_token,
      expires_in: accessExpiresIn,
    };
  }

  /**
   * Single source of truth for how tokens are attached to the response.
   * Used by every endpoint that issues or refreshes tokens.
   */
  setAuthCookies(res: Response, tokens: AuthTokens): void {
    res.cookie(COOKIE_KEYS.ACCESS_TOKEN, tokens.access_token, {
      ...this.cookieOptions(),
      maxAge: tokens.expires_in * 1000,
    });
  }

  /**
   * Clears both cookies — use in logout.
   */
  clearAuthCookies(res: Response): void {
    res.clearCookie(COOKIE_KEYS.ACCESS_TOKEN, this.cookieOptions());
  }

  private cookieOptions(): {
    httpOnly: boolean;
    secure: boolean;
    sameSite: CookieSameSite;
  } {
    // The frontend is deployed on Azure Static Web Apps, a separate origin from the API, so the
    // cookie must be sendable cross-site everywhere except local dev — `sameSite: 'strict'` in
    // production would silently stop the browser from sending the session cookie at all.
    const cookie = {
      httpOnly: true,
      secure: this.nodeEnv != Env.LOCAL,
      sameSite: this.nodeEnv === Env.LOCAL ? CookieSameSite.LAX : CookieSameSite.NONE,
    };

    return cookie;
  }

  /**
   * Single source of truth for verifying an access token, regardless of
   * whether it was pulled from the access-token cookie or the Authorization
   * header. Uses the same secret `generateTokens()` signs access tokens with.
   */
  async verifyToken<T extends object = TokenPayload>(
    token: string,
    options?: { ignoreExpiration?: boolean },
  ): Promise<T> {
    try {
      const payload = this.jwtService.verify<T>(token, {
        secret: this.configService.get<string>('jwt.accessSecret'),
        ignoreExpiration: options?.ignoreExpiration ?? false,
      });

      /** 
       * If user logs out the token will be blacklisted
       * Further request with the same token should not be allowed
       */
      const hasTokebBlackListed = await this.redisService.get<boolean>(this.blacklistKey(payload['jti'] as string)).catch(() => false)
      if (hasTokebBlackListed) {
        throw new UnauthorizedException(ERROR_MSG.COMMON.UNAUTHORIZED)
      }

      return payload
    } catch {
      throw new UnauthorizedException(ERROR_MSG.COMMON.UNAUTHORIZED);
    }
  }

  /**
   * Revokes an access token by its `jti` until the token's own expiry. Tokens without a `jti`
   * (or that can't be decoded) are ignored — they can't be looked up by `isBlackListed` anyway.
   */
  async blackListToken(token: string): Promise<void> {
    const decoded = this.decodeToken(token);
    if (!decoded?.jti) return;

    const ttlSeconds =
      typeof decoded.exp === 'number'
        ? decoded.exp - Math.floor(Date.now() / 1000)
        : TokenBlacklistConstants.DEFAULT_TTL_SECONDS;
    if (ttlSeconds <= 0) return;

    await this.redisService.set(this.blacklistKey(decoded.jti), true, ttlSeconds);
  }

  private decodeToken(token: string): { jti?: string; exp?: number } | null {
    if (!token) return null;
    try {
      return this.jwtService.decode<{ jti?: string; exp?: number } | null>(token);
    } catch {
      return null;
    }
  }

  private blacklistKey(jti: string): string {
    return `${TokenBlacklistConstants.REDIS_KEY_PREFIX}${jti}`;
  }
}
