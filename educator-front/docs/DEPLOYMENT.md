# Educator App Frontend — Deployment Guide

Vite + React + TypeScript frontend on Azure Static Web Apps, with a Porkbun-managed custom domain and a managed SSL certificate. Deployed via GitHub Actions.

---

## End-to-End Provisioning Order

```
1. (One time per env) ./scripts/Deploy-EducatorApp.ps1 -Environment <env> -Action provision
2. (One time per env) ./scripts/Deploy-EducatorApp.ps1 -Environment <env> -Action dns -UsePorkbunDNS
3. (Every push)       git push origin <branch>     # triggers .github/workflows/deploy-frontend.yml
```

`<branch>` is `development` (dev), `qualityassurance` (qa), or `main` (prod).

---

## Architecture

```
GitHub repo
   │  push to development / qualityassurance / main
   ▼
GitHub Actions (.github/workflows/deploy-frontend.yml)
   │  injects VITE_API_URL at build time
   │  builds /dist
   ▼
Azure Static Web App (swa-{env}1-rwai-edufront)
   │  custom domain: dev.educator.realityworksai.com
   │  managed cert (cname-delegation validation)
   ▼
Edge / CDN
```

| Branch             | Env  | SWA                     | Custom domain                           | API URL                                   |
| ------------------ | ---- | ----------------------- | --------------------------------------- | ----------------------------------------- |
| `development`      | dev  | `swa-dev1-rwai-edufront`  | https://dev.educator.realityworksai.com | https://dev.educatorbe.realityworksai.com |
| `qualityassurance` | qa   | `swa-qa1-rwai-edufront`   | https://qa.educator.realityworksai.com  | https://qa.educatorbe.realityworksai.com  |
| `main`             | prod | `swa-prod1-rwai-edufront` | https://educator.realityworksai.com     | https://educatorbe.realityworksai.com     |

Frontend code reads `import.meta.env.VITE_API_URL`. Default for local dev is `http://localhost:3000`.

---

## Prerequisites

- Azure CLI (`az --version`)
- GitHub CLI (`gh --version`)
- PowerShell 5.1+ or PowerShell 7
- Active Azure subscription with Contributor on `ARG-{env}1-rwai`
- (For DNS automation) Porkbun API keys

Set Porkbun keys at the User scope so any new shell inherits them:

```powershell
[Environment]::SetEnvironmentVariable("PORKBUN_API_KEY",    "pk1_...", "User")
[Environment]::SetEnvironmentVariable("PORKBUN_SECRET_KEY", "sk1_...", "User")
```

---

## Naming Conventions

| Resource                      | Pattern                  | Example                |
| ----------------------------- | ------------------------ | ---------------------- |
| Resource Group                | `ARG-{env}1-rwai`        | `ARG-dev1-rwai`        |
| Static Web App                | `swa-{env}1-rwai-edufront` | `swa-dev1-rwai-edufront` |
| Key Vault (shared w/ backend) | `akv{env}1rwai`          | `akvdev1rwai`          |
| Application Insights          | `appi-all1-rwai`         | `appi-all1-rwai`       |

---

## `Deploy-EducatorApp.ps1` Actions

```powershell
.\scripts\Deploy-EducatorApp.ps1 -Environment <dev|qa|prod> -Action <action>
```

