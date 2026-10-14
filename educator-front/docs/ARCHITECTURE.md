# Educator App - Frontend Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        GitHub (CI/CD)                           │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Repository: Realityworks-AI/Educator-App-Realityworks  │   │
│  │  Branches: main (prod) | qa | dev                       │   │
│  │  Workflow: Lint → Build → Deploy to SWA                 │   │
│  └─────────────────────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────────────────────┘
                       │ (push to branch)
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│                  GitHub Actions Runner                           │
│  • ESLint check (--max-warnings 0)                              │
│  • npm ci + npm run build                                        │
│  • VITE_API_URL injected at build time                          │
│  • Artifact upload to SWA                                        │
└──────────────────────┬──────────────────────────────────────────┘
                       │ (deploy)
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│              Azure Static Web Apps (per-environment)             │
│  ─────────────────────────────────────────────────              │
│  • Dev:  swa-dev1-rwai-edufront  → dev.educator.realityworksai.com  │
│  • QA:   swa-qa1-rwai-edufront   → qa.educator.realityworksai.com   │
│  • Prod: swa-prod1-rwai-edufront → educator.realityworksai.com      │
│                                                                  │
│  Features:                                                       │
│  • Global CDN distribution                                       │
│  • Managed SSL certificates (auto-renewed)                       │
│  • Custom domain support (CNAME delegation)                      │
│  • Automatic HTTPS redirect                                      │
└──────────────────────┬──────────────────────────────────────────┘
                       │ (API calls)
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│              Azure Container Apps (Backend API)                  │
│  ─────────────────────────────────────────────────              │
│  • Dev:  aca-dev1-rwai-eduback  → dev.educatorbe.realityworksai.com │
│  • QA:   aca-qa1-rwai-eduback   → qa.educatorbe.realityworksai.com  │
│  • Prod: aca-prod1-rwai-eduback → educatorbe.realityworksai.com     │
└─────────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. Vite + React + TypeScript Frontend

**Stack**:

- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite 5
- **Styling**: Tailwind CSS + shadcn/ui components
- **State Management**: Redux Toolkit + RTK Query
- **Routing**: React Router v6

**Key Features**:

- Educator dashboard with class/student management
- Simulation catalog and assignment workflows
- Real-time data via API polling
- Responsive design (mobile-first)

**Build Output**:

```
dist/
├── index.html
├── assets/
│   ├── index-[hash].js      # Main bundle
│   ├── index-[hash].css     # Compiled Tailwind
│   └── [chunk]-[hash].js    # Code-split chunks
└── staticwebapp.config.json # SWA routing rules
```

### 2. Environment Configuration

**Build-Time Variables** (embedded in bundle):

| Variable       | Dev                                         | QA                                         | Prod                                    |
| -------------- | ------------------------------------------- | ------------------------------------------ | --------------------------------------- |
| `VITE_API_URL` | `https://dev.educatorbe.realityworksai.com` | `https://qa.educatorbe.realityworksai.com` | `https://educatorbe.realityworksai.com` |

**Usage in Code**:

```typescript
const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const api = axios.create({ baseURL: apiUrl });
```

**Local Development** (`.env`):

```
VITE_API_URL=http://localhost:3000
```

### 3. Azure Static Web Apps

**Resource Names**:

| Environment | SWA Name                  | Custom Domain                     |
| ----------- | ------------------------- | --------------------------------- |
| Dev         | `swa-dev1-rwai-edufront`  | `dev.educator.realityworksai.com` |
| QA          | `swa-qa1-rwai-edufront`   | `qa.educator.realityworksai.com`  |
| Prod        | `swa-prod1-rwai-edufront` | `educator.realityworksai.com`     |

**SWA Configuration** (`public/staticwebapp.config.json`):

```json
{
  "navigationFallback": {
    "rewrite": "/index.html",
    "exclude": ["/assets/*", "/*.ico", "/*.png", "/*.svg"]
  },
  "globalHeaders": {
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff"
  }
}
```

**Features**:

- **CDN**: Global edge caching for static assets
- **SSL**: Managed certificates (auto-provisioned via CNAME delegation)
- **Routing**: SPA fallback to `index.html` for client-side routing
- **Headers**: Security headers applied globally

### 4. Project Structure

