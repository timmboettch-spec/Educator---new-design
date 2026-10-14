import { MailRetryService } from '../../../src/mail/mail-retry.service';
import { MailService } from '../../../src/mail/mail.service';
import type { LoggerService } from '../../../src/common/services';
import {
  MAIL_RETRY_BACKOFF_MS,
  MAIL_RETRY_JOBS_KEY,
  MAIL_RETRY_QUEUE_KEY,
} from '../../../src/mail/mail-retry.constants';

// Minimal fake of the subset of ioredis's API MailRetryService uses,
// including the chained `.multi()` builder.
function buildRedisMock() {
  const store = {
    jobs: new Map<string, string>(),
    scores: new Map<string, number>(),
  };

  const multiOps: { fn: string; args: unknown[] }[] = [];
  const multi = {
    hset: jest.fn((...args: unknown[]) => {
      multiOps.push({ fn: 'hset', args });
      return multi;
    }),
    zadd: jest.fn((...args: unknown[]) => {
      multiOps.push({ fn: 'zadd', args });
      return multi;
    }),
    hdel: jest.fn((...args: unknown[]) => {
      multiOps.push({ fn: 'hdel', args });
      return multi;
    }),
    zrem: jest.fn((...args: unknown[]) => {
      multiOps.push({ fn: 'zrem', args });
      return multi;
    }),
    exec: jest.fn(async () => {
      for (const op of multiOps.splice(0)) {
        if (op.fn === 'hset') store.jobs.set(op.args[1] as string, op.args[2] as string);
        // zadd(key, score, member) — member (the job id) is args[2], score is args[1].
        if (op.fn === 'zadd') store.scores.set(op.args[2] as string, op.args[1] as number);
        if (op.fn === 'hdel') store.jobs.delete(op.args[1] as string);
        if (op.fn === 'zrem') store.scores.delete(op.args[1] as string);
      }
      return [];
    }),
  };

  return {
    store,
    multi: jest.fn(() => multi),
    hget: jest.fn(async (_key: string, id: string) => store.jobs.get(id) ?? null),
    zrangebyscore: jest.fn(async (_key: string, _min: number, max: number) =>
      [...store.scores.entries()].filter(([, score]) => score <= max).map(([id]) => id),
    ),
    zrem: jest.fn(async (_key: string, id: string) => {
      store.scores.delete(id);
    }),
  };
}

