import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { RedisService } from 'src/redis/redis.service';
import { LoggerService } from '../common/services';
import { runLtiStorageOp } from './lti-storage.util';
import { LtiConstants } from './lti.constants';
import type { LtiSessionAudience, LtiSessionPayload } from './lti-session.types';

export class LtiSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LtiSessionError';
  }
}

/**
 * Temporary storage for LTI session handoff data.
 * Uses one-time codes bound to audience (educator vs student).
 *
 * Backed by Redis (5 minute TTL) so the launch and the code exchange can hit
 * different replicas. No fallback once Redis is configured — if it is down the
 * exchange fails rather than silently going per-replica again. Only a wholly
 * unconfigured Redis (REDIS_HOST unset, development only) uses in-memory
 * storage; staging and production refuse to boot without it.
 */
@Injectable()
export class LtiSessionService {
  constructor(
    private readonly logger: LoggerService,
    private readonly redisService: RedisService,
  ) {}

  private key(code: string): string {
    return `${LtiConstants.REDIS.SESSION_KEY_PREFIX}${code}`;
  }

  async createSession(session: LtiSessionPayload): Promise<string> {
    const code = this.generateCode();

    await runLtiStorageOp(this.logger, 'session write', () =>
      this.redisService.setStrict(this.key(code), session, LtiConstants.REDIS.SESSION_TTL_SECONDS),
    );
    
    const userId = 'userId' in session ? session.userId ?? 'n/a' : 'n/a';
    this.logger.log(
      `LTI session created: audience=${session.audience}, code=${code.substring(0, 8)}..., userId=${userId}`,
    );

    return code;
  }

  isValidCodeFormat(code: string): boolean {
    return /^[A-Za-z0-9_-]{40,50}$/.test(code);
  }

  async consumeSession(code: string, audience?: LtiSessionAudience): Promise<LtiSessionPayload> {
    if (!this.isValidCodeFormat(code)) {
      throw new LtiSessionError('Invalid or expired session code');
    }

    const session = await runLtiStorageOp(this.logger, 'session read', () =>
      this.redisService.getDelStrict<LtiSessionPayload>(this.key(code)),
    );
    if (!session) {
      this.logger.warn(
        `LTI session not found or already consumed: code=${code.substring(0, 8)}...`,
      );
      throw new LtiSessionError('Invalid or expired session code');
    }

    if (audience && session.audience !== audience) {
      this.logger.warn(
        `LTI session audience mismatch: expected=${audience}, stored=${session.audience}, code=${code.substring(0, 8)}...`,
      );
      throw new LtiSessionError('Invalid or expired session code');
    }

    const userId = 'userId' in session ? session.userId ?? 'n/a' : 'n/a';
    this.logger.log(
      `LTI session consumed: audience=${session.audience}, code=${code.substring(0, 8)}..., userId=${userId}`,
    );

    return session;
  }

  /**
   * Get session without consuming it (for Deep Linking flow where we need to read twice)
   */
  async getSession(code: string): Promise<LtiSessionPayload | null> {
    if (!this.isValidCodeFormat(code)) {
      return null;
    }

    return runLtiStorageOp(this.logger, 'session read', () =>
      this.redisService.get<LtiSessionPayload>(this.key(code)),
    );
  }

  /**
   * Delete a session explicitly (after Deep Linking submit)
   */
  async deleteSession(code: string): Promise<void> {
    await runLtiStorageOp(this.logger, 'session delete', () =>
      this.redisService.del(this.key(code)),
    );
  }

  private generateCode(): string {
    return randomBytes(32).toString('base64url');
  }
}
