# Environment Variable Tracking System — `Educator-App-Realityworks`

This document is the single source of truth for every configuration variable used by this app — what it is, where it comes from, when in the pipeline it gets resolved, who owns it, and whether the live value has drifted from what's recorded here.

Stack: **Vite 7.2.4 / React 19.2.4 / TypeScript**, package name `reality-works-frontend`. Deployed as an **Azure Static Web App (SWA)** — not Container Apps/Bicep like the Crexo sibling repos — via `.github/workflows/deploy-frontend.yml`, provisioned imperatively by `scripts/Deploy-EducatorApp.ps1` (no `infra/` Bicep directory in this repo). Shared Key Vault: `akv<env>1rwai` (shared with `Educator-App-Backend`, **no `crx` suffix** — this is a distinct naming scheme from the Crexo product line under the same `rwai` prefix, do not confuse the two).

It has two jobs:

1. Reference — define every variable actually used in this codebase.
2. Tracking — record how and when each variable is injected, verify it against reality, log every change, and flag rotation/drift issues.

---

## Legend & Field Definitions

| Field Column                       | Description & Allowed Values                                                                                                                                                                         |
| :--------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Variable Name**                  | Exact key, `UPPER_SNAKE_CASE`.                                                                                                                                                                       |
| **Stage**                          | **Build-Time** (`VITE_*`, baked into the JS bundle at `vite build`, browser-visible) • **Runtime** (n/a for this repo — see note) • **Pipeline/CI-CD** (GitHub Actions only, never reaches the app). |
| **Injection Method**               | How the value physically gets into the process. See Injection Methods below.                                                                                                                         |
| **Type**                           | **Secret** (Key Vault or GH secret–backed) • **Hardcoded** (static constant) • **Dynamic** (computed/derived per environment).                                                                       |
| **Req / Opt**                      | **Required**: build fails or app misbehaves without it. **Optional**: falls back to a code default.                                                                                                  |
| **Default Value**                  | Fallback baked in if unset (code default, since there is no `.env.example` in this repo — see finding below).                                                                                        |
| **Dev / QA / Prod Value or Query** | Literal value or secret-lookup path per environment.                                                                                                                                                 |
| **Who Uploads (Dev/QA)**           | Role that configures lower environments.                                                                                                                                                             |
| **Who Updates Prod**               | Role authorized to change the Prod value.                                                                                                                                                            |
| **Rotation Policy**                | How often a Secret must be rotated (`N/A` for non-secrets).                                                                                                                                          |
| **Next Rotation Due**              | Calculated date; flagged if overdue.                                                                                                                                                                 |
| **Last Verified**                  | Date someone last confirmed the recorded value matches what's actually deployed.                                                                                                                     |
| **Drift Status**                   | `OK` in sync • `Unverified` not checked in 30+ days or wiring unconfirmed • `Drift` confirmed mismatch, bug, or broken wiring (see Drift Tracking).                                                  |
| **Description & Usage**            | What it controls and exact `file:line` it's read at.                                                                                                                                                 |

> **Note on "Runtime" stage**: this repo ships a `Dockerfile` and `docker-entrypoint.sh` implementing a runtime placeholder-substitution pattern (`sed`-replacing `__VITE_API_URL_PLACEHOLDER__` in built JS at container start), but **no CI workflow ever builds or deploys that Dockerfile** — the actual, live deploy path is a static Vite build baked at CI build-time and pushed to Azure Static Web Apps. Treat the Dockerfile/entrypoint as dead/unused infrastructure until confirmed otherwise (see Cleanup Backlog).

### Injection Methods

