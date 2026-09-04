# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Keep this file current.** Update it in the same turn you change config,
> find or fix a defect, or lose time to a trap. Correct wrong entries rather
> than appending a second version. Mark what is *verified* vs *inferred*.

NestJS API for the educator/admin side: schools, educators, classes, students,
simulation assignments and report retrieval. Serves the student app's login and
assignment lookups too.

---

## Ground rules

- **Local only.** Nothing is committed or pushed; no cloud services configured.
  Deny rules live in `.claude/settings.local.json` (git-excluded via
  `.git/info/exclude`).
- **The Cloudflare tunnel is a deliberate exception** —
  `educatorbackend.rwthrive.ai` → `localhost:6002`. Do not propose stopping it.

## Commands

**Use npm, not pnpm.** The README says `pnpm install`; the repo only ships
`package-lock.json`. And **`npm ci` fails** — the lockfile omits optional
cross-platform binaries (`@css-inline/*`, `@unrs/resolver-binding-*`,
`fsevents`), so it aborts with `EUSAGE ... not in sync`. Use `npm install`.
(This also breaks CI on a clean checkout.)

```bash
npm install                 # NOT npm ci
npm run build               # nest build -> dist/
npm run start:dev           # watch mode
npm run lint                # eslint
npm run lint:fix

npm test                    # 27 unit specs (tests/unit/**, src/**/*.spec.ts)
npm test -- path/to/file.spec.ts        # single file
npm test -- -t "partial test name"      # single test by name
npm run test:integration    # 15 specs, config tests/jest-integration.json
npm run test:e2e            # config tests/jest-e2e.json
npm run test:api            # custom runner: tests/api/executor/module-executor.js

npm run migration:run       # dist/data-source.js (compiled) — build first
npm run migration:run:dev   # ts-node against src/data-source.ts
npm run migration:generate -- src/migrations/Name
npm run migration:show
npm run seed:roles          # District Admin + Educator (needs a build)
```

**The service runs `dist/`, so code changes need a rebuild AND a restart:**

```powershell
npm run build; Restart-Service educator-back
```

Test layout: `tests/{unit,integration,api,lint,test-data}`. Each of unit /
integration / lint has its own `reporters/` and `npm run report:*:generate`
HTML-report script.

## Topology

| | |
|---|---|
| This API | `localhost:6002`, public via `https://educatorbackend.rwthrive.ai` |
| Runs as | NSSM service `educator-back` (Automatic), `node dist/main.js` |
| Database | **local Postgres 17 on port 5434**, db `educator_dev` (not the Azure server) |
| Blob storage | **local Azurite**, NSSM service `azurite`, `127.0.0.1:10000`, container `json-data` |
| Educator UI | `D:\educator-front`, `localhost:6001`, `https://educatorapp.rwthrive.ai` |
| Student app | `D:\student-app` — calls this API for login + assignments |

