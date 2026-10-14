# ADR-0002: Redis-Backed Retry Queue for Report-Delivery Mail

## Status

Implemented and merged (`src/mail/mail-retry.service.ts`). Live in all environments that deploy this code — the queue itself needs no separate infra provisioning (it reuses the app's existing Azure Managed Redis instance, see [Cost](#cost)).

## Context

`MailService.sendMail()` (see [ADR-0001](0001-mail-service-managed-identity.md)) throws on any Azure Communication Services failure — a transient network blip, a momentary ACS throttling response, a DNS hiccup. Before this change, every call site either logged and dropped the email (`simulation-reports.service.ts`'s `notifyEducatorReportAvailable`, `emailReportPdfByStudentId`) or fell straight back to saving an HTML copy in Blob Storage (`student-backend/modules/reports/reports.service.ts`'s `sendReportEmail`) — a real email was never attempted again after the first failure.

For report-delivery mail specifically, a single transient failure shouldn't mean the educator/student never gets the email at all. These aren't time-sensitive like OTP codes — a report arriving 10 minutes late instead of instantly is a fine outcome, whereas an OTP arriving 10 minutes late is useless (the code has already expired). That distinction is why this is scoped to report delivery only.

## Decision

Add `MailRetryService` (`src/mail/mail-retry.service.ts`) as a delayed-retry queue, wired into exactly three call sites — no others:

- `simulation-reports.service.ts` → `notifyEducatorReportAvailable` (educator notification email)
- `simulation-reports.service.ts` → `emailReportPdfByStudentId` (user-initiated "email me this report")
- `student-backend/modules/reports/reports.service.ts` → `sendReportEmail`

Explicitly **not** applied to OTP/verification-code mail (`auth.service.ts`) or any other transactional mail (invites, welcome/reactivation emails, seat requests) — those were out of scope per the original ask and, for OTP specifically, retrying would just deliver an already-expired code.

### Storage: Redis sorted set + hash, not a new queue library

No queue library (BullMQ, Bull, etc.) was added. The app already has `ioredis` wired up with its own connection/auth handling (`src/redis/redis.provider.ts` — including Entra ID token auth against Azure Managed Redis) and a graceful in-memory-fallback philosophy (`RedisService`). The retry queue reuses the same `REDIS_CLIENT` DI token (now also exported from `RedisModule`, previously only `RedisService` was) rather than introducing a second Redis client or a new dependency:

- **`mail:retry:jobs`** (Redis hash) — `job.id -> JSON.stringify(job)`, the durable payload.
- **`mail:retry:queue`** (Redis sorted set) — `job.id` scored by due-time (epoch ms). This is the schedule: `ZRANGEBYSCORE 0 <now>` cheaply finds every job that's due, without scanning the whole queue.

Both are written/removed together via a single `MULTI`/`EXEC`, so a job can never exist in one structure without the other.

### Processing: `@nestjs/schedule` `@Interval`, not a separate worker

`@nestjs/schedule` was already a `package.json` dependency with **zero actual usage** anywhere in the app (confirmed via `grep -rn "@Cron\|@Interval" src/` before this change) — no new dependency needed, just `ScheduleModule.forRoot()` registered once at the root (`src/app.module.ts`). `MailRetryService.processDueJobs()` polls every `MAIL_RETRY_POLL_INTERVAL_MS` (60s) in the same process — no separate worker deployment, no additional Container App.

### Backoff schedule

`MAIL_RETRY_BACKOFF_MS = [2min, 10min, 30min]` (`src/mail/mail-retry.constants.ts`) — 3 attempts total, exponential-ish. After the last attempt fails, the job is deleted and logged as a final failure. **No dead-letter store** — the caller's own existing fallback (e.g. `reports.service.ts`'s blob-storage copy) remains the actual safety net; this queue is purely "try harder to send the real email before falling back."

### Graceful degradation when Redis is unavailable

Matches `RedisService`'s own established pattern exactly: if `REDIS_CLIENT` is `null` (no Redis configured) or a Redis write throws, jobs go into an in-memory array instead, driven by a self-rescheduling `setTimeout` chain that mirrors the same backoff/success/exhaust state machine. Lost on process restart — an accepted tradeoff, same as `RedisService`'s own in-memory cache fallback.

## Flow

