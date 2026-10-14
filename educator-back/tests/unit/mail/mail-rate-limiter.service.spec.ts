import { MailRateLimiterService } from '../../../src/mail/mail-rate-limiter.service';
import type { LoggerService } from '../../../src/common/services';
import {
  MAIL_RATE_LIMIT_HOUR_LIMIT,
  MAIL_RATE_LIMIT_MINUTE_LIMIT,
  MAIL_RATE_LIMIT_MINUTE_WINDOW_MS,
} from '../../../src/mail/mail-rate-limit.constants';

// Re-implements the RESERVE_SLOT_SCRIPT's sorted-set semantics in JS so these
// tests exercise the same rolling-window math a real Redis EVAL would, using
// ZCOUNT/ZRANGEBYSCORE's inclusive-both-ends default range behavior. The
// denied-path `oldest` score is returned as a string, matching real
// ioredis (WITHSCORES replies are bulk strings, unlike the plain integer
// `now` on the allowed path) — a prior version of this mock returned a JS
// number here, which masked a string/number arithmetic bug in
// MailRateLimiterService.tryAcquireRedis() that corrupted retryAfterMs into
// a multi-trillion-millisecond value in production.
function buildRedisMock() {
  const zset: { member: string; score: number }[] = [];

  return {
    zset,
    eval: jest.fn(
      async (
        _script: string,
        _numKeys: number,
        _key: string,
        ...argv: (string | number)[]
      ): Promise<[number, number | string, number]> => {
        const [now, minuteWindowMs, minuteLimit, hourWindowMs, hourLimit, member] = argv as [
          number,
          number,
          number,
          number,
          number,
          string,
          number,
        ];

        for (let i = zset.length - 1; i >= 0; i--) {
          if (zset[i].score <= now - hourWindowMs) zset.splice(i, 1);
        }

        const inMinuteWindow = zset.filter((e) => e.score >= now - minuteWindowMs && e.score <= now);
        if (inMinuteWindow.length >= minuteLimit) {
          const oldest = [...inMinuteWindow].sort((a, b) => a.score - b.score)[0];
          return [0, String(oldest?.score ?? now), 1];
        }

        if (zset.length >= hourLimit) {
          const oldest = [...zset].sort((a, b) => a.score - b.score)[0];
          return [0, String(oldest?.score ?? now), 2];
        }

        zset.push({ member, score: now });
        return [1, now, 0];
      },
    ),
  };
}

