import { Inject, Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT, REDIS_DEFAULT_TTL_SECONDS, isInMemoryAllowed } from './redis.constants';
import { LoggerService } from '../common/services/logger.service';

const GET_DEL_SCRIPT = `
  local value = redis.call('GET', KEYS[1])
  if value then redis.call('DEL', KEYS[1]) end
  return value
`;

interface MemoryCacheEntry {
  value: unknown;
  expiresAt: number;
}

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private cacheFlushTimer: NodeJS.Timeout | null = null;
  private inFallbackMode = false;

  private readonly memoryCache = new Map<string, MemoryCacheEntry>();

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis | null,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
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
    this.cacheFlushTimer = setInterval(() => void this.evictExpiredMemoryEntries(), intervalMs);
  }

  onModuleDestroy(): void {
    if (this.cacheFlushTimer) {
      clearInterval(this.cacheFlushTimer);
      this.cacheFlushTimer = null;
    }
  }

  private evictExpiredMemoryEntries(): void {
    const now = Date.now();
    for (const [key, entry] of this.memoryCache.entries()) {
      if (now >= entry.expiresAt) {
        this.memoryCache.delete(key);
      }
    }
  }

  private get ttlSeconds(): number {
    const raw = this.configService.get<number>('redis.cacheTtlSeconds');
    return raw !== undefined && Number.isFinite(raw) && raw > 0 ? raw : REDIS_DEFAULT_TTL_SECONDS;
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

  private get strictMemoryFallbackAllowed(): boolean {
    if (this.configService.get<string>('redis.host')) {
      return false;
    }
    return isInMemoryAllowed(this.configService.get<string>('app.nodeEnv'));
  }

  async setStrict(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (!this.redis && this.strictMemoryFallbackAllowed) {
      this.memorySet(key, value, ttlSeconds);
      return;
    }
    await this.requireRedis().set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  async getDelStrict<T>(key: string): Promise<T | null> {
    if (!this.redis && this.strictMemoryFallbackAllowed) {
      const value = this.memoryGet<T>(key);
      this.memoryDel(key);
      return value;
    }

    const raw = (await this.requireRedis().eval(GET_DEL_SCRIPT, 1, key)) as string | null;
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as T;
    } catch {
      this.logger.error(`[Redis] Corrupt JSON at "${key}" — treating as not found.`);
      return null;
    }
  }

  private requireRedis(): Redis {
    if (!this.redis) {
      throw new Error('Redis client is not configured');
    }
    return this.redis;
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
        } else {
          // Guard against orphaned keys that have no TTL (e.g. from a crashed previous run)
          const remaining = await this.redis.ttl(key);
          if (remaining < 0) {
            await this.redis.expire(key, ttlSeconds);
          }
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

  /** Appends one or more values to a Redis list. Falls back to a JSON array in memory. */
  async rpush(key: string, ...values: string[]): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.rpush(key, ...values);
        return;
      } catch (err) {
        this.activateFallback('RPUSH', key, err);
      }
    }
    const existing = this.memoryGet<string[]>(key) ?? [];
    this.memorySet(key, [...existing, ...values], 0);
  }

  /** Returns and removes all members of a Redis list. Falls back to in-memory. */
  async lrangeAndDel(key: string): Promise<string[]> {
    if (this.redis) {
      try {
        const values = await this.redis.lrange(key, 0, -1);
        if (values.length > 0) await this.redis.del(key);
        return values;
      } catch (err) {
        this.activateFallback('LRANGE', key, err);
      }
    }
    const values = this.memoryGet<string[]>(key) ?? [];
    this.memoryCache.delete(key);
    return values;
  }
}
