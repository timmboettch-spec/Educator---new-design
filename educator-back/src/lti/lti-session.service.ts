import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import type {
  CreateLtiSessionInput,
  LtiSessionAudience,
  LtiSessionPayload,
} from './lti-session.types';

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
 * Production: replace in-memory Map with Redis for multi-instance deployments.
 */
@Injectable()
export class LtiSessionService {
  private readonly logger = new Logger(LtiSessionService.name);
  private readonly sessions = new Map<string, LtiSessionPayload>();
  private readonly SESSION_TTL_MS = 5 * 60 * 1000;
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60 * 1000);
  }

  onModuleDestroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  createSession(data: CreateLtiSessionInput): string {
    const code = this.generateCode();
    const now = Date.now();
    const session: LtiSessionPayload = {
      ...data,
      createdAt: now,
      expiresAt: now + this.SESSION_TTL_MS,
    };

    this.sessions.set(code, session);
    this.logger.log(
      `LTI session created: audience=${data.audience}, code=${code.substring(0, 8)}..., userId=${data.userId ?? 'n/a'}`,
    );

    return code;
  }

  isValidCodeFormat(code: string): boolean {
    return /^[A-Za-z0-9_-]{40,50}$/.test(code);
  }

  /**
   * Atomically consume a one-time code: delete first, then validate.
   * Concurrent requests racing on the same code — only one wins.
   */
  consumeSession(code: string, audience: LtiSessionAudience): LtiSessionPayload {
    if (!this.isValidCodeFormat(code)) {
      throw new LtiSessionError('Invalid or expired session code');
    }

    const session = this.sessions.get(code);
    if (!session) {
      this.logger.warn(
        `LTI session not found or already consumed: code=${code.substring(0, 8)}...`,
      );
      throw new LtiSessionError('Invalid or expired session code');
    }

    // Single-use: delete immediately before validation completes
    this.sessions.delete(code);

    if (Date.now() > session.expiresAt) {
      this.logger.warn(`LTI session expired: code=${code.substring(0, 8)}...`);
      throw new LtiSessionError('Invalid or expired session code');
    }

    if (session.audience !== audience) {
      this.logger.warn(
        `LTI session audience mismatch: expected=${audience}, stored=${session.audience}, code=${code.substring(0, 8)}...`,
      );
      throw new LtiSessionError('Invalid or expired session code');
    }

    this.logger.log(
      `LTI session consumed: audience=${audience}, code=${code.substring(0, 8)}..., userId=${session.userId ?? 'n/a'}`,
    );

    return session;
  }

  private generateCode(): string {
    return randomBytes(32).toString('base64url');
  }

  private cleanupExpiredSessions(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [code, session] of this.sessions.entries()) {
      if (now > session.expiresAt) {
        this.sessions.delete(code);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.log(`Cleaned up ${cleanedCount} expired LTI session(s)`);
    }
  }

  getActiveSessionCount(): number {
    return this.sessions.size;
  }
}
