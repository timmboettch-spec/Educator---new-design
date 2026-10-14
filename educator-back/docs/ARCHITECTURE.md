# Educator App - Backend Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        GitHub (CI/CD)                           │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Repository: Realityworks-AI/Educator-App-Backend      │   │
│  │  Branches: main (prod) | qa | dev                      │   │
│  │  Workflows: Docker build → ACR push → Container App    │   │
│  └─────────────────────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────────────────────┘
                       │ (push to branch)
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Azure Container Registry                      │
│  Registry: acrall1rwai.azurecr.io (shared across environments)  │
│  Images: educator-backend:7-char-sha-{env}-latest              │
└──────────────────────┬──────────────────────────────────────────┘
                       │ (image pull)
                       ↓
┌──────────────────────────────────┬──────────────────────────────┐
│  Azure Container Apps            │   Azure PostgreSQL           │
│  per-environment:                │   per-environment:           │
│  ─────────────────────           │   ─────────────────────      │
│  • Dev: aca-dev1-rwai-eduback    │   • Dev: psql-dev1-rwai-edu  │
│  • QA:  aca-qa1-rwai-eduback     │   • QA:  psql-qa1-rwai-edu   │
│  • Prod: aca-prod1-rwai-eduback  │   • Prod: psql-prod1-rwai-edu│
│                                  │                              │
│  CPU/Memory (backend only):      │   Version: PostgreSQL 15      │
│  • Dev: 1.75 CPU / 3.5Gi RAM     │   Flexible Server (managed)   │
│  • QA: 1.75 CPU / 3.5Gi RAM      │   Automatic backups           │
│  • Prod: 2.0 CPU / 4.0Gi RAM     │   PITR enabled               │
│  Redis is a managed Azure       │                              │
│  Managed Redis instance (not a  │                              │
│  sidecar), access-key auth      │                              │
└──────────────────────────────────┴──────────────────────────────┘
         │                                      │
         │                                      │
    (env vars)                            (migrations)
         │                                      │
         ↓                                      ↓
┌─────────────────────────────────────────────────────────────────┐
│                      Azure Key Vault                             │
│  per-environment: akvdev1rwai | akvqa1rwai | akvprod1rwai       │
│  Secrets:                                                        │
│  • DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_NAME         │
│  • JWT_SECRET, JWT_EXPIRATION, NODE_ENV                         │
│  • DATABASE_URL (connection string)                             │
└─────────────────────────────────────────────────────────────────┘
         │
    (RBAC: AzureSDK)
         │
         ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Azure Log Analytics                           │
│  Workspace: ALA-all1-rwai (shared, all environments)            │
│  Logs from: All Container Apps + Application Insights           │
│  Monitoring: CPU, Memory, Request count, Error rates            │
└─────────────────────────────────────────────────────────────────┘

         (outbound email)
                │
                ↓
