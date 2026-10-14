import { Injectable, UnauthorizedException } from '@nestjs/common';
import { RedisService } from 'src/redis/redis.service';
import { runLtiStorageOp } from './lti-storage.util';
import { LtiConstants } from './lti.constants';
import { LoggerService } from 'src/common/services';

/**
 * LtiStateService manages state and nonce validation for LTI 1.3 OAuth2 flows.
 *
 * Security context:
 * - `state`: Prevents CSRF attacks during the OAuth2 redirect flow
 * - `nonce`: Prevents replay attacks by ensuring id_token freshness
 *
 * Implementation notes:
 * - Backed by Redis so login-init and the LMS callback can hit different replicas
 * - Redis TTL (10 minutes) expires entries; no cleanup timer needed
 * - One-time use: the record is read and deleted atomically on validation
 * - No fallback once Redis is configured: if it is down the launch fails
 *   rather than silently going per-replica again. Only a wholly unconfigured
 *   Redis (REDIS_HOST unset, development only) uses in-memory storage;
 *   staging and production refuse to boot without it.
 */

export interface LtiStateRecord {
  nonce: string;
  toolType: 'educator' | 'student';
  /**
   * Canvas SpeedGrader review token from OIDC `target_link_uri` (`rw_review`).
   * Carried across callback → launch because form_post drops the original query string.
   */
  canvasReviewToken?: string | null;
}

@Injectable()
export class LtiStateService {
  constructor(
    private readonly redisService: RedisService,
    private readonly logger: LoggerService,
  ) {}

  private key(state: string): string {
    return `${LtiConstants.REDIS.STATE_KEY_PREFIX}${state}`;
  }

  /**
   * Create a new state/nonce pair for an LTI login initiation.
   * Both values are UUIDs and stored together.
   */
  async createStatePair(
    state: string,
    nonce: string,
    toolType: 'educator' | 'student',
    options?: { canvasReviewToken?: string | null },
  ): Promise<void> {
    const review = options?.canvasReviewToken?.trim() || null;
    const record: LtiStateRecord = {
      nonce,
      toolType,
      ...(review ? { canvasReviewToken: review } : {}),
    };

    await runLtiStorageOp(this.logger, 'state write', () =>
      this.redisService.setStrict(this.key(state), record, LtiConstants.REDIS.STATE_TTL_SECONDS),
    );
    this.logger.debug(
      `[LTI State] Created state/nonce pair for ${toolType} tool. State: ${state.substring(0, 8)}...` +
        (review ? ' (canvas review token attached)' : ''),
    );
  }

  /**
   * Validate state and nonce from the LTI launch callback.
   *
   * Security checks:
   * 1. State must exist in Redis (not forged, not expired, not already used)
   * 2. Tool type must match the one the pair was created for
   * 3. Nonce in id_token must match the stored nonce
   *
   * The record is consumed on read, so a replay finds nothing regardless of
   * whether the checks below pass.
   *
   * @returns The consumed state record (includes optional Canvas review token)
   * @throws UnauthorizedException if validation fails
   */
  async validateAndConsume(
    state: string | undefined,
    nonceFromToken: string | undefined,
    toolType: 'educator' | 'student',
  ): Promise<LtiStateRecord> {
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

    const record = await runLtiStorageOp(this.logger, 'state read', () =>
      this.redisService.getDelStrict<LtiStateRecord>(this.key(state)),
    );
    if (!record) {
      this.logger.warn(
        `[LTI State] State not found: ${state.substring(0, 8)}... (possibly expired, already used, or forged)`,
      );
      throw new UnauthorizedException('Invalid or expired state parameter');
    }

    if (record.toolType !== toolType) {
      this.logger.warn(
        `[LTI State] Tool type mismatch. Expected: ${record.toolType}, got: ${toolType}`,
      );
      throw new UnauthorizedException('State parameter tool type mismatch');
    }

    if (record.nonce !== nonceFromToken) {
      this.logger.warn(
        `[LTI State] Nonce mismatch. Expected: ${record.nonce.substring(0, 8)}..., got: ${nonceFromToken.substring(0, 8)}...`,
      );
      throw new UnauthorizedException('Nonce mismatch - possible replay attack');
    }

    this.logger.log(
      `[LTI State] Successfully validated and consumed state/nonce for ${toolType} tool. State: ${state.substring(0, 8)}...`,
    );
    return record;
  }
}