| Action       | What it does                                                                                                                                                                                                                                                                                              |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `provision`  | Creates RG, Key Vault, shared Container Apps Environment + Container Registry + Log Analytics, and the Static Web App. Stores the SWA deployment token in GitHub repo secrets (via `gh secret set`).                                                                                                      |
| `dns`        | Resolves the SWA's `defaultHostname`, creates the CNAME via Porkbun (with `-UsePorkbunDNS`) or prompts for manual entry, then runs `az staticwebapp hostname set --validation-method cname-delegation` to bind the hostname **and provision the managed SSL certificate**. Reports cert status afterward. |
| `secrets`    | Stub for shared secret management (Key Vault) — reserved.                                                                                                                                                                                                                                                 |
| `status`     | Quick health check on RG, KV, SWA, Container App, Log Analytics.                                                                                                                                                                                                                                          |
| `monitoring` | Configures Application Insights + alert action group.                                                                                                                                                                                                                                                     |
| `sp`         | Manages the GitHub Actions service principal (currently a stub — backend repo's `Deploy-Backend.ps1 -Action sp` is the source of truth for the shared SP).                                                                                                                                                |

---

## DNS & Managed Certificate

```powershell
.\scripts\Deploy-EducatorApp.ps1 -Environment dev -Action dns -UsePorkbunDNS
```

What happens:

1. Reads `defaultHostname` from the SWA (e.g. `gentle-water-018bcff10.7.azurestaticapps.net`).
2. Splits the custom domain into root (`realityworksai.com`) and subdomain (`dev.educator`).
3. Idempotently upserts the CNAME via Porkbun's REST API.
4. Sleeps 30 s for propagation.
5. `az staticwebapp hostname list` — skips bind if already attached.
6. `az staticwebapp hostname set --validation-method cname-delegation` — this triggers managed cert provisioning.
7. `az staticwebapp hostname show` — prints status (`Adding` → `Ready` after 5–30 min).

Without `-UsePorkbunDNS`, the script prints the CNAME you need to add manually and waits at a `Read-Host` prompt before binding.

To poll cert status afterward:

```powershell
az staticwebapp hostname show `
  --name swa-dev1-rwai-edufront `
  --resource-group ARG-dev1-rwai `
  --hostname dev.educator.realityworksai.com `
  --query status -o tsv
```

---

## GitHub Actions Workflow

**File**: `.github/workflows/deploy-frontend.yml`

**Triggers**: `push` to `dev`, `qa`, or `main`. Supports manual dispatch via `workflow_dispatch` with an explicit environment choice.

### Trigger configuration

```yaml
on:
  push:
    branches: [dev, qa, main]
  workflow_dispatch:
    inputs:
      environment:
        description: 'Environment to deploy to'
        required: true
        default: 'dev'
        type: choice
        options: [dev, qa, prod]
```

### Jobs

| Job             | Purpose                                                         | Runs when                                        |
| --------------- | --------------------------------------------------------------- | ------------------------------------------------ |
| `lint`          | ESLint + Prettier checks; outputs error/warning counts          | always                                           |
| `build`         | Resolves env, installs deps, builds `/dist`, uploads artifact   | after `lint` succeeds                            |
| `qa-checkpoint` | Prints QA instructions; signals that a human review is expected | `build_env == 'qa'`                              |
| `deploy`        | Downloads artifact, uploads to the matching SWA                 | after `build` completes                          |
| `notify-deploy` | Posts Adaptive Card to Teams with lint + deploy status          | always (when `TEAMS_NOTIFICATIONS_ENABLED=true`) |

Lint gates the build: because `build` has `needs: lint`, it is automatically skipped whenever lint fails.

### Environment resolution

The triggering branch (`github.ref_name`) or `workflow_dispatch` input determines the environment:

| Source                       | Value → `BUILD_ENV` | API URL                                     | SWA                     |
| ---------------------------- | ------------------- | ------------------------------------------- | ----------------------- |
| push to `dev`                | `dev`               | `https://dev.educatorbe.realityworksai.com` | `swa-dev1-rwai-edufront`  |
| push to `qa`                 | `qa`                | `https://qa.educatorbe.realityworksai.com`  | `swa-qa1-rwai-edufront`   |
| push to `main`               | `prod`              | `https://educatorbe.realityworksai.com`     | `swa-prod1-rwai-edufront` |
| `workflow_dispatch` → `prod` | `prod`              | `https://educatorbe.realityworksai.com`     | `swa-prod1-rwai-edufront` |

**What it does**:

1. Resolves branch/env from `workflow_run.head_branch` or `inputs.environment`.
2. Checks out, installs deps (Node 24, `npm ci`).
3. Sets `VITE_API_URL` and builds → `/dist`.
4. Uploads `/dist` to the matching SWA via `Azure/static-web-apps-deploy@v1` using the per-env deployment token from GitHub secrets.

**Required GitHub secrets** (the `provision` action populates these):

| Secret                                 | SWA                       |
| -------------------------------------- | ------------------------- |
| `AZURE_STATIC_WEB_APPS_API_TOKEN_DEV`  | `swa-dev1-rwai-edufront`  |
| `AZURE_STATIC_WEB_APPS_API_TOKEN_QA`   | `swa-qa1-rwai-edufront`   |
| `AZURE_STATIC_WEB_APPS_API_TOKEN_PROD` | `swa-prod1-rwai-edufront` |
| `TEAMS_WEBHOOK_URL`                    | Teams Incoming Webhook for deploy notifications |

**Required GitHub variables**:

| Variable                      | Purpose                             |
| ----------------------------- | ----------------------------------- |
| `TEAMS_NOTIFICATIONS_ENABLED` | Set to `true` to enable Teams cards |

Manually rotate a token:

```powershell
$token = az staticwebapp secrets list --name swa-dev1-rwai-edufront --resource-group ARG-dev1-rwai --query "properties.apiKey" -o tsv
gh secret set AZURE_STATIC_WEB_APPS_API_TOKEN_DEV --body $token
```

---

## Promotion Pipeline

```
feature → development     → dev SWA      (rapid iteration)
development → qualityassurance → qa SWA  (PR review required, manual QA)
qualityassurance → main   → prod SWA     (PR review + QA sign-off)
```

Each merge automatically deploys to the matching environment.

---

## Frontend Code Requirements

```typescript
// Always read the API URL from Vite env
const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const api = axios.create({ baseURL: apiUrl });
```

`.env` for local development:

```
VITE_API_URL=http://localhost:3000
```

The build embeds the env var into the bundle — there is no runtime container or runtime injection.

---

## Local Development

```bash
pnpm install
pnpm run dev    # http://localhost:5173, talks to http://localhost:3000
```

---

## Troubleshooting

**Cert stuck in `Adding`**

- Verify the CNAME resolves: `nslookup dev.educator.realityworksai.com`
- Re-run `Deploy-EducatorApp.ps1 -Action dns` — it's idempotent.
- Wait up to 30 minutes for Azure's managed cert provisioning.

**`401 Unauthorized` from `static-web-apps-deploy` action**

- Token was rotated. Re-run `Deploy-EducatorApp.ps1 -Action provision` (it refreshes the GitHub secret) or rotate manually with the snippet above.

**Frontend hits `localhost:3000` in production**

- `VITE_API_URL` wasn't set in the workflow build step. Check the workflow logs for the `env:` block.

**Porkbun prompts for keys even though they're set**

- Env vars must be in the **shell that runs the script**. If you set them via `$env:PORKBUN_API_KEY = ...` in a different terminal, they don't carry over. Use `[Environment]::SetEnvironmentVariable(..., "User")` so all new shells inherit them.

---

## See Also

- [Backend deployment guide](../../fork-Educator-App-Backend/docs/DEPLOYMENT.md)
- [Backend architecture](../../fork-Educator-App-Backend/docs/ARCHITECTURE.md)
