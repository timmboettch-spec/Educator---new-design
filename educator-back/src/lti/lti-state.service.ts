import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * LtiStateService manages state and nonce validation for LTI 1.3 OAuth2 flows.
 *
 * Security context:
 * - `state`: Prevents CSRF attacks during the OAuth2 redirect flow
 * - `nonce`: Prevents replay attacks by ensuring id_token freshness
 *
 * Implementation notes:
 * - Uses in-memory storage (Map) suitable for single-instance deployments
 * - For production multi-instance deployments, replace with Redis or database
 * - Entries auto-expire after 10 minutes to prevent memory leaks
 * - One-time use: both state and nonce are deleted after successful validation
 */

interface StateRecord {
  nonce: string;
  createdAt: number;
  toolType: 'educator' | 'student';
}

@Injectable()
export class LtiStateService {
  private readonly logger = new Logger(LtiStateService.name);
  private readonly stateStore = new Map<string, StateRecord>();
  private cleanupTimerId?: NodeJS.Timeout;

  // State/nonce TTL in milliseconds (10 minutes)
  private readonly STATE_TTL_MS = 10 * 60 * 1000;

  // Cleanup interval (run every 2 minutes)
  private readonly CLEANUP_INTERVAL_MS = 2 * 60 * 1000;

  constructor(private readonly configService: ConfigService) {
    // Start periodic cleanup of expired entries
    this.startCleanupTimer();
  }

  /**
   * Create a new state/nonce pair for an LTI login initiation.
   * Both values are UUIDs and stored together.
   */
  createStatePair(state: string, nonce: string, toolType: 'educator' | 'student'): void {
    const record: StateRecord = {
      nonce,
      createdAt: Date.now(),
      toolType,
    };

    this.stateStore.set(state, record);
    this.logger.debug(
      `[LTI State] Created state/nonce pair for ${toolType} tool. State: ${state.substring(0, 8)}..., store size: ${this.stateStore.size}`,
    );
  }

  /**
   * Validate state and nonce from the LTI launch callback.
   *
   * Security checks:
   * 1. State must exist in the store (not forged)
   * 2. State must not be expired (< 10 min old)
   * 3. Nonce in id_token must match the stored nonce
   * 4. Both are deleted after validation (one-time use)
   *
   * @throws UnauthorizedException if validation fails
   */
  validateAndConsume(
    state: string | undefined,
    nonceFromToken: string | undefined,
    toolType: 'educator' | 'student',
  ): void {
    // 1. Check state presence
    if (!state || typeof state !== 'string' || state.trim() === '') {
      this.logger.warn('[LTI State] Missing or empty state parameter');
      throw new UnauthorizedException('Missing state parameter');
    }

    // 2. Check nonce presence
    if (!nonceFromToken || typeof nonceFromToken !== 'string' || nonceFromToken.trim() === '') {
      this.logger.warn('[LTI State] Missing or empty nonce in id_token');
      throw new UnauthorizedException('Missing nonce in id_token');
    }

    // 3. Retrieve stored record
    const record = this.stateStore.get(state);
    if (!record) {
      this.logger.warn(
        `[LTI State] State not found in store: ${state.substring(0, 8)}... (possibly expired, already used, or forged)`,
      );
      throw new UnauthorizedException('Invalid or expired state parameter');
    }

    // 4. Check expiration (10 minutes)
    const age = Date.now() - record.createdAt;
    if (age > this.STATE_TTL_MS) {
      this.stateStore.delete(state);
      this.logger.warn(
        `[LTI State] State expired (age: ${Math.round(age / 1000)}s, ttl: ${this.STATE_TTL_MS / 1000}s)`,
      );
      throw new UnauthorizedException('State parameter expired');
    }

    // 5. Check tool type match
    if (record.toolType !== toolType) {
      this.stateStore.delete(state);
      this.logger.warn(
        `[LTI State] Tool type mismatch. Expected: ${record.toolType}, got: ${toolType}`,
      );
      throw new UnauthorizedException('State parameter tool type mismatch');
    }

    // 6. Validate nonce match
    if (record.nonce !== nonceFromToken) {
      this.stateStore.delete(state);
      this.logger.warn(
        `[LTI State] Nonce mismatch. Expected: ${record.nonce.substring(0, 8)}..., got: ${nonceFromToken.substring(0, 8)}...`,
      );
      throw new UnauthorizedException('Nonce mismatch - possible replay attack');
    }

    // 7. Delete after successful validation (one-time use)
    this.stateStore.delete(state);
    this.logger.log(
      `[LTI State] Successfully validated and consumed state/nonce for ${toolType} tool. State: ${state.substring(0, 8)}...`,
    );
  }

  /**
   * Periodic cleanup of expired state/nonce pairs.
   * Runs every 2 minutes to prevent memory leaks.
   */
  private startCleanupTimer(): void {
    this.cleanupTimerId = setInterval(() => {
      const now = Date.now();
      let cleaned = 0;

      for (const [state, record] of this.stateStore.entries()) {
        const age = now - record.createdAt;
        if (age > this.STATE_TTL_MS) {
          this.stateStore.delete(state);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        this.logger.debug(
          `[LTI State] Cleaned up ${cleaned} expired entries. Current store size: ${this.stateStore.size}`,
        );
      }
    }, this.CLEANUP_INTERVAL_MS);
  }

  /**
   * Get current store size (for monitoring/debugging).
   */
  getStoreSize(): number {
    return this.stateStore.size;
  }

  /**
   * Clear all state/nonce pairs (for testing only).
   */
  clearAll(): void {
    const size = this.stateStore.size;
    this.stateStore.clear();
    this.logger.warn(`[LTI State] Cleared all ${size} entries from store`);
  }

  /**
   * Stop the cleanup timer (for testing/shutdown).
   */
  stopCleanupTimer(): void {
    if (this.cleanupTimerId) {
      clearInterval(this.cleanupTimerId);
      this.cleanupTimerId = undefined;
    }
  }
}