| Method                                                                             | Used For in This Repo                                                                                                                                                          | Rebuild Required to Change?                                                                                                         |
| :--------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------- |
| `build-arg` (set as a GitHub Actions `env:` before `vite build`, not a Docker ARG) | `VITE_API_URL`                                                                                                                                                                 | Yes — image/bundle rebuild required, restart alone does nothing (there is no running container to restart; SWA serves static files) |
| `ci-env` (GitHub Actions `secrets.*` / `vars.*`, pipeline-scoped only)             | `AZURE_STATIC_WEB_APPS_API_TOKEN*`, `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `TEAMS_*_WEBHOOK_URL`, `vars.API_URL`, `vars.SWA_NAME`, `vars.FRONTEND_URL` | N/A (never in app)                                                                                                                  |
| `dynamic-resolved` (derived from the deploy job's environment binding)             | Per-environment `VITE_API_URL` value resolved from the GitHub Environment (`dev`/`qa`/`main`) the workflow run is bound to                                                     | Yes (rebuild)                                                                                                                       |

**Precedence when the same var is defined in multiple places:** GitHub Actions `env:`/`vars.*` set immediately before `vite build` → code-level fallback default (e.g. `?? 'http://localhost:3000'`) → nothing else, since there is no `.env` file checked in and no runtime container to override at deploy time.

---

## Environment Variables Master Matrix

### Build-Time — `VITE_*` (baked into the JS bundle by CI, requires rebuild to change)

| Variable Name | Stage | Injection Method | Type | Req/Opt | Default | Dev Value/Query | QA Value/Query | Prod Value/Query | Uploads (Dev/QA) | Updates Prod | Rotation Policy | Next Rotation Due | Last Verified | Drift Status |
| `VITE_API_URL` | Build-Time | build-arg (`ci-env` -> `vars.API_URL` -> `vite build` env) | Dynamic | Required | `http://localhost:3000` (code fallback in `axiosInstance.ts`/`api.tsx`) | `https://dev.educatorbe.realityworksai.com` | `https://qa.educatorbe.realityworksai.com` | `https://educatorbe.realityworksai.com` | Frontend Lead | Release Manager | N/A | — | 2026-07-29 | OK |
| `VITE_SOCKET_URL` | Build-Time | _(none — never provisioned anywhere)_ | Dynamic | Optional | falls through to `VITE_API_URL` | unset | unset | unset | Frontend Lead | Release Manager | N/A | — | 2026-07-29 | Drift — orphaned, read in code but never set in any workflow/docs, see note below |