┌─────────────────────────────────────────────────────────────────┐
│           Azure Communication Services — Email (ACS)             │
│  Auth:             ManagedIdentityCredential (this app's own    │
│                     user-assigned identity — service principal  │
│                     granted "Communication and Email Service    │
│                     Owner" on the ACS resource; see              │
│                     infra/modules/acsEmail.bicep)                 │
│  Sender domain:    dev.rwai.curionn.com (dev, CustomerManaged)   │
│                     qa.rwai.curionn.com (qa, CustomerManaged)     │
│                     realityworks.com (prod, CustomerManaged)      │
│  Client:           @azure/communication-email EmailClient        │
│                     (src/mail/mail.service.ts)                    │
└─────────────────────────────────────────────────────────────────┘
```

## Platform Integration

The Educator App Backend is part of the larger **Realityworks AI Healthcare Simulation Platform**. It serves as the management layer for educators, classes, and students, while integrating with the student-facing simulation system.

### Platform Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                              REALITYWORKS AI PLATFORM                                        │
│                                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────────────────────┐  │
│  │                        STUDENT-FACING SIMULATION LAYER                                 │  │
│  │                                                                                        │  │
│  │  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐                    │  │
│  │  │  HS-online-AI   │    │    SARI-Web     │    │   Gen-LLM       │                    │  │
│  │  │  (Simulation)   │◄──►│  (Speech AI)    │◄──►│  (vLLM Server)  │                    │  │
│  │  │                 │    │                 │    │                 │                    │  │
│  │  │  Next.js + Nest │    │  WebSocket +    │    │  Llama 3.1 8B   │                    │  │
│  │  │  Patient convos │    │  RC4 crypto     │    │  + Guardrails   │                    │  │
│  │  │  Avatar embed   │    │                 │    │  A100 GPU       │                    │  │
│  │  └────────┬────────┘    └────────┬────────┘    └─────────────────┘                    │  │
│  │           │                      │                                                     │  │
│  │           │ EDUCATOR_BASE_URL    ▼                                                     │  │
│  │           │ (calls this API)    ┌─────────────────┐    ┌─────────────────┐            │  │
│  │           │                     │   Whisper-En    │    │ Realityworks-   │            │  │
│  │           │                     │  Speech-to-Text │    │    Avatar       │            │  │
│  │           │                     │  T4 GPU + VAD   │    │  Unreal PS 5.6  │            │  │
│  │           │                     └─────────────────┘    └─────────────────┘            │  │
│  └───────────┼───────────────────────────────────────────────────────────────────────────┘  │
│              │                                                                              │
│              │ writes reports.json                                                          │
│              ▼                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────────────────────┐  │
│  │                          SHARED DATA LAYER (Azure Blob)                                │  │
│  │                                                                                        │  │
│  │   Storage Account: asa{env}rwai                  Container: json-data                 │  │
│  │   ┌─────────────────────────────────────────────────────────────────────────────────┐ │  │
│  │   │  units.json        scenarios.json        reports.json        transcripts.json   │ │  │
│  │   └─────────────────────────────────────────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────────────────────────────────────────┘  │
│              ▲                                                                              │
│              │ seeders import units / scenarios / transcripts into Postgres                 │
│              │                                                                              │
│  ┌───────────┴───────────────────────────────────────────────────────────────────────────┐  │
│  │                        EDUCATOR MANAGEMENT LAYER                                       │  │
│  │                                                                                        │  │
│  │  ┌─────────────────────────────────────────────────────────────────────────────────┐  │  │
│  │  │                  Educator-App-Backend (THIS REPO)                                │  │  │
│  │  │                                                                                  │  │  │
│  │  │   ┌─────────────────────────┐    ┌─────────────────────────────────────────┐    │  │  │
│  │  │   │  Database seeders       │    │      PostgreSQL (per-env)               │    │  │  │
│  │  │   │  import shared blob:    │    │      psql-{env}1-rwai-edu              │    │  │  │
│  │  │   │  - units.json           │    │                                         │    │  │  │
│  │  │   │  - scenarios.json       │    │   ┌─────────────────────────────────┐   │    │  │  │
│  │  │   │  - transcripts.json     │    │   │ educators | classes | students  │   │    │  │  │
│  │  │   └─────────────────────────┘    │   │ simulations | invites | schools │   │    │  │  │
│  │  │                                  │   └─────────────────────────────────┘   │    │  │  │
│  │  │   ┌─────────────────────────┐    └─────────────────────────────────────────┘    │  │  │
│  │  │   │  REST API Modules       │                                                   │  │  │
│  │  │   │  - /auth (JWT)          │    ┌─────────────────────────────────────────┐    │  │  │
│  │  │   │  - /educators           │    │    Educator-App-Realityworks            │    │  │  │
│  │  │   │  - /classes             │◄───│    (React + Vite Frontend)              │    │  │  │
│  │  │   │  - /students            │    │                                         │    │  │  │
│  │  │   │  - /simulation-catalog  │    │    educator.realityworksai.com          │    │  │  │
│  │  │   │  - /simulation-reports  │    └─────────────────────────────────────────┘    │  │  │
│  │  │   └─────────────────────────┘                                                   │  │  │
│  │  └─────────────────────────────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Related Repositories

| Repository | Purpose | Integration Point |
|------------|---------|-------------------|
| [HS-online-AI-app](https://github.com/Realityworks-AI/HS-online-AI-app) | Healthcare simulation (student-facing) | Writes `reports.json` to shared blob; calls `EDUCATOR_BASE_URL` API |
| [Educator-App-Realityworks](https://github.com/Realityworks-AI/Educator-App-Realityworks) | Educator portal frontend | Calls this backend's REST API |
| [SARI-Web](https://github.com/Realityworks-AI/SARI-Web) | Real-time speech AI server | Used by HS-online-AI-app (indirect) |
| [Whisper-En](https://github.com/Realityworks-AI/Whisper-En) | Speech-to-text service | Used by SARI-Web (indirect) |
| [Gen-LLM](https://github.com/Realityworks-AI/Gen-LLM) | vLLM inference server | Used by SARI-Web (indirect) |
| [Realityworks-Avatar](https://github.com/Realityworks-AI/Realityworks-Avatar) | 3D patient avatar | Used by HS-online-AI-app (indirect) |

### Data Flow

```
┌──────────────────┐    assigns simulation     ┌──────────────────┐
│  Educator Portal │ ─────────────────────────▶│  This Backend    │
│  (Frontend)      │                           │  (PostgreSQL)    │
└──────────────────┘                           └────────┬─────────┘
                                                        │
                                                        │ stores class/student/
                                                        │ simulation assignment
                                                        ▼
