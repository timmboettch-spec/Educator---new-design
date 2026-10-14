import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { LoggerService } from '../common/services';
import {
  MAIL_RATE_LIMIT_HOUR_LIMIT,
  MAIL_RATE_LIMIT_HOUR_WINDOW_MS,
  MAIL_RATE_LIMIT_KEY,
  MAIL_RATE_LIMIT_KEY_TTL_SECONDS,
  MAIL_RATE_LIMIT_MINUTE_LIMIT,
  MAIL_RATE_LIMIT_MINUTE_WINDOW_MS,
} from './mail-rate-limit.constants';

export interface RateLimitResult {
  allowed: boolean;
  /** Only set when allowed is false — how long until a slot should be free. */
  retryAfterMs?: number;
}

// Atomic "sliding window log": every accepted send adds its own timestamp as
// a sorted-set member (score = timestamp), so the minute/hour counts are
// always the true rolling counts as of `now` — not a fixed-bucket count that
// resets on the clock and can let through 2x the limit right at a bucket
// boundary. Trimming to the (longer) hour window on every call keeps the set
// from growing unbounded while still holding everything the minute check
// needs. Runs as a single EVAL so concurrent sends (multiple replicas, or
// multiple in-flight requests on one replica) can't both read the same
// under-limit count and both proceed — Redis executes the whole script
// single-threaded.
const RESERVE_SLOT_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local minuteWindowMs = tonumber(ARGV[2])
local minuteLimit = tonumber(ARGV[3])
local hourWindowMs = tonumber(ARGV[4])
local hourLimit = tonumber(ARGV[5])
local member = ARGV[6]
local ttlSeconds = tonumber(ARGV[7])

redis.call('ZREMRANGEBYSCORE', key, 0, now - hourWindowMs)

local minuteCount = redis.call('ZCOUNT', key, now - minuteWindowMs, now)
if minuteCount >= minuteLimit then
  local oldest = redis.call('ZRANGEBYSCORE', key, now - minuteWindowMs, now, 'LIMIT', 0, 1, 'WITHSCORES')
  return {0, oldest[2] or now, 1}
end

local hourCount = redis.call('ZCARD', key)
if hourCount >= hourLimit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  return {0, oldest[2] or now, 2}
end

redis.call('ZADD', key, now, member)
redis.call('EXPIRE', key, ttlSeconds)
return {1, now, 0}
`;

/**
 * Enforces ACS's real rolling send-rate limits (30/min, 100/hour) ourselves,
 * so a burst of mail (e.g. a wave of signups) queues via MailRetryService
 * instead of ever tripping Azure's own throttle — which degrades the whole
 * sender identity, not just the offending burst, and was the likely
 * secondary cause of signup hangs during the bounce-storm incident.
 *
 * Same degrade-gracefully shape as RedisService/MailRetryService: Redis is
 * the real, cross-replica-accurate implementation; an in-memory sliding
 * window is the fallback when Redis is unavailable, accurate only within a
 * single replica.
 */
@Injectable()
export class MailRateLimiterService {
  private readonly memoryLog: number[] = [];

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis | null,
    private readonly logger: LoggerService,
  ) {}

  async tryAcquire(): Promise<RateLimitResult> {
    if (this.redis) {
      try {
        return await this.tryAcquireRedis();
      } catch (err) {
        this.logger.warn(
          `[MailRateLimiterService] Redis check failed, falling back to in-memory: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    return this.tryAcquireInMemory();
  }

  private async tryAcquireRedis(): Promise<RateLimitResult> {
    if (!this.redis) return this.tryAcquireInMemory();

    const now = Date.now();
    const member = `${now}-${Math.random().toString(36).slice(2, 10)}`;

    const result = (await this.redis.eval(
      RESERVE_SLOT_SCRIPT,
      1,
      MAIL_RATE_LIMIT_KEY,
      now,
      MAIL_RATE_LIMIT_MINUTE_WINDOW_MS,
      MAIL_RATE_LIMIT_MINUTE_LIMIT,
      MAIL_RATE_LIMIT_HOUR_WINDOW_MS,
      MAIL_RATE_LIMIT_HOUR_LIMIT,
      member,
      MAIL_RATE_LIMIT_KEY_TTL_SECONDS,
    )) as [number, number | string, number];

    const [allowed, oldest, violatedWindow] = result;
    if (allowed === 1) return { allowed: true };

    // `oldest` comes from the script's ZRANGEBYSCORE/ZRANGE ...WITHSCORES
    // branch — ioredis returns WITHSCORES values as strings (unlike the
    // plain integer `now` returned on the allowed path), so this must be
    // coerced before arithmetic or `oldest + windowMs` silently string-
    // concatenates instead of adding, corrupting retryAfterMs into a
    // multi-trillion-millisecond value that never becomes due.
    const windowMs =
      violatedWindow === 1 ? MAIL_RATE_LIMIT_MINUTE_WINDOW_MS : MAIL_RATE_LIMIT_HOUR_WINDOW_MS;
    return { allowed: false, retryAfterMs: Math.max(Number(oldest) + windowMs - now, 1_000) };
  }

  private tryAcquireInMemory(): RateLimitResult {
    const now = Date.now();

    while (this.memoryLog.length > 0 && this.memoryLog[0] <= now - MAIL_RATE_LIMIT_HOUR_WINDOW_MS) {
      this.memoryLog.shift();
    }

    const minuteCutoff = now - MAIL_RATE_LIMIT_MINUTE_WINDOW_MS;
    const minuteEntries = this.memoryLog.filter((t) => t > minuteCutoff);
    if (minuteEntries.length >= MAIL_RATE_LIMIT_MINUTE_LIMIT) {
      const oldest = minuteEntries[0];
      return {
        allowed: false,
        retryAfterMs: Math.max(oldest + MAIL_RATE_LIMIT_MINUTE_WINDOW_MS - now, 1_000),
      };
    }

    if (this.memoryLog.length >= MAIL_RATE_LIMIT_HOUR_LIMIT) {
      const oldest = this.memoryLog[0];
      return {
        allowed: false,
        retryAfterMs: Math.max(oldest + MAIL_RATE_LIMIT_HOUR_WINDOW_MS - now, 1_000),
      };
    }

    this.memoryLog.push(now);
    return { allowed: true };
  }
}
