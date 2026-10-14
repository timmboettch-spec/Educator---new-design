import { forwardRef, Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { LoggerService } from '../common/services';
import { MailService, type SendMailOptions } from './mail.service';
import {
  MAIL_RETRY_BACKOFF_MS,
  MAIL_RETRY_JOBS_KEY,
  MAIL_RETRY_MAX_PAYLOAD_BYTES,
  MAIL_RETRY_POLL_INTERVAL_MS,
  MAIL_RETRY_QUEUE_KEY,
} from './mail-retry.constants';

// JSON-safe mirror of SendMailOptions — Buffer attachment content can't
// round-trip through JSON, so it's stored base64-encoded and rebuilt into a
// real Buffer immediately before each retry send (see toSendMailOptions()).
interface RetryJob {
  id: string;
  attempt: number;
  context: string;
  options: {
    to: string | string[];
    subject: string;
    template?: string;
    context?: Record<string, unknown>;
    html?: string;
    text?: string;
    from?: string;
    attachments?: { filename: string; contentBase64: string; contentType?: string; cid?: string }[];
  };
}

/**
 * Best-effort delayed-retry queue for mail sends that are worth retrying
 * (report delivery) but shouldn't block the caller — enqueue() never throws
 * and returns once the job is durably queued (or accepted into the
 * in-memory fallback when Redis is unavailable, same degrade-gracefully
 * philosophy as RedisService).
 *
 * ---------------------------------------------------------------------------
 * FLOW (see docs/adr/0002-mail-retry-queue.md for the full write-up)
 * ---------------------------------------------------------------------------
 *   1. A caller's own sendMail() attempt fails (caller catches it).
 *   2. Caller calls enqueue(options, context) — never throws. The payload is
 *      converted to a JSON-safe RetryJob (Buffer attachments -> base64) and
 *      written to Redis: a hash (mail:retry:jobs, id -> job JSON) holding the
 *      payload, plus a sorted set (mail:retry:queue, id scored by due-time
 *      epoch ms) acting as the schedule/index. If Redis is unavailable (down,
 *      or REDIS_CLIENT is null because no Redis is configured at all), the
 *      job goes into an in-memory array instead, scheduled via setTimeout.
 *   3. Every MAIL_RETRY_POLL_INTERVAL_MS, @Interval-decorated processDueJobs()
 *      asks Redis for every queue member whose score (due-time) has passed,
 *      and retries each one's mail send.
 *   4. On success: both the hash entry and sorted-set entry are deleted —
 *      done.
 *   5. On failure: if attempts remain (MAIL_RETRY_BACKOFF_MS has more
 *      entries), the job is rewritten with attempt+1 and a new, later due
 *      score (exponential-ish backoff: 2min, 10min, 30min). If attempts are
 *      exhausted, the job is deleted and the failure is logged as final —
 *      there is no dead-letter store; the caller's own fallback (e.g. the
 *      blob-storage copy in student-backend reports.service.ts) is what
 *      still gets the content to the user.
 *   6. The in-memory fallback mirrors this exact state machine, just with a
 *      plain array + setTimeout chain instead of Redis structures.
 * ---------------------------------------------------------------------------
 *
 * Deliberately NOT used for OTP/verification-code mail: those are only
 * useful within their short validity window, so retrying them after a
 * backoff delay would just deliver a code that's already expired.
 */
@Injectable()
export class MailRetryService implements OnModuleDestroy {
  // Reentrancy guard for the @Interval poll — Redis calls are async, and a
  // slow poll (e.g. Redis briefly degraded) could still be running when the
  // next tick fires. Without this, two overlapping polls could both grab the
  // same due job and send it twice.
  private processing = false;

  // In-memory fallback queue, used only when REDIS_CLIENT is null (matches
  // RedisService's own "no Redis configured -> in-memory" degrade path).
  private readonly memoryQueue: RetryJob[] = [];
  private memoryTimer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis | null,
    // MailService.sendMail() calls back into enqueue() when rate-limited, so
    // this is a genuine mutual dependency — forwardRef breaks the otherwise
    // circular DI resolution between the two same-module providers.
    @Inject(forwardRef(() => MailService)) private readonly mailService: MailService,
    private readonly logger: LoggerService,
  ) {}

  onModuleDestroy(): void {
    // Prevents a scheduled in-memory retry from firing against a torn-down
    // module (e.g. in tests) and keeping the process alive past shutdown.
    if (this.memoryTimer) {
      clearTimeout(this.memoryTimer);
      this.memoryTimer = null;
    }
  }

  /**
   * Queue a mail send for later — either a failed attempt worth retrying, or
   * (MailService.sendMail's own call) one deferred because
   * MailRateLimiterService is at capacity. Fire-and-forget from the caller's
   * perspective — never throws; logs and drops the job (falling through to
   * whatever the caller already does on hard failure) if it can't be queued.
   *
   * `context` is a short human-readable label (e.g.
   * "emailReportPdfByStudentId:student=<id>") used purely for log
   * correlation — it has no effect on retry behavior.
   *
   * `initialDelayMs` defaults to the first failure-backoff step; pass the
   * rate limiter's own retryAfterMs when deferring due to rate limiting
   * instead of a genuine failure.
   */
  async enqueue(
    options: SendMailOptions,
    context: string,
    initialDelayMs: number = MAIL_RETRY_BACKOFF_MS[0],
  ): Promise<void> {
    const job = this.toRetryJob(options, context);
    if (!job) return; // toRetryJob already logged why.

    // Serialize exactly once here and reuse the string below, both to avoid
    // paying JSON.stringify's cost three times and — more importantly — so
    // there's a single, guarded place where a pathological payload (a
    // circular reference or BigInt inside the caller-supplied `context`
    // object would make JSON.stringify throw synchronously) can't escape
    // enqueue()'s "never throws" contract.
    let serialized: string;
    try {
      serialized = JSON.stringify(job);
    } catch (err) {
      this.logger.error(
        `[${context}] failed to serialize mail payload for retry — dropping: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return;
    }

    const payloadSize = Buffer.byteLength(serialized, 'utf8');
    if (payloadSize > MAIL_RETRY_MAX_PAYLOAD_BYTES) {
      this.logger.error(
        `[${context}] mail retry payload too large (${payloadSize} bytes) — dropping, not queueing.`,
      );
      return;
    }

    const dueAt = Date.now() + initialDelayMs;

    if (this.redis) {
      try {
        // hset (durable payload) + zadd (schedule index) as one atomic MULTI
        // so a job can never exist in the hash without a due-time in the
        // sorted set, or vice versa.
        await this.redis
          .multi()
          .hset(MAIL_RETRY_JOBS_KEY, job.id, serialized)
          .zadd(MAIL_RETRY_QUEUE_KEY, dueAt, job.id)
          .exec();
        this.logger.warn(
          `[${context}] mail send queued for retry in ~${Math.round(initialDelayMs / 1000)}s (job ${job.id}).`,
        );
        return;
      } catch (err) {
        // Redis is configured but the write itself failed (e.g. transient
        // network blip) — don't lose the job, fall through to the
        // in-memory path below instead of giving up entirely.
        this.logger.warn(
          `[${context}] failed to queue mail retry in Redis, falling back to in-memory: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    this.memoryQueue.push(job);
    this.scheduleMemoryProcessing(initialDelayMs);
    this.logger.warn(
      `[${context}] mail send queued for in-memory retry (job ${job.id}, no Redis).`,
    );
  }

  // ---------- Redis-backed processing ---------------------------------------

  /**
   * Polls for and processes every retry job whose scheduled due-time has
   * passed. No-ops entirely when there's no Redis client (in-memory jobs are
   * driven by their own setTimeout chain, not this poll).
   */
  @Interval(MAIL_RETRY_POLL_INTERVAL_MS)
  private async processDueJobs(): Promise<void> {
    if (!this.redis || this.processing) return;
    this.processing = true;
    try {
      const dueIds = await this.redis.zrangebyscore(MAIL_RETRY_QUEUE_KEY, 0, Date.now());
      for (const id of dueIds) {
        try {
          await this.processOneRedisJob(id);
        } catch (err) {
          // Isolate one bad job (e.g. corrupted JSON in the hash) from the
          // rest of the batch — without this try/catch, a single throw here
          // would abort the whole `for` loop and leave every other due job
          // unprocessed until the next poll.
          this.logger.warn(
            `[MailRetryService] processing job ${id} failed unexpectedly, will retry next poll: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
    } catch (err) {
      // Covers the zrangebyscore call itself (e.g. Redis briefly
      // unreachable) — the whole poll is skipped this cycle and picked back
      // up on the next @Interval tick.
      this.logger.warn(
        `[MailRetryService] processDueJobs failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.processing = false;
    }
  }

  private async processOneRedisJob(id: string): Promise<void> {
    if (!this.redis) return;
    const raw = await this.redis.hget(MAIL_RETRY_JOBS_KEY, id);
    // Sorted-set member without a matching hash entry — already cleaned up
    // by a previous (possibly concurrent) run; just drop the stale index.
    if (!raw) {
      await this.redis.zrem(MAIL_RETRY_QUEUE_KEY, id);
      this.logger.warn(
        `[MailRetryService] dropped stale queue entry with no job data (job ${id}).`,
      );
      return;
    }

    const job = JSON.parse(raw) as RetryJob;
    const sent = await this.attemptSend(job);

    if (sent) {
      await this.redis.multi().hdel(MAIL_RETRY_JOBS_KEY, id).zrem(MAIL_RETRY_QUEUE_KEY, id).exec();
      this.logger.log(
        `[${job.context}] mail retry succeeded (job ${id}, attempt ${job.attempt + 1}).`,
      );
      return;
    }

    const nextAttempt = job.attempt + 1;
    if (nextAttempt >= MAIL_RETRY_BACKOFF_MS.length) {
      // Backoff schedule exhausted — remove the job for good. No
      // dead-letter store by design; whatever fallback the caller already
      // has (e.g. reports.service.ts's blob-storage copy) is the safety net.
      await this.redis.multi().hdel(MAIL_RETRY_JOBS_KEY, id).zrem(MAIL_RETRY_QUEUE_KEY, id).exec();
      this.logger.error(
        `[${job.context}] mail retry exhausted after ${nextAttempt} attempt(s) — giving up (job ${id}).`,
      );
      return;
    }

    job.attempt = nextAttempt;
    const delayMs = MAIL_RETRY_BACKOFF_MS[nextAttempt];
    const dueAt = Date.now() + delayMs;
    await this.redis
      .multi()
      .hset(MAIL_RETRY_JOBS_KEY, id, JSON.stringify(job))
      .zadd(MAIL_RETRY_QUEUE_KEY, dueAt, id)
      .exec();
    this.logger.warn(
      `[${job.context}] mail retry rescheduled — attempt ${nextAttempt + 1}/${MAIL_RETRY_BACKOFF_MS.length} in ~${Math.round(delayMs / 1000)}s (job ${id}).`,
    );
  }

  // ---------- In-memory fallback processing ----------------------------------
  // Mirrors the Redis state machine above one-for-one (same backoff table,
  // same success/reschedule/exhaust outcomes) — the only difference is the
  // storage: a plain array walked by a single self-rescheduling setTimeout
  // chain instead of a sorted-set poll. Used only when REDIS_CLIENT is null,
  // or a specific enqueue() call's Redis write failed transiently.

  private scheduleMemoryProcessing(delayMs: number): void {
    // Only one timer is ever live at a time — processMemoryQueue() itself
    // re-schedules (with the soonest remaining job's delay) after each run,
    // so a second concurrent timer would just cause duplicate sends.
    if (this.memoryTimer) return;
    this.memoryTimer = setTimeout(() => {
      this.memoryTimer = null;
      void this.processMemoryQueue();
    }, delayMs);
  }

  private async processMemoryQueue(): Promise<void> {
    const now = Date.now();
    const stillPending: RetryJob[] = [];

    for (const job of this.memoryQueue) {
      // attemptSend() already catches its own errors and returns false —
      // nothing here can throw and abort the loop for the remaining jobs.
      const sent = await this.attemptSend(job);
      if (sent) {
        this.logger.log(
          `[${job.context}] mail retry succeeded (in-memory, attempt ${job.attempt + 1}).`,
        );
        continue;
      }

      const nextAttempt = job.attempt + 1;
      if (nextAttempt >= MAIL_RETRY_BACKOFF_MS.length) {
        this.logger.error(
          `[${job.context}] mail retry exhausted after ${nextAttempt} attempt(s) — giving up (in-memory).`,
        );
        continue;
      }

      job.attempt = nextAttempt;
      this.logger.warn(
        `[${job.context}] mail retry rescheduled (in-memory) — attempt ${nextAttempt + 1}/${MAIL_RETRY_BACKOFF_MS.length} in ~${Math.round(MAIL_RETRY_BACKOFF_MS[nextAttempt] / 1000)}s (job ${job.id}).`,
      );
      stillPending.push(job);
    }

    // Replace in place rather than reassigning — memoryQueue is `readonly`
    // (never a new array), and enqueue() may have pushed new jobs onto it
    // while this async loop was running.
    this.memoryQueue.length = 0;
    this.memoryQueue.push(...stillPending);

    if (stillPending.length > 0) {
      // Wake up at the soonest of the remaining jobs' due times, not a fixed
      // interval — jobs at different attempt counts have different delays.
      const nextDelay = Math.min(...stillPending.map((j) => MAIL_RETRY_BACKOFF_MS[j.attempt]));
      this.scheduleMemoryProcessing(Math.max(nextDelay - (Date.now() - now), 0));
    }
  }

  // ---------- shared ----------------------------------------------------------

  /**
   * The one place that actually attempts a retry send. Uses
   * MailService.trySendMail() rather than sendMail() deliberately: sendMail()
   * would itself call back into enqueue() on a rate-limit hit, replacing this
   * job with a brand-new one (losing the attempt count / backoff progress)
   * every time it's re-deferred. trySendMail() instead reports "still
   * rate-limited" as an ordinary failure, so this job keeps its own id and
   * follows the normal backoff schedule below. Never throws — callers (both
   * processing paths) rely on this returning a plain boolean so a failed
   * attempt can never crash the poll/timer loop.
   */
  private async attemptSend(job: RetryJob): Promise<boolean> {
    try {
      const result = await this.mailService.trySendMail(this.toSendMailOptions(job));
      if (result.sent) return true;
      this.logger.warn(
        `[${job.context}] mail retry attempt ${job.attempt + 1} still rate-limited.`,
      );
      return false;
    } catch (err) {
      this.logger.warn(
        `[${job.context}] mail retry attempt ${job.attempt + 1} failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return false;
    }
  }

  /**
   * Converts a live SendMailOptions (as passed by a caller) into the
   * JSON-safe RetryJob shape that gets persisted. Returns null (never
   * throws) if the payload can't be turned into a job at all — e.g. an
   * attachment's `content` is neither a Buffer nor a string.
   */
  private toRetryJob(options: SendMailOptions, context: string): RetryJob | null {
    try {
      return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        attempt: 0,
        context,
        options: {
          to: options.to,
          subject: options.subject,
          template: options.template,
          context: options.context,
          html: options.html,
          text: options.text,
          from: options.from,
          attachments: options.attachments?.map((a) => ({
            filename: a.filename,
            contentType: a.contentType,
            cid: a.cid,
            // Buffer attachment content can't round-trip through JSON —
            // base64-encode it here; toSendMailOptions() decodes it back to
            // a real Buffer immediately before each retry send.
            contentBase64:
              a.content instanceof Buffer
                ? a.content.toString('base64')
                : Buffer.from(a.content).toString('base64'),
          })),
        },
      };
    } catch (err) {
      this.logger.error(
        `[${context}] failed to serialize mail payload for retry — dropping: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }

  /** Inverse of toRetryJob()'s attachment handling — base64 string back to Buffer. */
  private toSendMailOptions(job: RetryJob): SendMailOptions {
    return {
      ...job.options,
      attachments: job.options.attachments?.map((a) => ({
        filename: a.filename,
        contentType: a.contentType,
        cid: a.cid,
        content: Buffer.from(a.contentBase64, 'base64'),
      })),
    };
  }
}