describe('MailRateLimiterService', () => {
  let logger: { log: jest.Mock; error: jest.Mock; warn: jest.Mock };

  beforeEach(() => {
    logger = { log: jest.fn(), error: jest.fn(), warn: jest.fn() };
  });

  describe('Redis-backed', () => {
    it('allows a send under both limits', async () => {
      const redis = buildRedisMock();
      const service = new MailRateLimiterService(redis as never, logger as unknown as LoggerService);

      await expect(service.tryAcquire()).resolves.toEqual({ allowed: true });
    });

    it('blocks the send that would exceed the per-minute limit', async () => {
      const redis = buildRedisMock();
      const service = new MailRateLimiterService(redis as never, logger as unknown as LoggerService);

      for (let i = 0; i < MAIL_RATE_LIMIT_MINUTE_LIMIT; i++) {
        // eslint-disable-next-line no-await-in-loop
        expect((await service.tryAcquire()).allowed).toBe(true);
      }

      const blocked = await service.tryAcquire();
      expect(blocked.allowed).toBe(false);
      expect(blocked.retryAfterMs).toBeGreaterThan(0);
      expect(blocked.retryAfterMs).toBeLessThanOrEqual(MAIL_RATE_LIMIT_MINUTE_WINDOW_MS);
    });

    it('is a true rolling window — frees exactly one slot as its one oldest entry ages out, not all-at-once on a fixed reset', async () => {
      const redis = buildRedisMock();
      const service = new MailRateLimiterService(redis as never, logger as unknown as LoggerService);
      const t0 = Date.now();
      let now = t0;
      jest.spyOn(Date, 'now').mockImplementation(() => now);

      try {
        // Stagger each send by 1ms so every entry has a distinct timestamp —
        // a fixed-bucket limiter would instead reset all of them together at
        // the next bucket boundary.
        for (let i = 0; i < MAIL_RATE_LIMIT_MINUTE_LIMIT; i++) {
          // eslint-disable-next-line no-await-in-loop
          await service.tryAcquire();
          now += 1;
        }
        expect((await service.tryAcquire()).allowed).toBe(false);

        // Land exactly 1ms past the oldest (t0) entry's window: t0 ages out,
        // every later entry (t0+1 .. t0+29) is still within it — frees
        // exactly the one slot, not the whole batch.
        now = t0 + 1 + MAIL_RATE_LIMIT_MINUTE_WINDOW_MS;
        expect((await service.tryAcquire()).allowed).toBe(true);
        expect((await service.tryAcquire()).allowed).toBe(false);
      } finally {
        (Date.now as jest.Mock).mockRestore();
      }
    });

    it('computes a sane retryAfterMs from a string-typed oldest score, not a string-concatenated one', async () => {
      const redis = buildRedisMock();
      const service = new MailRateLimiterService(redis as never, logger as unknown as LoggerService);

      for (let i = 0; i < MAIL_RATE_LIMIT_MINUTE_LIMIT; i++) {
        // eslint-disable-next-line no-await-in-loop
        await service.tryAcquire();
      }

      const blocked = await service.tryAcquire();
      expect(blocked.allowed).toBe(false);
      // A string-concatenation bug (e.g. '<oldest>' + windowMs - now) yields
      // a value in the trillions of ms — assert we're nowhere near that.
      expect(blocked.retryAfterMs).toBeLessThanOrEqual(MAIL_RATE_LIMIT_MINUTE_WINDOW_MS);
    });

    it('falls back to in-memory (and logs) when the Redis EVAL call fails', async () => {
      const redis = { eval: jest.fn().mockRejectedValue(new Error('connection reset')) };
      const service = new MailRateLimiterService(redis as never, logger as unknown as LoggerService);

      await expect(service.tryAcquire()).resolves.toEqual({ allowed: true });
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('in-memory fallback (no Redis configured)', () => {
    it('allows a send under both limits', async () => {
      const service = new MailRateLimiterService(null, logger as unknown as LoggerService);
      await expect(service.tryAcquire()).resolves.toEqual({ allowed: true });
    });

    it('blocks the send that would exceed the per-minute limit', async () => {
      const service = new MailRateLimiterService(null, logger as unknown as LoggerService);

      for (let i = 0; i < MAIL_RATE_LIMIT_MINUTE_LIMIT; i++) {
        // eslint-disable-next-line no-await-in-loop
        await service.tryAcquire();
      }

      const blocked = await service.tryAcquire();
      expect(blocked.allowed).toBe(false);
      expect(blocked.retryAfterMs).toBeGreaterThan(0);
    });

    it('blocks once the hourly limit is hit even while comfortably under the per-minute limit', async () => {
      const service = new MailRateLimiterService(null, logger as unknown as LoggerService);
      let now = Date.now();
      jest.spyOn(Date, 'now').mockImplementation(() => now);

      try {
        // 1 send every 5s stays far under the 30/min cap, but still
        // accumulates to the 100/hour cap well inside the hour window.
        for (let i = 0; i < MAIL_RATE_LIMIT_HOUR_LIMIT; i++) {
          // eslint-disable-next-line no-await-in-loop
          expect((await service.tryAcquire()).allowed).toBe(true);
          now += 5_000;
        }

        const blocked = await service.tryAcquire();
        expect(blocked.allowed).toBe(false);
      } finally {
        (Date.now as jest.Mock).mockRestore();
      }
    });
  });
});