> **`VITE_SOCKET_URL` is read in code (`src/hooks/useAccountStatus.ts:6`) but never set anywhere** — no `.env.example` (none exists in this repo), no CI workflow, no docs mention it. It always falls back to `VITE_API_URL`, which happens to work today since the socket and API share an origin, but it's dead/unconfigured plumbing that should either be removed from the code or actually wired up if a distinct socket host is ever needed.
>
> **No `.env`/`.env.example` file exists anywhere in this repo**, despite `.gitignore:81-83` anticipating one and `README.md:12` telling developers to override `VITE_API_URL` "in `.env`". New developers have nothing to copy for local setup. **Action**: add a `.env.example` with `VITE_API_URL=http://localhost:3000` (and `VITE_SOCKET_URL=` if it's kept) so the README instruction is actually followable.

### Pipeline / CI-CD only — `.github/workflows/*.yml`

| Variable Name | Stage | Injection Method | Type | Req/Opt | Default | Dev Value/Query | QA Value/Query | Prod Value/Query | Uploads (Dev/QA) | Updates Prod | Rotation Policy | Next Rotation Due | Last Verified | Drift Status |
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | Pipeline/CI-CD | ci-env (`secrets.*`, environment-scoped — resolves per dev/qa/main via the job's `environment:` binding) | Secret | Required | _None_ | GH environment secret (dev) | GH environment secret (qa) | GH environment secret (main) | DevOps | DevOps Lead | 180 days | TBD | 2026-07-29 | OK |
| `AZURE_STATIC_WEB_APPS_API_TOKEN_DEV` | Pipeline/CI-CD | ci-env (`secrets.*`) | Secret | Required (previews) | _None_ | GH secret (actively used by `preview-deploy.yml:307,601`) | N/A (previews are dev-slot only) | N/A | DevOps | DevOps Lead | 180 days | TBD | 2026-07-29 | Unverified — see doc-drift note below |
| `AZURE_CLIENT_ID` / `AZURE_TENANT_ID` / `AZURE_SUBSCRIPTION_ID` | Pipeline/CI-CD | ci-env (OIDC, `preview-deploy.yml` only) | Secret | Required (preview eviction) | _None_ | GH env secret (OIDC) | GH env secret (OIDC) | N/A (previews not built off main) | DevOps | DevOps Lead | N/A (OIDC, no static credential) | — | 2026-07-29 | OK |
| `TEAMS_WEBHOOK_URL` | Pipeline/CI-CD | ci-env (`secrets.*`) | Secret | Optional | _None_ | GH env secret | GH env secret | GH env secret | DevOps | DevOps Lead | 180 days | TBD | 2026-07-29 | OK |
| `TEAMS_PREVIEW_WEBHOOK_URL` | Pipeline/CI-CD | ci-env (`secrets.*`) | Secret | Optional | _None_ | GH env secret | N/A | N/A | DevOps | DevOps Lead | 180 days | TBD | 2026-07-29 | OK |
| `TEAMS_SAST_WEBHOOK_URL` | Pipeline/CI-CD | ci-env (`secrets.*`) | Secret | Optional | _None_ | GH env secret | GH env secret | GH env secret | DevOps | DevOps Lead | 180 days | TBD | 2026-07-29 | OK |
| `vars.API_URL` | Pipeline/CI-CD | ci-env (`vars.*`, GitHub Environment variable) | Dynamic | Required | _None_ | see `VITE_API_URL` dev row | see `VITE_API_URL` qa row | see `VITE_API_URL` prod row | Frontend Lead | Release Manager | N/A | — | 2026-07-29 | OK |
| `vars.SWA_NAME` | Pipeline/CI-CD | ci-env (`vars.*`) | Hardcoded | Required | _None_ | `swa-dev1-rwai-edufront` | `swa-qa1-rwai-edufront` | `swa-prod1-rwai-edufront` | DevOps | DevOps Lead | N/A | — | 2026-07-29 | OK |
| `vars.FRONTEND_URL` | Pipeline/CI-CD | ci-env (`vars.*`) | Dynamic | Required | _None_ | dev SWA hostname | qa SWA hostname | prod SWA hostname | DevOps | DevOps Lead | N/A | — | 2026-07-29 | OK |
| `vars.TEAMS_NOTIFICATIONS_ENABLED` / `vars.TEAMS_PREVIEW_NOTIFICATIONS_ENABLED` | Pipeline/CI-CD | ci-env (`vars.*`) | Hardcoded | Optional | _None_ | GH Actions variable | GH Actions variable | GH Actions variable | DevOps | DevOps Lead | N/A | — | 2026-07-29 | OK |
| `vars.PREVIEW_SMOKE_TEST_BLOCKING` / `vars.PREVIEW_SMOKE_TEST_BLOCKING_MAIN` | Pipeline/CI-CD | ci-env (`vars.*`) | Hardcoded | Optional | _None_ | GH Actions variable | GH Actions variable | GH Actions variable | DevOps | DevOps Lead | N/A | — | 2026-07-29 | OK |
| `BACKEND_URL_DEV` / `BACKEND_URL_QA` / `BACKEND_URL_PROD` | Pipeline/CI-CD | ci-env (hardcoded literal in `preview-deploy.yml:127-129` workflow `env:` block) | Hardcoded | Required (PR previews) | _None_ | plain public hostname | plain public hostname | plain public hostname | DevOps | DevOps Lead | N/A | — | 2026-07-29 | Unverified — duplicates `vars.API_URL`, see finding below |
| `GITHUB_TOKEN` | Pipeline/CI-CD | ci-env (auto-provisioned) | Secret | Required | _None_ | `github.token` (built-in) | same | same | DevOps | DevOps Lead | N/A | — | 2026-07-29 | OK |

> **`AZURE_STATIC_WEB_APPS_API_TOKEN_DEV` is the only suffixed-token variant actively wired in any workflow.** `preview-deploy.yml` references it at two places: `deploy-preview` job line 307 (build & deploy) and `close-preview` job line 601 (PR close/eviction). `deploy-frontend.yml:437` uses the single environment-scoped `AZURE_STATIC_WEB_APPS_API_TOKEN` (no suffix) resolved via the job's `environment:` binding. `AZURE_STATIC_WEB_APPS_API_TOKEN_QA` and `AZURE_STATIC_WEB_APPS_API_TOKEN_PROD` are documented in `docs/DEPLOYMENT.md:177-179` but are **referenced in no workflow file anywhere in this repo** — they are orphaned documentation artifacts. **Action**: reconcile — either `preview-deploy.yml` should move to the same single-secret pattern as the main deploy workflow, or the docs must be corrected to note only `_DEV` is still in use and `_QA`/`_PROD` entries are orphaned.
>
> **`BACKEND_URL_DEV/QA/PROD` hardcoded in `preview-deploy.yml:127-129` duplicate the same values already tracked in `vars.API_URL`.** Not a secret (plain public hostnames), but a second hand-maintained copy that can silently drift from the GitHub Environment variable if only one is updated. **Action**: have `preview-deploy.yml` read from the same `vars.API_URL`/environment binding as `deploy-frontend.yml` instead of a separate hardcoded map.

---

## Declared but Unused / Orphaned — Cleanup Backlog

| Variable(s) / Item | Found In | Status  
| `VITE_SOCKET_URL` | `src/hooks/useAccountStatus.ts:6` | Read in code, never provisioned anywhere — see Drift note above.  
| `AZURE_STATIC_WEB_APPS_API_TOKEN_QA` / `AZURE_STATIC_WEB_APPS_API_TOKEN_PROD` | `docs/DEPLOYMENT.md:177-179` | **Documented but never referenced in any workflow file.** `deploy-frontend.yml` uses the single env-scoped `AZURE_STATIC_WEB_APPS_API_TOKEN`; `preview-deploy.yml` uses `_DEV` only (lines 307, 601). These two suffixed variants are orphaned documentation artifacts — remove from docs or confirm they need wiring. |
| `process.env.NEXT_PUBLIC_IMAGE_BASE_URL` | `src/utils/sanitizePdf.ts:151-153` | **Leftover Next.js-style code in a Vite app** — `process.env` is not defined in the browser bundle Vite produces, so this always falls through to the hardcoded `"http://localhost:4000"` default in every environment including production. Needs to become `import.meta.env.VITE_IMAGE_BASE_URL` (new var) or reuse `VITE_API_URL`, whichever is actually correct for PDF image resolution. Flagged as a real functional bug, not just a doc gap — see Hardcoded Value Findings below. |
| `Dockerfile`, `docker-entrypoint.sh` | Repo root | Implement a runtime container placeholder-substitution pattern for `VITE_API_URL` that **no CI workflow ever uses** — the real deploy path is a build-time Vite bake to a static Azure SWA. Confirmed via grep: zero references to `Dockerfile`/`docker build`/`docker-entrypoint.sh` in any `.github/workflows/*.yml`. Either dead code from an abandoned container-hosting path, or aspirational for a future one — resolve with the team and either delete or document its actual purpose. |

---

## Hardcoded Value Findings (This Audit — 2026-07-29)

| # | Location | Finding | Severity | Recommended Action  
| 1 | `src/utils/sanitizePdf.ts:151-153` | `process.env.NEXT_PUBLIC_IMAGE_BASE_URL` used in a Vite app where `process.env` is undefined in the browser bundle — always silently falls back to hardcoded `"http://localhost:4000"` in every deployed environment | Medium — real functional bug affecting PDF image resolution in prod, not just dev | Replace with `import.meta.env.VITE_IMAGE_BASE_URL` (new var, wire through CI like `VITE_API_URL`) or reuse `VITE_API_URL` if the same origin is always correct |
| 2 | `.github/workflows/preview-deploy.yml:127-129` | `BACKEND_URL_DEV/QA/PROD` hardcoded literal hostnames, duplicating `vars.API_URL` | Low — not a secret, but a drift risk (two hand-maintained copies of the same config) | Have preview builds read from the same `vars.API_URL`/environment binding as the main deploy workflow |
| 3 | `docs/DEPLOYMENT.md:177-179` vs `deploy-frontend.yml:437` and `preview-deploy.yml:307,601` | Documented secret-naming scheme lists `_DEV`/`_QA`/`_PROD` suffixed tokens, but only `_DEV` is wired (in `preview-deploy.yml`); `_QA` and `_PROD` variants are referenced in docs but exist in no workflow file. Main workflow uses the single env-scoped `AZURE_STATIC_WEB_APPS_API_TOKEN` | Low — documentation drift, not a live issue, but confusing for on-call/new engineers | Reconcile: remove `_QA`/`_PROD` from docs or wire them; align `preview-deploy.yml` with the single-secret pattern if `_DEV` usage is also to be retired |
| 4 | Repo root `Dockerfile` + `docker-entrypoint.sh` | Implement a runtime env-injection pattern that's entirely unused by any CI workflow | Low — dead code, not a security issue | Delete or explicitly document as reserved/future-use |

**No live, currently-valid secrets (API keys, connection strings, tokens) were found checked into the working tree.** `.gitleaks.toml` allowlists exactly two known mock/test fixtures (a mock OTP token in `OtpVerify.test.tsx`, a mock activation key in `mockUsers.ts`), both already reviewed and documented by DevOps (per the allowlist comment, reviewed 2026-07-08). No Key Vault URIs, connection strings, or API keys were found hardcoded anywhere in `.ts`/`.tsx` source.

---

## Change / Audit Log

| Date       | Variable             | Environment | Old Value/Query                   | New Value/Query                                         | Changed By | Reason / Ticket                                                                                     |
| :--------- | :------------------- | :---------- | :-------------------------------- | :------------------------------------------------------ | :--------- | :-------------------------------------------------------------------------------------------------- |
| 2026-07-29 | _(document created)_ | All         | _(no prior variables.md existed)_ | Full matrix populated from `src`/`.github`/`docs` audit | DevOps     | Establish variable tracking for this repo per the org-wide Environment Variable Management Standard |
| …          | …                    | …           | …                                 | …                                                       | …          | …                                                                                                   |

_Add a new row for every change instead of overwriting. This table is the actual audit trail an SOC 2 / ISO 27001 review would ask for._

---

## Environment Promotion Checklist

Before a new or changed variable moves Dev -> QA -> Prod, it must pass:

1. [ ] Row exists in the Master Matrix with all columns filled (no `TBD`).
2. [ ] If Build-Time: added to the `vite build` env step in `.github/actions/build-frontend/action.yml` _and_ mirrored into `run-smoke-suite`/`rollback.yml` if those rebuild independently — this repo has three separate places that set `VITE_API_URL`, and a var added to only one silently never reaches some build paths.
3. [ ] If Secret: value stored as a GitHub Environment secret (or the shared `akv<env>1rwai` Key Vault if it ever needs to move there), never in git/Slack/email.
4. [ ] Rotation Policy assigned (or explicitly `N/A`).
5. [ ] Owner for Who Updates Prod has confirmed access/approval.
6. [ ] Tested in QA for at least one full deploy cycle (Build-Time vars need an actual rebuilt bundle, not just a redeploy of the same artifact).
7. [ ] Change Log row added on the day it goes live in Prod.
8. [ ] If it references a resource ID/name/URL hardcoded in a workflow — confirm it's sourced from the GitHub Environment `vars.*` config, not duplicated as a separate literal (see finding #2 above for what happens when this is skipped).

---

## Drift Tracking

"Drift" = the value recorded here no longer matches what's actually running in an environment, or the variable's wiring is broken end-to-end (declared, read in code, but never actually delivered by the pipeline).

**How to check:** on a regular cadence (recommend weekly for Prod, monthly for Dev/QA), someone with access diffs the live SWA / GitHub Environment config / built bundle against this document and updates Last Verified + Drift Status.

| Status     | Meaning                                                | Action                             |
| :--------- | :----------------------------------------------------- | :--------------------------------- |
| OK         | Verified match within last 30 days                     | None                               |
| Unverified | Not verified in 30+ days, or wiring needs confirmation | Schedule a check this sprint       |
| Drift      | Confirmed mismatch, broken wiring, or config bug       | Fix immediately, log in Change Log |

**Flagged this cycle:**

- `VITE_SOCKET_URL` — Drift, orphaned, read in code but never provisioned anywhere.
- `NEXT_PUBLIC_IMAGE_BASE_URL` (via `process.env`) — real bug, always falls back to a hardcoded localhost URL in every environment (see `sanitizePdf.ts`).
- `AZURE_STATIC_WEB_APPS_API_TOKEN_DEV` — Unverified, `preview-deploy.yml` actively uses it at lines 307 and 601, but the main `deploy-frontend.yml` has moved to a single env-scoped `AZURE_STATIC_WEB_APPS_API_TOKEN`. `_QA` and `_PROD` suffixed variants are documented in `DEPLOYMENT.md:177-179` but wired in no workflow file — confirmed orphaned.
- `BACKEND_URL_DEV/QA/PROD` — Unverified, duplicated hardcoded literals that can drift from `vars.API_URL`.

---

## Instructions for Engineering Teams

### 1. Workflow for Adding New Variables

1. Add a `.env.example` entry (create the file if this is the first one — none currently exists in this repo).
2. Add the var to all three build-triggering points: `.github/actions/build-frontend/action.yml`, `.github/actions/run-smoke-suite/action.yml`, and `.github/workflows/rollback.yml` — a Vite build-time var set in only one silently never reaches the others.
3. Add a full row to the Master Matrix (all columns, including Injection Method and Rotation Policy).
4. If it's a Secret, create the GitHub Environment secret first (or the shared Key Vault if backend-shared) — the PR should only ever contain the reference, never the value.
5. Run through the Promotion Checklist before merging to `dev`/deploying to Prod.
6. Submit PR for review.

### 2. Secret Management Guidelines

- Never commit secret values to git or markdown — only the lookup reference.
- Every Secret row must have a non-`N/A` Rotation Policy and a Next Rotation Due date.
- Remember: Build-Time vars require a full rebuild to take effect — there is no running container to restart for this app (static SWA hosting).

### 3. Role & Ownership Responsibilities

| Role                          | Responsibilities                                                                                                     |
| :---------------------------- | :------------------------------------------------------------------------------------------------------------------- |
| **DevOps / Infra Lead**       | Provisions SWA deployment tokens, GitHub Environment config, CI/CD secrets; owns Prod infra vars; runs drift checks. |
| **Frontend Lead**             | Build-time args, feature behavior tied to config, defaults.                                                          |
| **Security Admin**            | Rotates/updates Prod webhook URLs and any secret tokens; owns rotation cadence.                                      |
| **Release Manager / Product** | Approves deployment parameters in Prod releases; signs off on Promotion Checklist.                                   |

### 4. Suggested Cadence

| Task                                                         | Frequency   | Owner                           |
| :----------------------------------------------------------- | :---------- | :------------------------------ |
| Drift check — Prod                                           | Weekly      | DevOps Lead                     |
| Drift check — Dev/QA                                         | Monthly     | Frontend Lead                   |
| Secret rotation review (flag anything within 14 days of due) | Weekly      | Security Admin                  |
| Full matrix audit (every row, every column)                  | Quarterly   | DevOps + Security Admin jointly |
| Cleanup backlog review (see Declared but Unused / Orphaned)  | Next sprint | Frontend Lead                   |