```
src/
├── assets/              # Static assets (images, icons)
├── components/
│   ├── common/          # Shared UI components
│   ├── dashboard/       # Dashboard-specific components
│   ├── layout/          # App layout (sidebar, header)
│   ├── modal/           # Modal dialogs
│   ├── simulation/      # Simulation catalog/assignment
│   └── ui/              # shadcn/ui primitives
├── hooks/               # Custom React hooks
├── lib/                 # Utility functions
├── pages/
│   ├── app/             # Main app routes
│   ├── auth/            # Login/logout pages
│   ├── class/           # Class management
│   ├── dashboard/       # Dashboard views
│   ├── educator/        # Educator management
│   └── Simulation/      # Simulation views
├── redux/               # Redux store, slices, API
├── routes/              # Route definitions
├── services/            # API service layer
├── store/               # Redux store config
├── types/               # TypeScript type definitions
└── utils/               # Helper utilities
```

## Deployment Pipeline

### GitHub Actions Workflow

**File**: `.github/workflows/deploy-frontend.yml`

**Trigger**: Push to `dev`, `qa`, or `main` branches

**Pipeline**:

```
push → lint → build → deploy
```

| Job             | Purpose                                       | Dependencies      |
| --------------- | --------------------------------------------- | ----------------- |
| `lint`          | ESLint + Prettier check                       | -                 |
| `build`         | npm ci, VITE_API_URL injection, npm run build | `lint`            |
| `qa-checkpoint` | QA instructions (informational)               | `build` (qa only) |
| `deploy`        | Upload to matching SWA                        | `build`           |

**Gating**: If `lint` fails, `build` is skipped → `deploy` is skipped.

### Authentication

**Deployment Tokens** (per-environment GitHub secrets):

| Secret                                 | SWA                       |
| -------------------------------------- | ------------------------- |
| `AZURE_STATIC_WEB_APPS_API_TOKEN_DEV`  | `swa-dev1-rwai-edufront`  |
| `AZURE_STATIC_WEB_APPS_API_TOKEN_QA`   | `swa-qa1-rwai-edufront`   |
| `AZURE_STATIC_WEB_APPS_API_TOKEN_PROD` | `swa-prod1-rwai-edufront` |

### Promotion Flow

```
feature → dev     → Dev SWA       (rapid iteration)
dev → qa          → QA SWA        (PR review, manual QA)
qa → main         → Prod SWA      (PR review + QA sign-off)
```

## Platform Integration

The Educator App is part of the larger **Realityworks AI Healthcare Simulation Platform**. This section describes how the Educator frontend integrates with other platform components.

### Platform Overview

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                              REALITYWORKS AI PLATFORM                                        │
│                                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────────────────────┐  │
│  │                        STUDENT-FACING SIMULATION LAYER                                 │  │
│  │                                                                                        │  │
│  │  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐                    │  │
│  │  │  HS-online-AI   │    │    SARI-Web     │    │   Gen-LLM       │                    │  │
│  │  │  (Simulation)   │◄──►│  (Speech AI)    │◄──►│  (vLLM API)     │                    │  │
│  │  │                 │    │                 │    │                 │                    │  │
│  │  │  - Next.js UI   │    │  - WebSocket    │    │  - Guardrails   │                    │  │
│  │  │  - Avatar embed │    │  - RC4 stream   │    │  - Llama 3.1    │                    │  │
│  │  │  - OpenAI API   │    │                 │    │  - A100 GPU     │                    │  │
│  │  └────────┬────────┘    └────────┬────────┘    └─────────────────┘                    │  │
│  │           │                      │                                                     │  │
│  │           │                      ▼                                                     │  │
│  │           │             ┌─────────────────┐    ┌─────────────────┐                    │  │
│  │           │             │   Whisper-En    │    │ Realityworks-   │                    │  │
│  │           │             │  (Speech-to-    │    │    Avatar       │                    │  │
│  │           │             │   Text)         │    │  (Unreal PS)    │                    │  │
│  │           │             │                 │    │                 │                    │  │
│  │           │             │  - T4 GPU       │    │  - 3D Patient   │                    │  │
│  │           │             │  - VAD + Intent │    │  - Lip sync     │                    │  │
│  │           │             └─────────────────┘    └─────────────────┘                    │  │
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
│              │ reads simulation data + reports                                              │
│              │                                                                              │
│  ┌───────────┴───────────────────────────────────────────────────────────────────────────┐  │
│  │                        EDUCATOR MANAGEMENT LAYER                                       │  │
│  │                                                                                        │  │
│  │  ┌─────────────────────────────────────┐    ┌─────────────────────────────────────┐   │  │
│  │  │  Educator-App-Realityworks          │    │   Educator-App-Backend              │   │  │
│  │  │  (THIS REPO - Frontend)             │◄──►│                                     │   │  │
│  │  │                                     │    │   - NestJS REST API                 │   │  │
│  │  │  - React + Vite                     │    │   - PostgreSQL (educator data)      │   │  │
│  │  │  - Class/student mgmt               │    │   - TutorPatientService (blob read) │   │  │
│  │  │  - Simulation catalog               │    │   - JWT auth                        │   │  │
│  │  │  - Report viewer                    │    │                                     │   │  │
│  │  └─────────────────────────────────────┘    └─────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Related Repositories

