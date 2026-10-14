import { Inject, Injectable, OnModuleDestroy, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { createHash } from 'crypto';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { LoggerService } from '../../common/services';
import { AuthThrottleConstants } from '../../common/constants/throttle.constants';

export interface ForgotPasswordRateLimitResult {
  allowed: boolean;
  reason?: 'cooldown' | 'account_limit' | 'ip_limit';
  retryAfter: number;
  message?: string;
}

interface MemoryHitEntry {
  count: number;
  expiresAt: number;
}

interface MemoryCooldownEntry {
  expiresAt: number;
}

const FORGOT_PASSWORD_RATE_LIMIT_SCRIPT = `
local hasAccount = tonumber(ARGV[6]) == 1
local ipLimit = tonumber(ARGV[5])
local ipWindowTtl = tonumber(ARGV[4])

-- 1. Check IP limit
local ipCount = tonumber(redis.call('GET', KEYS[3]) or '0')
if ipCount >= ipLimit then
  local ipTtl = redis.call('TTL', KEYS[3])
  return {0, 'ip_limit', (ipTtl and ipTtl > 0) and ipTtl or ipWindowTtl}
end

-- 2. Check Account Cooldown and Limit (if account is present)
if hasAccount then
  local inCooldown = redis.call('EXISTS', KEYS[1])
  if inCooldown == 1 then
    local cooldownTtl = redis.call('TTL', KEYS[1])
    local fallbackCooldown = tonumber(ARGV[1])
    return {0, 'cooldown', (cooldownTtl and cooldownTtl > 0) and cooldownTtl or fallbackCooldown}
  end

  local accountLimit = tonumber(ARGV[3])
  local accountWindowTtl = tonumber(ARGV[2])
  local accountCount = tonumber(redis.call('GET', KEYS[2]) or '0')
  if accountCount >= accountLimit then
    local accountTtl = redis.call('TTL', KEYS[2])
    return {0, 'account_limit', (accountTtl and accountTtl > 0) and accountTtl or accountWindowTtl}
  end
end

-- 3. All checks passed! Now record and consume atomically:
local newIpCount = redis.call('INCR', KEYS[3])
if newIpCount == 1 then
  redis.call('EXPIRE', KEYS[3], ipWindowTtl)
end

if hasAccount then
  local cooldownTtl = tonumber(ARGV[1])
  redis.call('SET', KEYS[1], '1', 'EX', cooldownTtl)

  local accountWindowTtl = tonumber(ARGV[2])
  local newAccountCount = redis.call('INCR', KEYS[2])
  if newAccountCount == 1 then
    redis.call('EXPIRE', KEYS[2], accountWindowTtl)
  end
end

return {1, 'allowed', 0}
`;

@Injectable()
export class ForgotPasswordRateLimiterService implements OnModuleDestroy {
  private readonly memoryCooldown = new Map<string, MemoryCooldownEntry>();
  private readonly memoryAccountHits = new Map<string, MemoryHitEntry>();
  private readonly memoryIpHits = new Map<string, MemoryHitEntry>();

  constructor(
    @Inject(REDIS_CLIENT) @Optional() private readonly redis?: Redis | null,
    @Optional() private readonly configService?: ConfigService,
    @Optional() private readonly logger?: LoggerService,
  ) {}

  onModuleDestroy(): void {
    this.reset();
  }

  /**
   * Resets in-memory tracking state. Intended for use in unit tests.
   */
  reset(): void {
    this.memoryCooldown.clear();
    this.memoryAccountHits.clear();
    this.memoryIpHits.clear();
  }

  get cooldownSeconds(): number {
    return (
      this.configService?.get<number>('throttle.authForgotPassword.cooldownSeconds') ??
      AuthThrottleConstants.FORGOT_PASSWORD.COOLDOWN_SECONDS
    );
  }

  get accountLimit(): number {
    return (
      this.configService?.get<number>('throttle.authForgotPassword.limit') ??
      AuthThrottleConstants.FORGOT_PASSWORD.LIMIT
    );
  }

  get accountWindowSeconds(): number {
    const ttlMs =
      this.configService?.get<number>('throttle.authForgotPassword.ttlMs') ??
      AuthThrottleConstants.FORGOT_PASSWORD.TTL;
    return Math.max(1, Math.ceil(ttlMs / 1000));
  }

  get ipLimit(): number {
    return (
      this.configService?.get<number>('throttle.authForgotPassword.ipLimit') ??
      AuthThrottleConstants.FORGOT_PASSWORD.IP_LIMIT
    );
  }

  get ipWindowSeconds(): number {
    const ttlMs =
      this.configService?.get<number>('throttle.authForgotPassword.ipTtlMs') ??
      AuthThrottleConstants.FORGOT_PASSWORD.IP_TTL;
    return Math.max(1, Math.ceil(ttlMs / 1000));
  }

  async consume(rawEmail?: string, rawIp = 'unknown'): Promise<ForgotPasswordRateLimitResult> {
    const normalizedEmail = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
    const hasAccount = Boolean(normalizedEmail);
    const accountIdentifier = hasAccount
      ? createHash('sha256').update(normalizedEmail).digest('hex')
      : null;

    const normalizedIp = rawIp.trim().toLowerCase() || 'unknown';

    const cooldownKey = accountIdentifier
      ? `forgot-password:account:${accountIdentifier}:cooldown`
      : null;
    const accountLimitKey = accountIdentifier
      ? `forgot-password:account:${accountIdentifier}`
      : null;
    const ipLimitKey = `forgot-password:ip:${normalizedIp}`;

    const cooldownTtl = this.cooldownSeconds;
    const accountWindowTtl = this.accountWindowSeconds;
    const accountMax = this.accountLimit;
    const ipWindowTtl = this.ipWindowSeconds;
    const ipMax = this.ipLimit;

    if (this.redis && this.redis.status === 'ready') {
      try {
        return await this.consumeRedis(
          cooldownKey,
          accountLimitKey,
          ipLimitKey,
          cooldownTtl,
          accountWindowTtl,
          accountMax,
          ipWindowTtl,
          ipMax,
          hasAccount,
        );
      } catch (err) {
        this.logger?.warn?.(
          `[ForgotPasswordRateLimiterService] Redis check failed, falling back to in-memory: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    return this.consumeInMemory(
      accountLimitKey,
      cooldownKey,
      ipLimitKey,
      cooldownTtl,
      accountWindowTtl,
      accountMax,
      ipWindowTtl,
      ipMax,
      hasAccount,
    );
  }

  private async consumeRedis(
    cooldownKey: string | null,
    accountLimitKey: string | null,
    ipLimitKey: string,
    cooldownTtl: number,
    accountWindowTtl: number,
    accountMax: number,
    ipWindowTtl: number,
    ipMax: number,
    hasAccount: boolean,
  ): Promise<ForgotPasswordRateLimitResult> {
    if (!this.redis) {
      throw new Error('Redis client unavailable');
    }

    const keys = [cooldownKey ?? 'unused', accountLimitKey ?? 'unused', ipLimitKey];
    const args = [
      cooldownTtl,
      accountWindowTtl,
      accountMax,
      ipWindowTtl,
      ipMax,
      hasAccount ? 1 : 0,
    ];

    const result = (await this.redis.eval(
      FORGOT_PASSWORD_RATE_LIMIT_SCRIPT,
      keys.length,
      ...keys,
      ...args,
    )) as [number, string, number | string];

    const allowed = Number(result[0]) === 1;
    if (allowed) {
      return { allowed: true, retryAfter: 0 };
    }

    const reason = result[1] as 'cooldown' | 'account_limit' | 'ip_limit';
    const retryAfter = Math.max(1, Math.ceil(Number(result[2]) || 1));

    return {
      allowed: false,
      reason,
      retryAfter,
      message: this.resolveErrorMessage(reason),
    };
  }

  private consumeInMemory(
    accountLimitKey: string | null,
    cooldownKey: string | null,
    ipLimitKey: string,
    cooldownTtl: number,
    accountWindowTtl: number,
    accountMax: number,
    ipWindowTtl: number,
    ipMax: number,
    hasAccount: boolean,
  ): ForgotPasswordRateLimitResult {
    const now = Date.now();

    // 1. Check IP limit
    const ipEntry = this.memoryIpHits.get(ipLimitKey);
    if (ipEntry) {
      if (ipEntry.expiresAt > now) {
        if (ipEntry.count >= ipMax) {
          const retryAfter = Math.max(1, Math.ceil((ipEntry.expiresAt - now) / 1000));
          return {
            allowed: false,
            reason: 'ip_limit',
            retryAfter,
            message: this.resolveErrorMessage('ip_limit'),
          };
        }
      } else {
        this.memoryIpHits.delete(ipLimitKey);
      }
    }

    // 2. Check Account Cooldown and Limit
    if (hasAccount && accountLimitKey && cooldownKey) {
      const cooldownEntry = this.memoryCooldown.get(cooldownKey);
      if (cooldownEntry) {
        if (cooldownEntry.expiresAt > now) {
          const retryAfter = Math.max(1, Math.ceil((cooldownEntry.expiresAt - now) / 1000));
          return {
            allowed: false,
            reason: 'cooldown',
            retryAfter,
            message: this.resolveErrorMessage('cooldown'),
          };
        } else {
          this.memoryCooldown.delete(cooldownKey);
        }
      }

      const accountEntry = this.memoryAccountHits.get(accountLimitKey);
      if (accountEntry) {
        if (accountEntry.expiresAt > now) {
          if (accountEntry.count >= accountMax) {
            const retryAfter = Math.max(1, Math.ceil((accountEntry.expiresAt - now) / 1000));
            return {
              allowed: false,
              reason: 'account_limit',
              retryAfter,
              message: this.resolveErrorMessage('account_limit'),
            };
          }
        } else {
          this.memoryAccountHits.delete(accountLimitKey);
        }
      }
    }

    // 3. All checks passed! Now record and consume:
    // Increment IP counter
    const currentIp = this.memoryIpHits.get(ipLimitKey);
    if (currentIp && currentIp.expiresAt > now) {
      currentIp.count += 1;
    } else {
      this.memoryIpHits.set(ipLimitKey, {
        count: 1,
        expiresAt: now + ipWindowTtl * 1000,
      });
    }

    // If account provided, record cooldown and increment account counter
    if (hasAccount && accountLimitKey && cooldownKey) {
      this.memoryCooldown.set(cooldownKey, {
        expiresAt: now + cooldownTtl * 1000,
      });

      const currentAccount = this.memoryAccountHits.get(accountLimitKey);
      if (currentAccount && currentAccount.expiresAt > now) {
        currentAccount.count += 1;
      } else {
        this.memoryAccountHits.set(accountLimitKey, {
          count: 1,
          expiresAt: now + accountWindowTtl * 1000,
        });
      }
    }

    return { allowed: true, retryAfter: 0 };
  }

  private resolveErrorMessage(reason: 'cooldown' | 'account_limit' | 'ip_limit'): string {
    if (reason === 'cooldown') {
      return 'Please wait before requesting another password reset code.';
    }
    return 'Too many password reset requests. Please try again later.';
  }

  private sweepExpiredMemory(): void {
    const now = Date.now();
    for (const [key, entry] of this.memoryCooldown.entries()) {
      if (entry.expiresAt <= now) {
        this.memoryCooldown.delete(key);
      }
    }
    for (const [key, entry] of this.memoryAccountHits.entries()) {
      if (entry.expiresAt <= now) {
        this.memoryAccountHits.delete(key);
      }
    }
    for (const [key, entry] of this.memoryIpHits.entries()) {
      if (entry.expiresAt <= now) {
        this.memoryIpHits.delete(key);
      }
    }
  }
}