describe('MailRetryService', () => {
  let mailService: { sendMail: jest.Mock; trySendMail: jest.Mock };
  let logger: { log: jest.Mock; error: jest.Mock; warn: jest.Mock };
  let redis: ReturnType<typeof buildRedisMock>;
  let service: MailRetryService;

  beforeEach(() => {
    jest.useFakeTimers();
    mailService = {
      sendMail: jest.fn().mockResolvedValue(undefined),
      // attemptSend() calls trySendMail(), not sendMail() — see the
      // doc comment on MailRetryService.attemptSend() for why.
      trySendMail: jest.fn().mockResolvedValue({ sent: true }),
    };
    logger = { log: jest.fn(), error: jest.fn(), warn: jest.fn() };
    redis = buildRedisMock();
    service = new MailRetryService(
      redis as never,
      mailService as unknown as MailService,
      logger as unknown as LoggerService,
    );
  });

  afterEach(() => {
    // Clears any pending in-memory backoff setTimeout — without this, a
    // scheduled retry can outlive its test and keep Jest's process alive.
    service.onModuleDestroy();
    jest.useRealTimers();
  });

  describe('enqueue (Redis available)', () => {
    it('writes the job hash and a due-time sorted-set entry', async () => {
      await service.enqueue({ to: 'a@test.com', subject: 'Hi', text: 'x' }, 'ctx');

      expect(redis.store.jobs.size).toBe(1);
      expect(redis.store.scores.size).toBe(1);
    });

    it('base64-encodes Buffer attachment content for JSON-safe storage', async () => {
      const buf = Buffer.from('pdf-bytes');
      await service.enqueue(
        {
          to: 'a@test.com',
          subject: 'Hi',
          text: 'x',
          attachments: [{ filename: 'r.pdf', content: buf, contentType: 'application/pdf' }],
        },
        'ctx',
      );

      const [raw] = redis.store.jobs.values();
      const job = JSON.parse(raw!);
      expect(job.options.attachments[0].contentBase64).toBe(buf.toString('base64'));
    });

    it('falls back to in-memory queue when the Redis write throws', async () => {
      redis.multi.mockImplementationOnce(() => {
        throw new Error('connection reset');
      });

      await service.enqueue({ to: 'a@test.com', subject: 'Hi', text: 'x' }, 'ctx');

      expect(redis.store.jobs.size).toBe(0);
      // Internal memory queue got the job — verified indirectly via processMemoryQueue below.
      expect((service as unknown as { memoryQueue: unknown[] }).memoryQueue).toHaveLength(1);
    });

    it('drops (does not queue) an oversized payload', async () => {
      const huge = Buffer.alloc(6 * 1024 * 1024, 'x'); // > MAIL_RETRY_MAX_PAYLOAD_BYTES
      await service.enqueue(
        {
          to: 'a@test.com',
          subject: 'Hi',
          text: 'x',
          attachments: [{ filename: 'big.pdf', content: huge }],
        },
        'ctx',
      );

      expect(redis.store.jobs.size).toBe(0);
      expect((service as unknown as { memoryQueue: unknown[] }).memoryQueue).toHaveLength(0);
    });

    it('does not throw when the mail context payload is unserializable (circular reference)', async () => {
      const circular: Record<string, unknown> = {};
      circular.self = circular;

      await expect(
        service.enqueue({ to: 'a@test.com', subject: 'Hi', text: 'x', context: circular }, 'ctx'),
      ).resolves.toBeUndefined();

      expect(redis.store.jobs.size).toBe(0);
      expect((service as unknown as { memoryQueue: unknown[] }).memoryQueue).toHaveLength(0);
    });
  });

  describe('enqueue (no Redis — in-memory only)', () => {
    beforeEach(() => {
      service = new MailRetryService(
        null,
        mailService as unknown as MailService,
        logger as unknown as LoggerService,
      );
    });

    it('queues in memory and schedules a retry timer', async () => {
      jest.useFakeTimers();
      await service.enqueue({ to: 'a@test.com', subject: 'Hi', text: 'x' }, 'ctx');
      expect((service as unknown as { memoryQueue: unknown[] }).memoryQueue).toHaveLength(1);
    });
  });

  describe('processDueJobs (Redis-backed)', () => {
    const processDueJobs = (): Promise<void> =>
      (service as unknown as { processDueJobs: () => Promise<void> }).processDueJobs();

    it('resends and removes the job on success', async () => {
      await service.enqueue({ to: 'a@test.com', subject: 'Hi', text: 'x' }, 'ctx');
      // Force it "due" by rewriting the score to the past.
      const [id] = redis.store.jobs.keys();
      redis.store.scores.set(id!, Date.now() - 1000);

      await processDueJobs();

      expect(mailService.trySendMail).toHaveBeenCalledTimes(1);
      expect(redis.store.jobs.size).toBe(0);
      expect(redis.store.scores.size).toBe(0);
    });

    it('reschedules with backoff on a further failure, preserving the job, and logs it', async () => {
      const warnSpy = jest.spyOn(
        (service as unknown as { logger: { warn: jest.Mock } }).logger,
        'warn',
      );
      mailService.trySendMail.mockRejectedValueOnce(new Error('still down'));
      await service.enqueue({ to: 'a@test.com', subject: 'Hi', text: 'x' }, 'ctx');
      const [id] = redis.store.jobs.keys();
      redis.store.scores.set(id!, Date.now() - 1000);

      await processDueJobs();

      expect(redis.store.jobs.size).toBe(1);
      const job = JSON.parse(redis.store.jobs.get(id!)!);
      expect(job.attempt).toBe(1);
      // Re-scheduled further into the future than "now".
      expect(redis.store.scores.get(id!)).toBeGreaterThan(Date.now());
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('rescheduled'));
    });

    it('gives up, removes the job, and logs the final failure after exhausting all backoff attempts', async () => {
      const errorSpy = jest.spyOn(
        (service as unknown as { logger: { error: jest.Mock } }).logger,
        'error',
      );
      mailService.trySendMail.mockRejectedValue(new Error('permanently down'));
      await service.enqueue({ to: 'a@test.com', subject: 'Hi', text: 'x' }, 'ctx');
      const [id] = redis.store.jobs.keys();

      for (let i = 0; i < MAIL_RETRY_BACKOFF_MS.length; i++) {
        redis.store.scores.set(id!, Date.now() - 1000);
        await processDueJobs();
      }

      expect(redis.store.jobs.size).toBe(0);
      expect(redis.store.scores.size).toBe(0);
      expect(mailService.trySendMail).toHaveBeenCalledTimes(MAIL_RETRY_BACKOFF_MS.length);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('exhausted'));
    });

    it('cleans up a sorted-set entry whose job hash is already gone, and logs it', async () => {
      const warnSpy = jest.spyOn(
        (service as unknown as { logger: { warn: jest.Mock } }).logger,
        'warn',
      );
      redis.store.scores.set('ghost-id', Date.now() - 1000);
      await processDueJobs();
      expect(redis.store.scores.has('ghost-id')).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('stale queue entry'));
      expect(mailService.trySendMail).not.toHaveBeenCalled();
    });

    it('does not double-process concurrently (processing guard)', async () => {
      await service.enqueue({ to: 'a@test.com', subject: 'Hi', text: 'x' }, 'ctx');
      const [id] = redis.store.jobs.keys();
      redis.store.scores.set(id!, Date.now() - 1000);

      (service as unknown as { processing: boolean }).processing = true;
      await processDueJobs();
      expect(mailService.trySendMail).not.toHaveBeenCalled();
    });

    it('treats a still-rate-limited retry as a normal failure (same job id, not re-enqueued)', async () => {
      mailService.trySendMail.mockResolvedValueOnce({ sent: false, retryAfterMs: 5_000 });
      await service.enqueue({ to: 'a@test.com', subject: 'Hi', text: 'x' }, 'ctx');
      const [id] = redis.store.jobs.keys();
      redis.store.scores.set(id!, Date.now() - 1000);

      await processDueJobs();

      expect(redis.store.jobs.size).toBe(1);
      expect(redis.store.jobs.has(id!)).toBe(true);
      const job = JSON.parse(redis.store.jobs.get(id!)!);
      expect(job.attempt).toBe(1);
    });
  });

  describe('constants sanity', () => {
    it('exposes the expected Redis key names', () => {
      expect(MAIL_RETRY_JOBS_KEY).toBe('mail:retry:jobs');
      expect(MAIL_RETRY_QUEUE_KEY).toBe('mail:retry:queue');
    });
  });
});
