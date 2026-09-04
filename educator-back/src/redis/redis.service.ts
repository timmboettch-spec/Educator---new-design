import { Inject, Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_BLOB_KEY_PREFIX, REDIS_CLIENT, REDIS_DEFAULT_TTL_SECONDS } from './redis.constants';

interface MemoryCacheEntry {
  value: unknown;
  expiresAt: number;
}

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private cacheFlushTimer: NodeJS.Timeout | null = null;
  private inFallbackMode = false;

  private readonly memoryCache = new Map<string, MemoryCacheEntry>();

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis | null,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    if (this.redis) {
      this.logger.log('[Redis] Client initialized — connecting to Redis server...');
      this.redis.on('ready', () => {
        this.logger.log('[Redis] Connected and ready.');
      });
      this.redis.on('error', (err: Error) => {
        if (!this.inFallbackMode) {
          this.inFallbackMode = true;
          this.logger.warn(
            `[Redis] Server unavailable — switching to in-memory fallback. Reason: ${err.message}`,
          );
        }
      });
      this.redis.on('reconnecting', () => {
        this.logger.log('[Redis] Reconnecting to server...');
      });
    } else {
      this.logger.warn('[Redis] No client configured — running in in-memory fallback mode.');
    }
    const intervalMs = this.ttlSeconds * 1000;
    this.cacheFlushTimer = setInterval(() => void this.flushBlobCache(), intervalMs);
  }

  onModuleDestroy(): void {
    if (this.cacheFlushTimer) {
      clearInterval(this.cacheFlushTimer);
      this.cacheFlushTimer = null;
    }
  }

  private async flushBlobCache(): Promise<void> {
    if (this.redis) {
      try {
        const keys = await this.redis.keys(`${REDIS_BLOB_KEY_PREFIX}*`);
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      } catch (err) {
        this.logger.warn(
          `[Redis] flushBlobCache failed — falling back to in-memory eviction. Reason: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    const now = Date.now();
    for (const [key, entry] of this.memoryCache.entries()) {
      if (now >= entry.expiresAt) {
        this.memoryCache.delete(key);
      }
    }
  }

  private get ttlSeconds(): number {
    const raw = this.configService.get<string>('REDIS_CACHE_TTL_SECONDS');
    const parsed = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : REDIS_DEFAULT_TTL_SECONDS;
  }

  private memoryGet<T>(key: string): T | null {
    const entry = this.memoryCache.get(key);
    if (!entry) return null;
    if (Date.now() >= entry.expiresAt) {
      this.memoryCache.delete(key);
      return null;
    }
    return entry.value as T;
  }

  private memorySet(key: string, value: unknown, ttlSeconds: number): void {
    this.memoryCache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  private memoryDel(key: string): void {
    this.memoryCache.delete(key);
  }

  async get<T>(key: string): Promise<T | null> {
    if (this.redis) {
      try {
        const raw = await this.redis.get(key);
        if (raw !== null && raw !== undefined) {
          this.logRecovery();
          return JSON.parse(raw) as T;
        }
        return this.memoryGet<T>(key);
      } catch (err) {
        this.activateFallback('GET', key, err);
        return this.memoryGet<T>(key);
      }
    }
    return this.memoryGet<T>(key);
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const expiry = ttlSeconds ?? this.ttlSeconds;
    if (this.redis) {
      try {
        await this.redis.set(key, JSON.stringify(value), 'EX', expiry);
        this.logRecovery();
        return;
      } catch (err) {
        this.activateFallback('SET', key, err);
      }
    }
    this.memorySet(key, value, expiry);
  }

  async del(key: string): Promise<void> {
    this.memoryDel(key);
    if (this.redis) {
      try {
        await this.redis.del(key);
        this.logRecovery();
      } catch (err) {
        this.logger.warn(
          `[Redis] DEL "${key}" failed — removed from in-memory only. Reason: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  async delByPrefix(prefix: string): Promise<void> {
    for (const key of Array.from(this.memoryCache.keys())) {
      if (key.startsWith(prefix)) {
        this.memoryCache.delete(key);
      }
    }

    if (this.redis) {
      try {
        const keys = await this.redis.keys(`${prefix}*`);
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      } catch (err) {
        this.logger.warn(
          `[Redis] DEL by prefix "${prefix}" failed — removed from in-memory only. Reason: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  private logRecovery(): void {
    if (this.inFallbackMode) {
      this.inFallbackMode = false;
      this.logger.log('[Redis] Connection recovered — resumed using Redis.');
    }
  }

  private activateFallback(op: string, key: string, err: unknown): void {
    const reason = err instanceof Error ? err.message : String(err);
    if (!this.inFallbackMode) {
      this.inFallbackMode = true;
      this.logger.warn(
        `[Redis] ${op} "${key}" failed — activating in-memory fallback. Reason: ${reason}`,
      );
    } else {
      this.logger.debug(`[Redis] ${op} "${key}" still failing in fallback mode. Reason: ${reason}`);
    }
  }

  get isRedisConnected(): boolean {
    return this.redis !== null && this.redis.status === 'ready';
  }

  async isHealthy(): Promise<boolean> {
    if (!this.redis) return false;
    try {
      return (await this.redis.ping()) === 'PONG';
    } catch (err) {
      this.logger.warn(
        `[Redis] Health check failed — connection unavailable. Reason: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return false;
    }
  }

  async getStatus(): Promise<{
    mode: 'redis' | 'in-memory-fallback';
    redisConnected: boolean;
    memoryCacheSize: number;
    ttlSeconds: number;
  }> {
    const redisConnected = this.redis ? await this.isHealthy() : false;
    const mode: 'redis' | 'in-memory-fallback' = redisConnected ? 'redis' : 'in-memory-fallback';
    this.logger.log(
      `[Redis] Status — mode: ${mode}, connected: ${redisConnected}, ` +
        `memoryCacheSize: ${this.memoryCache.size}, ttl: ${this.ttlSeconds}s`,
    );
    return {
      mode,
      redisConnected,
      memoryCacheSize: this.memoryCache.size,
      ttlSeconds: this.ttlSeconds,
    };
  }

  async increment(key: string, ttlSeconds: number): Promise<number> {
    if (this.redis) {
      try {
        const value = await this.redis.incr(key);
        if (value === 1) {
          await this.redis.expire(key, ttlSeconds);
        }
        return value;
      } catch (err) {
        this.activateFallback('INCR', key, err);
      }
    }
    const current = this.memoryGet<number>(key) ?? 0;
    const next = current + 1;
    this.memorySet(key, next, ttlSeconds);
    return next;
  }
}
