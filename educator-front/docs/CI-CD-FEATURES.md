# Educator App — CI/CD Features

Feature tracking for CI/CD workflows. For implementation details, see [DEPLOYMENT.md](DEPLOYMENT.md).

> **Reference:** [HS-Online-AI-App](https://github.com/Realityworks-AI/HS-Online-AI-App) — feature-complete CI/CD reference

---

## ✅ Implemented

| Feature | Backend | Frontend | Notes |
|---------|:-------:|:--------:|-------|
| GitHub Actions deploy workflow | ✅ | ✅ | Push to `dev/qa/main` triggers `deploy-frontend.yml` |
| ESLint gating (ratcheted vs. baseline) | ✅ | ✅ | `lint-ratchet-against-baseline` action — fails only on a regression past `.github/lint-baseline.json`, notices on improvement |
| Lint blocks build | ✅ | ✅ | `needs: lint` on the build job |
| Multi-environment (dev/qa/prod) | ✅ | ✅ | Branch-based routing (`dev`→dev, `qa`→qa, `main`→prod) |
| Environment-scoped SWA deploy token | — | ✅ | Single secret name `AZURE_STATIC_WEB_APPS_API_TOKEN`, resolved per-environment via the job's `environment:` binding — no more three separately-named per-env secrets |
| OIDC authentication | ✅ | ❌ | Frontend has no Azure OIDC credentials at all — SWA deploys purely via deployment token, no `az` calls |
| workflow_dispatch (manual deploy) | ✅ | ✅ | Environment selectable |
| Teams notifications (Adaptive Cards) | ✅ | ✅ | Deploy success/failure, lint delta, preview status, SAST failures, rollback, pending approval |
| Author @mention in Teams (SCIM) | ✅ | ✅ | `firstname-lastname_rwthrive` GitHub login → `firstname.lastname@rwthrive.com` Entra UPN, resolved in the `teams-notify` action; mention line only renders when a caller sets `mention-prefix`/`mention-suffix` |
| Unit + integration tests in CI | ✅ | ✅ | `run-test-suite` action (Vitest, Jest-shaped `--json` report) — used for both unit and integration suites in `deploy-frontend.yml` and `preview-deploy.yml` |
| Bicep IaC (provision + deploy) | ✅ | ❌ | Frontend deploys via the Static Web Apps CLI/action, no `infra/` folder |
| Health check verification | ✅ | ✅ | Playwright smoke suite (`run-smoke-suite`) waits for the URL to respond, then runs the e2e:smoke flow |
| Custom domain preservation | ✅ | ❌ | Not applicable — SWA manages its own default + custom domains outside this pipeline |
| Preview environments (per-PR) | ✅ | ✅ | `preview-deploy.yml` — deploys on `pull_request` with an empty `deployment_environment`, so Azure auto-manages its own PR-numbered slot (not a custom named environment); teardown on PR close. Changed from a per-branch, push-triggered, custom-named-environment design on 2026-07-24 — those names are invisible to `az staticwebapp environment list/show/delete`, which made cleanup and eviction impossible to build reliably |
| Preview eviction at cap (real-time) | ✅ | ✅ | `preview-deploy.yml`'s `deploy-preview` job — before deploying, lists existing preview slots via OIDC (`az staticwebapp environment list`) and deletes the oldest *other* PR's slot if this PR would push the count over `MAX_PREVIEWS` (10, Standard tier). Modeled on pxt-crexo's `Setup-Script.ps1 -Action evict-old-previews`. Replaces the old `preview-cleanup-stale.yml` scheduled sweep (removed 2026-07-24 — it swept by branch staleness, which no longer applies now that previews are tied to PR lifecycle, not branch pushes) |
| Preview smoke test | ✅ (warning only) | ✅ (warning only) | Frontend's `preview-smoke-test` job uses `continue-on-error` on the Playwright step and surfaces failures as a job annotation + non-blocking PR comment/Teams warning — matches the backend's behavior, made non-blocking on 2026-07-24 |
| Rollback workflow | ✅ | ✅ | `rollback.yml` — redeploy a previous build to SWA, dry-run supported |
| Pending approval notifications | ✅ | ✅ | `notify-pending-approval.yml` — fires on `deployment_status: waiting`, @mentions the deployer |
| SAST (Gitleaks · Trivy) | ✅ (+ CodeQL/Semgrep) | ✅ | `sast.yml` — frontend runs Gitleaks + Trivy only (no CodeQL/Semgrep); runs on **every push to every branch**, not just PRs, via its own dedicated `TEAMS_SAST_WEBHOOK_URL` |
| SAST failure notifications | ✅ (Teams + Power Automate) | ✅ (Teams only) | Frontend's `teams-alert` job resolves subject/author/subtitle differently for `pull_request` vs. `push` events (no PR context on a plain branch push) |
| PR sticky comments (dedup'd across events) | ✅ | ✅ | `pr-sticky-comment` action resolves the open PR from a branch name on push-triggered jobs (previews, push-triggered SAST runs), not just `pull_request` events |

---

## ❌ Not Implemented

| Feature | Priority | Reference |
|---------|:--------:|-----------|
| Azure OIDC / Bicep IaC for the frontend | Low | SWA deploy token model works fine for a static app; no infra to reconcile |
| CodeQL / Semgrep in `sast.yml` | Low | Backend runs these; frontend's `sast.yml` only has Gitleaks + Trivy |
| Power Automate SAST notification | Low | Backend added this 2026-07-21; not ported to frontend |

---

## 🚧 Roadmap

| Feature | Priority | Reference |
|---------|:--------:|-----------|
| Multi-environment gating (qa/stage/prod) | Low | GitHub Environments |

---

## Pipeline Architecture

Every workflow in this repo is **standalone/flat** — there is no `workflow_call`/`reusable-*.yml` layer anywhere in `.github/workflows/`. Shared logic lives at the **composite action** level (`.github/actions/`), which every workflow composes directly. This is the shape the backend repo (`Educator-App-Backend`) was flattened to match on 2026-07-22 (it briefly adopted a `reusable-*.yml`/`workflow_call` layer, then reverted to this repo's flat structure).

| Workflow | Purpose | Composite actions used |
|----------|---------|-------------------------|
| `deploy-frontend.yml` | Push-to-`dev`/`qa`/`main` deploy, lint + unit + integration tests, approval gate on prod, smoke test, Teams notify | `lint-ratchet-against-baseline`, `run-test-suite`, `build-frontend`, `deploy-swa`, `run-smoke-suite`, `pr-sticky-comment`, `teams-notify` |
| `preview-deploy.yml` | Per-PR SWA preview (Azure's own PR-numbered slot, not a custom named environment), real-time eviction at the 10-slot cap, teardown on PR close | `lint-ratchet-against-baseline`, `run-test-suite`, `build-frontend`, `deploy-swa`, `run-smoke-suite`, `pr-sticky-comment`, `teams-notify`, `azure/login` (OIDC) |
| `rollback.yml` | Manual rollback to a previous build | `teams-notify` |
| `notify-pending-approval.yml` | Deployer @mention when a gated environment awaits approval | `teams-notify` |
| `sast.yml` | Gitleaks + Trivy on every PR and every push | `pr-sticky-comment`, `teams-notify` |

### Composite actions — aggregated by use-case

Rather than one micro-action per step, actions are **aggregated into cohesive use-case units** (`.github/actions/`):

| Action | Folds in | Used by |
|--------|----------|---------|
| `build-frontend` | Node setup + npm ci + `vite build` with a given `VITE_API_URL` | `deploy-frontend`, `preview-deploy` |
| `deploy-swa` | Azure Static Web Apps deploy (upload built `dist/`, empty `deployment-environment` for a PR-triggered run lets Azure auto-manage the PR-numbered slot, `close` action for teardown) | `deploy-frontend`, `preview-deploy` |
| `run-test-suite` | Node setup + npm ci + test command + JSON/HTML artifact upload + pass/fail parsing (Jest-shaped `numTotalTests` report) | `deploy-frontend` (unit + integration), `preview-deploy` |
| `run-smoke-suite` | Node setup + npm ci + Playwright install + wait-for-URL + `e2e:smoke` suite run + report upload | `deploy-frontend`, `preview-deploy` |
| `pr-sticky-comment` | PR resolution from branch (for push-triggered jobs) or auto-detected from event context (for `pull_request`-triggered jobs) + sticky comment upsert | `deploy-frontend`, `preview-deploy`, `sast` |
| `teams-notify` | mention-resolution (SCIM) + Adaptive Card post, with `mention-prefix`/`mention-suffix`/`footer` support | `deploy-frontend`, `preview-deploy`, `rollback`, `notify-pending-approval`, `sast` |
| `lint-ratchet-against-baseline` | ESLint run + baseline compare + verdict | `deploy-frontend`, `preview-deploy` |

One notification action, one build action, one deploy action — no per-step fragmentation. `deploy-frontend.yml`'s SWA deploy step resolves its deployment token per-environment via the job's `environment:` binding rather than one hardcoded secret name per branch.

---

## Path Filters

| Workflow | Trigger Paths | Excluded Paths |
|----------|---------------|----------------|
| `deploy-frontend.yml` | All code paths | `docs/**`, `*.md`, `scripts/**` |
| `preview-deploy.yml` | All code paths, on `pull_request` (opened/synchronize/reopened/closed) against `dev`/`qa`/`main` — any source branch name | `docs/**`, `*.md` |

> **Standard:** Doc-only changes do not trigger deployments. Use `workflow_dispatch` to force a deploy if needed.

---

## Testing

| Test Type | Framework | Job | CI Status | Blocking? |
|-----------|-----------|-----|:---------:|-----------|
| Unit tests | Vitest + React Testing Library | `deploy-frontend.yml` / `preview-deploy.yml` → `unit-tests` (`run-test-suite`) | ✅ In workflow | Yes |
| Integration tests | Vitest | `deploy-frontend.yml` / `preview-deploy.yml` → `integration-tests` (`run-test-suite`) | ✅ In workflow | Yes |
| Smoke tests (E2E) | Playwright | `smoke-tests` / `preview-smoke-test` (`run-smoke-suite`) | ✅ In workflow | No — both `continue-on-error`; a failure surfaces as a job annotation + Teams/PR warning, doesn't fail the job |

**Test scripts** (`package.json`):
- `npm test` — Vitest (watch mode)
- `npm run test:run` — Vitest, single run (used in CI)
- `npm run test:integration` — Vitest integration suite
- `npm run e2e:smoke` — Playwright smoke suite (used by `run-smoke-suite`)

---

## Configuration

| Type | Name | Purpose |
|------|------|---------|
| Variable | `TEAMS_NOTIFICATIONS_ENABLED` | Set to `true` to enable Teams notifications (`deploy-frontend`, `rollback`, `notify-pending-approval`) |
| Variable | `TEAMS_PREVIEW_NOTIFICATIONS_ENABLED` | Set to `true` to enable the preview-deploy Teams card |
| Variable | `API_URL` | Backend API base URL used as `VITE_API_URL` for real-environment builds |
| Variable | `FRONTEND_URL` | This app's own deployed URL, used in notification cards |
| Variable | `SWA_NAME` | Azure Static Web App resource name |
| Secret | `AZURE_STATIC_WEB_APPS_API_TOKEN` | SWA deployment token — environment-scoped (dev/qa/main each define their own value under this same secret name) |
| Secret | `TEAMS_WEBHOOK_URL` | Teams Incoming Webhook for deploy/rollback/approval cards |
| Secret | `TEAMS_PREVIEW_WEBHOOK_URL` | Separate Teams Incoming Webhook for preview-deploy status cards |
| Secret | `TEAMS_SAST_WEBHOOK_URL` | Separate Teams Incoming Webhook for SAST failure cards — kept apart from the deploy/preview webhooks so a security finding can't get lost in a deploy-notification channel |
| Secret | `GITHUB_TOKEN` | Default token — used for sticky PR comments and `gh pr list` lookups |

> No Azure OIDC secrets (`AZURE_CLIENT_ID`/`AZURE_TENANT_ID`) — this repo has no Azure CLI calls at all; SWA deploys are purely token-based via `Azure/static-web-apps-deploy`.

---

## Changelog

| Date | Feature | PR |
|------|---------|-----|
| 2026-07-24 | `preview-deploy.yml`: switch previews from push-triggered custom-named environments to `pull_request`-triggered, Azure-managed PR-numbered slots + real-time eviction via OIDC (`az staticwebapp environment list/delete`), modeled on pxt-crexo. Removes `preview-cleanup-stale.yml` and `swa-preview-slug` (obsolete under the new model) | #474 |
| 2026-07-22 | Refresh this doc to match the actual current pipeline (previous version described `preview-deploy.yml`/`rollback.yml` as roadmap items that were already implemented, and was missing `preview-cleanup-stale.yml`, `sast.yml`, and every composite action) | - |
| 2026-07-21 | `sast.yml`: run on every push (not just PRs opened against dev/qa/main), resolve the PR via `pr-sticky-comment` on push-triggered runs, dedicated `TEAMS_SAST_WEBHOOK_URL` | - |
| — | `deploy-frontend.yml`: environment-scoped `AZURE_STATIC_WEB_APPS_API_TOKEN` (single secret name) replacing three separately-named per-branch secrets | - |
| — | Extract `pr-sticky-comment` composite action; dedupe lint/test/build/deploy/notify logic via `run-test-suite`, `build-frontend`, `deploy-swa`, `run-smoke-suite`, `swa-preview-slug` | - |
| — | Add branch preview environments (Azure SWA named environments) + `preview-cleanup-stale.yml` scheduled sweep | - |
| 2026-06-02 | Add Teams notifications with lint summary | Backend #137, Frontend #129 |
| 2026-06-01 | Merge lint into deploy workflow | Backend #134, Frontend #118 |
| 2026-06-01 | Fix workflow_run trigger issue | Backend #133, Frontend #117 |
| 2026-05-xx | Initial deploy workflows | - |
