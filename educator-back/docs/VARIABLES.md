# Environment Variable Tracking System — `Educator-App-Backend`

This document is the **single source of truth** for every configuration variable used by this service — what it is, where it comes from, when in the pipeline it gets resolved, who owns it, and whether the live value has drifted from what's recorded here.

Stack: **NestJS 11 (Node 20) / TypeORM + PostgreSQL / Redis (ioredis) / Azure Blob Storage / Microsoft Graph Mail / LTI 1.3**. Deployed as an Azure Container App via **Bicep** (`infra/`), built and pushed by **GitHub Actions** (`.github/workflows/deploy-backend.yml`). Secrets live in **Azure Key Vault**, one per environment: `akv<env>1rwai` (shared with sibling app `HS-Online-AI`; the `edu-` secret-name prefix namespaces this app's entries — **note the `rwai` naming scheme has no `crx` suffix here**, distinct from the `Crexo-Educator-Backend`/`Crexo-*` sibling repos which use `akv<env>1rwaicrx`).

It has two jobs:
1. **Reference** — define every variable actually used in this codebase.
2. **Tracking** — record *how* and *when* each variable is injected, verify it against reality, log every change, and flag rotation/drift issues.

---

## Legend & Field Definitions

| Field Column | Description & Allowed Values |
| :--- | :--- |
| **Variable Name** | Exact key, `UPPER_SNAKE_CASE`. |
| **Stage** | **Runtime** (container startup) • **Pipeline/CI-CD** (used only inside the GitHub Actions job, never reaches the app) • **Provision-time** (passed as a shell env var to `Provision-Bicep.ps1`/`Deploy-Backend.ps1 -Action provision` when someone re-provisions Key Vault content; not part of the routine `deploy-backend.yml` push/redeploy flow). This repo has **no Build-Time vars** — the Dockerfile only has `ENV` defaults (`NODE_ENV`, `APP_PORT`), zero `ARG` instructions. |
| **Injection Method** | *How* the value physically gets into the process. See [Injection Methods](#injection-methods) below. |
| **Type** | **Secret** (Key Vault–backed) • **Hardcoded** (static constant) • **Dynamic** (computed/derived per environment). |
| **Req / Opt** | **Required**: app fails or a feature silently breaks without it. **Optional**: falls back to Default Value. |
| **Default Value** | Fallback if unset (code default, from `?? '...'` / `configService.get(key, default)`). |
| **Dev / QA / Prod Value or Query** | Literal value or secret-lookup path per environment. |
| **Who Uploads (Dev/QA)** | Role that configures lower environments. |
| **Who Updates Prod** | Role authorized to change the Prod value. |
| **Rotation Policy** | How often a Secret must be rotated (`N/A` for non-secrets). |
| **Next Rotation Due** | Calculated date; flagged if overdue. |
| **Last Verified** | Date someone last confirmed the recorded value matches what's actually deployed. |
| **Drift Status** | `OK` in sync • `Unverified` not checked in 30+ days or wiring unconfirmed • `Drift` confirmed mismatch, bug, or broken wiring (see [Drift Tracking](#drift-tracking)). |
| **Description & Usage** | What it controls and exact `file:line` it's read at. |

### Injection Methods

| Method | Used For in This Repo | Rebuild Required to Change? |
| :--- | :--- | :--- |
| `kv-ref` (Key Vault `secretRef` on the Container App, resolved at deploy — `infra/modules/containerApp-backend.bicep:240-264`) | Most Runtime rows — `DB_*`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `GRAPH_*`, `AZURE_STORAGE_*`, `AZURE_BLOB_CONTAINER_NAME`, `VITE_API_URL`, `API_BASE_URL`, `STUDENT_FRONTEND_URL`, `LTI_FALLBACK_*`, `NODE_ENV`, `APP_PORT`, `APP_URL`, `FRONTEND_URL`, `MAIL_FROM` | No (restart only) |
| `container-env` (literal `value:` on the Container App spec, not `secretRef:` — `containerApp-backend.bicep:221-238`) | `AZURE_KEY_VAULT_URL`, `AZURE_KEY_VAULT_SECRET_PREFIX`, `AZURE_SHARED_KEY_VAULT_URL`, `NODE_OPTIONS`, `APPLICATIONINSIGHTS_CONNECTION_STRING`, `ALLOW_NONSSL`, `REDIS_HOST` (`127.0.0.1`), `REDIS_PORT` (`6379`) | No (restart only) |
| `provision-env` (shell env var read by `infra/env/*.bicepparam` via `readEnvironmentVariable(...)`, only during a manual/CI provisioning run, not the routine push-to-deploy flow) | `POSTGRES_ADMIN_PASSWORD`, `JWT_SECRET`, `GRAPH_CLIENT_SECRET`, `AZURE_STORAGE_CONNECTION_STRING`, `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `LTI_FALLBACK_KEY_ID`, `LTI_FALLBACK_PRIVATE_KEY_PEM`, `IMAGE_TAG`, `BACKEND_CUSTOM_DOMAIN`, `BACKEND_CUSTOM_DOMAIN_CERT_ID` | Yes — writes Key Vault, then the app must be restarted/redeployed to pick it up |
| `ci-env` (GitHub Actions `env:` / `vars.*` / `secrets.*`, pipeline-scoped only) | `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `SUBSCRIPTION_ID`, `AZ_PREFIX`/`APP`/`AZ_VER`/`IMAGE_NAME`/`ACR_NAME`/`ACR_RG`, `STRICT_TEST_GATING`, `STRICT_SMOKE_GATING`, `LINT_NOTIFICATIONS_ENABLED`, `TEAMS_NOTIFICATIONS_ENABLED`, `TEAMS_PREVIEW_NOTIFICATIONS_ENABLED`, `TEAMS_WEBHOOK_URL`, `TEAMS_WEBHOOK_LINT_URL`, `TEAMS_PREVIEW_WEBHOOK_URL`, `TEAMS_SAST_WEBHOOK_URL`, `GITHUB_TOKEN` | N/A (never in app) |
| `dynamic-resolved` (derived per environment inside `infra/env/{env}.bicepparam`, not read from a shell env var) | `APP_URL`, `FRONTEND_URL`, `AZURE_STORAGE_ACCOUNT`, `AZURE_STORAGE_CONTAINER`, `VITE_API_URL`, `DB_HOST` (via `postgres.bicep` output) | No (restart only) |
| `job-secret-ref` (Key Vault `secretRef` on the Container Apps **Job** resource, not the main Container App — `infra/modules/containerAppJob-snapshot.bicep`) | `GIT_APP_PRIVATE_KEY`, `TEAMS_WEBHOOK_URL` (see [Snapshot Job](#snapshot-job--infrastructureentrypointps1-scriptsprovision-snapshot-prodps1) section) | No (no rebuild; a manual/scheduled trigger re-reads current KV value each run) |
| `job-env` (literal `value:` on the Job's container spec, `containerAppJob-snapshot.bicep`) | `SOURCE_STORAGE_ACCOUNT`, `SOURCE_CONTAINER`, `GIT_APP_ID`, `GIT_APP_INSTALLATION_ID`, `SNAPSHOT_REPO`, `SNAPSHOT_UAI_CLIENT_ID`, `SNAPSHOT_TEAMS_MENTION` | Yes — requires a re-deploy of the Job resource |
| `platform-injected` (set automatically by the Container Apps platform whenever a Job/App has a managed identity attached — never declared in this repo's Bicep) | `IDENTITY_ENDPOINT`, `IDENTITY_HEADER` | N/A — platform-managed, rotates itself |

**Precedence when the same var is defined in multiple places:** Container App `secretRef:`/`value:` (resolved once when the revision is created, no live override without a new revision) → local `.env`/`.env.local` (dev-only, never deployed) → hardcoded default in code (`?? '...'` / `configService.get(key, default)`).

---

## Environment Variables Master Matrix

### Core App / URLs — `src/main.ts`, `src/config/db.config.ts`, `.deployment/container-spec.json`

| Variable Name | Stage | Injection Method | Type | Req/Opt | Default | Dev Value/Query | QA Value/Query | Prod Value/Query | Uploads (Dev/QA) | Updates Prod | Rotation Policy | Next Rotation Due | Last Verified | Drift Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `NODE_ENV` | Runtime | kv-ref (`edu-node-env`) | Hardcoded | Required | *None* (`main.ts` has no fallback) | `development` | `staging` (`qa.bicepparam:17`) | `production` | DevOps | DevOps Lead | N/A | — | 2026-07-30 | OK |
| `APP_PORT` | Runtime | kv-ref (`edu-app-port`) | Hardcoded | Required | Dockerfile `ENV APP_PORT=3000` | `3000` | `3000` | `3000` | DevOps | DevOps Lead | N/A | — | 2026-07-30 | OK |
| `APP_URL` | Runtime | kv-ref (`edu-app-url`), value set per-env in `.bicepparam` | Dynamic | Required | *None* | `https://dev.educatorbe.realityworksai.com` | `https://qa.educatorbe.realityworksai.com` | `https://educatorbe.realityworksai.com` | DevOps | DevOps Lead | N/A | — | 2026-07-30 | OK |
| `FRONTEND_URL` | Runtime | kv-ref (`edu-frontend-url`) | Dynamic | Required | `http://localhost:5173` (`educators.service.ts:531`, `invites.service.ts:201`, `schools.service.ts:434`, `lti.controller.ts:270,494`) | `https://dev.educator.realityworksai.com` | `https://qa.educator.realityworksai.com` | `https://educator.realityworksai.com` | DevOps | DevOps Lead | N/A | — | 2026-07-30 | OK |
| `STUDENT_FRONTEND_URL` | Runtime | kv-ref (`edu-student-frontend-url`) — **secret never provisioned, see Cleanup Backlog** | Dynamic | Required (LTI student redirects) | `http://localhost:5174` (`lti.controller.ts:394`) | in `.env.example` only | *(no KV secret exists)* | *(no KV secret exists)* | DevOps | DevOps Lead | N/A | — | 2026-07-30 | **Drift — see below** |
| `ALLOW_NONSSL` | Runtime | container-env (literal, derived: `environment == 'prod' ? 'false' : 'true'`, `containerApp-backend.bicep:116,245`) | Hardcoded | Optional | `false` (`db.config.ts:4`, `data-source.ts:30`) | `true` (SSL off) | `true` (SSL off) | `false` (SSL enforced) | DevOps | DevOps Lead | N/A | — | 2026-07-30 | OK |
| `PORT` | Runtime | *(never set anywhere)* | Hardcoded | Optional (log message only) | `3000` | unset | unset | unset | Backend Dev | Release Manager | N/A | — | 2026-07-30 | **Drift — see below** |

> **`STUDENT_FRONTEND_URL` is read via `secretRef: 'edu-student-frontend-url'` in `containerApp-backend.bicep:262`, but `infra/modules/keyVaultSecrets.bicep` has no parameter or child resource that ever writes that secret name**, and `docs/KEY-VAULT-VARS.md`'s variable catalog doesn't mention it either. On a from-scratch environment stand-up (new vault, first `provision`), the Container App would reference a KV secret that doesn't exist. In the three long-lived environments it presumably works today only because someone created `edu-student-frontend-url` by hand at some point outside IaC — confirm this in each vault and either add it to `keyVaultSecrets.bicep`'s "empty-allowed" tier (mirroring `frontendUrl`) or document it as an intentionally manual entry.
>
> **`PORT` vs `APP_PORT` — cosmetic logging bug, not a functional one.** `main.ts:54` correctly calls `app.listen(process.env.APP_PORT!)`, but the two `console.log` lines right after it (`main.ts:56-57`) read `process.env.PORT ?? 3000` instead of `APP_PORT` — so the startup log always prints "Server running on http://localhost:3000" / the Swagger URL on port 3000 regardless of what `APP_PORT` is actually set to. Harmless today because `APP_PORT` is `3000` everywhere, but it will silently mislead on-call if `APP_PORT` is ever changed. **Fix**: change `main.ts:56-57` to read `process.env.APP_PORT`.

### Database — `src/config/db.config.ts`, `src/data-source.ts`

| Variable Name | Stage | Injection Method | Type | Req/Opt | Default | Dev Value/Query | QA Value/Query | Prod Value/Query | Uploads (Dev/QA) | Updates Prod | Rotation Policy | Next Rotation Due | Last Verified | Drift Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `DB_HOST` | Runtime | kv-ref (`edu-db-host`) — value resource-derived from `postgres.bicep` | Dynamic | Required | *None* | `psql-dev1-rwai-edu.postgres.database.azure.com` | `psql-qa1-rwai-edu.postgres.database.azure.com` | `psql-prod1-rwai-edu.postgres.database.azure.com` | DevOps | DevOps Lead | N/A | — | 2026-07-30 | OK |
| `DB_PORT` | Runtime | kv-ref (`edu-db-port`) | Hardcoded | Optional | *None* (`Number(undefined)` = `NaN` if unset) | `5432` | `5432` | `5432` | DevOps | DevOps Lead | N/A | — | 2026-07-30 | OK |
| `DB_NAME` | Runtime | kv-ref (`edu-db-name`) | Hardcoded | Required | *None* | `educator_dev` | `educator_qa` | `educator_prod` | DevOps | DevOps Lead | N/A | — | 2026-07-30 | OK |
| `DB_USERNAME` | Runtime | kv-ref (`edu-db-username`) | Secret | Required | *None* | `kv:akvdev1rwai/edu-db-username` | `kv:akvqa1rwai/edu-db-username` | `kv:akvprod1rwai/edu-db-username` | DevOps | DevOps Lead | 180 days | TBD | 2026-07-30 | OK |
| `DB_PASSWORD` | Runtime | kv-ref (`edu-db-password`) — written from `POSTGRES_ADMIN_PASSWORD` on `provision` (`keyVaultSecrets.bicep:41,116-120`) | Secret | Required | *None* | `kv:akvdev1rwai/edu-db-password` | `kv:akvqa1rwai/edu-db-password` | `kv:akvprod1rwai/edu-db-password` | DevOps | DevOps Lead | 90 days | TBD | 2026-07-30 | OK |

### Auth / JWT — `src/auth/`, `src/common/strategy/`, `src/students/`

| Variable Name | Stage | Injection Method | Type | Req/Opt | Default | Dev Value/Query | QA Value/Query | Prod Value/Query | Uploads (Dev/QA) | Updates Prod | Rotation Policy | Next Rotation Due | Last Verified | Drift Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `JWT_SECRET` | Runtime | kv-ref (`edu-jwt-secret`) — provision-env `JWT_SECRET` | Secret | Required (`auth.module.ts:31` throws if unset) | *None* | `kv:akvdev1rwai/edu-jwt-secret` | `kv:akvqa1rwai/edu-jwt-secret` | `kv:akvprod1rwai/edu-jwt-secret` | Security Lead | Security Admin | 90 days | TBD | 2026-07-30 | OK |
| `JWT_EXPIRES_IN` | Runtime | kv-ref (`edu-jwt-expires-in`), value set per-env in `.bicepparam` | Hardcoded | Optional | `1d` (`auth.module.ts:29`, `students.module.ts:28`) / `AuthConstants.DEFAULT_JWT_EXPIRES` elsewhere | `7d` (`dev.bicepparam:17`, not `.env.example`'s `1d`) | `7d` | `7d` | Backend Dev | Release Manager | N/A | — | 2026-07-30 | Unverified — see note below |
| `LTI_STUDENT_CODE_SECRET` | Runtime | *(none provisioned — always falls back to `JWT_SECRET`)* | Secret | Optional | falls back to `JWT_SECRET` (`lti.controller.ts:182-183`, `students.controller.ts:54-55`) | unset | unset | unset | Security Lead | Security Admin | N/A | — | 2026-07-30 | Unverified — orphaned, see Cleanup Backlog |

> **`JWT_EXPIRES_IN` — `.env.example:19` documents `1d` as the value to copy for local dev, but every deployed environment (dev/qa/prod `.bicepparam`) actually ships `7d`.** Not a bug (both values are intentional per-environment choices, and the code correctly reads whatever KV has), but the `.env.example` comment doesn't tell a new developer that deployed environments differ from local — worth a one-line note in `.env.example` so nobody assumes local behavior (1-day tokens) matches what QA/Prod actually issue (7-day tokens).

### Mail — Microsoft Graph — `src/mail/mail.service.ts`, `src/educators/`, `src/invites/`, `src/schools/`

| Variable Name | Stage | Injection Method | Type | Req/Opt | Default | Dev Value/Query | QA Value/Query | Prod Value/Query | Uploads (Dev/QA) | Updates Prod | Rotation Policy | Next Rotation Due | Last Verified | Drift Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `MAIL_FROM` | Runtime | kv-ref (`edu-mail-from`) — `mail.service.ts:43` uses `getOrThrow` | Hardcoded | Required | *None* | `no-reply@realityworks.com` | `no-reply@realityworks.com` | `no-reply@realityworks.com` | Backend Dev | Release Manager | N/A | — | 2026-07-30 | OK |
| `GRAPH_TENANT_ID` | Runtime | kv-ref (`edu-graph-tenant-id`) — provision-env `GRAPH_TENANT_ID` | Dynamic | Required (`mail.service.ts:39` `getOrThrow`) | *None* | `kv:akvdev1rwai/edu-graph-tenant-id` (shared value from `akv-all1-all`) | `kv:akvqa1rwai/edu-graph-tenant-id` | `kv:akvprod1rwai/edu-graph-tenant-id` | DevOps | DevOps Lead | N/A | — | 2026-07-30 | OK |
| `GRAPH_CLIENT_ID` | Runtime | kv-ref (`edu-graph-client-id`) — provision-env `GRAPH_CLIENT_ID` | Dynamic | Required (`getOrThrow`) | *None* | `kv:akvdev1rwai/edu-graph-client-id` | `kv:akvqa1rwai/edu-graph-client-id` | `kv:akvprod1rwai/edu-graph-client-id` | DevOps | DevOps Lead | N/A | — | 2026-07-30 | OK |
| `GRAPH_CLIENT_SECRET` | Runtime | kv-ref (`edu-graph-client-secret`) — provision-env `GRAPH_CLIENT_SECRET` | Secret | Required (`getOrThrow`) | *None* | `kv:akvdev1rwai/edu-graph-client-secret` | `kv:akvqa1rwai/edu-graph-client-secret` | `kv:akvprod1rwai/edu-graph-client-secret` | Security Lead | Security Admin | 180 days | TBD | 2026-07-30 | OK |
| `EMAIL_LOGO_URL` | Runtime | *(none provisioned)* | Dynamic | Optional | `''` (empty string — logo silently omitted) (`educators.service.ts:324,533,652`, `invites.service.ts:203`, `schools.service.ts:435`) | unset | unset | unset | Backend Dev | Release Manager | N/A | — | 2026-07-30 | Unverified — orphaned, see Cleanup Backlog |

### Azure Blob Storage — `src/config/azure-blob.config.ts`, `src/common/utils/azure-blob.service.ts`, `src/common/utils/tutor-patient.service.ts`, `src/health/health.service.ts`

| Variable Name | Stage | Injection Method | Type | Req/Opt | Default | Dev Value/Query | QA Value/Query | Prod Value/Query | Uploads (Dev/QA) | Updates Prod | Rotation Policy | Next Rotation Due | Last Verified | Drift Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `AZURE_STORAGE_CONNECTION_STRING` | Runtime | kv-ref (`edu-azure-storage-connection-string`) — provision-env | Secret | Optional (managed-identity path used when unset) | *(none — falls through to `AZURE_STORAGE_ACCOUNT` + `DefaultAzureCredential`)* | `.env.local` Azurite emulator string (local Docker only) | `kv:akvqa1rwai/edu-azure-storage-connection-string` | `kv:akvprod1rwai/edu-azure-storage-connection-string` | DevOps | DevOps Lead | 90 days | TBD | 2026-07-30 | OK |
| `AZURE_STORAGE_ACCOUNT` | Runtime | kv-ref (`edu-azure-storage-account`), value set per-env in `.bicepparam` | Dynamic | Required (when no connection string) | *None* | `asadev1rwai` | `asaqarwai` | `asaprodrwai` | DevOps | DevOps Lead | N/A | — | 2026-07-30 | OK |
| `AZURE_STORAGE_CONTAINER` | Runtime | kv-ref (`edu-azure-storage-container`), value set per-env in `.bicepparam` | Hardcoded | Required | `profile-pictures` (`azure-blob.config.ts:30`) | `edu-uploads` | `edu-uploads` | `edu-uploads` | DevOps | DevOps Lead | N/A | — | 2026-07-30 | OK |
| `AZURE_BLOB_CONTAINER_NAME` | Runtime | kv-ref (`edu-azure-blob-container-name`) | Hardcoded | Optional | `json-data` (`tutor-patient.service.ts:50`) | `json-data` | `json-data` | `json-data` | DevOps | DevOps Lead | N/A | — | 2026-07-30 | OK |
| `AZURE_BLOB_DATA_CONTAINER_NAME` | Runtime | *(none provisioned)* | Hardcoded | Optional | falls back to `AZURE_BLOB_CONTAINER_NAME` (`tutor-patient.service.ts:53-54`) | unset | unset | unset | Backend Dev | Release Manager | N/A | — | 2026-07-30 | Unverified — orphaned, see Cleanup Backlog |
| `BLOB_DOWNLOAD_TIMEOUT_MS` | Runtime | *(none provisioned — reads raw `process.env`, not `ConfigService`)* | Hardcoded | Optional | `20000` (`tutor-patient.service.ts:907-910`) | unset | unset | unset | Backend Dev | Release Manager | N/A | — | 2026-07-30 | Unverified — orphaned, see Cleanup Backlog |
| `AZURE_STORAGE_CONTAINER_NAME` | Runtime | *(never set anywhere — dead fallback key)* | Hardcoded | Optional | falls back to `json-data` (`health.service.ts:112-113`) | unset | unset | unset | — | — | N/A | — | 2026-07-30 | **Drift — see below** |

> **`AZURE_STORAGE_CONTAINER_NAME` (`health.service.ts:113`) and the lowercase-underscore fallbacks `edu_azure_storage_connection_string` / `edu_azure_blob_container_name` (`tutor-patient.service.ts:48,51`) can never resolve to anything.** No `.env.example`, KV secret, or `.bicepparam` entry uses these exact names anywhere in the repo — they look like leftover attempts to read the Key Vault secret's *hyphenated* name (`edu-azure-storage-connection-string`) directly out of `ConfigService`, which never happens automatically (ACA maps `secretRef:` to the plain env var name given in Bicep, e.g. `AZURE_STORAGE_CONNECTION_STRING`, not the KV secret name). These branches are unreachable dead code today; harmless because the primary `AZURE_STORAGE_CONNECTION_STRING`/`AZURE_BLOB_CONTAINER_NAME` reads already succeed first. Recommend deleting the dead fallback branches to avoid confusing future maintainers into thinking they do something.

### Redis Cache — `src/redis/redis.module.ts`, `src/redis/redis.service.ts`, `infra/modules/containerApp-backend.bicep`

| Variable Name | Stage | Injection Method | Type | Req/Opt | Default | Dev Value/Query | QA Value/Query | Prod Value/Query | Uploads (Dev/QA) | Updates Prod | Rotation Policy | Next Rotation Due | Last Verified | Drift Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `REDIS_HOST` | Runtime | **container-env (hardcoded literal `value: '127.0.0.1'`, `containerApp-backend.bicep:237`)** | Hardcoded | Optional (`redis.module.ts:19-21` returns `null` client, app degrades to no-cache) | *(unset -> no Redis client)* | `127.0.0.1` (literal) | `127.0.0.1` (literal) | `127.0.0.1` (literal) | DevOps | DevOps Lead | N/A | — | 2026-07-30 | OK — same-revision sidecar, intentional |
| `REDIS_PORT` | Runtime | container-env (hardcoded literal, `containerApp-backend.bicep:238`) | Hardcoded | Optional | `6379` (`redis.module.ts:17`) | `6379` | `6379` | `6379` | DevOps | DevOps Lead | N/A | — | 2026-07-30 | OK |
| `REDIS_PASSWORD` | Runtime | *(none — not set anywhere)* | Secret | Optional | *None* (`redis.module.ts:23,29` — `password: password \|\| undefined`) | unset | unset | **unset** | DevOps | DevOps Lead | 90 days | TBD | 2026-07-30 | **Drift — missing control** |
| `REDIS_TLS` | Runtime | *(none provisioned)* | Hardcoded | Optional | `false` (`redis.module.ts:24`) | unset | unset | unset | DevOps | DevOps Lead | N/A | — | 2026-07-30 | Unverified — see Cleanup Backlog |
| `REDIS_BLOB_KEY_PREFIX` | Runtime | *(none provisioned)* | Hardcoded | Optional | `tutor-patient:blob:` (`tutor-patient.service.ts:62`) | unset | unset | unset | Backend Dev | Release Manager | N/A | — | 2026-07-30 | Unverified — orphaned, see Cleanup Backlog |
| `REDIS_CACHE_TTL_SECONDS` | Runtime | *(none provisioned)* | Hardcoded | Optional | `300` (5 min) (`redis.service.ts:80`, `tutor-patient.service.ts:64-66`) | unset | unset | unset | Backend Dev | Release Manager | N/A | — | 2026-07-30 | Unverified — orphaned, see Cleanup Backlog |

> **`REDIS_PASSWORD` is a missing security control, matching the same pattern flagged in the `Crexo-Educator-Backend` audit.** Redis runs as a same-revision sidecar (`containerApp-backend.bicep:295-327`, `redis:7-alpine`) reachable only over `127.0.0.1` inside the Container App, so hardcoding `REDIS_HOST`/`REDIS_PORT` as literals (not KV-sourced) is a defensible, documented pattern for same-pod traffic (see the comment at `containerApp-backend.bicep:234-236`). However, **no `REDIS_PASSWORD`/`--requirepass` is configured anywhere** — the sidecar's `args:` block (`containerApp-backend.bicep:303-307`) only sets `--save`, `--appendonly`, `--maxmemory`, `--maxmemory-policy`. Any process able to reach the Container App's internal loopback (including a compromised app-container process, or another container injected into the same revision) can talk to Redis unauthenticated. Recommend adding a KV-backed `REDIS_PASSWORD` + `--requirepass` sidecar arg as a defense-in-depth measure, tracked as a Prod hardening backlog item.

### LTI 1.3 / LMS Integration — `src/lti/`, `src/lms/`

| Variable Name | Stage | Injection Method | Type | Req/Opt | Default | Dev Value/Query | QA Value/Query | Prod Value/Query | Uploads (Dev/QA) | Updates Prod | Rotation Policy | Next Rotation Due | Last Verified | Drift Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `API_BASE_URL` | Runtime | kv-ref (`edu-api-base-url`) — **secret never provisioned, see Cleanup Backlog** | Dynamic | Required (LTI launch/callback redirects, `lti-key.service.ts:99`) | *(none — used for JWKS `iss`/callback URL construction)* | in `.env.example` only | *(no KV secret exists)* | *(no KV secret exists)* | DevOps | DevOps Lead | N/A | — | 2026-07-30 | **Drift — see below** |
| `LTI_FALLBACK_KEY_ID` | Runtime | kv-ref (`edu-lti-fallback-key-id`) — provision-env `LTI_FALLBACK_KEY_ID` | Secret | Optional (used only when platform JWKS is unavailable, `lti-key.service.ts:81`) | *None* | `kv:akvdev1rwai/edu-lti-fallback-key-id` | `kv:akvqa1rwai/edu-lti-fallback-key-id` | `kv:akvprod1rwai/edu-lti-fallback-key-id` | Security Lead | Security Admin | 180 days | TBD | 2026-07-30 | Unverified — provisioned in Bicep but **missing from `docs/KEY-VAULT-VARS.md`**, see note below |
| `LTI_FALLBACK_PRIVATE_KEY_PEM` | Runtime | kv-ref (`edu-lti-fallback-private-key-pem`) — provision-env | Secret | Optional (paired with above) | *None* | `kv:akvdev1rwai/edu-lti-fallback-private-key-pem` | `kv:akvqa1rwai/edu-lti-fallback-private-key-pem` | `kv:akvprod1rwai/edu-lti-fallback-private-key-pem` | Security Lead | Security Admin | 180 days | TBD | 2026-07-30 | Unverified — same doc-drift as above |
| `LMS_ENABLE_LTI_AUTO_PROVISION` | Runtime | *(declared in `.env.example` only; no KV secret / container env in `.deployment/container-spec.json` for any environment)* | Hardcoded | Optional | `'false'` (`lti.controller.ts:346`) | `true` (`.env.example:30`, local only) | *(falls back to code default `false`)* | *(falls back to code default `false`)* | Backend Dev | Release Manager | N/A | — | 2026-07-30 | **Drift — see below** |
| `MOODLE_URL` | Runtime | *(none provisioned)* | Dynamic | Optional | `''` (`lms-provision.service.ts:315`, `lms-roster.service.ts:30`) | unset | unset | unset | Backend Dev | Release Manager | N/A | — | 2026-07-30 | Unverified — orphaned, see Cleanup Backlog |
| `MOODLE_WS_TOKEN` | Runtime | *(none provisioned)* | Secret | Optional | `''` (`lms-provision.service.ts:321`, `lms-roster.service.ts:34`) | unset | unset | unset | Security Lead | Security Admin | N/A (not currently live) | — | 2026-07-30 | Unverified — orphaned, see Cleanup Backlog |

> **`API_BASE_URL` has the exact same broken-provisioning pattern as `STUDENT_FRONTEND_URL` above** — `containerApp-backend.bicep:261` reads `secretRef: 'edu-api-base-url'`, but `keyVaultSecrets.bicep` never writes that secret name, and `docs/KEY-VAULT-VARS.md` doesn't list it. `.env.example:22-23` explicitly documents "In deployed envs (dev/qa/prod): injected from Key Vault secret `edu-api-base-url`" — so the intent is clear, the wiring to actually create that secret is just missing from IaC. This is a **higher-severity gap than the frontend-URL one** because `API_BASE_URL` is explicitly called out as "Required for ngrok/deployed envs" for LTI launch/callback redirects — if it's genuinely unset in any live environment, LTI launches would build callback URLs against the wrong host.
>
> **`LTI_FALLBACK_KEY_ID` / `LTI_FALLBACK_PRIVATE_KEY_PEM` are correctly provisioned in `keyVaultSecrets.bicep` (lines 49-51, 136-145) but absent from `docs/KEY-VAULT-VARS.md`'s "Sensitive" table (lines 44-49), which only lists 4 of the 6 sensitive secrets the module actually writes.** Doc-only gap, not a live issue — update the doc.
>
> **`LMS_ENABLE_LTI_AUTO_PROVISION` — the value documented for local dev (`.env.example:30`, `true`) is the opposite of the code's fallback default (`lti.controller.ts:346`, `'false'`), and neither `.deployment/container-spec.json` nor any `.bicepparam`/KV secret sets this var in dev, qa, or prod.** Every deployed environment therefore silently runs with LTI auto-provisioning **disabled**, regardless of the `.env.example` guidance suggesting it should be on. If auto-provisioning is expected to work in any deployed environment today, this is a live functional bug, not just a doc gap — confirm the intended behavior per environment and either wire the var through Key Vault/Bicep or update `.env.example` to stop implying it's on by default.

### Rate Limiting / Throttling — `src/common/constants/throttle.constants.ts`, `infra/modules/containerApp-backend.bicep`

| Variable Name | Stage | Injection Method | Type | Req/Opt | Default | Dev Value/Query | QA Value/Query | Prod Value/Query | Uploads (Dev/QA) | Updates Prod | Rotation Policy | Next Rotation Due | Last Verified | Drift Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `RATE_LIMIT_PUBLIC_LIMIT` | Runtime | kv-ref (`edu-rate-limit-public-limit`, `containerApp-backend.bicep:268`) | Hardcoded | Optional | `3` (`throttle.constants.ts`, `RATE_LIMIT.PUBLIC.LIMIT`) | `kv:akvdev1rwai/edu-rate-limit-public-limit` = `3` | `kv:akvqa1rwai/edu-rate-limit-public-limit` = `3` | `kv:akvprod1rwai/edu-rate-limit-public-limit` = `3` | DevOps | DevOps Lead | N/A | — | 2026-08-14 | OK |
| `RATE_LIMIT_PUBLIC_TTL` | Runtime | kv-ref (`edu-rate-limit-public-ttl`, `containerApp-backend.bicep:269`) | Hardcoded | Optional | `1` (`throttle.constants.ts`, `RATE_LIMIT.PUBLIC.TTL`) | `kv:akvdev1rwai/edu-rate-limit-public-ttl` = `1` | `kv:akvqa1rwai/edu-rate-limit-public-ttl` = `1` | `kv:akvprod1rwai/edu-rate-limit-public-ttl` = `1` | DevOps | DevOps Lead | N/A | — | 2026-08-14 | OK |
| `RATE_LIMIT_AUTH_LIMIT` | Runtime | kv-ref (`edu-rate-limit-auth-limit`, `containerApp-backend.bicep:275`) | Hardcoded | Optional | `5` (`throttle.constants.ts`, `RATE_LIMIT.AUTHENTICATED.LIMIT`) | `kv:akvdev1rwai/edu-rate-limit-auth-limit` = `5` | `kv:akvqa1rwai/edu-rate-limit-auth-limit` = `5` | `kv:akvprod1rwai/edu-rate-limit-auth-limit` = `5` | DevOps | DevOps Lead | N/A | — | 2026-08-14 | OK |
| `RATE_LIMIT_AUTH_TTL` | Runtime | kv-ref (`edu-rate-limit-auth-ttl`, `containerApp-backend.bicep:276`) | Hardcoded | Optional | `1` (`throttle.constants.ts`, `RATE_LIMIT.AUTHENTICATED.TTL`) | `kv:akvdev1rwai/edu-rate-limit-auth-ttl` = `1` | `kv:akvqa1rwai/edu-rate-limit-auth-ttl` = `1` | `kv:akvprod1rwai/edu-rate-limit-auth-ttl` = `1` | DevOps | DevOps Lead | N/A | — | 2026-08-14 | OK |
| `DEFAULT_THROTTLE_LIMIT` | Runtime | kv-ref (`edu-default-throttle-limit`, `containerApp-backend.bicep:279`) | Hardcoded | Optional | `5` (`throttle.constants.ts`, `DEFAULT_THROTTLE.LIMIT`) | `kv:akvdev1rwai/edu-default-throttle-limit` = `5` | `kv:akvqa1rwai/edu-default-throttle-limit` = `5` | `kv:akvprod1rwai/edu-default-throttle-limit` = `5` | DevOps | DevOps Lead | N/A | — | 2026-08-14 | OK |
| `DEFAULT_THROTTLE_TTL_MS` | Runtime | kv-ref (`edu-default-throttle-ttl-ms`, `containerApp-backend.bicep:280`) | Hardcoded | Optional | `1` (`throttle.constants.ts`, `DEFAULT_THROTTLE.TTL_MS` — note the code fallback is `1`, not `1_000`) | `kv:akvdev1rwai/edu-default-throttle-ttl-ms` = `1000` | `kv:akvqa1rwai/edu-default-throttle-ttl-ms` = `1000` | `kv:akvprod1rwai/edu-default-throttle-ttl-ms` = `1000` | DevOps | DevOps Lead | N/A | — | 2026-08-14 | OK |
| `RATE_LIMIT_FALLBACK_RETRY_AFTER_SECONDS` | Runtime | kv-ref (`edu-rate-limit-fallback-retry-after-seconds`, `containerApp-backend.bicep:281`) | Hardcoded | Optional | `60` (`throttle.constants.ts`, module-level constant) | `kv:akvdev1rwai/edu-rate-limit-fallback-retry-after-seconds` = `60` | `kv:akvqa1rwai/edu-rate-limit-fallback-retry-after-seconds` = `60` | `kv:akvprod1rwai/edu-rate-limit-fallback-retry-after-seconds` = `60` | DevOps | DevOps Lead | N/A | — | 2026-08-14 | OK |

> All seven vars above are now read via `Number(process.env.X ?? default)` in `throttle.constants.ts` on `dev` (commit range `0a04b8f..6b822ba`), provisioned in Key Vault (Dev/QA/Prod), and wired via `secretRef:` in `containerApp-backend.bicep` — the pipeline from Key Vault to running code is complete for all seven. One drift worth a follow-up: the code fallback for `DEFAULT_THROTTLE_TTL_MS` is `1` ms, not `1_000` ms as originally intended — harmless while the Key Vault secret (`1000`) is present in every environment, but the in-code default would be wrong if that secret were ever deleted or a new environment stood up without it.

### API Timeout Handling — `src/main.ts`, `src/config/db.config.ts`, `src/common/interceptors/request-timeout.interceptor.ts`

| Variable Name | Stage | Injection Method | Type | Req/Opt | Default | Dev Value/Query | QA Value/Query | Prod Value/Query | Uploads (Dev/QA) | Updates Prod | Rotation Policy | Next Rotation Due | Last Verified | Drift Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `API_TIMEOUT_MS` | Runtime | kv-ref (`edu-api-timeout-ms`, `containerApp-backend.bicep`) | Hardcoded | Optional | `60000` (`request-timeout.interceptor.ts:12`, `Number(process.env.API_TIMEOUT_MS) \|\| 60_000`) | `kv:akvdev1rwai/edu-api-timeout-ms` = `60000` | `kv:akvqa1rwai/edu-api-timeout-ms` = `60000` | `kv:akvprod1rwai/edu-api-timeout-ms` = `60000` | DevOps | DevOps Lead | N/A | — | 2026-08-19 | OK |
| `SERVER_KEEP_ALIVE_TIMEOUT_MS` | Runtime | kv-ref (`edu-server-keep-alive-timeout-ms`, `containerApp-backend.bicep`) | Hardcoded | Optional | `65000` (`main.ts`, sets `server.keepAliveTimeout`) | `kv:akvdev1rwai/edu-server-keep-alive-timeout-ms` = `65000` | `kv:akvqa1rwai/edu-server-keep-alive-timeout-ms` = `65000` | `kv:akvprod1rwai/edu-server-keep-alive-timeout-ms` = `65000` | DevOps | DevOps Lead | N/A | — | 2026-08-19 | OK |
| `SERVER_HEADERS_TIMEOUT_MS` | Runtime | kv-ref (`edu-server-headers-timeout-ms`, `containerApp-backend.bicep`) | Hardcoded | Optional | `66000` (`main.ts`, sets `server.headersTimeout`; must stay above `SERVER_KEEP_ALIVE_TIMEOUT_MS` per Node's HTTP server contract) | `kv:akvdev1rwai/edu-server-headers-timeout-ms` = `66000` | `kv:akvqa1rwai/edu-server-headers-timeout-ms` = `66000` | `kv:akvprod1rwai/edu-server-headers-timeout-ms` = `66000` | DevOps | DevOps Lead | N/A | — | 2026-08-19 | OK |
| `DB_POOL_MAX` | Runtime | kv-ref (`edu-db-pool-max`, `containerApp-backend.bicep`) | Hardcoded | Optional | `10` (`db.config.ts`, TypeORM `extra.max`) | `kv:akvdev1rwai/edu-db-pool-max` = `10` | `kv:akvqa1rwai/edu-db-pool-max` = `10` | `kv:akvprod1rwai/edu-db-pool-max` = `10` | DevOps | DevOps Lead | N/A | — | 2026-08-19 | OK |
| `DB_POOL_IDLE_TIMEOUT_MS` | Runtime | kv-ref (`edu-db-pool-idle-timeout-ms`, `containerApp-backend.bicep`) | Hardcoded | Optional | `30000` (`db.config.ts`, TypeORM `extra.idleTimeoutMillis`) | `kv:akvdev1rwai/edu-db-pool-idle-timeout-ms` = `30000` | `kv:akvqa1rwai/edu-db-pool-idle-timeout-ms` = `30000` | `kv:akvprod1rwai/edu-db-pool-idle-timeout-ms` = `30000` | DevOps | DevOps Lead | N/A | — | 2026-08-19 | OK |
| `DB_POOL_ACQUIRE_TIMEOUT_MS` | Runtime | kv-ref (`edu-db-pool-acquire-timeout-ms`, `containerApp-backend.bicep`) | Hardcoded | Optional | `5000` (`db.config.ts`, TypeORM `extra.connectionTimeoutMillis`) | `kv:akvdev1rwai/edu-db-pool-acquire-timeout-ms` = `5000` | `kv:akvqa1rwai/edu-db-pool-acquire-timeout-ms` = `5000` | `kv:akvprod1rwai/edu-db-pool-acquire-timeout-ms` = `5000` | DevOps | DevOps Lead | N/A | — | 2026-08-19 | OK |
| `HEAP_LOG_INTERVAL_MS` | Runtime | kv-ref (`edu-heap-log-interval-ms`, `containerApp-backend.bicep`) | Hardcoded | Optional | `60000` (`main.ts`, `startHeapLogger` interval) | `kv:akvdev1rwai/edu-heap-log-interval-ms` = `60000` | `kv:akvqa1rwai/edu-heap-log-interval-ms` = `60000` | `kv:akvprod1rwai/edu-heap-log-interval-ms` = `60000` | DevOps | DevOps Lead | N/A | — | 2026-08-19 | OK |

> All seven vars above were added as part of PR #564 (cold-start / connection-pool / memory-leak hardening on `feature/rwed-2702-api-timeout-handling-and-memory-leak-investigation`): request timeout, HTTP server keep-alive/headers timeouts, TypeORM connection-pool sizing, and the periodic heap-usage logger. Each is read via `Number(process.env.X) || <default>` in code, so an unset or empty KV value falls back safely rather than crashing. Provisioned in Key Vault (Dev/QA/Prod) and wired via `secretRef:` in `containerApp-backend.bicep`, following the same pattern as the Rate Limiting section above.

### Snapshot Job — `infra/modules/containerAppJob-snapshot.bicep`, `snapshot/entrypoint.ps1`, `scripts/Provision-Snapshot-Prod.ps1`

A **separate compute resource** from the main app: a Container Apps *Job*
(`acj-{env}1-rwai-edusnap`), not the Container App the rest of this
document describes. **Prod only by design** — `infra/resources.bicep`'s
`deploySnapshotJob` gates the whole module on `snapshotRepo` being
non-empty, and only prod's `provision` should ever set it (see
`docs/WEEKLY-SNAPSHOT.md`). Dev/QA values below are "N/A" for that reason,
not an oversight.

#### Runtime — resolved onto the Job at deploy time (`containerAppJob-snapshot.bicep`)

| Variable Name | Stage | Injection Method | Type | Req/Opt | Default | Dev Value/Query | QA Value/Query | Prod Value/Query | Uploads (Dev/QA) | Updates Prod | Rotation Policy | Next Rotation Due | Last Verified | Drift Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `SOURCE_STORAGE_ACCOUNT` | Runtime | job-env (literal, `containerAppJob-snapshot.bicep`) | Dynamic | Required | *None* | N/A — prod-only | N/A — prod-only | `asaprodrwai` | DevOps | DevOps Lead | N/A | — | 2026-08-21 | OK |
| `SOURCE_CONTAINER` | Runtime | job-env (literal) | Hardcoded | Required | *None* | N/A — prod-only | N/A — prod-only | `json-data` | DevOps | DevOps Lead | N/A | — | 2026-08-21 | OK |
| `GIT_APP_ID` | Runtime | job-env (literal) | Dynamic | Required | *None* — not secret, just the App's numeric ID | N/A — prod-only | N/A — prod-only | `4652247` | DevOps | DevOps Lead | N/A | — | 2026-08-21 | OK |
| `GIT_APP_INSTALLATION_ID` | Runtime | job-env (literal) | Dynamic | Required | *None* — not secret | N/A — prod-only | N/A — prod-only | `155013243` | DevOps | DevOps Lead | N/A | — | 2026-08-21 | OK |
| `SNAPSHOT_REPO` | Runtime | job-env (literal) | Dynamic | Required | *None* | N/A — prod-only | N/A — prod-only | `Realityworks-AI/student-app-scenario-snapshot` | DevOps | DevOps Lead | N/A | — | 2026-08-21 | OK |
| `GIT_APP_PRIVATE_KEY` | Runtime | job-secret-ref (`snap-git-app-private-key`) — provision-env `SNAPSHOT_GIT_APP_PRIVATE_KEY` | Secret | Required (Job references this secret unconditionally — must exist before the Job is created) | *None* | N/A — prod-only | N/A — prod-only | `kv:akvprod1rwai/snap-git-app-private-key` | Security Lead | Security Admin | 180 days (rotate via GitHub App settings → generate new key → re-provision) | TBD | 2026-08-21 | OK |
| `SNAPSHOT_UAI_CLIENT_ID` | Runtime | job-env (literal, `snapshotIdentity.outputs.clientId`) | Dynamic | Required — Container Apps' MSI token endpoint defaults to a (nonexistent) system-assigned identity unless this is passed as `client_id` on every token request | *None* | N/A — prod-only | N/A — prod-only | resolved from `id-prod1-rwai-edusnap`'s client ID | DevOps | DevOps Lead | N/A | — | 2026-08-21 | OK |
| `TEAMS_WEBHOOK_URL` | Runtime | job-secret-ref (`snap-teams-webhook-url`) — provision-env `SNAPSHOT_TEAMS_WEBHOOK_URL` | Secret | Optional — omitted entirely (no secret, no env var) when unset | *(unset → `Send-TeamsNotification` no-ops)* | N/A — prod-only | N/A — prod-only | `kv:akvprod1rwai/snap-teams-webhook-url` | DevOps | DevOps Lead | 180 days (Teams Workflow webhook URLs don't expire but should be rotated if leaked) | TBD | 2026-08-21 | OK |
| `SNAPSHOT_TEAMS_MENTION` | Runtime | job-env (literal) — provision-env `SNAPSHOT_TEAMS_MENTION` | Dynamic | Optional — only applied on **failure** notifications, never success | *(unset → no `@mention`, still posts a red card)* | N/A — prod-only | N/A — prod-only | `kavyesh.shah@rwthrive.com` | DevOps | DevOps Lead | N/A | — | 2026-08-21 | OK — confirmed as a real Teams ping, not just card text |
| `SNAPSHOT_HYDRATION_CONCURRENCY` | Runtime | *(declared in `entrypoint.ps1`, never provisioned in Bicep)* | Hardcoded | Optional | `32` (mirrors the backend's own `SCENARIO_HYDRATION_CONCURRENCY`) | unset | unset | unset | Backend Dev | Release Manager | N/A | — | 2026-08-21 | Unverified — no functional need to override yet, listed for completeness |
| `IDENTITY_ENDPOINT`, `IDENTITY_HEADER` | Runtime | platform-injected — never declared in this repo's Bicep at all | Dynamic | Required (consumed by `Get-ManagedIdentityToken` in `entrypoint.ps1`) | *None* | N/A — prod-only | N/A — prod-only | resolved by the Container Apps platform at container start | N/A | N/A | N/A | — | 2026-08-21 | OK |

#### Provision-time — shell env vars read by `scripts/Provision-Snapshot-Prod.ps1` (feeds `infra/env/prod.bicepparam` via `readEnvironmentVariable(...)`)

These are distinct from the Runtime vars above even where the name looks
identical — these are shell-level inputs to a one-time/occasional
`provision` run on an operator's machine, not what the Job container reads
at execution time.

| Variable Name | Stage | Injection Method | Type | Req/Opt | Default | Dev Value/Query | QA Value/Query | Prod Value/Query | Uploads (Dev/QA) | Updates Prod | Rotation Policy | Next Rotation Due | Last Verified | Drift Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `SNAPSHOT_REPO` | Provision-time | provision-env | Dynamic | Required (once) | `''` | N/A — prod-only | N/A — prod-only | operator-supplied, set once | DevOps | DevOps Lead | N/A | — | 2026-08-21 | OK |
| `SNAPSHOT_GIT_APP_ID` | Provision-time | provision-env | Dynamic | Required (once) | `''` | N/A — prod-only | N/A — prod-only | operator-supplied, set once | DevOps | DevOps Lead | N/A | — | 2026-08-21 | OK |
| `SNAPSHOT_GIT_APP_INSTALLATION_ID` | Provision-time | provision-env — auto-resolved by `Provision-Snapshot-Prod.ps1` if omitted | Dynamic | Optional (auto-resolved) | *(resolved via `GET /repos/{repo}/installation`)* | N/A — prod-only | N/A — prod-only | auto-resolved | DevOps | DevOps Lead | N/A | — | 2026-08-21 | OK |
| `SNAPSHOT_GIT_APP_PRIVATE_KEY` | Provision-time | provision-env — **empty preserves existing KV value on re-provisions** | Secret | Required on first provision | `''` | N/A — prod-only | N/A — prod-only | operator-supplied from the downloaded `.pem` | Security Lead | Security Admin | 180 days | TBD | 2026-08-21 | OK |
| `SNAPSHOT_IMAGE_TAG` | Provision-time | provision-env | Hardcoded | Optional | `placeholder` (dormant image until `build-snapshot-image.yml` has pushed a real one) | N/A — prod-only | N/A — prod-only | real image tag once built | DevOps | DevOps Lead | N/A | — | 2026-08-21 | OK |
| `SNAPSHOT_TEAMS_WEBHOOK_URL` | Provision-time | provision-env — **omitting on a re-provision un-wires notifications until passed again** (no "preserves existing" behavior, unlike the private key) | Secret | Optional | `''` | N/A — prod-only | N/A — prod-only | operator-supplied Teams Workflow URL | DevOps | DevOps Lead | 180 days | TBD | 2026-08-21 | OK |
| `SNAPSHOT_TEAMS_MENTION` | Provision-time | provision-env | Dynamic | Optional | `''` | N/A — prod-only | N/A — prod-only | operator-supplied UPN | DevOps | DevOps Lead | N/A | — | 2026-08-21 | OK |

> Full setup walkthrough (creating the GitHub App with the right permissions, generating the private key, wiring up Teams) lives in `docs/SNAPSHOT-PROD-SETUP.md`; architecture and day-to-day operation in `docs/WEEKLY-SNAPSHOT.md`. This job was added in PR #508 and hardened (naming convention, managed-identity token endpoint, OOM/sizing, per-record file scope, branch+PR+merge landing, Teams notifications, daily cadence) in PR #567 — see those PRs' descriptions for the incident-by-incident history if a similar bug resurfaces.

### Observability — `infra/modules/containerApp-backend.bicep`

| Variable Name | Stage | Injection Method | Type | Req/Opt | Default | Dev Value/Query | QA Value/Query | Prod Value/Query | Uploads (Dev/QA) | Updates Prod | Rotation Policy | Next Rotation Due | Last Verified | Drift Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | Runtime | container-env (literal, resolved from existing shared `appi-all1-rwai` resource, `containerApp-backend.bicep:233`) | Secret | Optional | *None* | resolved value | resolved value | resolved value | DevOps | DevOps Lead | N/A (rotate-on-compromise only) | — | 2026-07-30 | OK |
| `NODE_OPTIONS` | Runtime | container-env (literal, `--max-old-space-size=${nodeMaxOldSpaceMB}`, `containerApp-backend.bicep:230`) | Dynamic | N/A (infra-computed, not user-facing) | *None* | `--max-old-space-size=2816` | `--max-old-space-size=2816` | `--max-old-space-size=3328` | DevOps | DevOps Lead | N/A | — | 2026-07-30 | OK |
| `NOTIFICATION_DUE_REMINDER_DAYS` | Runtime | *(none provisioned)* | Hardcoded | Optional | see code (`class-simulation.service.ts:81`) | unset | unset | unset | Backend Dev | Release Manager | N/A | — | 2026-07-30 | Unverified — orphaned, see Cleanup Backlog |

### Bootstrap Key Vault vars — declared and provisioned, but **not consumed by any application code**

| Variable Name | Stage | Injection Method | Type | Req/Opt | Default | Dev Value/Query | QA Value/Query | Prod Value/Query | Uploads (Dev/QA) | Updates Prod | Rotation Policy | Next Rotation Due | Last Verified | Drift Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `AZURE_KEY_VAULT_URL` | Runtime | container-env (literal, `containerApp-backend.bicep:221`) | Dynamic | N/A — unread | *None* | `https://akvdev1rwai.vault.azure.net/` | `https://akvqa1rwai.vault.azure.net/` | `https://akvprod1rwai.vault.azure.net/` | DevOps | DevOps Lead | N/A | — | 2026-07-30 | **Drift — see below** |
| `AZURE_KEY_VAULT_SECRET_PREFIX` | Runtime | container-env (literal `'edu-'`, `containerApp-backend.bicep:222`) | Hardcoded | N/A — unread | *None* | `edu-` | `edu-` | `edu-` | DevOps | DevOps Lead | N/A | — | 2026-07-30 | Same as above |
| `AZURE_SHARED_KEY_VAULT_URL` | Runtime | container-env (literal, `containerApp-backend.bicep:223`) | Dynamic | N/A — unread | *None* | `https://akvdev1rwai.vault.azure.net/` | `https://akvqa1rwai.vault.azure.net/` | `https://akvprod1rwai.vault.azure.net/` | DevOps | DevOps Lead | N/A | — | 2026-07-30 | Same as above |

> **`AZURE_KEY_VAULT_URL`, `AZURE_KEY_VAULT_SECRET_PREFIX`, `AZURE_SHARED_KEY_VAULT_URL` are declared in `.env.example`, provisioned as plain Container App env vars, and described in both `containerApp-backend.bicep:6-10` ("Bootstrap env vars for the Azure KV client itself") and `docs/KEY-VAULT-VARS.md:65-74` ("A handful of values must exist as plain env vars ... so it can locate the vault ... before the SDK reads any secret") — but there is no Key Vault SDK usage anywhere in `src`** (confirmed: zero matches for `@azure/keyvault-*`, `SecretClient`, or `process.env.AZURE_KEY_VAULT_*` / `configService.get('AZURE_KEY_VAULT...')` in the codebase). The app's actual secret delivery is 100% via Container App `secretRef:` resolved by the platform — Azure resolves KV values into plain env vars before the container starts, so the NestJS process never needs to talk to Key Vault itself. These three vars appear to be leftover from an earlier design (or a copy from a sibling app that does call the KV SDK directly) that was superseded by the `secretRef:` pattern without removing the now-dead bootstrap plumbing. Not a security issue (values are non-sensitive vault URLs/prefix), but dead config that should either be removed or the comments corrected.

### Frontend-only var wired all the way through this backend's infra — dead plumbing

| Variable Name | Stage | Injection Method | Type | Req/Opt | Default | Dev Value/Query | QA Value/Query | Prod Value/Query | Uploads (Dev/QA) | Updates Prod | Rotation Policy | Next Rotation Due | Last Verified | Drift Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `VITE_API_URL` | Runtime | kv-ref (`edu-vite-api-url`) | Dynamic | N/A — unread | *None* | `''` (`dev.bicepparam:26`, empty) | `https://qa.educatorbe.realityworksai.com/api` | `https://educatorbe.realityworksai.com/api` | DevOps | DevOps Lead | N/A | — | 2026-07-30 | **Drift — see below** |

> **`VITE_API_URL` is a Vite frontend build-time variable name, but it is wired end-to-end through this *backend's* infrastructure** — `keyVaultSecrets.bicep:56,158-162` writes it to KV, `containerApp-backend.bicep:175,260` reads it back via `secretRef:` into the running Container App, `docs/KEY-VAULT-VARS.md:57` documents it as "Used by FE build (mirrors backend)", and every `.bicepparam` sets a per-env value — yet grepping `src/**/*.ts` for `VITE_API_URL` returns **zero matches**. Nothing in this NestJS app ever reads it. This is very likely leftover plumbing from when the frontend and backend Bicep/KV setup were built together (mirroring the sibling `Educator-App-Realityworks` frontend repo's own `VITE_API_URL`, which is a genuinely-used build-time var *there*) and never pruned from the backend side. **Action**: confirm nothing depends on `edu-vite-api-url` existing in this app's vault namespace, then remove the KV write, the Container App secretRef, and the `.bicepparam`/doc references from this repo.

### Pipeline / CI-CD only — `.github/workflows/deploy-backend.yml`, `preview-deploy.yml`, `rollback.yml`, `sast.yml`

| Variable Name | Stage | Injection Method | Type | Req/Opt | Default | Dev Value/Query | QA Value/Query | Prod Value/Query | Uploads (Dev/QA) | Updates Prod | Rotation Policy | Next Rotation Due | Last Verified | Drift Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `AZURE_CLIENT_ID` | Pipeline/CI-CD | ci-env (`secrets.*`, OIDC) | Secret | Required | *None* | GH repo secret (OIDC) | GH repo secret (OIDC) | GH repo secret (OIDC) | DevOps | DevOps Lead | N/A (OIDC, no static credential) | — | 2026-07-30 | OK |
| `AZURE_TENANT_ID` | Pipeline/CI-CD | ci-env (`secrets.*`, OIDC) | Secret | Required | *None* | GH repo secret (OIDC) | GH repo secret (OIDC) | GH repo secret (OIDC) | DevOps | DevOps Lead | N/A | — | 2026-07-30 | OK |
| `AZURE_SUBSCRIPTION_ID` | Pipeline/CI-CD | ci-env — documented in `docs/KEY-VAULT-VARS.md:13` as a repo secret | Secret | Required | *None* | GH repo secret | GH repo secret | GH repo secret | DevOps | DevOps Lead | N/A | — | 2026-07-30 | Unverified — see note below |
| `SUBSCRIPTION_ID` | Pipeline/CI-CD | **ci-env (hardcoded literal in `deploy-backend.yml:52`)** | Hardcoded | Required | *None* | `215408ae-455d-4213-bcc4-3b4a56228db6` | same (single subscription) | same | DevOps | DevOps Lead | N/A | — | 2026-07-30 | Unverified — see note below |
| `AZ_PREFIX` / `APP` / `AZ_VER` / `IMAGE_NAME` / `ACR_NAME` / `ACR_RG` | Pipeline/CI-CD | ci-env (hardcoded literals, `deploy-backend.yml:46-51`) | Hardcoded | Required | *None* | `rwai` / `edu` / `1` / `educator-backend` / `acrall1rwai` / `ARG-all1-rwai` | same | same | DevOps | DevOps Lead | N/A | — | 2026-07-30 | OK — naming-convention constants, not sensitive |
| `STRICT_TEST_GATING` | Pipeline/CI-CD | ci-env (`vars.*`, `deploy-backend.yml:517`) | Hardcoded | Optional | `false` | GH Actions variable | GH Actions variable | GH Actions variable | DevOps | DevOps Lead | N/A | — | 2026-07-30 | OK |
| `STRICT_SMOKE_GATING` | Pipeline/CI-CD | ci-env (`vars.*`, `deploy-backend.yml:799`) | Hardcoded | Optional | *None* | GH Actions variable | GH Actions variable | GH Actions variable | DevOps | DevOps Lead | N/A | — | 2026-07-30 | OK |
| `LINT_NOTIFICATIONS_ENABLED` | Pipeline/CI-CD | ci-env (`vars.*`, `deploy-backend.yml:169`) | Hardcoded | Optional | *None* | GH Actions variable | GH Actions variable | GH Actions variable | DevOps | DevOps Lead | N/A | — | 2026-07-30 | OK |
| `TEAMS_NOTIFICATIONS_ENABLED` | Pipeline/CI-CD | ci-env (`vars.*`) | Hardcoded | Optional | *None* | GH Actions variable | GH Actions variable | GH Actions variable | DevOps | DevOps Lead | N/A | — | 2026-07-30 | OK |
| `TEAMS_PREVIEW_NOTIFICATIONS_ENABLED` | Pipeline/CI-CD | ci-env (`vars.*`, `preview-deploy.yml:244`) | Hardcoded | Optional | *None* | GH Actions variable | N/A | N/A | DevOps | DevOps Lead | N/A | — | 2026-07-30 | OK |
| `TEAMS_WEBHOOK_URL` | Pipeline/CI-CD | ci-env (`secrets.*`) | Secret | Optional | *None* | GH env secret | GH env secret | GH env secret | DevOps | DevOps Lead | 180 days | TBD | 2026-07-30 | OK |
| `TEAMS_WEBHOOK_LINT_URL` | Pipeline/CI-CD | ci-env (`secrets.*`, `deploy-backend.yml:207`) | Secret | Optional | *None* | GH env secret | GH env secret | GH env secret | DevOps | DevOps Lead | 180 days | TBD | 2026-07-30 | OK |
| `TEAMS_PREVIEW_WEBHOOK_URL` | Pipeline/CI-CD | ci-env (`secrets.*`) | Secret | Optional | *None* | GH env secret | N/A | N/A | DevOps | DevOps Lead | 180 days | TBD | 2026-07-30 | OK |
| `TEAMS_SAST_WEBHOOK_URL` | Pipeline/CI-CD | ci-env (`secrets.*`, `sast.yml:430`) | Secret | Optional | *None* | GH env secret | GH env secret | GH env secret | DevOps | DevOps Lead | 180 days | TBD | 2026-07-30 | OK |
| `GITHUB_TOKEN` | Pipeline/CI-CD | ci-env (auto-provisioned, `sast.yml:358`) | Secret | Required | *None* | `github.token` (built-in) | same | same | DevOps | DevOps Lead | N/A | — | 2026-07-30 | OK |

> **`SUBSCRIPTION_ID` is a literal Azure subscription GUID checked into `deploy-backend.yml:52`, while `docs/KEY-VAULT-VARS.md:13` separately claims the *only* 3 GitHub repository secrets for this repo are `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and `AZURE_SUBSCRIPTION_ID` — implying subscription ID should be a secret, not a hardcoded workflow literal.** Either the doc is describing an intended/older setup that doesn't match what `deploy-backend.yml` actually does today, or `AZURE_SUBSCRIPTION_ID` (the secret) and `SUBSCRIPTION_ID` (the hardcoded env) are two different things that happen to serve the same purpose. Subscription IDs aren't credentials by themselves (they can't authenticate without the paired OIDC trust), so this isn't a leaked secret — but it's a real inconsistency between code and docs that should be reconciled: either move `SUBSCRIPTION_ID` to `vars.SUBSCRIPTION_ID`/consume the existing `AZURE_SUBSCRIPTION_ID` secret, or correct the doc.

---

## Declared but Unused / Orphaned — Cleanup Backlog

Variables that exist in `.env.example`, are read in code with `configService.get(...)`/`process.env.*`, or are provisioned somewhere in infra — but have **no matching counterpart on the other side** (declared-but-never-read, or read-but-never-provisioned). Each needs a decision: wire it up properly, or delete the dead half.

| Variable(s) / Item | Found In | Status |
| :--- | :--- | :--- |
| `AZURE_KEY_VAULT_URL`, `AZURE_KEY_VAULT_SECRET_PREFIX`, `AZURE_SHARED_KEY_VAULT_URL` | `.env.example`, `containerApp-backend.bicep:221-223`, `docs/KEY-VAULT-VARS.md` | Provisioned everywhere, read nowhere in `src` — see Bootstrap Key Vault section above. |
| `VITE_API_URL` | `keyVaultSecrets.bicep`, `containerApp-backend.bicep`, all three `.bicepparam`, `docs/KEY-VAULT-VARS.md` | Provisioned end-to-end, read nowhere in `src` — see dedicated section above. |
| `STUDENT_FRONTEND_URL`, `API_BASE_URL` | `containerApp-backend.bicep` `secretRef:` | Read via `secretRef:` pointing at KV secrets that `keyVaultSecrets.bicep` never writes and `docs/KEY-VAULT-VARS.md` never documents — broken provisioning path, not just doc drift. |
| `LTI_STUDENT_CODE_SECRET` | `src/lti/lti.controller.ts:182`, `src/students/students.controller.ts:54` | Read in code, never provisioned anywhere (falls back to `JWT_SECRET`, which happens to work but means there's no independently-rotatable secret for LTI student codes). |
| `EMAIL_LOGO_URL` | `educators.service.ts`, `invites.service.ts`, `schools.service.ts` | Read in 3 services, never provisioned anywhere — emails always render without a logo in every environment. |
| `AZURE_BLOB_DATA_CONTAINER_NAME` | `tutor-patient.service.ts:53-54` | Read, never provisioned — always falls back to `AZURE_BLOB_CONTAINER_NAME`, so the "separate data container" code path has never actually been exercised. |
| `BLOB_DOWNLOAD_TIMEOUT_MS` | `tutor-patient.service.ts:908` | Read via raw `process.env` (not even `ConfigService`), never provisioned. |
| `AZURE_STORAGE_CONTAINER_NAME`, `edu_azure_storage_connection_string`, `edu_azure_blob_container_name` | `health.service.ts:113`, `tutor-patient.service.ts:48,51` | Dead fallback branches — see note in Azure Blob Storage section above. |
| `REDIS_TLS`, `REDIS_BLOB_KEY_PREFIX`, `REDIS_CACHE_TTL_SECONDS` | `redis.module.ts:24`, `tutor-patient.service.ts:62,64`, `redis.service.ts:80` | Read, never provisioned — all three silently run on code defaults in every environment. |
| `NOTIFICATION_DUE_REMINDER_DAYS` | `class-simulation.service.ts:81` | Read, never provisioned. |
| `MOODLE_URL`, `MOODLE_WS_TOKEN` | `lms-provision.service.ts:315,321`, `lms-roster.service.ts:30,34` | Read, never provisioned in any environment — Moodle LMS integration has no live host/token wired up. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM` | `.deployment/container-spec.json` (dev `env-vars`) | Provisioned for dev only, **never read anywhere in `src`** — mail delivery is 100% Microsoft Graph (`GRAPH_*` + `MAIL_FROM`). Leftover from a pre-Graph SMTP transport, same pattern flagged in the `Crexo-Educator-Backend` audit. |
| `LMS_ENABLE_LTI_AUTO_PROVISION` | `.env.example:30` vs `.deployment/container-spec.json` / `.bicepparam` | Declared with `true` as the local-dev value; never provisioned in any deployed environment, so it always runs on the code default (`false`) in dev/qa/prod — see note in LTI/LMS section above. |

---

## Hardcoded Value Findings (This Audit — 2026-07-30)

| # | Location | Finding | Severity | Recommended Action |
| :--- | :--- | :--- | :--- | :--- |
| 1 | `infra/modules/containerApp-backend.bicep:261-262` (`secretRef: 'edu-api-base-url'`, `secretRef: 'edu-student-frontend-url'`) | `API_BASE_URL` and `STUDENT_FRONTEND_URL` reference KV secrets that `infra/modules/keyVaultSecrets.bicep` never writes and `docs/KEY-VAULT-VARS.md` never documents | **High — `API_BASE_URL` is explicitly required for LTI launch/callback URL construction (`lti-key.service.ts:99`)**; a from-scratch vault stand-up would leave both env vars resolving to nothing | Add both to `keyVaultSecrets.bicep`'s empty-allowed tier (mirroring `frontendUrl`/`viteApiUrl`), confirm the values currently live in each vault were set correctly out-of-band, and update `docs/KEY-VAULT-VARS.md` |
| 2 | `src/main.ts:56-57` | Startup log reads `process.env.PORT` instead of `APP_PORT` — log always shows the fallback `3000` regardless of the real configured port | Low — cosmetic, misleads on-call only if `APP_PORT` is ever changed from `3000` | Change both lines to read `process.env.APP_PORT` |
| 3 | `infra/modules/containerApp-backend.bicep:221-223`, `docs/KEY-VAULT-VARS.md:65-74` | `AZURE_KEY_VAULT_URL`/`_SECRET_PREFIX`/`AZURE_SHARED_KEY_VAULT_URL` provisioned and documented as being for an in-app Key Vault SDK client that doesn't exist in `src` | Low — dead config, not a security issue (non-sensitive values) | Remove the unused env vars and correct the bicep/doc comments, or confirm a future direct-KV-SDK use case and keep them intentionally |
| 4 | `infra/modules/keyVaultSecrets.bicep:56,158-162`, all three `.bicepparam`, `docs/KEY-VAULT-VARS.md:57` | `VITE_API_URL` (a frontend build-time var name) fully wired through this backend's KV + Bicep + Container App, never read by any backend code | Low — dead plumbing, not a leak (values are non-sensitive public URLs) | Remove `edu-vite-api-url` write, the Container App `secretRef:`, and the `.bicepparam`/doc references from this repo |
| 5 | `src/redis/redis.module.ts:23`, sidecar `args:` at `containerApp-backend.bicep:303-307` | No `REDIS_PASSWORD`/`--requirepass` configured anywhere for the Redis sidecar | Medium — missing control, not a leak (loopback-only sidecar) | Add a KV-backed `REDIS_PASSWORD` + `--requirepass` sidecar arg as defense-in-depth |
| 6 | `.github/workflows/deploy-backend.yml:52` vs `docs/KEY-VAULT-VARS.md:13` | `SUBSCRIPTION_ID` hardcoded literal GUID in the workflow `env:` block, while docs describe an `AZURE_SUBSCRIPTION_ID` GitHub secret as the source of truth | Low — not a credential, but a code/doc inconsistency | Reconcile: either consume the existing `AZURE_SUBSCRIPTION_ID` secret or correct the doc to describe the literal |
| 7 | `.env.example:30` vs every deployed environment | `LMS_ENABLE_LTI_AUTO_PROVISION` documented as `true` for local dev; silently resolves to the code default `false` in dev/qa/prod because it's never provisioned there | Medium — real behavioral drift between local dev and every deployed environment for a feature flag | Confirm intended behavior per environment; wire through Key Vault/Bicep if auto-provisioning should be live anywhere, or correct `.env.example` |
| 8 | `src/common/utils/tutor-patient.service.ts:48,51`, `src/health/health.service.ts:113` | Dead fallback env-var names (`edu_azure_storage_connection_string`, `edu_azure_blob_container_name`, `AZURE_STORAGE_CONTAINER_NAME`) that can never resolve | Low — unreachable dead code, not a functional bug (primary lookups already succeed) | Remove the dead fallback branches |

**No live, currently-valid secrets (API keys, connection strings, passwords) were found checked into the working tree.** `.env.example` values are all empty or clearly-labeled placeholders. `.env.local` contains a locally-generated JWT signing secret and the well-known Azurite emulator connection string (`UseDevelopmentStorage`-equivalent `devstoreaccount1` key) — both are dev-only, `.env.local` is `.gitignore`d, and neither is a live credential for any deployed environment.

---

## Change / Audit Log

| Date | Variable | Environment | Old Value/Query | New Value/Query | Changed By | Reason / Ticket |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 2026-07-30 | *(document created)* | All | *(no prior VARIABLES.md existed)* | Full matrix populated from `src`/`infra`/`.github`/`docs` audit | DevOps | Establish variable tracking for this repo per the org-wide Environment Variable Management Standard |
| 2026-08-19 | `API_TIMEOUT_MS`, `SERVER_KEEP_ALIVE_TIMEOUT_MS`, `SERVER_HEADERS_TIMEOUT_MS`, `DB_POOL_MAX`, `DB_POOL_IDLE_TIMEOUT_MS`, `DB_POOL_ACQUIRE_TIMEOUT_MS`, `HEAP_LOG_INTERVAL_MS` | All (Dev/QA/Prod) | *(not provisioned — code defaults only)* | Added as `edu-*` Key Vault secrets, wired via `secretRef:` in `containerApp-backend.bicep`, provisioned with default values in all three vaults | Kavyesh Shah | PR #564 — API timeout / connection-pool / memory-leak hardening |
| 2026-08-21 | `SOURCE_STORAGE_ACCOUNT`, `SOURCE_CONTAINER`, `GIT_APP_ID`, `GIT_APP_INSTALLATION_ID`, `SNAPSHOT_REPO`, `GIT_APP_PRIVATE_KEY`, `SNAPSHOT_UAI_CLIENT_ID`, `TEAMS_WEBHOOK_URL`, `SNAPSHOT_TEAMS_MENTION`, `SNAPSHOT_HYDRATION_CONCURRENCY`, `IDENTITY_ENDPOINT`, `IDENTITY_HEADER` (Runtime) + `SNAPSHOT_REPO`, `SNAPSHOT_GIT_APP_ID`, `SNAPSHOT_GIT_APP_INSTALLATION_ID`, `SNAPSHOT_GIT_APP_PRIVATE_KEY`, `SNAPSHOT_IMAGE_TAG`, `SNAPSHOT_TEAMS_WEBHOOK_URL`, `SNAPSHOT_TEAMS_MENTION` (Provision-time) | Prod only (job is gated off in Dev/QA by design) | *(this repo had no VARIABLES.md coverage of the snapshot Job at all — it's a separate compute resource from the main Container App)* | Full Snapshot Job section added, documenting the Job's own env vars plus the `Provision-Snapshot-Prod.ps1` shell inputs that feed them; added `job-secret-ref`/`job-env`/`platform-injected` to the Injection Methods table | Kavyesh Shah | PR #508 (job added) + PR #567 (naming/MSI/OOM/PR-landing/notifications/cadence hardening) — documentation catch-up |
| … | … | … | … | … | … | … |

*Add a new row for every change instead of overwriting. This table is the actual audit trail an SOC 2 / ISO 27001 review would ask for.*

---

## Environment Promotion Checklist

Before a new or changed variable moves **Dev -> QA -> Prod**, it must pass:

1. [ ] Row exists in the Master Matrix with all columns filled (no `TBD`).
2. [ ] `.env.example` updated with a placeholder (not the real value), and a one-line note if the deployed default differs from the local one (see the `JWT_EXPIRES_IN` finding for why this matters).
3. [ ] If **Secret**: added as a param + child resource in `infra/modules/keyVaultSecrets.bicep`, wired through `infra/resources.bicep` and `infra/main.bicep`, added to `kvSecretNames` + the `env:` block in `infra/modules/containerApp-backend.bicep`, and the KV write actually verified — do not assume a `secretRef:` in the Container App means the secret exists (see findings #1 above).
4. [ ] Rotation Policy assigned (or explicitly `N/A`).
5. [ ] Owner for **Who Updates Prod** has confirmed access/approval.
6. [ ] Tested in QA for at least one full deploy cycle (a Container App revision restart is enough for KV-backed vars; no rebuild needed).
7. [ ] Change Log row added on the day it goes live in Prod.
8. [ ] `docs/KEY-VAULT-VARS.md`'s variable catalog updated to match — confirm it isn't missing the new secret the way it currently misses `LTI_FALLBACK_KEY_ID`/`LTI_FALLBACK_PRIVATE_KEY_PEM`, `edu-api-base-url`, and `edu-student-frontend-url`.

---

## Drift Tracking

"Drift" = the value recorded here no longer matches what's actually running in an environment, or the variable's wiring is broken end-to-end (declared, read in code, but never actually delivered by the pipeline).

**How to check:** on a regular cadence (recommend weekly for Prod, monthly for Dev/QA), someone with access diffs the live Container App / Key Vault value against this document and updates `Last Verified` + `Drift Status`.

| Status | Meaning | Action |
| :--- | :--- | :--- |
| OK | Verified match within last 30 days | None |
| Unverified | Not verified in 30+ days, or wiring needs confirmation | Schedule a check this sprint |
| Drift | Confirmed mismatch, broken wiring, or config bug | Fix immediately, log in Change Log |

**Flagged this cycle:**
- `STUDENT_FRONTEND_URL` / `API_BASE_URL` — Drift, `secretRef:` points at KV secrets that IaC never provisions.
- `PORT` — Drift (cosmetic), startup log reads the wrong env var name.
- `AZURE_STORAGE_CONTAINER_NAME` (and the underscored `edu_*` fallbacks in `tutor-patient.service.ts`) — Drift, dead fallback keys that can never resolve.
- `AZURE_KEY_VAULT_URL` / `_SECRET_PREFIX` / `AZURE_SHARED_KEY_VAULT_URL` — Drift, provisioned but never consumed by any code path.
- `VITE_API_URL` — Drift, fully wired through this backend's infra but never read by the backend.
- `LMS_ENABLE_LTI_AUTO_PROVISION` — Drift, local-dev doc value contradicts what every deployed environment actually runs.
- `REDIS_PASSWORD` — missing control, no authentication on the Redis sidecar.
- `LTI_FALLBACK_KEY_ID` / `LTI_FALLBACK_PRIVATE_KEY_PEM` — Unverified, provisioned correctly in Bicep but missing from `docs/KEY-VAULT-VARS.md`.
- `SUBSCRIPTION_ID` / `AZURE_SUBSCRIPTION_ID` — Unverified, hardcoded workflow literal vs. documented GitHub secret don't obviously line up.

---

## Instructions for Engineering Teams

### 1. Workflow for Adding New Variables
1. Update `.env.example` with a placeholder/default, and note if the deployed default will differ from the local one.
2. If it's a Secret or per-env dynamic value, add it end-to-end in one PR: `infra/modules/keyVaultSecrets.bicep` (param + child resource) → `infra/resources.bicep` → `infra/main.bicep`/`app-deploy.bicep` → `kvSecretNames` + `env:` block in `infra/modules/containerApp-backend.bicep` → `infra/env/{env}.bicepparam` for each environment. Skipping any link in this chain is exactly how `STUDENT_FRONTEND_URL`/`API_BASE_URL` ended up broken (see findings above) — don't add the `secretRef:` before the thing it references actually exists.
3. Add a full row to the Master Matrix (all columns, including Injection Method and Rotation Policy).
4. Update `docs/KEY-VAULT-VARS.md`'s variable catalog to match — it should never fall behind what's actually in `keyVaultSecrets.bicep`.
5. If it's a Secret, create the Key Vault entry first (via `provision`) — the PR should only ever contain the *reference*, never the value.
6. Run through the Promotion Checklist before merging to `main`/deploying to Prod.
7. Submit PR for review.

### 2. Secret Management Guidelines
- **Never commit secret values to git or markdown** — only the lookup query/reference.
- Every Secret row must have a non-`N/A` Rotation Policy and a `Next Rotation Due` date.
- On rotation: update Key Vault -> bump Change Log -> update `Last Verified`.
- Sensitive values passed to `Provision-Bicep.ps1`/`Deploy-Backend.ps1 -Action provision` go through a shell env var on the operator's machine or CI runner, never a checked-in `.bicepparam` literal — the empty-string default on every sensitive param exists specifically so re-provisioning without setting the env var preserves the existing KV value instead of blanking it out.

### 3. Role & Ownership Responsibilities

| Role | Responsibilities |
| :--- | :--- |
| **DevOps / Infra Lead** | Provisions Key Vault entries, DB connection info, storage accounts, CI/CD secrets; owns Prod infra vars; runs drift checks. |
| **Backend Lead** | Feature flags, logging levels, timeouts, defaults, LTI/LMS integration config. |
| **Security Admin** | Rotates/updates Prod JWT secrets, Graph client secret, LTI fallback keys; owns rotation cadence. |
| **Release Manager / Product** | Approves feature toggles and deployment parameters in Prod releases; signs off on Promotion Checklist. |

### 4. Suggested Cadence

| Task | Frequency | Owner |
| :--- | :--- | :--- |
| Drift check — Prod | Weekly | DevOps Lead |
| Drift check — Dev/QA | Monthly | Backend Lead |
| Secret rotation review (flag anything within 14 days of due) | Weekly | Security Admin |
| Full matrix audit (every row, every column) | Quarterly | DevOps + Security Admin jointly |
| Cleanup backlog review (§ Declared but Unused / Orphaned) | Next sprint | Backend Lead |
