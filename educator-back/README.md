# Educator App — Backend

NestJS REST API for the Educator App, deployed to Azure Container Apps with PostgreSQL Flexible Server.

## Quick start (local)

```bash
pnpm install
cp .env.example .env   # then fill in DB_* and JWT_SECRET
pnpm run migration:run
pnpm run start:dev
```

API runs on `http://localhost:3000`. Health check: `GET /health`.

## Tests

```bash
pnpm test           # unit
pnpm run test:e2e   # e2e
pnpm run test:cov   # coverage
```

## Deployment

All Azure provisioning, DNS, migrations, and ops are driven by [`scripts/Deploy-Backend.ps1`](./scripts/Deploy-Backend.ps1). CI/CD lives in [`.github/workflows/deploy-backend.yml`](./.github/workflows/deploy-backend.yml).

See [**docs/DEPLOYMENT.md**](./docs/DEPLOYMENT.md) for the full guide and [**docs/ARCHITECTURE.md**](./docs/ARCHITECTURE.md) for the system diagram.

Quick ref:

```powershell
# One time per environment
./scripts/Deploy-Backend.ps1 -Environment dev -Action provision
./scripts/Deploy-Backend.ps1 -Environment dev -Action dns -UsePorkbunDNS
./scripts/Deploy-Backend.ps1 -Environment dev -Action migrate

# Every change
git push origin dev   # workflow builds, pushes to ACR, updates Container App
```

## Environments

| Branch | Env  | Container App         | Database         | URL                                         |
|--------|------|-----------------------|------------------|---------------------------------------------|
| `dev`  | dev  | `aca-dev1-edu-back`   | `educator_dev`   | https://dev.educatorbe.realityworksai.com   |
| `qa`   | qa   | `aca-qa1-edu-back`    | `educator_qa`    | https://qa.educatorbe.realityworksai.com    |
| `main` | prod | `aca-prod1-edu-back`  | `educator_prod`  | https://educatorbe.realityworksai.com       |