┌──────────────────┐    EDUCATOR_BASE_URL      ┌──────────────────┐
│  HS-online-AI    │ ◄─────────────────────────│  This Backend    │
│  (Simulation)    │    /api/students/:code    │  (API response)  │
└────────┬─────────┘                           └──────────────────┘
         │
         │ student completes simulation
         │ posts report to /students-backend
         ▼
┌──────────────────┐    SimulationReport       ┌──────────────────┐
│  PostgreSQL      │ ◄─────────────────────────│  This Backend    │
│  simulation_     │    Repository             │  (API response)  │
│  reports         │                           └────────┬─────────┘
└──────────────────┘                                    │
                                                        │
                                                        │ returns reports to
                                                        ▼
                                               ┌──────────────────┐
                                               │  Educator Portal │
                                               │  (Report View)   │
                                               └──────────────────┘
```

### Shared Infrastructure

| Resource | Naming Pattern | Educator-Specific | Shared with HS-online-AI |
|----------|---------------|-------------------|-------------------------|
| Resource Group | `ARG-{env}1-rwai` | ❌ (shared RG) | ✅ Same RG |
| Key Vault | `akv{env}1rwai` | ❌ (shared KV) | ✅ Same KV |
| Storage Account | `asa{env}rwai` | ❌ (shared) | ✅ Same storage |
| Blob Container | `json-data` | ❌ (shared) | ✅ Same container |
| Blob Container | `profile-pictures` | ✅ Educator-only | ❌ |
| Blob Container | `voice-profiles` | ✅ Educator-only (created by the backend; the audio worker reads it) | ❌ |
| PostgreSQL | `psql-{env}1-rwai-edu` | ✅ Educator-only | ❌ (separate DB) |
| ACR | `acrall1rwai` | ✅ Shared | ✅ Same registry |

### Key Integration Services

#### Blob data import

The app no longer reads the shared `json-data` container at runtime. Simulation content
(`units.json`, `scenarios.json`), transcripts and sales-order lines are imported into Postgres
by the seeders in `src/database/seeders/`; student reports are written to and read from the
`simulation_reports` table via `SimulationReportRepository`.

**Environment Variables** (used by the seeders):
| Variable | Description | Example |
|----------|-------------|---------|
| `AZURE_STORAGE_CONNECTION_STRING` | Shared storage account | (from Key Vault) |
| `AZURE_BLOB_CONTAINER_NAME` | Container name | `json-data` |

#### Blob Data Protection

The shared storage accounts (`asaqarwai` for dev/qa, `asaprodrwai` for prod) have account-level data protection enabled. These settings cover every container (`json-data`, `profile-pictures`, `rwai-data-files`, `edu-uploads`, `voice-profiles`) and apply to both this backend and HS-online-AI-app.

| Setting | dev + qa | prod |
|---|---|---|
| Versioning | enabled | enabled |
| Blob soft-delete | 30 days | 90 days |
| Container soft-delete | 30 days | 90 days |
| Change feed | 14 days | 30 days |
| Point-in-Time Restore | 14 days | 30 days |

**Owner**: these settings are codified in [`HS-online-AI-app/azure_storage_blob_docs/Deploy-blob.ps1`](https://github.com/Realityworks-AI/HS-online-AI-app/blob/dev/azure_storage_blob_docs/Deploy-blob.ps1). The Educator-App-Backend Bicep references the storage account as `existing` and does not own its configuration.

**Restore procedures**: see the [Blob Data Restore Runbook](https://github.com/Realityworks-AI/HS-online-AI-app/blob/dev/docs/RUNBOOK.md#blob-data-restore-runbook) for step-by-step examples (undelete a blob, restore a prior version, restore a deleted container, point-in-time restore, change-feed forensics).

**Note**: dev and qa share the same storage account (`asaqarwai`), so a Point-in-Time Restore against qa will also roll dev back to that same point in time.

#### Voice profiles (patient TTS reference audio)

Admins (scenario admin role) upload a reference recording per voice at `POST /api/voice-profiles`;
the audio worker clones the patient's speech from it. The reference clip lives in the
`voice-profiles` blob container at `voices/<voiceProfileId>/voice.wav`.

- **Upload vs stored length**: an upload must be 5-30 s (WAV, MP3, M4A/MP4, Ogg, WebM or FLAC, max
  20 MB). The backend identifies the container from the file's magic bytes (the client's MIME type
  is not trusted), then ffmpeg trims the ends, normalises loudness and resamples to 24 kHz mono
  16-bit WAV, and the **stored clip is cut to 10 s** (`VoiceProfileConstants.AUDIO.OUTPUT_MAX_S`).
- **Container**: created by the backend on first upload (`createIfNotExists`). DevOps does not
  provision it; they only need to grant the audio worker read access to it.
- **Storage account**: dev and qa share `asaqarwai`, so they also share the `voice-profiles`
  container (blob paths are per-profile UUIDs and do not collide). Prod uses `asaprodrwai`.
- **Scenario voice**: `voiceProfileId` on a scenario must be an active profile (400 otherwise). A
  profile cannot be retired while a scenario uses it, and the check and the write are serialised
  with row locks, so a concurrent assignment cannot slip past a retire.
- **Reads**: the authenticated scenario reads return the resolved `voiceProfile`. The public share
  link, `GET /api/simulations/:scenarioId/public`, deliberately returns neither `voiceProfile` nor
  `voiceProfileId`.

#### HS-online-AI-app → Educator API

HS-online-AI-app calls this backend to validate student access codes and fetch class/simulation data:

**HS-online-AI Environment Variable**:
```
EDUCATOR_BASE_URL=https://dev.educatorbe.realityworksai.com/api
```

**API Endpoints Called**:
- `GET /students/code/:code` - Validate student access code
- `GET /simulation-catalog` - Fetch available simulations

## Component Details

### 1. NestJS Backend Service

**Container App**: `aca-{env}1-rwai-eduback`

**Key Responsibilities**:
- REST API for Educator App (port 3000)
- Authentication & Authorization (JWT)
- Business logic (classes, students, educators, simulations)
- Database transaction management
- Health checks (`GET /health`)

**Docker Image**:
```
acrall1rwai.azurecr.io/educator-backend:abc1234-{env}-latest
├─ 7-character git SHA (short form of commit)
├─ Environment suffix (dev/qa/prod)
└─ Latest tag for environment
```

**Environment Variables** (declared in `infra/modules/containerApp-backend.bicep`, sourced from Key Vault):
```
APP_PORT=3000
DB_HOST=psql-{env}1-rwai-edu.postgres.database.azure.com
DB_PORT=5432
DB_USERNAME=educator_admin
DB_NAME=educator_{env}
NODE_ENV={env}
DB_PASSWORD=secretref:db-password   # Key Vault reference via system MI
```

All env vars (plain and secret-backed) are declared in Bicep and reconciled on every deploy via `az deployment group create -t infra/app-deploy.bicep`. The Container App's system-assigned managed identity pulls secret values from the shared per-env Key Vault `akv{env}1rwai` using the `edu-*` secret-name prefix.

**Health Endpoint**:
```
GET /health → { status: "ok", timestamp: "..." }
```

Used by:
- Container App liveness probe (every 30s, timeout 3s)
- Manual monitoring via: `curl https://{FQDN}/health`

