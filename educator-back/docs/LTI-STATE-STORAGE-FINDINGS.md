# LTI State/Nonce Storage — Findings & Options

> **Scope note:** what started as an LTI-specific investigation surfaced two
> more consumers of the same per-replica sidecar Redis with the identical
> root cause. Both are documented in **Section 1a** below, since they're
> arguably more urgent than the LTI issue itself — one is a live security gap,
> the other has already caused production bugs (twice).

Compiled from direct inspection of `origin/dev` code, `infra/modules/containerApp-backend.bicep`,
the 1EdTech LTI 1.3 Security Framework, and current Microsoft Learn documentation
(links at bottom). Not based on assumptions — every claim below is traceable to
a file, spec section, or doc page.

---

## 1. The finding

### What's broken
`src/lti/lti-state.service.ts` (`LtiStateService`) stores LTI `state`/`nonce` pairs
(RWED-1070 — CSRF + replay protection for the OAuth-style LTI launch handshake)
in a plain in-memory `Map<string, StateRecord>`. The file's own comment already
flags this:

> "Uses in-memory storage (Map) suitable for single-instance deployments...
> For production multi-instance deployments, replace with Redis or database."

`src/csrf/csrf.service.ts` (`CsrfService`) has the same class of bug: it calls
the app's `RedisService`, which is wired to `REDIS_HOST=127.0.0.1` — a
**per-replica sidecar container**, confirmed directly in
`infra/modules/containerApp-backend.bicep`:

```bicep
// Redis runs as a sidecar container in this same revision —
// containers in one ACA replica share a network namespace, so
// it's reachable over loopback. Not a secret; no KV entry needed.
{ name: 'REDIS_HOST', value: '127.0.0.1' }
{ name: 'REDIS_PORT', value: '6379' }
```

Loopback means each replica only ever sees its **own** sidecar. Nothing written
by replica A is visible to replica B.

### Why it matters, and when
Replica counts, same bicep file:

| Env | maxReplicas | Impact |
|---|---|---|
| dev | 1 | Bug invisible — only one replica exists |
| qa | 2 | Intermittent — ~50% of launches can hit a different replica between login-init and callback |
| prod | 8 | Frequent — up to 7/8 chance of landing on a different replica |

LTI launch is a two-step handshake (login-init writes `state`/`nonce` → Moodle
redirects back → callback must read the same `state`/`nonce`). If the two
steps land on different replicas, the callback finds nothing and the launch
fails with `Invalid or expired state parameter`.

### Why "just use the existing RedisService" doesn't fix it
`RedisService` already exists in this codebase (`src/redis/redis.service.ts`)
and is used for blob/report caching. It would be tempting to just inject it
into `LtiStateService`. **This does not fix anything** — `RedisService` talks
to the same `127.0.0.1` sidecar, so it has the identical per-replica blind
spot. Any fix must point at a genuinely shared store, not just reuse the
existing Redis client.

---

## 1a. Other consumers of the same sidecar — found while auditing this issue

Every consumer of `RedisService` / `REDIS_CLIENT` (i.e. everything pointed at
`127.0.0.1`, the per-replica sidecar) was checked. Two more have the identical
root cause as `LtiStateService`/`CsrfService`; two are safe as-is.

### 1a-i. Rate limiting / brute-force protection — `RedisThrottlerStorage` (severe, live now)

`src/app.module.ts` registers `ThrottlerModule` globally with
`RedisThrottlerStorage` as backing storage and `AuthThrottlerGuard` as a
global `APP_GUARD` (default: 100 req/min on every endpoint). `auth.controller.ts`
layers stricter limits on top of that for sensitive endpoints:

```
signup:          5 requests / 60s
login:           AuthThrottleConstants.LOGIN.LIMIT / 60s
forgot-password: AuthThrottleConstants.FORGOT_PASSWORD.LIMIT / 15min
verify-otp:      AuthThrottleConstants.VERIFY_OTP.LIMIT / 15min
resend-otp:      3 / 15min
reset-password:  AuthThrottleConstants.RESET_PASSWORD.LIMIT / 15min
```

