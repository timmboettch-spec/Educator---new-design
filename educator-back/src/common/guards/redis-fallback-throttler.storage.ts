import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { RedisService } from 'src/redis/redis.service';

interface CacheEntry {
  hits: number;
  expiresAt: number;
}

@Injectable()
export class RedisFallbackThrottlerStorage implements ThrottlerStorage, OnModuleDestroy {
  private readonly memoryCache = new Map<string, CacheEntry>();
  private readonly cleanupTimer: NodeJS.Timeout;

  constructor(private readonly redisService: RedisService) {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();

      for (const [key, value] of this.memoryCache.entries()) {
        if (value.expiresAt <= now) {
          this.memoryCache.delete(key);
        }
      }
    }, 60_000);
    // Prevents this housekeeping timer from keeping the process (or a Jest
    // worker with no --forceExit) alive — it's a best-effort cache sweep,
    // not something the process should wait on.
    this.cleanupTimer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.cleanupTimer);
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<{
    totalHits: number;
    timeToExpire: number;
    isBlocked: boolean;
    timeToBlockExpire: number;
  }> {
    const cacheKey = `throttle:${throttlerName}:${key}`;
    const ttlSeconds = Math.max(1, Math.ceil(ttl / 1000));

    try {
      const totalHits = await this.redisService.increment(
        cacheKey,
        ttlSeconds,
      );

      return {
        totalHits,
        timeToExpire: ttlSeconds,
        isBlocked: totalHits > limit,
        timeToBlockExpire: blockDuration ? Math.ceil(blockDuration / 1000) : ttlSeconds,
      };
    } catch (error) {
      const now = Date.now();
      const existing = this.memoryCache.get(cacheKey);
      const timeToExpire = existing
        ? Math.max(1, Math.ceil((existing.expiresAt - now) / 1000))
        : ttlSeconds;
      let hits = 1;

      if (existing && existing.expiresAt > now) {
        hits = existing.hits + 1;
      }

      this.memoryCache.set(cacheKey, {
        hits,
        expiresAt: now + ttl,
      });

      return {
        totalHits: hits,
        timeToExpire: timeToExpire,
        isBlocked: hits > limit,
        timeToBlockExpire: blockDuration ? Math.ceil(blockDuration / 1000) : ttlSeconds,
      };
    }
  }
}