### 2. Azure PostgreSQL Database

**Server**: `psql-{env}1-rwai-edu.postgres.database.azure.com`

**Database**: `educator_{env}`

**Version**: PostgreSQL 17 Flexible Server

**Key Characteristics**:
- Managed service (Azure handles patching, backups, HA)
- Automatic backups (7-day retention, with PITR)
- SSL connections required (except dev for easier local testing)
- Admin user: `educator_admin`
- Per-environment isolation (no shared data between dev/qa/prod)

**Schema** (9 migrations):
```
1. roles ────────────────┐
                         ├─→ users
2. users ────────────────┤   ├── educators
                         ├─→ educators
3. schools              │    ├── classes
4. educators ───────────┤    └── invites
5. classes ─────────────┤
6. students ────────────┤
7. invites ─────────────┤
8. products ────────────┤
9. simulations ──────────┘
```

**Roles Seeded**:
- District Admin (full system access)
- Educator (classroom management, student sim assignments)

**UUID Generation**:
- Type: `uuid` (PostgreSQL native type)
- Generation: Application-side via `@Generated('uuid')` in TypeORM, OR DB-side via `uuid_generate_v4()` from `uuid-ossp`
- Extension: `uuid-ossp` is enabled via the `azure.extensions` server parameter (declared in `infra/modules/postgres.bicep`). After server creation, run `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";` once per database (TypeORM migrations handle this).

### 3. Azure Key Vault

**Per-environment (shared with HS-Online-AI)**:
- Dev: `akvdev1rwai`
- QA: `akvqa1rwai`
- Prod: `akvprod1rwai`

Educator secrets live alongside HS-Online-AI secrets in the same per-env vault, disambiguated by the **`edu-` prefix** on the secret name.