`RedisThrottlerStorage` (`src/common/storage/redis-throttler.storage.ts`)
increments a hit counter via `REDIS_CLIENT` — the same `127.0.0.1` sidecar.
**Each replica keeps its own counter.** In prod (8 replicas), a client whose
requests get load-balanced across replicas effectively gets up to **8× every
configured limit** — e.g. login's real ceiling isn't `LOGIN.LIMIT`/min, it's
`LOGIN.LIMIT × (replicas it lands on)`/min. This silently weakens brute-force
protection on exactly the endpoints it exists to protect (login, OTP,
password reset), with no error or symptom — it just works, at a much looser
effective limit than configured.

- **Severity:** high — this is a live security control gap in prod today,
  not a launch-flow edge case.
- **Fix:** identical shape to the LTI/CSRF fix — this needs a genuinely
  shared counter. A shared cache (Managed Redis) is actually a *better* fit
  here than Postgres, since `INCR`+`PTTL` is exactly what Redis is for and
  the throttler library (`@nestjs/throttler`) already expects a
  Redis-shaped storage interface — swapping to a real shared Redis instance
  is close to a one-line change (`REDIS_HOST` pointing at Managed Redis
  instead of the sidecar) with no rewrite of `RedisThrottlerStorage` itself.
  A Postgres-backed counter would work but fights the grain of what
  `@nestjs/throttler`'s storage interface expects (atomic increment + TTL).

### 1a-ii. Blob/catalog caching — confirmed to have already caused production bugs

The former blob reader service and `simulation-catalog.service.ts` cached blob
data (scenarios, units, merged reports) via the same sidecar `RedisService`,
with explicit invalidation (`del`, `delByPrefix`) on update. Two commits in
history are the direct symptom of this exact per-replica problem:

- `2332cfc` (2026-07-29, RWAI-2581): *"Fixed GET /my-library and
  GET /simulation-catalog/combined returning stale data after Publish
  Update... eliminate units.json Redis race condition."*
- `c30b73d` (2026-07-10): *"force fresh blob reads on every catalog
  request... bypasses stale Redis/in-memory cache."*

Root cause: when an educator publishes an update, the request handling it
calls `delByPrefix()` against **its own replica's** sidecar only. The other
7 replicas' sidecars are untouched and keep serving pre-update cached data
until their own TTL naturally expires (previously observed: 5 min–24h
depending on env config). Both fixes above worked around the *symptom*
(bypass the cache entirely on the affected endpoints, add `Cache-Control:
no-store`) rather than the root cause — any other cache key in these
services that wasn't specifically patched is still exposed to the same
stale-data risk after an update.

- **Severity:** medium — user-visible correctness bug (stale data), already
  hit twice, currently contained only on the two endpoints that were
  explicitly patched.
- **Fix:** a genuinely shared cache (Managed Redis) fixes this at the root —
  `delByPrefix()` from any replica would invalidate the value for all
  replicas, restoring the cache-aside pattern's actual invariant, instead of
  disabling caching endpoint-by-endpoint as bugs are found.

### Checked and safe — no action needed

- **`simulation-reports.service.ts`'s `dismissKey`** — Redis is only a
  fast-path check; on a cache miss (wrong replica) the code falls back to a
  real DB query (`alreadySent` count) before acting. Self-healing by design;
  a miss just costs an extra query, not incorrect behavior.
- **`health.service.ts`** — calls `isHealthy()` to report its *own*
  replica's sidecar status. Correct and intentional — each replica is
  supposed to report on its own local sidecar, not a shared one.

---

## 2. What the LTI 1.3 spec actually requires (so we don't over-build)

Per the 1EdTech (IMS Global) Security Framework:

- Nonce/state only needs to be tracked for the tool's **own acceptable time
  interval**, tied to the `iat` claim tolerance — not indefinitely. The
  current 10-minute TTL in `lti-state.service.ts` is already generous versus
  what the spec requires.
- **One-time use** — a nonce must be rejected the second time it's presented.
- **PKCE** is recommended for the authorization code exchange as additional
  replay protection — a separate, smaller hardening item worth a follow-up
  check on whether the current launch flow implements it; not itself a
  storage decision.

Net: this is a **tiny, short-lived, low-throughput key-value workload** —
small strings, few-minute TTL, volume bounded by LTI launches (not page
views or API calls). That should drive the infra choice below, not the
reverse.

---

## 3. Options