```
Caller's sendMail() fails (caller catches it)
        │
        ▼
MailRetryService.enqueue(options, context)   ─── never throws
        │
        ├─ payload too large (>5MB) or unserializable? → log + drop
        │
        ├─ Redis available? ── write fails? ──┐
        │         │                           │
        │       success                       ▼
        │         │                    fall through to
        │         ▼                    in-memory queue
        │   HSET mail:retry:jobs            │
        │   ZADD mail:retry:queue           │
        │   (due = now + 2min)         push to array,
        │                              setTimeout(2min)
        │
        ▼ (every 60s)                        ▼ (per job's own timer)
processDueJobs()                    processMemoryQueue()
  ZRANGEBYSCORE 0..now                  walk array
  → for each due job:                   → for each job:
     attemptSend()                         attemptSend()
        │                                     │
    succeeded? ──yes──> HDEL + ZREM       succeeded? ──yes──> drop from array
        │no                                  │no
        ▼                                    ▼
  attempts left? ──yes──> reschedule    attempts left? ──yes──> reschedule
     (attempt+1, later due score)          (attempt+1, keep in array,
        │no                                 re-set timer to soonest job)
        ▼                                    │no
  HDEL + ZREM, log final failure             ▼
  (caller's own fallback, e.g.          drop from array,
   blob storage, is the real           log final failure
   safety net — no dead-letter here)
```

## Error handling / safety audit

Every path that can throw is caught, and two gaps found during review were fixed:

- **`enqueue()` never throws.** `toRetryJob()` (payload construction) and the `JSON.stringify()` call (payload size check + Redis write) are both wrapped in `try/catch` — a circular reference or `BigInt` in a caller-supplied `context` object would otherwise throw synchronously and escape `enqueue()`'s "never throws" contract. Covered by a dedicated test (`does not throw when the mail context payload is unserializable`).
- **A bad job in a batch no longer blocks the rest of the batch.** `processDueJobs()`'s `for` loop now wraps each `processOneRedisJob(id)` call in its own `try/catch` — originally a single throw (e.g. corrupted JSON in the hash) would abort the whole poll cycle, leaving every other due job unprocessed until the next tick.
- **`attemptSend()` never throws** — it's the one place `MailService.sendMail()` is actually called from this queue, and both processing paths (Redis-backed, in-memory) depend on it returning a plain `boolean` rather than rejecting.
- **Reentrancy guard** (`processing` flag) prevents two overlapping `@Interval` ticks from grabbing and double-sending the same due job if a poll runs long.
- **Every state transition is logged**, not just success/final-failure: queued (Redis or in-memory), Redis write failed → falling back, payload dropped (too large / unserializable), each attempt's failure reason, each reschedule (with next-attempt count and delay), stale queue entry cleanup, success, and final exhaustion. See the code's own file-level doc comment in `mail-retry.service.ts` for the authoritative flow description kept in sync with the implementation.

## Consequences

**Positive**
- Report emails survive transient ACS failures without any new infrastructure — reuses the existing Redis instance and an already-installed-but-unused scheduling dependency.
- Fire-and-forget from the caller's perspective (except `emailReportPdfByStudentId`, which awaits `enqueue()` specifically because that path is user-initiated and needs to respond "queued" rather than a hard failure).
- Degrades gracefully to in-memory if Redis is down, consistent with how the rest of the app already treats Redis as best-effort infrastructure.

**Negative / risk**
- In-memory fallback jobs are lost on process restart/redeploy — acceptable given this is "try harder," not a durability guarantee, and the caller's own fallback (blob storage) already covers the "user must get something" requirement.
- No dead-letter queue or alerting on final exhaustion beyond a log line — if ACS is down for longer than the full backoff window (~42 minutes) for a batch of reports, those specific emails are permanently dropped (though still recoverable from the blob-storage copy where that fallback exists).
- Multiple Container App replicas each run their own `@Interval` poll against the same Redis keys — the `processing` flag only guards against overlap *within* one replica's own ticks, not across replicas. Two replicas could both pick up the same due job in the same 60s window and send it twice. Low-probability (60s poll window vs. near-instant `HGET`+send) and low-impact (a duplicate report email, not a security issue) — not addressed here; would need a Redis-level lock (e.g. `SET NX` per job ID) if it becomes a real problem.

## Cost

No new billable resources — reuses the Azure Managed Redis instance already provisioned per environment (`infra/modules/redisCache.bicep`) and an already-installed npm dependency (`@nestjs/schedule`, previously unused). The only marginal cost is Redis command volume from the 60s poll (`ZRANGEBYSCORE`) — negligible at this app's report-email volume.

## Future upgrade path

Azure Service Bus (queue or topic) would remove the cross-replica double-send risk noted above (via message locking/leases) and add a real dead-letter queue instead of a log line on final exhaustion. Not adopted here — reviewed and agreed the Redis-backed queue is sufficient at current retry volume — but worth revisiting if that volume or the duplicate-send risk grows.
