# Educator App — CI/CD Features

Feature tracking for CI/CD workflows. For implementation details, see [DEPLOYMENT.md](DEPLOYMENT.md).

> **Reference:** [HS-Online-AI-App](https://github.com/Realityworks-AI/HS-Online-AI-App) — feature-complete CI/CD reference

---

## ✅ Implemented

| Feature | Backend | Frontend | Notes |
|---------|:-------:|:--------:|-------|
| GitHub Actions deploy workflow | ✅ | ✅ | Push to `dev/qa/main` triggers deploy |
| ESLint gating (errors block deploy) | ✅ | ✅ | `--max-warnings 0` in lint job |
| Lint blocks build | ✅ | ✅ | `needs: lint` on build job |
| Multi-environment (dev/qa/prod) | ✅ | ✅ | Branch-based routing |
| Key Vault secrets | ✅ | ❌ | Backend reads from KV; frontend uses SWA tokens |
| OIDC authentication | ✅ | ❌ | Backend uses federated credentials |
| QA Checkpoint job | ✅ | ✅ | Informational logging for QA deploys |
| workflow_dispatch (manual deploy) | ✅ | ✅ | Environment selectable |
| Teams notifications (Adaptive Cards) | ✅ | ✅ | Deploy success/failure + lint summary |
| Lint summary in Teams | ✅ | ✅ | Error/warning counts in card facts |
| Frontend + Backend URLs in cards | ✅ | ✅ | Links to deployed environment |
| Bicep IaC (provision + deploy) | ✅ | ❌ | `infra/` — `main.bicep` + `app-deploy.bicep` |
| Health check verification | ✅ | ❌ | Polls `healthState == Healthy` + curl `/health` smoke |
| Custom domain preservation | ✅ | ❌ | Reads live `customDomains[0]` + cert, passes to Bicep |
| Preview environments (per-branch) | ✅ | ❌ | `preview-deploy.yml` — ephemeral `aca-p-<slug>-<hash>-eduback` on dev infra; teardown on branch delete / PR close. See [DEPLOYMENT.md → Preview Environments](DEPLOYMENT.md#preview-environments-per-branch) |
| Preview smoke test (warning only) | ✅ | ❌ | Full `tests/api` suite (login → school → educator → class → student → simulation) run against the preview; failures post a `::warning::` with the specific failing test names + a non-blocking PR comment/Teams card — does **not** block merge (deploy failure itself still does, via the `deploy-preview` job) |
| Rollback workflow | ✅ | ❌ | `rollback.yml` — roll back to the previous ACR tag or a specific SHA, dry-run supported, prod gated by the `prod` GitHub Environment |
| Pending approval notifications | ✅ | ❌ | `notify-pending-approval.yml` — fires on `deployment_status: waiting`, @mentions the deployer |
| Author @mention in Teams (SCIM) | ✅ | ❌ | `firstname-lastname_rwthrive` GitHub login → `firstname.lastname@rwthrive.com` Entra UPN, resolved in the `teams-notify` action; used across deploy/lint/preview/SAST/rollback/approval cards |
| SAST (Gitleaks · Trivy · CodeQL · Semgrep) | ✅ | ❌ | `sast.yml` — CodeQL currently disabled (`if: false`, GitHub API permissions quirk on this private repo); Trivy is warning-only |
| SAST failure notifications (2 channels) | ✅ | ❌ | Teams Adaptive Card + a Power Automate HTTP-trigger webhook, both @mention the PR author on failure |
| PR sticky comments (dedup'd across events) | ✅ | ❌ | `pr-sticky-comment` action resolves the open PR from a branch name on push-triggered jobs (previews, push-triggered SAST-adjacent flows), not just `pull_request` events |

---

## ❌ Not Implemented

| Feature | Priority | Reference |
|---------|:--------:|-----------|
| Frontend Bicep conversion | Medium | Frontend still uses Static Web Apps CLI |
| CodeQL (enabled) | Medium | `sast.yml`'s `codeql` job has `if: false` — its init step 403s on this repo's GitHub API permissions (private-repo quirk, not a code issue) |

---

## 🚧 Roadmap

| Feature | Priority | Reference |
|---------|:--------:|-----------|
| Separate lint workflow (PR feedback) | Medium | Currently folded into `deploy-backend.yml`'s `lint`/`pr-lint-comment` jobs |
| Multi-environment gating (qa/stage/prod) | Low | GitHub Environments |
| Extend `aca-blue-green-deploy`/`aca-promote-traffic` (org actions) with custom-domain + Bicep support | Low | Would let `deploy-backend.yml`'s prod deploy path adopt the vendored org actions instead of its inline blue/green logic — see [Org Pipeline Standard Adoption](#org-pipeline-standard-adoption) |

---

## Org Pipeline Standard Adoption

Every workflow in this repo is now **standalone/flat** — same shape as the frontend repo (`Educator-App-Realityworks`), which has never had a `reusable-*.yml`/`workflow_call` layer. There is no `workflow_call` indirection anywhere in `.github/workflows/`; shared logic instead lives at the **composite action** level (`.github/actions/`), which every workflow file composes directly.

| Workflow | Shape | Composite actions used |
|----------|-------|-------------------------|
| `sast.yml` | Standalone (flat) | `pr-sticky-comment`, `teams-notify`, `power-automate-notify` |
| `rollback.yml` | Standalone (flat) | `teams-notify` |
| `notify-pending-approval.yml` | Standalone (flat) | `teams-notify` |
| `preview-deploy.yml` | Standalone (flat) | `aca-deploy`, `parse-api-test-results`, `pr-sticky-comment`, `teams-notify` |
| `deploy-backend.yml` | Standalone (flat) | `lint-ratchet-against-baseline`, `run-test-suite`, `parse-api-test-results`, `pr-sticky-comment`, `teams-notify` |

> **Why `deploy-backend.yml`'s deploy step stays inline** rather than calling `aca-deploy`: it deploys via **Bicep** (`infra/app-deploy.bicep`, full env/secret/probe reconciliation) and preserves the **custom-domain** binding across deploys, and its staging smoke test hits the **new revision's direct FQDN** (blue/green at 0% traffic). `aca-deploy` doesn't model any of that blue/green sequencing, so merging the two would change production deploy behavior — it stays inline (`azure/login@v2` + Bicep) instead.

### Composite actions — aggregated by use-case

Rather than one micro-action per step, the actions are **aggregated into cohesive use-case units** (`.github/actions/`):

| Action | Folds in | Used by |
|--------|----------|---------|
| `aca-deploy` | OIDC login + ACR login + `docker-build-push-acr` (build/push) + Bicep deploy + wait-health + smoke + summary | `preview-deploy` (and available to any Bicep ACA deploy) |
| `docker-build-push-acr` | `docker/setup-buildx-action` + `docker/build-push-action` with GHA layer cache (`cache-from`/`cache-to: type=gha`), multi-tag support (vendored from `orgwide`) | `aca-deploy` (→ `preview-deploy`), `deploy-backend` (`build-and-deploy` job) |
| `teams-notify` | mention-resolution (SCIM) + Adaptive Card post | `deploy-backend`, `preview-deploy`, `sast`, `rollback`, `notify-pending-approval` |
| `power-automate-notify` | mention-resolution (SCIM) + JSON payload post to a Power Automate HTTP-trigger webhook | `sast` |
| `pr-sticky-comment` | PR resolution from branch (for push-triggered jobs) + sticky comment upsert | `sast`, `deploy-backend`, `preview-deploy` |
| `run-test-suite` | Node setup + npm ci + test run + JSON/HTML artifact upload + pass/fail parsing (`numTotalTests`-shaped Jest report) | `deploy-backend` (unit + integration suites) |
| `run-api-test-suite` | Node setup + npm ci + `tests/api/executor/module-executor.js` + JSON/HTML artifact upload + pass/fail parsing (via `parse-api-test-results`) | `deploy-backend` (API suite), `preview-deploy` (preview smoke test) |
| `parse-api-test-results` | assertionResults-shaped JSON parsing → pass/fail counts + failing test names | `run-api-test-suite` |
| `lint-ratchet-against-baseline` | Optional Node setup + npm ci + ESLint run + baseline compare + verdict | `deploy-backend` |
| `resolve-environment-from-branch` | branch/dispatch-input → environment → resource-group naming (vendored from `orgwide`) | `deploy-backend` |
| `test-gate-evaluate` | failed-count → strict-mode/branch-based block-or-warn decision (vendored from `orgwide`) | `deploy-backend` |

> **Why `az acr build` was replaced:** it runs the Docker build remotely on ACR Tasks with no layer cache across CI runs — every build starts from scratch. `docker-build-push-acr` (vendored from `orgwide`, the org standards repo) uses `docker/build-push-action` with the GitHub Actions cache backend, which reuses unchanged layers between runs — same custom-tag capability (`--image name:tag` → `tags: |` list), just faster and cheaper. Both `aca-deploy` and `deploy-backend.yml`'s prod build step now use it; `az acr login` replaces the implicit auth `az acr build` used to handle internally.

One notification action, one deploy action — no per-step fragmentation. `deploy-backend`'s blue/green (custom-domain, revision-direct smoke, traffic promotion) stays inline in that workflow, using inline `azure/login@v2` + Bicep rather than micro-actions.

---

## Path Filters

| Workflow | Trigger Paths | Excluded Paths |
|----------|---------------|----------------|
| `deploy-backend.yml` | `src/**`, `Dockerfile`, `package*.json`, `tsconfig*.json`, `infra/**`, workflow file | `docs/**`, `*.md`, `scripts/**` |
| `preview-deploy.yml` | `src/**`, `Dockerfile`, `package*.json`, `tsconfig*.json`, `infra/**`, workflow file (on `feature/**`, `fix/**`, `bug/**`, `epic/**`, `chore/**`, `devops/**`, `ci/**`, `infra/**`, `release/**` branches) | anything not listed |

> **Standard:** Doc-only changes do not trigger deployments. Use `workflow_dispatch` to force a deploy if needed.

**Excluded from CI triggers:**
- `docs/` — Documentation changes
- `*.md` — Root markdown files (README.md, CONTRIBUTING.md)
- `scripts/` — Deployment scripts (run manually)

---

## Testing

| Test Type | Framework | Job | CI Status | Blocking? |
|-----------|-----------|-----|:---------:|-----------|
| Unit tests | Jest | `deploy-backend.yml` → `test-unit` (`run-test-suite` action) | ✅ In workflow | No — non-blocking, TODO to fix upstream failures |
| API tests | Jest-shaped custom executor (`tests/api/executor/module-executor.js`) | `deploy-backend.yml` → `test-api` (`parse-api-test-results` action) | ✅ In workflow | No — informational, real backend required |
| Integration tests | Jest (`tests/jest-integration.json`) | `deploy-backend.yml` → `test-integration` (`run-test-suite` action) | ✅ In workflow | Yes — real gate; blocks `set-environment` on push and on PRs into `main`/`qa` |
| Preview smoke tests | Same API executor, run against the live preview | `preview-deploy.yml` → `preview-smoke-test` | ✅ In workflow | No — warning only (see Implemented table) |
| Combined test gate | — | `deploy-backend.yml` → `test-gate` (`test-gate-evaluate` action, vendored from `orgwide`) | ✅ In workflow | Configurable — always strict on `main`, elsewhere gated by `vars.STRICT_TEST_GATING` |

**Test scripts** (`package.json`):
- `npm test` — Jest unit tests
- `npm run test:api` — API executor suite (`test-api` job / preview smoke test)
- `npm run test:integration` — Integration suite (`test-integration` job)
- `npm run test:e2e` — E2E suite (config at `tests/jest-e2e.json`) — not yet wired into any workflow

---

## Configuration

| Type | Name | Purpose |
|------|------|---------|
| Variable | `TEAMS_NOTIFICATIONS_ENABLED` | Set to `true` to enable Teams notifications (`deploy-backend`, `rollback`, `notify-pending-approval`) |
| Variable | `TEAMS_PREVIEW_NOTIFICATIONS_ENABLED` | Set to `true` to enable the preview-deploy Teams card |
| Variable | `LINT_NOTIFICATIONS_ENABLED` | Set to `true` to enable the lint-regression/-improvement Teams card on PRs |
| Variable | `STRICT_TEST_GATING` | `true` = block the deploy on any unit/API test failure regardless of branch (always strict on `main` either way) |
| Variable | `STRICT_SMOKE_GATING` | `true` = staging smoke-test failure blocks `promote-live` on every environment (always strict on `prod` either way) |
| Secret | `TEAMS_WEBHOOK_URL` | Teams Incoming Webhook for deploy/rollback/approval/SAST cards |
| Secret | `TEAMS_WEBHOOK_LINT_URL` | Separate Teams Incoming Webhook for the lint PR card |
| Secret | `POWER_AUTOMATE_SAST_WEBHOOK_URL` | Power Automate HTTP-trigger URL for the SAST failure notification |
| Secret | `AZURE_CLIENT_ID` | SP for OIDC (used by `deploy-backend`, `preview-deploy`, `rollback`) |
| Secret | `AZURE_TENANT_ID` | Azure AD tenant |
| Secret | `GITHUB_TOKEN` | Default token — used for sticky PR comments and `gh pr list` lookups |

> Subscription ID and other per-environment naming (`ACR_NAME`, `ACR_RG`, resource-group/container-app naming) are hardcoded as workflow-level `env:` values in each workflow, not secrets — there's nothing sensitive in an Azure subscription ID or resource name.

---

## Changelog

| Date | Feature | PR |
|------|---------|-----|
| 2026-07-22 | Adopt `resolve-environment-from-branch` + `test-gate-evaluate` composite actions vendored from `orgwide` (`set-environment`/`test-gate` jobs in `deploy-backend.yml`); refresh this doc's Implemented/Testing/Configuration sections to match current pipeline state | - |
| 2026-07-22 | Make preview smoke test warning-only (was a required merge-blocking check) — failures now post `::warning::` + PR comment/Teams card with the specific failing tests, never block merge | - |
| 2026-07-22 | Flatten all workflows back to standalone (dropped `reusable-sast.yml`, `reusable-rollback-aca.yml`, `reusable-notify-approval.yml`/`workflow_call` entirely), matching the frontend repo's shape — `sast.yml`, `rollback.yml`, `notify-pending-approval.yml` now each own their full job logic inline; ported `pr-sticky-comment`, `run-test-suite`, and the `teams-notify` mention-prefix/suffix upgrade from the frontend; added a Power Automate SAST failure notification (`power-automate-notify`) | - |
| 2026-07-17 | Adopt org pipeline standard: `sast`/`rollback`/`notify-pending-approval` now call vendored reusable workflows; `deploy-backend` + `preview-deploy` compose vendored composite actions from `.github/actions/` | - |
| 2026-07-17 | Add per-branch preview environments + blocking preview smoke test (`preview-deploy.yml`, `infra/preview-deploy.bicep`) | - |
| 2026-06-02 | Add Teams notifications with lint summary | Backend #137, Frontend #129 |
| 2026-06-01 | Merge lint into deploy workflow | Backend #134, Frontend #118 |
| 2026-06-01 | Fix workflow_run trigger issue | Backend #133, Frontend #117 |
| 2026-05-xx | Initial deploy workflows | - |
