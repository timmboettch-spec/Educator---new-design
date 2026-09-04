# Educator App Backend — Deployment Guide

NestJS backend on Azure Container Apps with PostgreSQL Flexible Server, Key Vault secrets, and GitHub Actions CI/CD.

**Infrastructure is declared in Bicep** (`infra/`). See [Bicep Layout](#bicep-layout) below and [KEY-VAULT-VARS.md](./KEY-VAULT-VARS.md) for the env var catalog.

For system architecture, see [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## Source-of-truth model

**The per-env Key Vault `akv{env}1rwai` is the source of truth** for every runtime env var (under the `edu-` prefix). The backend Container App reads its env vars via `secretRef:` to KV using its system-assigned managed identity.

Only three values live as GitHub repository secrets: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` (for OIDC).

DB migrations and seeders run **inline at container startup** via the Dockerfile `CMD` (`npm run migration:run && npm run seed:roles && node dist/main.js`). There is no separate migrate Job.

---

## End-to-End Provisioning Order

```
1. (One time per env) ./scripts/Deploy-Backend.ps1 -Environment <env> -Action provision
2. (One time per env) ./scripts/Deploy-Backend.ps1 -Environment <env> -Action sp
3. (One time per env) ./scripts/Deploy-Backend.ps1 -Environment <env> -Action dns -UsePorkbunDNS
4. (Every push)       git push origin <env>     # triggers .github/workflows/deploy-backend.yml
```

> Migrations run inline at container startup, so there is no separate `migrate` step in the standard flow.

---

## Prerequisites

- Azure CLI (`az --version`)
- PowerShell 5.1+ or PowerShell 7
- GitHub CLI (`gh --version`)
- Active Azure subscription with Contributor on the target resource groups
- (Optional, for DNS automation) Porkbun API keys — see [DNS](#dns--custom-domain) below

---

## Repository Layout

```
.
├── infra/
│   ├── main.bicep              # subscription-scope entry; references existing RG
│   ├── resources.bicep         # RG scope; Postgres + KV secrets + Container App + AcrPull
│   ├── app-deploy.bicep        # narrow reconcile (image + env + probes); used by GHA workflow
│   ├── modules/
│   │   ├── postgres.bicep
│   │   ├── keyVaultSecrets.bicep
│   │   ├── containerApp-backend.bicep
│   │   └── acrPullRoleAssignment.bicep
│   └── env/
│       ├── dev.bicepparam
│       ├── qa.bicepparam
│       └── prod.bicepparam
├── .deployment/                # ⚠️  TRANSITIONAL — preserved during cutover
│   ├── container-spec.json     # Legacy single-source-of-truth JSON (NO LONGER READ by workflow)
│   ├── REQUIREMENTS.md
│   └── SEEDING.md
├── .github/
│   ├── lint-baseline.json
│   └── workflows/
│       └── deploy-backend.yml  # Lint → az acr build → az deployment group (Bicep) → health → smoke → Teams
├── docs/
│   ├── ARCHITECTURE.md
│   ├── CI-CD-FEATURES.md
│   ├── DEPLOYMENT.md           # This file
│   └── KEY-VAULT-VARS.md       # Env var catalog
├── scripts/
│   └── Deploy-Backend.ps1      # Provisioning + ops (still imperative; Bicep wrapper in flight)
├── src/
└── ...
```

> **`container-spec.json` status**: Preserved during cutover so it stays available as a reference and for emergency rollback. The GitHub Actions workflow no longer reads it; CPU/memory/replicas/env-vars/secrets/probes are all declared in `infra/modules/containerApp-backend.bicep`. Once the Bicep flow is validated in all envs, this file will be removed.

---

## Naming Conventions

| Resource              | Pattern                          | Example                       | Owner / Notes |
|-----------------------|----------------------------------|-------------------------------|---------------|
| Resource Group        | `ARG-{env}1-rwai`                | `ARG-dev1-rwai`               | Shared (HS-Online-AI deploy script owns) |
| Container App         | `aca-{env}1-rwai-eduback`        | `aca-dev1-rwai-eduback`       | Educator-owned (Bicep) |
| Container Environment | `AEN-{env}1-rwai`                | `AEN-dev1-rwai`               | Shared (existing) |
| Container Registry    | `acrall1rwai`                    | `acrall1rwai.azurecr.io`      | Shared (existing) |
| Key Vault             | `akv{env}1rwai`                  | `akvdev1rwai`                 | Shared (Bicep writes `edu-*` child secrets only) |
| Storage Account       | `asa{env}1rwai`                  | `asadev1rwai`                 | Shared (existing) |
| App Insights          | `appi-all1-rwai`                 | `appi-all1-rwai`              | Shared (existing, in `ARG-all1-rwai`) |
| Log Analytics         | `ALA-{env}1-rwai`                | `ALA-dev1-rwai`               | Shared (existing) |
| PostgreSQL Server     | `psql-{env}1-rwai-edu`           | `psql-dev1-rwai-edu`          | Educator-owned (Bicep) |
| Database              | `educator_{env}`                 | `educator_dev`                | Educator-owned (Bicep) |
| Container App Job     | `acj-{env}1-rwai-{app}`          | `acj-dev1-rwai-edusnap`       | Org-wide convention — matches every other Container Apps Job (`acj-{env}1-rwai-crxmigrate`, etc.); not `job-` |
| Managed Identity      | `id-{env}1-rwai-{app}`           | `id-dev1-rwai-edusnap`        | Educator-owned (Bicep) |

---

## Bicep Layout

All infrastructure is declared in `infra/`. The Bicep templates are idempotent — re-running `provision` reconciles drift rather than creating duplicates.

| File | Scope | Purpose |
|------|-------|---------|
| `infra/main.bicep` | subscription | References per-env RG as `existing`; calls `resources.bicep`. |
| `infra/resources.bicep` | resource group | References shared infra (KV, AEN, ACR, AAI, LAW, Storage) as `existing`; instantiates Postgres + KV `edu-*` secrets + Container App + AcrPull role assignment. |
| `infra/app-deploy.bicep` | resource group | Narrow reconcile template invoked by GitHub Actions on every deploy. Updates image + env + secrets + probes + cpu/memory only. Does NOT touch KV values, Postgres, or role assignments. |
| `infra/modules/postgres.bicep` | resource group | `psql-{env}1-rwai-edu` Flexible Server + database + firewall + SSL config + diagnostics. |
| `infra/modules/keyVaultSecrets.bicep` | resource group | Writes `edu-*` child secrets to the shared per-env KV. Does NOT create the vault. |
| `infra/modules/containerApp-backend.bicep` | resource group | `aca-{env}1-rwai-eduback` with all env vars wired as `secretRef:` to KV. |
| `infra/modules/acrPullRoleAssignment.bicep` | shared RG | Grants `AcrPull` on shared ACR to backend system MI. |
| `infra/env/{env}.bicepparam` | — | Per-env parameter values (URLs, storage account name, NODE_ENV); sensitive values read from env via `readEnvironmentVariable()`. |

### Source-of-truth pattern

- **Resource-derived secrets** (DB host/port/name/username, NODE_ENV defaults) are written to KV by `keyVaultSecrets.bicep` on every `provision`.
- **Sensitive secrets** (DB password, JWT secret, Graph client secret, storage connection string) use the **"empty preserves existing"** pattern: pass via env var on `provision`; an empty value skips the KV write so existing values are preserved.
- **Empty-allowed secrets** (custom URLs, Graph IDs, storage account/container names) are only written when the caller supplies a non-empty value.

See [KEY-VAULT-VARS.md](./KEY-VAULT-VARS.md) for the full variable catalog and how to add new values.

### What's in Bicep vs CLI vs GitHub Actions

| Concern | Where | Notes |
|---|---|---|
| Postgres server, database, firewall, SSL config | **Bicep** | Idempotent; re-run `provision` to reconcile. |
| KV `edu-*` secret writes (resource-derived) | **Bicep** | Always written on `provision`. |
| KV `edu-*` secret writes (sensitive) | **Bicep** (when caller passes non-empty), else preserved | Pass via env var on `provision`. Empty = keep existing. |
| Container App spec (image, env, secrets, probes, scale) | **Bicep** | Reconciled on every workflow run via `app-deploy.bicep`. |
| Role assignments (MI → ACR `AcrPull`, MI → KV Secrets User) | **Bicep** | KV role assignment skipped in workflow context (SP lacks RBAC write); created once during interactive `provision`. |
| Image build & push | **GHA** (`az acr build`) | Per-commit, authenticated via OIDC. |
| Container App image update | **GHA** (`az deployment group create -t infra/app-deploy.bicep`) | Per-deploy. |
| Database migrations + seeders | **Container CMD** | Inline at startup; no separate Job. |
| OIDC SP + federated credentials | **CLI** (`-Action sp`) | One-time per env. |
| Custom domain DNS + managed cert | **CLI** (`-Action dns`, Porkbun API + `az containerapp hostname add/bind`) | Requires Porkbun API keys. |

### Microsoft Graph mail (cross-env shared)

### Microsoft Graph mail — original notes (no SMTP)

The backend sends transactional email via the Microsoft Graph `sendMail` endpoint — there is no SMTP relay. See [`src/mail/mail.service.ts`](../src/mail/mail.service.ts).

Inputs:

| Variable | Source | Notes |
|----------|--------|-------|
| `MAIL_FROM` | `env-vars` (per env) | Sender mailbox UPN, currently `no-reply@realityworks.com` for all envs. |
| `GRAPH_TENANT_ID` | `shared-secrets` → `akv-all1-all/GRAPH-TENANT-ID` | Entra tenant ID (`454e3edd-66d1-4e0a-aff2-db5d92eb1c13`, RW Thrive). |
| `GRAPH_CLIENT_ID` | `shared-secrets` → `akv-all1-all/GRAPH-CLIENT-ID` | App registration `MailerForAzureContainers` (AppId `cf315e73-4b97-4e23-9ae4-f6cabc9e0456`). Single app, shared by dev/qa/prod. |
| `GRAPH_CLIENT_SECRET` | `shared-secrets` → `akv-all1-all/GRAPH-CLIENT-SECRET` | Client secret on the app registration. Rotate periodically. |
| `AZURE_STORAGE_CONNECTION_STRING` | per-env Key Vault → `akv{env}1edu/AZURE_STORAGE_CONNECTION_STRING` | Blob storage connection string. Set during `secrets` action or via `az keyvault secret set`. |
| `AZURE_STORAGE_ACCOUNT` | `env-vars` (per env in `container-spec.json`) | Storage account name — `asadev1realityworksai` / `asaqa1realityworksai` / `asaprod1realityworksai`. |
| `AZURE_STORAGE_CONTAINER` | `env-vars` (per env in `container-spec.json`) | Blob container name — same value as `AZURE_STORAGE_ACCOUNT` per env. |

#### Changing Azure Blob Storage settings

**Connection string** (e.g. new storage account or rotated key):
```powershell
# Update Key Vault, then restart the Container App to pick it up
az keyvault secret set --vault-name akv<env>1edu --name AZURE_STORAGE_CONNECTION_STRING --value "<new-connection-string>"
az containerapp revision restart --name aca-<env>1-edu-back --resource-group ARG-<env>1-edu
```
Or re-run the `secrets` action and it will prompt you:
```powershell
.\scripts\Deploy-Backend.ps1 -Environment dev -Action secrets
```

**Account name or container name** (e.g. pointing to a different storage account):
1. Edit `.deployment/container-spec.json` — update `AZURE_STORAGE_ACCOUNT` and `AZURE_STORAGE_CONTAINER` under the relevant environment's `env-vars`.
2. Push to the branch — the workflow applies the new values via `--set-env-vars` automatically.

**Local dev** — edit `.env` directly; the values are read at startup via `ConfigService`.

#### App registration `MailerForAzureContainers`

Application permissions (admin-consented, tenant-wide):

| Permission | Purpose | Notes |
|------------|---------|-------|
| `Mail.Send` | Send mail as any mailbox via `/users/{id}/sendMail`. | Required for runtime email. |
| `MailboxSettings.ReadWrite` | Read/write mailbox settings (used to manage the `no-reply` auto-reply via Graph). | Operational only — can be removed after auto-reply is stable. Was added because Exchange Online PowerShell `Set-MailboxAutoReplyConfiguration` failed with "Identity not found" on the new mailbox. |

> **Scoping note**: both permissions are tenant-wide today. Once **RBAC for Applications** rolls out to this tenant in EAC, the app should be scoped to only the `MailerAppAllowed` distribution group (member: `no-reply@realityworks.com`) using the `Application Mail.Send` role. Until then, treat the client secret as a tenant-wide credential and store/rotate accordingly.

#### `no-reply@realityworks.com` mailbox

| Property | Value |
|----------|-------|
| Type | `UserMailbox` (regular licensed mailbox, **not** a shared mailbox — Exchange Online REST PowerShell can no longer create shared mailboxes) |
| ExchangeGuid | `a8745195-2761-4cb4-98bc-a13627962359` |
| License | Microsoft 365 Business Premium |
| Inbound | Unattended — no human reads it |
| Auto-reply | `alwaysEnabled`, internal + external, points senders to `support@rwthrive.com` |

The auto-reply was set via Microsoft Graph (Exchange Online `Set-MailboxAutoReplyConfiguration` returned "Identity not found" on this mailbox even after Get worked):

```powershell
# Requires MailboxSettings.ReadWrite Application permission on MailerForAzureContainers.
$tenant = az keyvault secret show --vault-name akv-all1-all --name GRAPH-TENANT-ID --query value -o tsv
$client = az keyvault secret show --vault-name akv-all1-all --name GRAPH-CLIENT-ID --query value -o tsv
$secret = az keyvault secret show --vault-name akv-all1-all --name GRAPH-CLIENT-SECRET --query value -o tsv
$tok = (Invoke-RestMethod -Method Post `
    -Uri "https://login.microsoftonline.com/$tenant/oauth2/v2.0/token" `
    -Body @{client_id=$client;client_secret=$secret;scope='https://graph.microsoft.com/.default';grant_type='client_credentials'}).access_token

$reply = "<p>This mailbox is unattended and not monitored. For assistance, please contact <a href='mailto:support@rwthrive.com'>support@rwthrive.com</a>.</p>"
$body = @{ automaticRepliesSetting = @{
    status               = 'alwaysEnabled'
    externalAudience     = 'all'
    internalReplyMessage = $reply
    externalReplyMessage = $reply
}} | ConvertTo-Json -Depth 6

Invoke-RestMethod -Method Patch `
    -Uri 'https://graph.microsoft.com/v1.0/users/no-reply@realityworks.com/mailboxSettings' `
    -Headers @{ Authorization = "Bearer $tok"; 'Content-Type' = 'application/json' } `
    -Body $body
```

#### Optional per-mailbox scoping (deferred)

A security distribution group `MailerAppAllowed` (`mailer-app-allowed@realityworks.com`, `RequireSenderAuthenticationEnabled: $true`, sole member `no-reply@realityworks.com`) already exists. When **RBAC for Applications** in the Exchange admin center is available in this tenant, assign the `Application Mail.Send` role to AppId `cf315e73-4b97-4e23-9ae4-f6cabc9e0456` scoped to that group. The legacy `New-ApplicationAccessPolicy` cmdlet has been retired in EXO V3 REST and is no longer usable.

#### Smoke test (out-of-cluster)

```powershell
$tenant = az keyvault secret show --vault-name akv-all1-all --name GRAPH-TENANT-ID --query value -o tsv
$client = az keyvault secret show --vault-name akv-all1-all --name GRAPH-CLIENT-ID --query value -o tsv
$secret = az keyvault secret show --vault-name akv-all1-all --name GRAPH-CLIENT-SECRET --query value -o tsv
$tok = (Invoke-RestMethod -Method Post `
    -Uri "https://login.microsoftonline.com/$tenant/oauth2/v2.0/token" `
    -Body @{client_id=$client;client_secret=$secret;scope='https://graph.microsoft.com/.default';grant_type='client_credentials'}).access_token

$msg = @{ message = @{
    subject = 'Graph sendMail smoke test'
    body    = @{ contentType = 'Text'; content = "Test from $(Get-Date -Format o)" }
    toRecipients = @(@{ emailAddress = @{ address = 'you@example.com' } })
}; saveToSentItems = $false } | ConvertTo-Json -Depth 6

Invoke-RestMethod -Method Post `
    -Uri 'https://graph.microsoft.com/v1.0/users/no-reply@realityworks.com/sendMail' `
    -Headers @{ Authorization = "Bearer $tok"; 'Content-Type' = 'application/json' } `
    -Body $msg
# 202 No Content == success
```

Rotating the client secret: generate a new secret on the app registration, store it via `az keyvault secret set --vault-name akv-all1-all --name GRAPH-CLIENT-SECRET --value '<new>'`, then restart the Container App revisions (or re-run `provision`) to pick up the new value.

---

## `Deploy-Backend.ps1` Actions

```powershell
.\scripts\Deploy-Backend.ps1 -Environment <dev|qa|prod> -Action <action>
```

> **Transitional state.** The script is currently imperative (`az` CLI calls) and predates the Bicep migration. It will be slimmed to wrap `az deployment sub create -t infra/main.bicep -p infra/env/<env>.bicepparam` in a follow-up. The verbs below are the **target** behavior after that refactor; today, several actions still mirror the old `container-spec.json` flow.

| Action      | What it does (target) |
|-------------|--------------|
| `provision` | Runs `az deployment sub create -t infra/main.bicep -p infra/env/<env>.bicepparam`. Creates/reconciles Postgres + `edu-*` KV secrets + Container App + AcrPull role assignment. Prompts for sensitive values (DB password, JWT secret, etc.); empty input preserves existing KV values. |
| `secrets`   | Helper to set or update a single KV secret post-provision (`az keyvault secret set`). |
| `dns`       | Configures custom domain on the Container App + binds managed cert. Use `-UsePorkbunDNS` to also create CNAME/TXT records via Porkbun API. |
| `health`    | Pings `/health` and shows revision status. |
| `logs`      | Streams `az containerapp logs`. |
| `sp`        | Creates / updates the GitHub Actions OIDC service principal + federated credentials. |
| `gh-config` | Pushes `AZURE_CLIENT_ID` / `AZURE_TENANT_ID` to GitHub repo secrets via `gh`. |
| `rollback`  | Reverts the Container App to a previous revision. |

> Migrations and seeders run inline at container startup via the Dockerfile `CMD`; there is no longer a `migrate` action.

---

## Lint Ratchet (CI Gate)

**Files**: `.github/workflows/lint.yml`, `.github/lint-baseline.json`

All pushes to `dev`, `qa`, and `main` run the **Lint (ratcheted)** workflow before any deploy is allowed. The deploy workflow will not start unless lint passes.

### How the ratchet works

| Situation | Result |
|---|---|
| Errors/warnings **equal** baseline | ✅ Pass — code is no worse than before |
| Errors/warnings **below** baseline | ✅ Pass + improvement notice posted |
| Errors/warnings **above** baseline | ❌ Fail — deploy is blocked |

The baseline is stored in `.github/lint-baseline.json`:

```json
{
  "errors": 0,
  "warnings": 0
}
```

### Lowering the baseline (locking in a cleanup)

When a cleanup PR reduces the count below the current baseline:
1. Run lint locally: `npm run lint -- --format json 2>&1 | jq '[.[] | {e:.errorCount,w:.warningCount}] | {errors:(map(.e)|add//0),warnings:(map(.w)|add//0)}'`
2. Edit `.github/lint-baseline.json` down to the new count **in the same PR**.
3. Never raise the baseline — the gate should only move downward.

### PR comment

On every PR, a sticky comment is posted (and updated on each push) showing a table of current vs baseline counts and the delta. This is managed by the `pr-comment` job and uses `marocchino/sticky-pull-request-comment`.

### Teams notifications

If the repository variable `LINT_NOTIFICATIONS_ENABLED` is set to `true` and the secret `TEAMS_WEBHOOK_LINT_URL` is configured, the workflow posts an Adaptive Card to the lint Teams channel on regression or improvement (flat results are silent).

**Required GitHub setup for Teams notifications**:
- Repository variable: `LINT_NOTIFICATIONS_ENABLED = true`
- Repository secret: `TEAMS_WEBHOOK_LINT_URL` (incoming webhook URL for the lint channel)

---

## GitHub Actions Workflow

**File**: `.github/workflows/deploy-backend.yml`

**Triggers**: push to `dev`, `qa`, or `main` (paths: `src/**`, `Dockerfile`, `package*.json`, `tsconfig*.json`, `infra/**`, the workflow file itself), or `workflow_dispatch`.

### Pipeline flow

```
git push → lint              (ESLint; --max-warnings 0)
             ↓ (pass)
           build-and-deploy
             ├─ Resolve env (dev/qa/prod from branch or dispatch input)
             ├─ Azure OIDC login
             ├─ az acr build           (image: educator-backend:{sha} + {env}-latest)
             ├─ Fetch existing custom-domain cert ID (preserves binding)
             ├─ az deployment group create -t infra/app-deploy.bicep
             │     params: environment, backendImageTag,
             │             [backendCustomDomain, backendCustomDomainCertificateId]
             ├─ Wait for new revision: healthState == Healthy (≤5 min)
             └─ Smoke test: curl --fail https://{FQDN}/health
             ↓
           notify-teams              (Adaptive Card with status, env, image, links)
```

**Key behaviors**:
1. **Branch → environment mapping**: `dev`→dev, `qa`→qa, `main`→prod. `workflow_dispatch` input overrides.
2. **Image tag**: full commit SHA (`github.sha`) plus a moving `{env}-latest` tag.
3. **ACR auth**: discovers actual `loginServer` from ARM (ACRs with unique data-endpoint FQDNs don't always resolve via the `<name>.azurecr.io` short form).
4. **Custom domain preservation**: reads current `customDomains[0].name` and `certificateId` off the live container app, passes them back to Bicep so the hostname binding survives every deploy.
5. **Migrations**: run inline at container startup (`CMD` in Dockerfile). The workflow does not invoke a separate migrate job.
6. **Health gate**: deploy fails if the new revision's `healthState` does not reach `Healthy` within 5 minutes.
7. **Smoke gate**: deploy fails if `/health` does not return 2xx after 5 retries.

**Manually trigger a deploy**:
```powershell
gh workflow run deploy-backend.yml -f environment=dev
gh workflow run deploy-backend.yml -f environment=qa -f image_tag=abc1234
gh run list --workflow=deploy-backend.yml --limit 5
```

**Required GitHub setup**:
- Federated credentials on the SP (`Deploy-Backend.ps1 -Action sp` creates them).
- Repository secrets: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`.
- Optional repo variable: `TEAMS_NOTIFICATIONS_ENABLED=true` + secret `TEAMS_WEBHOOK_URL` for Teams cards.

---

## Preview Environments (per-branch)

**Files**: `.github/workflows/preview-deploy.yml` + `infra/preview-deploy.bicep` + vendored composite actions in `.github/actions/`

> **Built on Educator's aggregated composite actions.** The whole deploy
> use-case is one action, `.github/actions/aca-deploy` (OIDC + ACR build + Bicep
> deploy + wait-health + smoke + summary); Teams goes through one
> `.github/actions/teams-notify` (mention-resolve + card). The Bicep
> (`preview-deploy.bicep`) follows `MODULE-PATTERN.md` and reuses
> `modules/containerApp-backend.bicep`, so the preview inherits the managed Redis creds
> + all env/secret wiring with zero drift.

Every feature branch gets its own **ephemeral, isolated container** on the dev
infrastructure so a change can be exercised on a live URL — and gated by a
blocking smoke test — before it merges. This is separate from the `dev`/`qa`/`prod`
deploy in `deploy-backend.yml`; it never touches the real dev app
(`aca-dev1-rwai-eduback`) or its traffic.

> **Origin**: ported from the org reference `HS-online-AI-app/preview-deploy.yml`,
> which `Organization-Standards-Policy`'s `reusable-deploy-aca.yml` names as the
> pattern to copy until a reusable preview workflow exists org-wide. Adapted for
> Educator (single backend service, deployed via our own Bicep module so the
> preview inherits the managed Redis creds + all env/secret wiring with zero drift).

**Triggers**:
- **push** to `feature/**`, `fix/**`, `bug/**`, `epic/**`, `chore/**`, `devops/**`,
  `ci/**`, `infra/**`, `release/**` — **path-filtered** to `src/**`, `Dockerfile`,
  `package*.json`, `tsconfig*.json`, `infra/**`, and the workflow file (same
  surface as `deploy-backend.yml`). Doc-only / test-only pushes do not build a preview.
- **delete** (branch deleted) and **pull_request → closed** — teardown.
- **workflow_dispatch** with an optional `branch` input — manual preview.

### Flow

```
push to feature/** (relevant path changed)
   ↓
deploy-preview
   ├─ Set names:  slug = sanitized branch (≤10 chars) + 4-char hash of full name
   │              app  = aca-p-<slug>-<hash>-eduback          (≤32 chars, ACA limit)
   │              tag  = prev-<slug>-<hash>-<sha7>
   │              (the "edu" segment keeps this app's previews from colliding
   │              with other apps' previews — e.g. the HA student app — on the
   │              shared dev RG/ACR, since branch names alone aren't unique
   │              across repos)
   └─ aca-deploy  (one aggregated action):
          OIDC login → az acr build → az deployment group create
            -t infra/preview-deploy.bicep  (reuses containerApp-backend.bicep on
            DEV infra; single revision @ 100%, scale-to-zero)
          → wait revision Healthy → (smoke deferred to the gate job below)
          → outputs app-fqdn / preview URL
   ↓
preview-smoke-test  (HARD GATE — required merge check)
   ├─ curl --fail --retry <preview-url>/health   (public URL; no Azure auth needed)
   └─ node tests/api/executor/module-executor.js against <preview-url>/api
        (login → school → educator → dashboard → user → class → student →
        simulation → cleanup — same suite deploy-backend.yml's test-api job
        runs on every dev/qa/main push, blocking here instead of informational)
   ↓
preview-comment  (sticky PR comment)   +   preview-notify (teams-notify, optional)
```

On **branch delete** or **PR close**:

```
cleanup-preview
   ├─ az containerapp delete  aca-p-<slug>-<hash>-eduback
   └─ az acr repository delete educator-backend:prev-<slug>-<hash>-*
```

### Key behaviors

1. **Isolation**: each branch gets a *dedicated* Container App, not a revision on
   the shared dev app — so previews never affect dev traffic. Name collisions are
   avoided by appending a 4-char hash of the full branch name to the slug.
2. **Zero-drift wiring**: the preview reuses `modules/containerApp-backend.bicep`,
   so it has the exact same managed Redis creds, env vars, KV secret refs, and probes as
   a real deploy. Update the module once and both paths follow.
3. **Identity/auth**: reuses the dev user-assigned identity
   (`id-dev1-rwai-eduback`), which already holds AcrPull on the shared ACR and Key
   Vault Secrets User on `akvdev1rwai` — no per-preview identity or ACR admin
   credentials.
4. **Cost**: previews inherit dev `minReplicas=0`, so they scale to zero and cost
   ~nothing at rest. Teardown on branch delete / PR close removes the app and its
   image tags entirely.
5. **Smoke = blocking merge gate**: `preview-smoke-test` fails the run if the
   preview does not serve `2xx` on `/health` (and fails RED, not skipped, if the
   preview never deployed — so a required check can't be silently satisfied). This
   is stricter than the HS reference, where preview smoke is warning-only.

### Making the smoke test a required merge check

The workflow *produces* the check; branch protection is what *enforces* it. Add
the check context to each protected branch (needs repo admin):

```bash
# Check context = "<workflow name> / <job name>"
gh api -X PUT repos/Realityworks-AI/Educator-App-Backend/branches/main/protection/required_status_checks/contexts \
  -f 'contexts[]=Branch Preview Environment / Preview smoke test (blocks merge)'
# repeat for qa and dev
```

> ⚠️ **Required-check + path-filter interaction**: because the preview is
> path-filtered, a PR that changes none of the trigger paths (e.g. docs- or
> test-only) won't run the smoke check, and a *required* check that never reports
> leaves the PR stuck "pending". Either keep such PRs out of the enforced set, or
> add an always-runs gate job that satisfies the same context when a preview
> legitimately isn't needed.

### Manually trigger / inspect a preview

```powershell
gh workflow run preview-deploy.yml -f branch=feature/rwed-658-my-change
gh run list --workflow=preview-deploy.yml --limit 5
# List live preview apps:
az containerapp list -g ARG-dev1-rwai --query "[?starts_with(name,'aca-p-')].name" -o tsv
```

---

## DNS & Custom Domain

```powershell
.\scripts\Deploy-Backend.ps1 -Environment dev -Action dns -UsePorkbunDNS
```

If `-UsePorkbunDNS`, the script:
1. Creates the CNAME and `asuid` TXT verification record via the Porkbun API.
2. Waits 30 s for propagation.
3. Runs `az containerapp hostname add` then `hostname bind --validation-method CNAME` (managed cert).

Set Porkbun keys at the User scope so any new shell inherits them:
```powershell
[Environment]::SetEnvironmentVariable("PORKBUN_API_KEY",    "pk1_...", "User")
[Environment]::SetEnvironmentVariable("PORKBUN_SECRET_KEY", "sk1_...", "User")
```

---

## Database

### Migrations
```powershell
.\scripts\Deploy-Backend.ps1 -Environment dev -Action migrate
```
Runs `npm run migration:run`. `seeding-config.json` controls auto-seed (roles always; users/schools in dev).

### Manual seeds
```powershell
.\scripts\Deploy-Backend.ps1 -Environment dev -Action seed
```

### Connection
```
Server: apg-{env}-edu.postgres.database.azure.com
User:   educator_admin
DB:     educator_{env}
```
Password is stored in Key Vault as `DB-PASSWORD` and injected into the Container App via Key Vault reference.

### Local dev
```bash
docker run -e POSTGRES_PASSWORD=DevPassword123! \
  -e POSTGRES_DB=educator_dev -e POSTGRES_USER=postgres \
  -p 5432:5432 -d postgres:15

cat > .env <<'EOF'
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=DevPassword123!
DB_NAME=educator_dev
JWT_SECRET=local-dev-secret
NODE_ENV=development
EOF

npm install
npm run migration:run
npm run start:dev
```

---

## Health & Observability

- Health endpoint: `GET /health`
- Liveness probe: 30 s initial, 10 s period, 3 failures
- Readiness probe: 10 s initial, 5 s period, 2 failures
- Logs: `ala-all1-edu` Log Analytics workspace
- Container logs:
  ```powershell
  az containerapp logs show --name aca-dev1-edu-back --resource-group ARG-dev1-edu --follow
  ```

---

## Rollback

```powershell
# List recent revisions
az containerapp revision list --name aca-dev1-edu-back --resource-group ARG-dev1-edu -o table

# Activate a previous revision
az containerapp revision set-active `
  --name aca-dev1-edu-back --resource-group ARG-dev1-edu `
  --revision aca-dev1-edu-back--<revisionId>
```

---

## Troubleshooting

**Container shows `ActivationFailed` / `Unhealthy`**
1. `az containerapp logs show ... --follow` — look for missing env vars or DB connect errors.
2. Verify env vars are set: `az containerapp show -n aca-dev1-edu-back -g ARG-dev1-edu --query "properties.template.containers[0].env"`.
3. Verify `DB_PASSWORD` is bound as a `secretRef` (not missing). If missing, re-run `Deploy-Backend.ps1 -Action provision`.

**`Key Vault secret reference not found`**
- The Container App's managed identity needs `Key Vault Secrets User` on the vault. `Deploy-Backend.ps1 -Action provision` assigns this — re-run if it's missing.

**DB connection refused**
- Postgres firewall: ensure the Container Apps environment outbound IPs are allow-listed, or that "Allow Azure services" is enabled.
- Verify `DB_HOST` env var matches `az postgres flexible-server show ... --query fullyQualifiedDomainName`.

**Workflow fails on `--secrets`**
- Workflow no longer runs `--secrets`. Secrets are bound during provisioning. If you see this error, you're on an old workflow — pull `dev`.

---

## Service Principal / OIDC

```powershell
.\scripts\Deploy-Backend.ps1 -Environment dev -Action sp
```

Creates `github-actions-sp` with federated credentials for `dev`/`qa`/`main` branches and matching environments. No client secrets stored.

---

## See Also

- [ARCHITECTURE.md](./ARCHITECTURE.md) — system diagram, component details
- [`.deployment/REQUIREMENTS.md`](../.deployment/REQUIREMENTS.md) — container sizing rationale
- [`.deployment/SEEDING.md`](../.deployment/SEEDING.md) — DB seeding strategy
- [Frontend deployment guide](../../fork-Educator-App-Realityworks/docs/DEPLOYMENT.md)
