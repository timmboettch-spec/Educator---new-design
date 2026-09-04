# Educator App — Frontend

Vite + React + TypeScript frontend for the Educator App, deployed to Azure Static Web Apps.

## Quick start (local)

```bash
pnpm install
pnpm run dev
```

Runs on http://localhost:5173 and expects the backend at http://localhost:3000 (override via `VITE_API_URL` in `.env`).

## Build

```bash
pnpm run build      # → dist/
pnpm run preview    # serve dist/ locally
```

## Lint

```bash
pnpm run lint
```

## Deployment

All Azure provisioning, DNS, and managed-cert binding live in [`scripts/Deploy-EducatorApp.ps1`](./scripts/Deploy-EducatorApp.ps1). CI/CD lives in [`.github/workflows/deploy-frontend.yml`](./.github/workflows/deploy-frontend.yml).

See [**docs/DEPLOYMENT.md**](./docs/DEPLOYMENT.md) for the full guide.

Quick ref:

```powershell
# One time per environment
./scripts/Deploy-EducatorApp.ps1 -Environment dev -Action provision
./scripts/Deploy-EducatorApp.ps1 -Environment dev -Action dns -UsePorkbunDNS

# Every change
git push origin development     # → dev SWA
git push origin qualityassurance # → qa SWA
git push origin main            # → prod SWA
```

## Environments

| Branch             | Env  | URL                                     |
| ------------------ | ---- | --------------------------------------- |
| `development`      | dev  | https://dev.educator.realityworksai.com |
| `qualityassurance` | qa   | https://qa.educator.realityworksai.com  |
| `main`             | prod | https://educator.realityworksai.com     |

## Tech

React 19, Vite, TypeScript, Tailwind, Redux Toolkit, React Router. See [`package.json`](./package.json) for the full dependency list.