### Option A — Do nothing (keep in-memory `Map`)
| | |
|---|---|
| **Pros** | Zero work. Already correct for dev (`maxReplicas: 1`). |
| **Cons** | Confirmed broken at qa (2 replicas) and prod (8 replicas) — this is a real, reproducible bug, not a theoretical one. Fails the exact scenario LTI 1.3 state/nonce exists to prevent (CSRF/replay) the moment there's more than one replica. |
| **Verdict** | Not viable past dev. |

### Option B — Point `LtiStateService` at the existing sidecar `RedisService`
| | |
|---|---|
| **Pros** | Looks like reuse — no new service to add. |
| **Cons** | **Does not fix the bug.** `RedisService` → `127.0.0.1` → same per-replica sidecar `CsrfService` already suffers from. Would look fixed in testing if you only test against one replica, then fail identically in qa/prod. |
| **Verdict** | Dead end — do not do this. Including here only because it's the most tempting wrong answer. |

### Option C — Azure Cache for Redis (classic: Basic/Standard/Premium/Enterprise)
| | |
|---|---|
| **Pros** | Familiar service, native TTL (`SET key val EX ttl`) matches the state/nonce pattern exactly. Well-documented. |
| **Cons** | **Being retired.** Per Microsoft Learn: Basic/Standard/Premium retire **September 30, 2028**; Enterprise/Enterprise Flash retire **March 31, 2027**. Microsoft explicitly recommends *not* provisioning new instances of this service — "don't wait until the retirement deadline." Standing this up now means a forced migration project later for a service that's about to exist for this exact use case. |
| **Verdict** | Do not provision new instances of the classic service. |

