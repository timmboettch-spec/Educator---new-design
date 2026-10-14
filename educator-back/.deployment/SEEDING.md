# Database Seeding Strategy

This document explains the database seeding approach for different environments. The actual configuration is defined in `.deployment/seeding-config.json` which is read by the deployment script.

## Overview

Database seeding is the process of populating the database with initial required data after migrations. Today that's just roles; the mechanism is generic so future essential-data seeders (see the safety note below) are picked up automatically.

## How seeding actually runs

`npm run seed:prod` (containers/CI, compiled) and `npm run seed:local`
(local dev, ts-node) both run `src/database/seeders/index.ts`, which:

1. Scans `src/database/seeders/` for every `*.seeder.js` (or `.ts` under
   `seed:local`) file.
2. Imports each one and expects a **default export** with the signature
   `(dataSource: DataSource) => Promise<void>`.
3. Runs them **sequentially**, in filename-sorted order, sharing one
   `DataSource` connection that `index.ts` initializes before the first
   seeder and destroys after the last one.
4. If one seeder throws, the error is logged and the remaining seeders still
   run — one broken seeder doesn't block the others or block the app from
   starting.

Adding a new seeder is now just "drop a file in the directory" — there is
**no npm script to add and no config file to register it in**. See
"Creating New Seeders" below.

## ⚠️ Safety convention: this directory always runs in every environment

`seed:prod` is what the Dockerfile `CMD` calls on **every** boot, in
**every** environment (dev/qa/prod all run the same image) — there is no
per-environment allow-list of *which* seeder files execute anymore. Only
`role.seeder.ts` exists today, and it only inserts the two auth roles if
they're missing, so this is safe.

**Before adding a new file to `src/database/seeders/`, ask: is this safe to
run unattended in production, every time the container starts, forever?**
It must be:
- **Idempotent** — check-then-insert, like `role.seeder.ts` does.
- **Essential reference data only** — not sample/demo data (sample schools,
  fake educators, bulk test classes, etc.).

If you need dev-only sample data (10 sample schools, 20 sample educators,
etc.), do **not** put it in this auto-discovered directory. Write it as a
one-off script (e.g. under `scripts/`) that a developer runs manually against
their own environment, so it can never accidentally fire in qa/prod.

## Seeding Configuration

The `enabled` / `autoSeed` flags in `.deployment/seeding-config.json` still
control whether `Deploy-Backend.ps1`'s `-Action migrate`/`-Action seed` runs
`npm run seed:prod` at all for a given environment. The per-env `seeders`
array is now **descriptive metadata only** (a manifest of what's expected to
exist) — it is no longer used to select which seeder files execute; `seed:prod`
always runs everything it finds.

| Environment | Auto-Seed | Runs | Purpose |
|-------------|-----------|------|---------|
| **dev** | Yes | every seeder in the directory (today: roles) | Development with essential data |
| **qa** | Yes | every seeder in the directory (today: roles) | QA testing with minimal baseline |
| **prod** | Yes | every seeder in the directory (today: roles) | Production with only essential data |

## Available Seeders

```
Current Seeders (src/database/seeders/):
└── role.seeder.ts   ✅ Implemented (2 roles: District Admin, Educator)
```

Sample/bulk data for schools, educators, classes, and students is not
implemented as auto-discovered seeders — see the safety convention above for
why, and create ad-hoc manual scripts instead if you need that for local
testing.

## Using Seeders

### Run migrations + seed (automatic in deploy script and in the container CMD)
```bash
npm run migration:run
npm run seed:prod
```

### Run against a local dev DB (ts-node, no build step)
```bash
npm run seed:local
```

## Creating New Seeders

When adding a new **essential, idempotent** seeder:

### 1. Create the seeder file
```typescript
// src/database/seeders/schools.seeder.ts
import { DataSource } from 'typeorm';
import { Schools } from '../schools/entity/schools.entity';

export default async function seedSchools(dataSource: DataSource): Promise<void> {
  const schoolRepo = dataSource.getRepository(Schools);

  const schools = [
    { name: 'Central High School', code: 'CHS-001' },
  ];

  for (const school of schools) {
    const exists = await schoolRepo.findOneBy({ code: school.code });
    if (!exists) {
      await schoolRepo.save(school);
      console.log(`Seeded school: ${school.name}`);
    }
  }
}
```
Notes:
- Default export, matching `(dataSource: DataSource) => Promise<void>` — that's the only contract `index.ts` requires.
- Don't call `dataSource.initialize()`/`destroy()` yourself — `index.ts` owns that lifecycle for all seeders sharing the connection.
- That's it — no npm script, no `seeding-config.json` edit. It will be picked up by `seed:prod`/`seed:local` automatically the next time either runs.

### 2. Update documentation
Update the "Available Seeders" list above and `.deployment/seeding-config.json`'s per-env `seeders` array (descriptive manifest — see above) in the same PR.

## Seeding Workflow

### Initial Deployment
```powershell
# 1. Provision infrastructure
.\Deploy-Backend.ps1 -Environment dev -Action provision

# 2. Create schema
.\Deploy-Backend.ps1 -Environment dev -Action migrate
# (automatically runs seed:prod if enabled/autoSeed are true)
```

### Subsequent Deployments
```powershell
# Deploy script handles everything
.\Deploy-Backend.ps1 -Environment dev -Action deploy
# (provision + migrate + seed:prod automatically)
```

## Troubleshooting

### Seeders not running
Check `.deployment/seeding-config.json`:
```json
{
  "dev": {
    "enabled": true,              // Must be true
    "autoSeed": true              // Must be true to auto-run seed:prod
  }
}
```

### Seeder fails with "Role already exists"
This is normal - seeders are idempotent:
```typescript
if (!exists) {
  await schoolRepo.save(school);  // Only saves if doesn't exist
}
```

### Clear and re-seed (dev only)
```bash
# Delete all data and re-migrate
npm run migration:revert
npm run migration:run

# Re-seed
npm run seed:prod
```

### Database connection errors
Ensure PostgreSQL is running and environment variables are set:
```bash
# Check connection
psql postgresql://$DB_USERNAME:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME
```

## Related Configuration

- Container specs: `.deployment/container-spec.json`
- Deployment script: `scripts/Deploy-Backend.ps1`
- Data migrations: `src/database/migrations/`
- Data entities: `src/[module]/entity/`

## Monitoring Seeding

View seeding logs during deployment:
```powershell
# Verbose deployment
.\Deploy-Backend.ps1 -Environment dev -Action seed -Verbose
```

Check database records after seeding:
```powershell
# Connect to production database
$env:PGPASSWORD = "your-password"
psql -h psql-dev1-rwai-edu.postgres.database.azure.com -U sqladmin -d educator_dev -c "SELECT * FROM role;"
```

## Cost Implications

Seeding has minimal cost impact:
- One-time data insertion (negligible I/O)
- Network: ~1MB data upload
- Compute: <1 second execution time
- **Cost**: <$0.01 per seeding operation