**Educator secrets (written by `infra/modules/keyVaultSecrets.bicep`)**:
```
edu-db-host
edu-db-port
edu-db-name
edu-db-username
edu-db-password                          ← sensitive (empty preserves existing)
edu-node-env
edu-app-port
edu-jwt-secret                           ← sensitive (empty preserves existing)
edu-jwt-expires-in
edu-mail-from                            ← dev.rwai.curionn.com (dev) / qa.rwai.curionn.com (qa) / realityworks.com (prod)
edu-azure-storage-account                ← empty-allowed
edu-azure-storage-container              ← empty-allowed
edu-azure-storage-connection-string      ← sensitive (empty preserves existing)
edu-app-url                              ← empty-allowed
edu-frontend-url                         ← empty-allowed
edu-vite-api-url                         ← empty-allowed
```

See [KEY-VAULT-VARS.md](./KEY-VAULT-VARS.md) for the full catalog.

**Access Control**:
- Role: `Key Vault Secrets User` (read-only) — granted to the Container App's system-assigned managed identity by `infra/modules/containerApp-backend.bicep`.
- Bicep authoring of secrets: caller (interactive user or SP running `provision`) needs `Key Vault Secrets Officer`.
- Authentication: OIDC (GitHub Actions) or managed identity (Container App).

### 4. Azure Container Registry

**Name**: `acrall1rwai` (shared across all environments)

**Architecture**:
- Single registry for cost optimization
- Images tagged by environment (dev/qa/prod suffix)
- Cleanup policies to remove old images

**Image Naming**:
```
acrall1rwai.azurecr.io/educator-backend:abc1234-dev-latest
                      ├─ repo ──────┤  ├─ sha ─┤ ├env┤ ├latest┤
```

**Access**:
- Service Principal: `github-actions-sp` (role: AcrPush)
- Container App: Managed identity with AcrPull

## Deployment Pipeline

### GitHub Actions Workflow

**Trigger**: Push to `main`, `qa`, or `dev` branch (paths: `src/**`, `Dockerfile`, `package*.json`, `tsconfig*.json`, `infra/**`, the workflow file itself), or `workflow_dispatch`.

**Workflow File**: `.github/workflows/deploy-backend.yml`

**Steps**:

1. **Lint** (ESLint, `--max-warnings 0`) — blocks all subsequent jobs on failure.

2. **Build & push image via ACR Tasks**
   ```
   az acr build --registry acrall1rwai \
     --image educator-backend:{sha} \
     --image educator-backend:{env}-latest .
   ```
   - OIDC-authenticated (no stored credentials).
   - Tagged with full commit SHA + moving `{env}-latest`.

3. **Reconcile Container App via Bicep**
   ```
   az deployment group create \
     --resource-group ARG-{env}1-rwai \
     --template-file infra/app-deploy.bicep \
     --parameters environment={env} \
                  backendImageTag={sha} \
                  backendCustomDomain=<preserved> \
                  backendCustomDomainCertificateId=<preserved>
   ```
   - `app-deploy.bicep` is a narrow reconcile template: image + env + secrets + probes + cpu/memory + custom-domain binding.
   - Does NOT touch KV secret values, Postgres, or role assignments (those live in the full `provision` template `infra/main.bicep`).
   - Existing custom domain + cert ID are read off the live Container App and passed back so the binding survives every deploy.

4. **Health gate**: poll new revision until `healthState == Healthy` (≤ 5 min); fail otherwise.

5. **Smoke gate**: `curl --fail https://{FQDN}/health`.

6. **Teams notification** with deploy status, image SHA, lint summary, and frontend/backend URLs.

**Database migrations + seeders** run **inline at container startup** via the Dockerfile `CMD` (`npm run migration:run && npm run seed:prod && node dist/main.js`). `seed:prod` auto-discovers and runs every seeder file in `src/database/seeders/`, not just roles. There is no separate migrate job in the pipeline.

**Environment Mapping**:
| Git Branch | Environment | Container App           | Database              | Image Tag |
|-----------|-------------|-------------------------|-----------------------|-----------|
| main      | prod        | aca-prod1-rwai-eduback  | psql-prod1-rwai-edu   | `{sha}` + `prod-latest` |
| qa        | qa          | aca-qa1-rwai-eduback    | psql-qa1-rwai-edu     | `{sha}` + `qa-latest`   |
| dev       | dev         | aca-dev1-rwai-eduback   | psql-dev1-rwai-edu    | `{sha}` + `dev-latest`  |

## Authentication & Authorization

### GitHub Actions → Azure (OIDC)

**No stored credentials!** Uses federated OIDC tokens:

1. GitHub generates short-lived token (valid 5 min)
2. Token includes:
   - Repository: `Realityworks-AI/Educator-App-Backend`
   - Branch or environment context
   - GitHub token.actions.githubusercontent.com issuer
3. Azure validates token and issues access token
4. Service Principal used only for RBAC, no password stored

