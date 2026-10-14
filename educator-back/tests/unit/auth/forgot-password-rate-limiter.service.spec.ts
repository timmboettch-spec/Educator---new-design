import { ForgotPasswordRateLimiterService } from '../../../src/auth/services/forgot-password-rate-limiter.service';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../../../src/common/services';
import type Redis from 'ioredis';

describe('ForgotPasswordRateLimiterService', () => {
  let service: ForgotPasswordRateLimiterService;
  let mockLogger: LoggerService;
  let mockConfigService: ConfigService;

  beforeEach(() => {
    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as unknown as LoggerService;

    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'throttle.authForgotPassword.cooldownSeconds') return 60;
        if (key === 'throttle.authForgotPassword.limit') return 5;
        if (key === 'throttle.authForgotPassword.ttlMs') return 900_000;
        if (key === 'throttle.authForgotPassword.ipLimit') return 10;
        if (key === 'throttle.authForgotPassword.ipTtlMs') return 900_000;
        return undefined;
      }),
    } as unknown as ConfigService;

    // By default instantiate without Redis (in-memory mode)
    service = new ForgotPasswordRateLimiterService(null, mockConfigService, mockLogger);
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  describe('In-Memory Mode (RWAI-3018 Core Requirements)', () => {
    it('Test 1 — First request allowed: allows first request for account and IP', async () => {
      const result = await service.consume('student@example.com', '192.168.1.1');
      expect(result.allowed).toBe(true);
      expect(result.retryAfter).toBe(0);
    });

    it('Test 2 — Repeated request rejected: immediately rejects second request for same account', async () => {
      const first = await service.consume('student@example.com', '192.168.1.1');
      expect(first.allowed).toBe(true);

      const second = await service.consume('student@example.com', '192.168.1.1');
      expect(second.allowed).toBe(false);
      expect(second.reason).toBe('cooldown');
      expect(second.retryAfter).toBeGreaterThan(0);
      expect(second.retryAfter).toBeLessThanOrEqual(60);
      expect(second.message).toBe('Please wait before requesting another password reset code.');
    });

    it('Test 3 — Multiple rapid requests: repeated rapid attempts remain blocked without consuming limit slots', async () => {
      const res1 = await service.consume('rapid@example.com', '10.0.0.1');
      expect(res1.allowed).toBe(true);

      const res2 = await service.consume('rapid@example.com', '10.0.0.1');
      const res3 = await service.consume('rapid@example.com', '10.0.0.1');
      const res4 = await service.consume('rapid@example.com', '10.0.0.1');

      expect(res2.allowed).toBe(false);
      expect(res2.reason).toBe('cooldown');
      expect(res3.allowed).toBe(false);
      expect(res3.reason).toBe('cooldown');
      expect(res4.allowed).toBe(false);
      expect(res4.reason).toBe('cooldown');
    });

    it('Test 4 — Cooldown/window expiry: allows next request after cooldown and enforces account limit', async () => {
      const originalNow = Date.now;
      let currentTime = 1000000;
      jest.spyOn(Date, 'now').mockImplementation(() => currentTime);

      try {
        // Request 1: allowed at t=0
        const res1 = await service.consume('cooldown-test@example.com', '10.0.0.2');
        expect(res1.allowed).toBe(true);

        // Immediate retry at t=10s: blocked by cooldown
        currentTime += 10_000;
        const res2 = await service.consume('cooldown-test@example.com', '10.0.0.2');
        expect(res2.allowed).toBe(false);
        expect(res2.reason).toBe('cooldown');

        // Advance past cooldown (60s -> t=61s): Request 2 allowed!
        currentTime += 51_000;
        const res3 = await service.consume('cooldown-test@example.com', '10.0.0.2');
        expect(res3.allowed).toBe(true);

        // Make requests up to accountLimit (limit = 5):
        // Requests 3, 4, 5 (after cooldown each time)
        for (let i = 3; i <= 5; i++) {
          currentTime += 61_000;
          const r = await service.consume('cooldown-test@example.com', '10.0.0.2');
          expect(r.allowed).toBe(true);
        }

        // 6th request after cooldown (exceeds account limit of 5 in 15min window)
        currentTime += 61_000;
        const resOverLimit = await service.consume('cooldown-test@example.com', '10.0.0.2');
        expect(resOverLimit.allowed).toBe(false);
        expect(resOverLimit.reason).toBe('account_limit');
        expect(resOverLimit.message).toBe('Too many password reset requests. Please try again later.');

        // Advance past the 15-minute window (900 seconds)
        currentTime += 900_000;
        const resAfterWindow = await service.consume('cooldown-test@example.com', '10.0.0.2');
        expect(resAfterWindow.allowed).toBe(true);
      } finally {
        jest.spyOn(Date, 'now').mockImplementation(originalNow);
      }
    });

    it('Test 5 — Account isolation: rate limit for Account A does not block Account B', async () => {
      // Account A makes request
      const resA1 = await service.consume('accountA@example.com', '10.0.0.3');
      expect(resA1.allowed).toBe(true);

      // Account A immediately tries again -> blocked by cooldown
      const resA2 = await service.consume('accountA@example.com', '10.0.0.3');
      expect(resA2.allowed).toBe(false);
      expect(resA2.reason).toBe('cooldown');

      // Account B from the same IP makes request -> allowed!
      const resB1 = await service.consume('accountB@example.com', '10.0.0.3');
      expect(resB1.allowed).toBe(true);
    });

    it('Test 6 — Source/IP protection: multiple accounts from same IP hit the IP limit', async () => {
      const ip = '198.51.100.5';
      const ipLimit = service.ipLimit; // 10

      // Make 10 requests from distinct accounts from the same IP
      for (let i = 1; i <= ipLimit; i++) {
        const res = await service.consume(`victim${i}@example.com`, ip);
        expect(res.allowed).toBe(true);
      }

      // 11th request from a completely new account from the same IP -> blocked by ip_limit!
      const blocked = await service.consume('victim11@example.com', ip);
      expect(blocked.allowed).toBe(false);
      expect(blocked.reason).toBe('ip_limit');
      expect(blocked.message).toBe('Too many password reset requests. Please try again later.');

      // But a request from a DIFFERENT IP for victim11 -> allowed!
      const otherIp = await service.consume('victim11@example.com', '198.51.100.6');
      expect(otherIp.allowed).toBe(true);
    });

    it('Test 7 — Concurrent requests: simultaneous requests for same account cannot both pass', async () => {
      // Execute 5 concurrent requests for the same account simultaneously
      const promises = [
        service.consume('concurrent@example.com', '10.0.0.4'),
        service.consume('concurrent@example.com', '10.0.0.4'),
        service.consume('concurrent@example.com', '10.0.0.4'),
      ];

      const results = await Promise.all(promises);
      const allowedCount = results.filter((r) => r.allowed).length;
      const blockedCount = results.filter((r) => !r.allowed).length;

      expect(allowedCount).toBe(1);
      expect(blockedCount).toBe(2);
      expect(results.find((r) => !r.allowed)?.reason).toBe('cooldown');
    });

    it('Test 8 — Normalization: email is normalized to prevent case/whitespace bypass', async () => {
      const res1 = await service.consume('  Student.User@Example.COM  ', '10.0.0.5');
      expect(res1.allowed).toBe(true);

      // Same email in lowercase without whitespace
      const res2 = await service.consume('student.user@example.com', '10.0.0.5');
      expect(res2.allowed).toBe(false);
      expect(res2.reason).toBe('cooldown');
    });

    it('handles requests with undefined or empty email safely by checking IP only', async () => {
      const res1 = await service.consume(undefined, '10.0.0.6');
      expect(res1.allowed).toBe(true);

      const res2 = await service.consume('', '10.0.0.6');
      expect(res2.allowed).toBe(true);
    });
  });

  describe('Redis Mode & Fallback Handling', () => {
    it('executes Lua script when Redis is ready and parses allowed response', async () => {
      const mockRedis = {
        status: 'ready',
        eval: jest.fn().mockResolvedValue([1, 'allowed', 0]),
      } as unknown as Redis;

      const redisService = new ForgotPasswordRateLimiterService(
        mockRedis,
        mockConfigService,
        mockLogger,
      );

      const result = await redisService.consume('redis-user@example.com', '1.2.3.4');
      expect(result.allowed).toBe(true);
      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.stringContaining('local hasAccount'),
        3,
        expect.stringContaining('forgot-password:account:'),
        expect.stringContaining('forgot-password:account:'),
        'forgot-password:ip:1.2.3.4',
        60,
        900,
        5,
        900,
        10,
        1,
      );
      redisService.onModuleDestroy();
    });

    it('parses Lua rejection response for cooldown', async () => {
      const mockRedis = {
        status: 'ready',
        eval: jest.fn().mockResolvedValue([0, 'cooldown', 42]),
      } as unknown as Redis;

      const redisService = new ForgotPasswordRateLimiterService(
        mockRedis,
        mockConfigService,
        mockLogger,
      );

      const result = await redisService.consume('redis-user@example.com', '1.2.3.4');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('cooldown');
      expect(result.retryAfter).toBe(42);
      expect(result.message).toBe('Please wait before requesting another password reset code.');
      redisService.onModuleDestroy();
    });

    it('parses Lua rejection response for account_limit', async () => {
      const mockRedis = {
        status: 'ready',
        eval: jest.fn().mockResolvedValue([0, 'account_limit', 300]),
      } as unknown as Redis;

      const redisService = new ForgotPasswordRateLimiterService(
        mockRedis,
        mockConfigService,
        mockLogger,
      );

      const result = await redisService.consume('redis-user@example.com', '1.2.3.4');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('account_limit');
      expect(result.retryAfter).toBe(300);
      expect(result.message).toBe('Too many password reset requests. Please try again later.');
      redisService.onModuleDestroy();
    });

    it('falls back to in-memory mode if Redis eval throws an error', async () => {
      const mockRedis = {
        status: 'ready',
        eval: jest.fn().mockRejectedValue(new Error('Connection lost')),
      } as unknown as Redis;

      const redisService = new ForgotPasswordRateLimiterService(
        mockRedis,
        mockConfigService,
        mockLogger,
      );

      const res1 = await redisService.consume('fallback-user@example.com', '1.2.3.5');
      expect(res1.allowed).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Redis check failed, falling back to in-memory'),
      );

      const res2 = await redisService.consume('fallback-user@example.com', '1.2.3.5');
      expect(res2.allowed).toBe(false);
      expect(res2.reason).toBe('cooldown');

      redisService.onModuleDestroy();
    });
  });
});