### Option D — Azure Managed Redis (AMR) — the classic service's replacement
| | |
|---|---|
| **Pros** | Current, supported path. Native TTL — no code-level reinvention of expiry logic needed once wired to `RedisService`-style access. Tiers now organized by memory:vCPU ratio (Memory Optimized / Balanced / Compute Optimized / Flash Optimized) rather than feature-gated tiers — **zone redundancy, persistence, and geo-replication are available at every size**, so HA doesn't force a bigger/pricier SKU. |
| **Cons** | New billed resource per environment (dev/qa/prod) — real incremental infra cost even at the cheapest tier. Requires provisioning, KV wiring, private endpoint/VNet integration, and rewriting `LtiStateService` + `CsrfService` to use it instead of the sidecar. Persistence/clustering/Redis Modules would all be wasted spend for this workload — must be explicit about *not* enabling them. |
| **Right-sizing if chosen** | Smallest **Memory Optimized** size (cheapest tier, matches this workload's near-zero throughput need) · zone redundancy **on for prod only** · persistence **off** (state is disposable — losing it just means a retry, not data loss) · one shared instance for both LTI state and CSRF (same shape, same TTL pattern — no reason to run two). |
| **Verdict** | Viable, but the more expensive of the two "actually fixes it" options below. |

### Option E — Postgres-backed `lti_state` table (reuse existing shared DB)
| | |
|---|---|
| **Pros** | **Zero new infra** — Educator-App-Backend already has a shared Postgres wired (`DB_HOST` secret, etc.), billed regardless of this change. Genuinely shared across all replicas (that's the whole point of it already being a managed, non-sidecar DB). Matches the spec's actual requirements (tiny, short-lived key-value data) without over-provisioning a cache service for it. Natural place to also fix `CsrfService`'s identical bug in one pass. |
| **Cons** | Requires a migration (new table), a rewrite of `LtiStateService`'s storage calls (`Map.get/set/delete` → SQL `SELECT/INSERT/DELETE` in a transaction for atomic consume), and a TTL cleanup mechanism since Postgres has no native key expiry (a scheduled job or lazy-delete-on-read, mirroring the existing cleanup-timer logic). Slightly higher per-lookup latency than Redis — irrelevant here since this fires once per LTI launch, not per request. |
| **Verdict** | Cheapest correct fix, and the one that best matches how small this workload actually is per spec. |

### Option F — Session affinity / sticky sessions (route each user to the same replica)
| | |
|---|---|
| **Pros** | No new storage at all — if login-init and the callback are guaranteed to hit the same replica, the existing in-memory `Map` becomes correct again without any code change. Azure Container Apps supports session affinity via cookies. |
| **Cons** | Fragile as a fix for *this specific* bug: LTI's redirect flow goes through the browser and Moodle, and affinity depends on the client presenting the same session cookie/token back — not guaranteed across an external redirect through a third-party LMS, and breaks silently if a replica restarts/scales down between the two steps (in-memory state is lost entirely, not just misrouted). Doesn't fix `CsrfService`'s use of the sidecar either, since CSRF checks can legitimately span multiple requests over a session's lifetime, not just one immediate redirect. |
| **Verdict** | Not recommended as the primary fix — too fragile for a security-relevant handshake. Could be a defense-in-depth layer on top of Option E/D, not a substitute for shared storage. |

---

## 4. Recommendation matrix

| Option | New infra cost | Fixes the bug | Spec-appropriate sizing | Future-proof |
|---|---|---|---|---|
| A. Do nothing | None | ❌ No | — | ❌ |
| B. Reuse sidecar Redis | None | ❌ No (dead end) | — | ❌ |
| C. Classic Azure Cache for Redis | New spend | ✅ Yes | Over-built if Standard/Premium chosen | ❌ Retiring |
| D. Azure Managed Redis | New spend (smallest tier) | ✅ Yes | ✅ If sized to Memory Optimized, no persistence | ✅ |
| E. Postgres table | None (reuses existing DB) | ✅ Yes | ✅ Matches actual spec-required size | ✅ |
| F. Session affinity | None | ⚠️ Partial / fragile | — | ⚠️ |

**Recommendation: Option E (Postgres)** as the primary fix for LTI
state/nonce and CSRF specifically — cheapest, zero new infra, and the
workload's actual size (per the LTI spec itself) doesn't justify a cache
service. **Option D (Azure Managed Redis, Memory Optimized, no persistence)**
is the fallback if there's a reason to prefer a cache (e.g. an existing
shared AMR instance already provisioned for other services, making this
marginal rather than net-new spend). Do not pursue A, B, or C.

### But this changes once the other two consumers (Section 1a) are in scope

The rate limiter and blob cache don't have the same shape as LTI
state/CSRF, and point toward a different answer:

- **Rate limiter (`RedisThrottlerStorage`)** — needs atomic `INCR` + TTL at
  potentially high request volume (every API call, not just LTI launches).
  This is exactly Redis's native use case, and `@nestjs/throttler`'s storage
  interface is already Redis-shaped. Forcing this onto Postgres means
  re-implementing atomic increment-with-TTL semantics in SQL (e.g.
  `INSERT ... ON CONFLICT DO UPDATE` with manual expiry bookkeeping) — doable,
  but fighting the grain, and this one has real throughput (every request
  gets throttler-checked) versus LTI's launch-only volume.
- **Blob/catalog cache** — is a cache by definition; Postgres isn't a natural
  fit for "cache-aside with TTL eviction" the way Redis is, and the existing
  code is already written against the `RedisService` interface.

**Net recommendation, all four consumers considered:** if a shared **Azure
Managed Redis** instance is provisioned anyway (Memory Optimized, smallest
size, zone-redundant in prod, no persistence — sized for all four workloads
combined, still tiny), route **all four** — LTI state, CSRF, rate limiter,
blob cache — through it, and retire the sidecar entirely. That's a single
piece of new infra fixing a live security gap (1a-i), a recurring correctness
bug (1a-ii), and the LTI/CSRF issue in one pass, versus splitting the fix
across Postgres (LTI/CSRF) and still needing Redis anyway for the other two.
The "zero new infra" appeal of Postgres for LTI/CSRF alone weakens
considerably once the rate limiter and cache are counted — at that point a
shared Redis is needed regardless, so use it everywhere rather than running
two different shared-storage solutions for what is architecturally the same
problem.

---

## 5. Sources

- [1EdTech Security Framework 1.0](https://www.imsglobal.org/spec/security/v1p0)
- [1EdTech Security Framework v1.1](https://www.imsglobal.org/spec/security/v1p1)
- [What is Azure Cache for Redis? (retirement notice)](https://learn.microsoft.com/en-us/azure/azure-cache-for-redis/cache-overview)
- [FAQ on the retirement of Azure Cache for Redis](https://learn.microsoft.com/en-us/azure/azure-cache-for-redis/retirement-faq)
- [What is Azure Managed Redis?](https://learn.microsoft.com/en-us/azure/redis/overview)
- Repo evidence: `src/lti/lti-state.service.ts`, `src/csrf/csrf.service.ts`,
  `src/redis/redis.service.ts`, `infra/modules/containerApp-backend.bicep`
  (all on `origin/dev`, Educator-App-Backend)