**Federated Credentials** (configured for):
- Branches: main, qa, dev
- Environments: prod, qa, dev
- Pull requests (for previews)

### Container App → Azure Services

**Managed Identity Flow**:
1. Container App has system-assigned managed identity
2. Identity granted roles:
   - Key Vault Secrets User (read secrets)
   - Container Registry Acrpull (pull images)
3. Application code uses Azure SDK to authenticate
4. No credentials in environment variables (SDK handles it)

## Database Migration Strategy

### TypeORM Migrations

**Location**: `src/database/migrations/`

**File Naming**: `{timestamp}-{Description}.ts`

**Example**:
```
1711431000000-CreateRolesTable.ts
1711431100000-CreateUsersTable.ts
...
1786433000000-CreateSimulationsTable.ts
```

**Execution**:

Migrations run **inline at container startup** via the Dockerfile `CMD`:
```
npm run migration:run && npm run seed:prod && node dist/main.js
```

For an ad-hoc/manual migration run (e.g. against a freshly provisioned env before first deploy):
```powershell
.\scripts\Deploy-Backend.ps1 -Environment dev -Action migrate
```
(Verb deprecated once startup-driven migrations are validated end-to-end.)

**What Happens**:
1. Connects to PostgreSQL (uses .env from Key Vault)
2. Runs migrations in order (only unexecuted ones)
3. Auto-seeds initial data (roles table)
4. Creates user accounts (District Admin, Educator)

**Idempotency**:
- TypeORM tracks executed migrations in `typeorm_metadata` table
- Running migration twice is safe (skips already-executed)

## Configuration Management

### Container Specs (declared in Bicep)

**File**: `infra/modules/containerApp-backend.bicep`

The Container App revision runs a single `backend` container per replica (the NestJS app). Redis is a separate managed Azure resource, not a container in this revision — see below.

| Environment | Backend CPU / Memory | Min replicas | Max replicas | Node heap (`--max-old-space-size`) |
|-------------|----------------------|--------------|--------------|-------------------------------------|
| dev         | 1.75 / 3.5Gi         | 0            | 1            | 3328 MB |
| qa          | 1.75 / 3.5Gi         | 0            | 2            | 3328 MB |
| prod        | 2.0 / 4.0Gi          | 1            | 8            | 3840 MB |

**Used by**: `infra/main.bicep` (full provision) and `infra/app-deploy.bicep` (per-deploy reconcile).