| Repository                                                                      | Purpose                                | Integration Point                                                             |
| ------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------- |
| [HS-online-AI-app](https://github.com/Realityworks-AI/HS-online-AI-app)         | Healthcare simulation (student-facing) | Writes `reports.json` to shared blob; reads `EDUCATOR_BASE_URL` for API calls |
| [Educator-App-Backend](https://github.com/Realityworks-AI/Educator-App-Backend) | Educator REST API                      | Direct API calls from this frontend                                           |
| [SARI-Web](https://github.com/Realityworks-AI/SARI-Web)                         | Real-time speech AI server             | Used by HS-online-AI-app (not direct)                                         |
| [Whisper-En](https://github.com/Realityworks-AI/Whisper-En)                     | Speech-to-text service                 | Used by SARI-Web (not direct)                                                 |
| [Gen-LLM](https://github.com/Realityworks-AI/Gen-LLM)                           | vLLM inference server                  | Used by SARI-Web (not direct)                                                 |
| [Realityworks-Avatar](https://github.com/Realityworks-AI/Realityworks-Avatar)   | 3D patient avatar                      | Used by HS-online-AI-app (not direct)                                         |

### Data Flow

1. **Simulation Catalog**: Backend reads `units.json` and `scenarios.json` from shared Azure Blob Storage and presents them in the Simulation Catalog UI
2. **Simulation Assignment**: Educators assign simulations to students via this frontend → Backend stores assignment in PostgreSQL
3. **Student Simulation**: Students run simulations in HS-online-AI-app → Reports written to `reports.json` in blob
4. **Report Viewing**: Backend reads `reports.json` from blob → Frontend displays student performance reports

### Shared Infrastructure

| Resource        | Pattern           | Example                                     |
| --------------- | ----------------- | ------------------------------------------- |
| Resource Group  | `ARG-{env}1-rwai` | `ARG-dev1-rwai`                             |
| Key Vault       | `akv{env}1rwai`   | `akvdev1rwai`                               |
| Storage Account | `asa{env}rwai`    | `asadevrwai`                                |
| Blob Container  | `json-data`       | Shared across HS-online-AI-app and Educator |

**Note**: The Educator App uses a **separate** database (`apg-{env}-edu`) but **shares** blob storage with HS-online-AI-app for simulation content and reports.

## Integration Points

### Backend API

All API calls go through the Educator backend:

- Authentication (JWT tokens)
- Class/student/educator CRUD
- Simulation catalog (fetched from shared blob)
- Simulation assignments
- Reports and analytics (fetched from shared blob)

**CORS**: Backend allows requests from all SWA custom domains.

### External Services (via Backend)

- **Microsoft Graph**: Email notifications (handled by backend)
- **Azure Blob Storage (json-data)**: Simulation content and student reports (shared with HS-online-AI-app)
- **Azure Blob Storage (profile-pictures)**: Educator profile image uploads

## Monitoring & Observability

### Current State

- **Build logs**: GitHub Actions workflow output
- **Deployment status**: SWA deployment history in Azure Portal

### Planned

- Application Insights integration
- Client-side error tracking
- Performance metrics (Core Web Vitals)

## Security

### Headers (via `staticwebapp.config.json`)

- `X-Frame-Options: DENY` - Clickjacking protection
- `X-Content-Type-Options: nosniff` - MIME sniffing prevention
- HTTPS enforced (SWA default)

### Authentication

- JWT tokens stored in localStorage
- Token refresh handled by API interceptors
- Automatic redirect to login on 401

## See Also

- [Deployment Guide](./DEPLOYMENT.md)
- [CI/CD Features](./CI-CD-FEATURES.md)
- [Backend Architecture](https://github.com/Realityworks-AI/Educator-App-Backend/blob/main/docs/ARCHITECTURE.md)
- [HS-online-AI-app Architecture](https://github.com/Realityworks-AI/HS-online-AI-app/blob/main/docs/ARCHITECTURE.md)