Services, all Automatic: `postgresql-edu17`, `azurite`, `educator-back`
(depends on both), `educator-front`, `student-front`, `student-port6000-fwd`,
`Cloudflared`. Scheduled task `EducatorBack-Watchdog` health-checks every 5 min
and restarts only on genuine local failure (429 and tunnel-only failures do not
trigger a restart). Watchdog + logs: `D:\logs\educator-back\`.

Key Vault is unconfigured and Microsoft Graph mail credentials are placeholders,
so **email is expected to fail by design** locally — that breaks invites, OTP and
forgot-password. Blob *is* configured (Azurite), which is why reports load.

**Beware a second, parallel stack.** `D:\rwai-platform\educator-app-backend`
runs on port **4100** against a *different* `educator_dev` on **PG16:5432**,
started by boot tasks `HS-Educator-Backend` / `HS-Educator-Frontend`. Same db
name, separate cluster: data written through one is invisible to the other.
Confirm which backend a script targets before concluding data is missing.

## Logins

| Role | Credentials |
|---|---|
| Educator | `<first.last>@<school-abbr>.rwthrive.test` / `Educator2709!` |
| Admin | `realityworks@rwthrive.ai` / `realityworks2709` |
| Student | access code only (e.g. `CAR-6S7U`) — no password |

Current data (verified): 7 schools · 105 educators · 1,050 classes ·
17,343 students · 5,852 assignments. All classes ACTIVE, so **every student can
log in**. Only 1 row in `users` — the 105 educators are records without login
accounts, and creating those normally needs the (broken) email path.

## Calling the API from scripts

Two gotchas that will cost you an hour:

1. **Bearer token AND CSRF token are required — CSRF on GETs too**, not just
   mutations. Sequence: `POST /api/auth/login` → `GET /api/auth/csrf-token`
   (needs the Bearer) → then your call with **both** headers
   (`Authorization`, `x-csrf-token`) plus the cookie jar.
2. `/api/auth/csrf-token` returns 401 without the Bearer, which reads like the
   endpoint is broken.

`CsrfGuard.CSRF_EXCLUDED_PATHS` lists the exempt routes. Handy for unauthenticated
smoke tests: `GET /api/simulation-catalog/scenario/:id/public`, `/health`,
`/readyz`, the `/api/students/*` student paths, and `/api/lti/*`.

## Architecture

One NestJS app, one module per domain under `src/<domain>/` with the usual
`*.module.ts` / `*.controller.ts` / `*.service.ts` / `entity/` / `dto/`.
The parts that need several files to understand:

- **Data lives in two places.** Postgres holds the roster (schools, educators,
  classes, students, assignments). Blob holds the simulation catalog, reports and
  transcripts, read through `src/common/utils/tutor-patient.service.ts` with a
  memory + optional Redis cache. There is **no filesystem fallback** — with no
  blob connection string the catalog is silently empty, not an error.
- **Blob layout:** `en/scenarios.json` (bulk overlay), `en/scenario/<id>.json`
  (per-scenario, **takes priority** over the bulk entry), `units.json`,
  `default-scenarios.json`, `reports.json`, `transcripts.json`. Scenarios are
  merged by `id`. `es/` equivalents exist for Spanish.
- **Global guards, applied to everything** (`app.module.ts` providers):
  `AuthThrottlerGuard` then `CsrfGuard`, plus `RequestTimeoutInterceptor` and
  `AuditLoggerInterceptor`. `main.ts` sets global prefix `api` (excluding
  `health`, `healthz`, `readyz`, `api-docs`), a whitelisting `ValidationPipe`
  with `forbidNonWhitelisted`, and `trust proxy = 1`.
- **Entities have drifted from migrations** — see the migration trap below.
- Swagger at `/api-docs`, OpenAPI JSON at `/api-docs-json`. Prometheus metrics
  via `@willsoto/nestjs-prometheus`. Logging is pino (`nestjs-pino`) and logs the
  full request headers per call, which gets loud under load.

## Environment traps

- **`ALLOW_NONSSL` is inverted.** `ALLOW_NONSSL=true` *enables* TLS
  (`src/config/db.config.ts`). Must be `false` for the local cluster, `true` for
  Azure Postgres.
- **Mail credentials are load-bearing at boot.** `src/mail/mail.service.ts`
  (~39-43) uses `config.getOrThrow()` then builds a `ClientSecretCredential`,
  which rejects empty strings — blank `GRAPH_*` **crashes startup**. Placeholder
  values exist purely so the app boots.
- **Azurite needs `--skipApiVersionCheck`.** `@azure/storage-blob` here
  negotiates API version `2026-04-06`, which Azurite rejects outright otherwise.
- Leave `AZURE_STORAGE_ACCOUNT` **empty** — setting it makes
  `src/config/azure-blob.config.ts` build an
  `https://<account>.blob.core.windows.net` URL and reach for real Azure.
- Redis is optional (no `REDIS_HOST` → null client), but **`/readyz` reports
  `redis: error` when it is simply unconfigured** rather than `skipped` the way
  `azureBlob` does. Health-check against `/health`, not `/readyz`.

## Migrations cannot build a fresh database

Two defects compound:

1. Migration 37 `AddPerformanceIndexes` indexes `classes.is_active` and
   `class_simulations.is_active`, but **no migration creates those columns** —
   they are added at runtime by `onModuleInit` in `class/classes.service.ts`
   (~113) and `class-simulations/class-simulation.service.ts` (~131).
2. TypeORM wraps the whole run in **one transaction** by default, so that single
   failure **silently rolls back all 36 preceding migrations**, leaving only the
   `migrations` table.

Working order on an empty DB:

```bash
npm run migration:run -- -t each   # 36 apply and commit; 37 fails
# start the app once so the onModuleInit hooks add the columns
npm run migration:run -- -t each   # 37 now applies
```

## Where reports live (this surprises people)

Reports are **read live from blob storage** via
`tutorPatientService.getReportsFresh()` — they are *not* stored in Postgres.
**`simulation_reports` being empty is normal, not a fault.** That table is used
for notification/viewed tracking only.

`POST /simulation-reports/student/:simId/simupdate` syncs the **simulation
catalog** from blob (it loaded 21 scenarios locally) — despite the route name it
does not import reports.

### "Student Report Available" emails are gated (added this session)

These go to the **shared** `no-reply@realityworks.com` mailbox, so automated test
runs at scale can flood it and block live customer mail. Two gates in
`simulation-reports.service.ts` `getReportEmailSuppressionReason()`:

- `REPORT_EMAILS_DISABLED=true` — kill switch, stops **all** report email.
- `REPORT_EMAILS_TEST_SCHOOLS` (default `Beta Test,Test`) — comma-separated
  patterns matched case-/punctuation-insensitively on **whole words** of
  `schools.school_name`. `Beta-Test`, `BETA_TEST` and `Beta Test School` match;
  `Protestant` and `Betamax Testing` deliberately do **not** (word-boundary
  matching exists so the bare `Test` pattern cannot silence a real school).

`findTestSchoolName()` checks the legacy `educator.school` FK **and** every
`schoolAssignments` junction row, because the junction is the source of truth
and a junction-only educator has `educator.school === null`. Both are loaded in
the `educatorRepo.findOne` relations list — dropping `schoolAssignments.school`
from that list silently reopens the gap.

Suppression logs `[notifyEducatorReportAvailable] email suppressed (<reason>)` —
that line is the only positive proof the gate fired, since locally mail fails
anyway (placeholder `GRAPH_*`) and "no email" proves nothing. A `firing →` line
with **no** matching `email suppressed` line means the gate did not catch it.

Both vars are wired through infra as KV-backed `secretRef`s
(`edu-report-emails-disabled`, `edu-report-emails-test-schools`) across
`main.bicep` → `resources.bicep` → `keyVaultSecrets.bicep` →
`containerApp-backend.bicep`, plus all three `.bicepparam`s. Without that,
`app-deploy.bicep` reconciles the whole env block on every deploy and an
imperative `az containerapp update --set-env-vars` is silently reverted.

**Provision before deploying.** The KV secrets come from the *provision* path
(`main.bicep`); the `secretRef` consuming them is applied by *every* deploy
(`app-deploy.bicep`). Deploy first and the revision references secrets that do
not exist yet and fails to start. See `docs/RUNBOOK-report-email-gate.md` §2b.

**One caveat, unverified against prod:** there is **no "Beta Test" school in the
local DB** (the 7 seeded schools are fictional), so the real prod `school_name`
was never confirmed against live data. Whole-word `Test` is the safety net.

The admin block just below the email block is **not** email — it is
`notificationsGateway.notifyAdminStudentReportAvailable()`, a DB row plus a
websocket emit. It is deliberately **not** gated: coupling it to the email kill
switch would silently mute real admins' in-app notifications for zero mailbox
benefit. `emailReportPdfByStudentId()` (~line 2100) does send mail but is
manually triggered per request, not part of the automatic flood.

## Simulation library & entitlement model

**Library now auto-populates (verified — added this session).**
`educator-simulations/educator-simulations.service.ts` `getMyLibrary()` seeds a
**never-curated** educator's library with every active scenario on first fetch,
via `seedLibrary()`. Guarded by `EducatorSimulationsConstants.AUTO_POPULATE`
(`ENABLED`, `MAX_CATALOG_SIZE: 50`) so it only fires while the catalog is small,
and only when the educator has **zero** rows (a prior removal counts as history,
so removals stick and it never re-seeds). Items are normal, **removable** rows.
Until entitlement scoping exists (below), "all available" = **all active
scenarios** — `simulation-catalog.service.ts getCombinedCatalog()` filters only
on `draft`/`archived`, **not** on the redeemed subscription.

**Planned four-product entitlement model (design — see the spec doc
"Simulation Products and Entitlement Model").** Two axes — *modality*
(ONLINE / MANIKIN) × *audience* (SECONDARY / POST_SECONDARY) — derive four
products P1–P4. Two gates: online content needs a reserved **seat**; manikin
content needs a live **hardware key**; audience is an access-control check at
launch. Seats become inventory (admin↔educator, five states, reservation +
release), sold as bundles with a shared end-term date (next Jun 30 / Dec 31
after purchase+redemption+12mo) plus a 40h/seat cap. Not yet built.

**Phase-1 logic landed (verified — added this session):**
`src/common/entitlement/product.ts` — `deriveProduct(modality, audience)` →
`P1–P4` | null (fail-closed), `parseModality()`, `normalizeAudience()` (maps the
5 free-text spellings in the live library to one enum), and the launch/assign
gate messages. Pure, dependency-free, unit-tested (`product.spec.ts`, 8 specs).
**Not yet wired** into assign/launch — that needs the schema work (explicit
`modality`/`online_eligible`/`audience` columns) which is blocked by the
migration trap above; do it deliberately, not as a side effect.

**Current-state gaps this model must close (all verified):** `requiresAiSeats()`
decides "AI" from a **category string**, not `avatarEnabled`; the "AI Seats
Required" badge (frontend `avatarEnabled`) and the actual charge therefore
disagree — audited **21/21 active scenarios mismatch** (0 badged, all charge).
**Fixed upstream in 2.1.0** (verified 2026-08-26, not applied here): migration
`1789800000002-AddAvatarEnabled` adds the column and `requiresAiSeats()` gained
`if (simulation.avatarEnabled || scenario.avatarEnabled) return true;` alongside
the category check. Since our frontend is already 2.1.0 and reads `avatarEnabled`
in four components (`AddSimulationModal`, `MyLibraryModal`, `EditSimulationModal`,
`DeleteSimulationModal`), **the badge/charge mismatch we see locally is backend
version skew, not a frontend bug.** Upstream also changed the charge model: it
now charges only when `existingAiSimCount === 0`, so the 2nd AI sim on a class is
free — still a point-in-time student snapshot, so the "assign then add 30
students = 0 seats" gap below survives in a new shape.
`TOTAL_ALLOCATED_SECONDS = 400*3600` (`simulation-reports.service.ts:31`) is
per-**student** and never enforced; the design wants **40h per seat**.
`LICENSE_EXPIRY_YEARS: 1` (`auth.constants.ts:6`) stamps an expiry that is never
compared to today. Redemption sets `hw_support_until` from `line.type ===
'Hardware'` but **no device identity exists** (P3/P4 unenforceable).

---

## Upstream divergence — local is 1.8.0, `main` is 2.1.0

**Verified 2026-08-26** against a GitHub "Download ZIP" of `main`
(`~/Downloads/Educator-App-Backend-main (1).zip`, snapshot 2026-08-26 00:30).
**Nothing was applied — the local tree is untouched.** The repo has **never
fetched** (no `.git/FETCH_HEAD`); `origin/main` is pinned at `78d5911`.

| | local | upstream `main` |
|---|---|---|
| version | 1.8.0 | 2.1.0 |
| migrations | 37 | 42 |

178 files differ · 294 new · 46 removed · 123 changed under `src/`.

**The educator API surface is identical.** Parsed both controller trees: 24
local routes vs 83 upstream, **0 routes removed**, and all 59 additions are the
merged student backend under `/api/students-backend/*`. That is why a 2.1.0
frontend runs fine against this 1.8.0 backend.

**Biggest change:** `src/student-backend/` (~95 files) is now mounted inside
this app (`app.module.ts` → `StudentBackend`, `StudentBackendRouter`,
`JsonDataModule`, `EducatorAuthModule`) — conversation providers
(OpenAI / speech-engine / static), report scoring, telemetry, uploads, units,
admin scenario CRUD. Plus LMS/LTI (Moodle adapter + factory, NRPS, AES-GCM
encryption of LMS secrets at rest), `RedisFallbackThrottlerStorage`, helmet
security headers, and `src/config/env.validation.ts`.

**Two issues listed below are already fixed upstream** — see the rate-limit
bullet and the `avatarEnabled` note in the entitlement section.

**What upstream does NOT have** (grepped `src` + `infra`): the report-email gate
(`getReportEmailSuppressionReason`, `REPORT_EMAILS_DISABLED`,
`REPORT_EMAILS_TEST_SCHOOLS`) and `src/common/entitlement/`. Upstream
`notifyEducatorReportAvailable()` still fires unconditionally, and its
`simulation-reports.service.ts` has diverged heavily — re-applying the gate is a
**real merge, not a copy**.

**Still broken upstream:** the migration trap. `AddPerformanceIndexes` still
indexes `classes.is_active` with no migration creating it; the new
`AddMissingColumnsToClassSimulations` covers only `class_simulations` and is
ordered *after* it anyway. Both `onModuleInit` column hacks remain.

**Upstream `package.json` carries a junk dependency:** `"ci": "^2.3.0"` — a real
npm package, in `dependencies` (not dev), **imported nowhere** in `src` or
`tests`. Almost certainly `npm install ci` typed instead of `npm ci`. It ships a
`bin/ci` into the production container. Worth raising with the team.

**If we ever do update:** new deps need `npm install` — `helmet`, `nodemailer`,
`@nestjs/axios`, `exceljs`, `@redis/entraid`, `@opentelemetry/api`;
`@nestjs-modules/mailer` was dropped. Boot risk is low: `getOrThrow` count is
unchanged at 4 (mail only), `env.validation.ts` only *warns*, the AI provider
falls back gracefully with no `OPENAI_API_KEY`, and the LMS-encryption migration
is a no-op with zero LMS rows. `npm ci` may work again upstream (`@css-inline/*`
gone, `fsevents` present, `@unrs/resolver-binding-*` 24 → 66 entries) — **that
does not apply to the local 1.8.0 tree; keep using `npm install` here.**

**The frontend is already 2.1.0.** `D:\educator-front\src` is byte-identical to
the matching frontend zip (0 diffs), on `main` at `1ddefaa`. So we run **FE
2.1.0 against BE 1.8.0**: anything depending on 2.1.0 backend behaviour looks
broken locally but works deployed. Do not "fix" the frontend to compensate.

---

## Known issues found while testing

- **Rate limiting will break real classrooms.**
  `src/common/constants/throttle.constants.ts` hardcodes
  `RATE_LIMIT.PUBLIC = { LIMIT: 3, TTL: 1 }` and `AUTHENTICATED = { LIMIT: 5 }`
  with **no env override** — unlike `AuthThrottleConstants` in the same file,
  which are all `process.env`-tunable.

  `common/guards/auth-throttler.guard.ts` `getTracker()` keys authenticated
  requests `auth:${userId}` (per user) but public requests `public:${ip}`
  (**shared**). Students hold no platform JWT, so they all share one 3/sec
  bucket — and the `@Public()` routes are the entire student entry path:
  `LOOKUP_BY_CODE`, `LOGIN`, `SIMULATIONS_BY_CODE`, `START_ASSESSMENT`.

  30 students logging in together ≈ 90 public calls in ~10 s against 3/sec →
  most get 429, and the student app's `validate` misreads it as
  **"Access denied"**, which looks like an invalid code.

  `extractIp` trusts `X-Forwarded-For` (first entry) with no trusted-proxy
  check: students in different schools get separate buckets, a shared school NAT
  does not, and the header is spoofable if the API is reachable off-proxy.

  **Fix carefully:** keying on student code suits the post-login routes, but
  `LOGIN`/`LOOKUP_BY_CODE` must stay IP-keyed or brute-force protection is lost.

  Related: the limiter is **global**, so a bulk seeding script saturating it
  429s the frontends and health checks too. `AUTH_LOGIN_LIMIT` /
  `AUTH_LOGIN_TTL` in `.env` do **not** govern these routes — raising them has no
  effect on `/api/auth/redeem` or `/health`. Throttle the client instead.

  **Both halves are fixed upstream in 2.1.0** (verified 2026-08-26, not applied
  here). `throttle.constants.ts` became env-tunable —
  `RATE_LIMIT_PUBLIC_LIMIT` / `_TTL`, `RATE_LIMIT_AUTH_LIMIT` / `_TTL`,
  `DEFAULT_THROTTLE_LIMIT` / `_TTL_MS`. And `getTracker()` was replaced by
  `generateKey()`, which keys `GET /api/students/login` per
  `student:<ip>:<student_id>` instead of one shared `public:<ip>` bucket — so
  the classroom 429 storm is gone. `extractIp` still trusts `X-Forwarded-For`
  with no trusted-proxy check. Note `DEFAULT_THROTTLE` defaults tightened from
  100/60s to 5/1s upstream.

- **Educator seats are charged once, at assignment time.**
  `class-simulations/class-simulation.service.ts` ~330:
  `tokensToReduce = count(Student, { is_active: true })` — a point-in-time
  snapshot. `updateToken` has **exactly one caller in the whole backend**, and
  the student-creation path (`students.service.ts` `create` / `bulkCreate`)
  never touches seats.

  So students added *after* an AI simulation is assigned consume nothing:
  "add 30 then assign" costs 30 seats, "assign then add 30" costs 0, for an
  identical end state. Nothing records what an assignment was meant to cover, so
  it cannot be reconciled afterwards.

  *Inferred, not traced:* reactivating a student (`is_active` false→true) likely
  dodges the charge too, since the count filters on `is_active: true`. Same for
  moving a student between classes.

  A cleaner model is charging on **first access** to an AI simulation — then it
  is order-independent by construction.

- **Class names are NOT unique.** Two classes can share a name and carry
  different simulation sets (`MED-2F3H` and `MED-2FTQ` are both in a
  "Medical-Surgical Nursing I — Sec C"). **Select by `class_id`, never by name.**
  This silently broke a whole test batch.

- **Assigned ≠ launchable.** A class can be assigned a simulation whose content
  is absent from the blob catalog; the student's card then always bounces back to
  the dashboard. Confirm with `GET /students/simulations/{code}` and check the
  catalog before assuming an app bug.

- **`.env.example` has stray log output committed** at lines 69-70
  (`[AzureBlobService] AZURE_STORAGE_CONNECTION_STRING: SET`).

## Useful queries

Students who can actually launch a given simulation (note: by `class_id`):

```sql
SELECT s.student_id, c.class_name
FROM class_simulations cs
JOIN classes  c ON c.id = cs.class_id AND c.is_active AND c.status::text = 'ACTIVE'
JOIN students s ON s.class_id = c.id AND s.is_active AND s.status = 'ACTIVE'
WHERE cs.simulation_id = 'AI_SCN_ADLT_NRSG_04'
LIMIT 20;
```

The DB row is necessary but **not sufficient** — verify against the API before
trusting it for automated runs.

Schema notes: `schools.school_name` (not `name`); `simulation_reports` has
`scenario_id`, not `simulation_id`; the `role` table is **singular**; `students`
has no name or email columns (migration 37 dropped them).