> **Must match a valid Consumption plan tier.** Azure Container Apps only accepts CPU/memory matching its fixed 1:2 ratio tiers (e.g. 1.75 vCPU ↔ 3.5Gi, not 3.75Gi) — see [billing docs](https://aka.ms/azure-container-apps-billing). Picking an arbitrary memory bump without also adjusting CPU to keep the ratio valid fails ARM preflight validation with `ContainerAppInvalidResourceTotal`.
>
> **Sizing history**: bumped a tier across all environments from an earlier baseline (dev 1.0/2.0Gi, qa 1.25/2.5Gi, prod 1.5/3.0Gi) after code review found unbounded-growth endpoints — `simulation-reports.service.ts`'s `findAll()`/`getMergedReports()` load the entire `simulation_reports` table plus the entire blob-based report set with no pagination, and `students.service.ts`'s bulk PDF/email generation runs `Promise.all` over a class's students with no concurrency cap. Both make heap usage scale with total data/class size rather than being fixed. This sizing bump is a **stopgap that buys headroom**, not a fix — the actual fix is pagination on the report endpoints and a concurrency limit (e.g. `p-limit`) on the bulk PDF/email path. `nodeMaxOldSpaceMB` is derived per env as `backend container memory - ~256MiB native RSS headroom`. The 0.25 vCPU / 0.5Gi that used to be carved out for the Redis sidecar (see below) has been folded back into these figures now that Redis runs as its own managed resource.

### Redis Cache (Azure Managed Redis)

Redis is a standalone **Azure Managed Redis** cluster (`Microsoft.Cache/redisEnterprise` + a `databases` child resource, in `infra/modules/redisCache.bicep`), reconciled alongside Postgres in `infra/resources.bicep`. This is the current Azure-managed Redis product — the successor to the classic "Azure Cache for Redis" (`Microsoft.Cache/redis`), which Microsoft has announced a future retirement timeline for. It replaced an earlier in-revision sidecar container (`docker.io/library/redis:7-alpine` running as a second container next to `backend`) — that approach coupled Redis's lifecycle/restarts to the Container App revision and counted against the revision's shared CPU/memory budget.

- **Naming**: `redis-{env}1-rwai-eduback` (e.g. `redis-dev1-rwai-eduback`), one per environment; the database within it is always named `default`.
- **Tier**: `Balanced_B0` for dev/qa (smallest tier); `Balanced_B1` for prod. `highAvailability: Enabled` everywhere.
- **Persistence**: none (`aofEnabled`/`rdbEnabled` both false) — matches the old sidecar's `--save "" --appendonly no`. Eviction is `AllKeysLRU`. `clusteringPolicy: NoCluster` so the existing single-endpoint `ioredis.Redis` client (not `ioredis.Cluster`) keeps working unchanged.
- **Network**: the shared Container App Environment this app deploys into is not VNet-integrated, so Private Link isn't reachable from the backend. `publicNetworkAccess: Enabled`; unlike the classic tier there's no IP-based firewall on Azure Managed Redis — access control is TLS + the access key.
- **Auth**: access-key based (`accessKeysAuthentication: 'Enabled'` on the database) — `src/redis/redis.module.ts` only supports static-password AUTH today. The primary key is written to Key Vault as `edu-redis-password` every provision, same pattern as every other credential in this repo.
- **Entra ID pre-wired for later**: `redisCache.bicep` also grants the backend's user-assigned managed identity Entra ID data-plane access via an `accessPolicyAssignments` child resource (`accessPolicyName: 'default'` — the only policy the API supports today, full data access), unused by the app for now. Moving to token-based auth later is then just an app-code change to `redis.module.ts` plus flipping `accessKeysAuthentication` to `Disabled` — no further infra rework.
- **Credentials/config wiring**: host, TLS port, and the primary key are written to Key Vault as `edu-redis-host` / `edu-redis-port` / `edu-redis-password` every provision (always-written, resource-derived — like the Postgres FQDN) and wired into the backend container via `secretRef`. `REDIS_TLS=true` is a plain (non-secret) value since the cache always enforces TLS (`clientProtocol: Encrypted`).
- **App support**: `src/redis/redis.module.ts` reads `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD`/`REDIS_TLS` via `ioredis`, unchanged from before this migration.

> `.deployment/container-spec.json` is retained transitionally as a reference but is no longer consumed by the workflow.

### Seeding Configuration

**File**: `.deployment/seeding-config.json`

```json
{
  "dev": {
    "enabled": true,
    "autoSeed": true,
    "seeders": ["roles", "users", "schools"]
  },
  "qa": {
    "enabled": true,
    "autoSeed": false,
    "seeders": ["roles"]
  },
  "prod": {
    "enabled": false,
    "autoSeed": false,
    "seeders": []
  }
}
```

**Used by**: Migration process to auto-populate initial data

## Scaling & Performance

### Auto-Scaling

Container Apps configured with HTTP-concurrency scaling (per `infra/modules/containerApp-backend.bicep`):

| Environment | Min Replicas | Max Replicas |
|-------------|--------------|--------------|
| Dev         | 0            | 1            |
| QA          | 0            | 2            |
| Prod        | 1            | 6            |

**Behavior**:
- Non-prod scales to zero on idle (no cost when unused).
- Prod always maintains ≥1 replica for HA.
- Authoritative source: `resourceMap` in `infra/modules/containerApp-backend.bicep`.

### Database Connection Pooling

**PgBouncer** (optional, not currently enabled but recommended for prod):
```
Max connections from Container App: 20 + 20*replicas
Example (prod, 2 replicas): 60 concurrent connections
```

## Security Architecture

### Network Isolation

**Current (Development)**:
- PostgreSQL firewall allows all public IPs (dev only)
- Container Apps exposed via public endpoint (with auth)

**Recommended (Production)**:
- PostgreSQL in private subnet (no public endpoint)
- Container Apps in VNet integration
- Private Link for Key Vault access
- Network security groups (NSGs) restrict traffic

### Secrets Management

**Never in**:
- ❌ Environment files (.env committed)
- ❌ Code comments
- ❌ Container image layers
- ❌ GitHub secrets (replaced by OIDC)

**Always use**:
- ✅ Key Vault for storage
- ✅ Managed Identity for access
- ✅ Azure SDK for injection

### Application-Level Security

**JWT Authentication**:
- Issued on login
- Expiration: 7 days
- Secret: Stored in Key Vault
- Verified on every request

**RBAC**:
- Roles: District Admin, Educator
- Permissions enforced via decorators
- Audit log (TODO) tracks all changes

## Monitoring & Logging

### Logs Collection

**Sources**:
- Container App stdout/stderr
- Application logs (structured JSON)
- TypeORM query logs (dev only)

**Destination**: Log Analytics Workspace `ALA-all1-rwai`

**Query Examples**:
```kusto
# Recent errors
ContainerAppConsoleLogs
| where TimeGenerated > ago(1h)
| where Log contains "ERROR"
| project TimeGenerated, Log

# Request rate
ContainerAppConsoleLogs
| summarize Count by bin(TimeGenerated, 5m)
```

### Health Checks

**Liveness Probe**:
```
GET /health every 30s
Timeout: 3s
Failure threshold: 3 consecutive fails → restart pod
```

**Readiness Probe** (TODO):
```
GET /ready
Indicates pod can accept traffic
Checks DB connection pool health
```

## Development Workflow

### Local Development

```bash
# Install dependencies
npm install

# Set environment variables
export DB_HOST=psql-dev1-rwai-edu.postgres.database.azure.com
export DB_USERNAME=sqladmin
export DB_PASSWORD=(from Key Vault or .env.local)

# Run migrations
npm run migration:run

# Start dev server
npm run start:dev
```

### Testing

```bash
# Unit tests
npm test

# E2E tests
npm run test:e2e

# Coverage
npm run test:cov
```

### Debugging

**Remote Debug Container App**:
```powershell
# Get logs
az containerapp logs show --name aca-dev1-rwai-eduback --resource-group ARG-dev1-rwai --follow

# SSH into container (if enabled)
az containerapp exec --name aca-dev1-rwai-eduback --resource-group ARG-dev1-rwai
```

## Cost Optimization

### Current Architecture

| Component | Environment | Monthly Cost | Notes |
|-----------|-------------|--------------|-------|
| Container Apps | Dev | ~$15 | 0.5 CPU, 1Gi |
| Container Apps | QA | ~$30 | 1 CPU, 2Gi |
| Container Apps | Prod | ~$60 | 2 CPU, 4Gi |
| PostgreSQL | Dev | ~$15 | Flexible Server, small |
| PostgreSQL | QA | ~$30 | Flexible Server, medium |
| PostgreSQL | Prod | ~$60 | Flexible Server, large |
| Key Vault | (shared) | ~$1 | 3 vaults @ $0.33 each |
| Container Registry | (shared) | ~$5 | Standard tier |
| Log Analytics | (shared) | ~$20 | 1GB/day ingestion |
| **Total** | | **~$246/mo** | All environments |

### Cost Saving Strategies

1. **Use shared resources**: ACR, Log Analytics (already done)
2. **Environment isolation**: Separate DBs reduce blast radius vs cost
3. **Auto-scaling limits**: Prevents runaway costs from scale-up
4. **Reserved instances** (✗ not available for Container Apps yet)
5. **Dev environment reduction**: Run dev on shared smaller VM (future)

## Disaster Recovery

### Backup Strategy

**PostgreSQL**:
- Automatic backups: 7-day retention
- PITR (Point-In-Time Restore): 4 weeks
- Manual backups: Can trigger via Azure CLI

**Container Images**:
- Retained in ACR for 90 days
- Can redeploy old image if needed

### Recovery Procedures

**Container App Rollback**:
```powershell
# List recent images
az acr repository show-tags --name acrall1rwai --repository educator-backend

# Redeploy specific image
az containerapp update \
  --image acrall1rwai.azurecr.io/educator-backend:old-sha-dev-latest
```

**Database Restore**:
```powershell
# Restore to specific point in time
az postgres flexible-server restore \
  --source-server psql-dev1-rwai-edu \
  --restore-time "2024-04-22 10:00:00"
```

## Future Enhancements

- [ ] Private endpoint for PostgreSQL (security)
- [ ] VNet integration for Container Apps
- [ ] Multi-region failover (prod only)
- [ ] API Gateway rate limiting
- [ ] Advanced monitoring (Application Insights)
- [ ] CI/CD for database migrations (policy enforcement)
- [ ] Automated scaling based on custom metrics
- [ ] Blue/green deployments (canary testing)

## See Also

- [Deployment Guide](./DEPLOYMENT.md)
- [CI/CD Features](./CI-CD-FEATURES.md)
- [Frontend Architecture](https://github.com/Realityworks-AI/Educator-App-Realityworks/blob/main/docs/ARCHITECTURE.md)
- [HS-online-AI-app Architecture](https://github.com/Realityworks-AI/HS-online-AI-app/blob/main/docs/ARCHITECTURE.md)
- [SARI-Web README](https://github.com/Realityworks-AI/SARI-Web/blob/master/README.md)
- [Whisper-En Architecture](https://github.com/Realityworks-AI/Whisper-En/blob/main/docs/ARCHITECTURE.md)
- [Gen-LLM Architecture](https://github.com/Realityworks-AI/Gen-LLM/blob/master/docs/ARCHITECTURE.md)
- [Avatar Deployment](https://github.com/Realityworks-AI/Realityworks-Avatar/blob/main/docs/DEPLOYMENT.md)
