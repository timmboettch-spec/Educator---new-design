# Database Seeding Strategy

This document explains the database seeding approach for different environments. The actual configuration is defined in `.deployment/seeding-config.json` which is read by the deployment script.

## Overview

Database seeding is the process of populating the database with initial required data after migrations. This includes roles, sample schools, educators, classes, and students (environment-dependent).

## Seeding Configuration

The seeding strategy is environment-specific and controlled by `.deployment/seeding-config.json`:

| Environment | Auto-Seed | Seeders | Truncate | Purpose |
|-------------|-----------|---------|----------|---------|
| **dev** | Yes | roles | No | Development with essential data |
| **qa** | Yes | roles | No | QA testing with minimal baseline |
| **prod** | Yes | roles | No | Production with only essential data |

## Environment-Specific Strategies

### Development Environment

**What gets seeded automatically:**
- `roles` - District Admin, Educator (essential for auth)

**When**: During `npm run migration:run` (automatic)

**How to seed additional data:**
```bash
# Seed everything
npm run seed:all

# Or individually
npm run seed:roles
npm run seed:schools      # Add 10 sample schools
npm run seed:educators    # Add 20 sample educators
npm run seed:classes      # Add 30 sample classes
```

**Rationale**: 
- Developers need working roles to test authentication
- Additional sample data needed for feature testing is developer-controlled
- Supports exploring multiple datasets

### QA Environment

**What gets seeded automatically:**
- `roles` - District Admin, Educator only

**When**: During deployment (automatic)

**Manual data creation:**
- QA team creates test scenarios via API/UI
- Ensures workflows for data creation are tested
- Prevents reliance on pre-populated data

**Rationale**:
- QA must test entire data creation workflow (admins creating schools, educators, classes, etc.)
- Pre-seeded data can mask bugs in admin interfaces
- Ensures real-world scenarios are tested

### Production Environment

**What gets seeded automatically:**
- `roles` - District Admin, Educator only

**When**: Upon initial deployment only

**Never seed in production:**
- ❌ Schools
- ❌ Educators
- ❌ Classes
- ❌ Students

**Manual data creation:**
- System administrators create all production data via admin interfaces
- Ensures audit trails and proper access controls

**Rationale**:
- Production data is sensitive and must be intentional
- All production data creation must be auditable
- Prevents accidental overwrites or data loss

## Available Seeders

```
Current Seeders:
├── roles         ✅ Implemented (2 roles: District Admin, Educator)
├── schools       ⏳ Planned
├── educators     ⏳ Planned
├── classes       ⏳ Planned
└── students      ⏳ Planned
```

## Using Seeders

### Run migrations + seed roles (automatic in deploy script)
```bash
npm run migration:run
npm run seed:roles
```

### Seed all data (development only)
```bash
npm run seed:all
```

### Seed specific entity
```bash
npm run seed:roles
npm run seed:schools
npm run seed:educators
```

### Check available seeders
```bash
npm run seed:help
```

## Creating New Seeders

When adding new database entities that need seeding:

### 1. Create seeder file
```typescript
// src/seeds/schools.seeder.ts
import { AppDataSource } from '../data-source';
import { Schools } from '../schools/entity/schools.entity';

async function seedSchools(): Promise<void> {
  try {
    await AppDataSource.initialize();
    const schoolRepo = AppDataSource.getRepository(Schools);
    
    const schools = [
      { name: 'Central High School', code: 'CHS-001' },
      { name: 'West Academy', code: 'WA-001' },
    ];
    
    for (const school of schools) {
      const exists = await schoolRepo.findOneBy({ code: school.code });
      if (!exists) {
        await schoolRepo.save(school);
        console.log(`Seeded school: ${school.name}`);
      }
    }
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

void seedSchools();
```

### 2. Add npm script to `package.json`
```json
{
  "scripts": {
    "seed:schools": "ts-node -r tsconfig-paths/register src/seeds/schools.seeder.ts"
  }
}
```

### 3. Register in `.deployment/seeding-config.json`
```json
{
  "dev": {
    "seeders": ["roles", "schools"]
  }
}
```

### 4. Update documentation (this file)

### 5. Update Pull Request Template
Add to `.github/PULL_REQUEST_TEMPLATE.md`:
```markdown
## Database Changes
- [ ] Migration created (if new table)
- [ ] Seeder created (if new entity)
- [ ] Updated `.deployment/seeding-config.json`
- [ ] Updated `.deployment/REQUIREMENTS.md`
```

## Seeding Workflow

### Initial Deployment
```powershell
# 1. Provision infrastructure
.\Deploy-Backend.ps1 -Environment dev -Action provision

# 2. Create schema
.\Deploy-Backend.ps1 -Environment dev -Action migrate
# (automatically runs seed:roles)

# 3. Optional: Seed additional data
npm run seed:all
```

### Subsequent Deployments
```powershell
# Deploy script handles everything
.\Deploy-Backend.ps1 -Environment dev -Action deploy
# (provision + migrate + seed:roles automatically)
```

## Troubleshooting

### Seeders not running
Check `.deployment/seeding-config.json`:
```json
{
  "dev": {
    "enabled": true,              // Must be true
    "autoSeed": true,             // Must be true to auto-run
    "seeders": ["roles"]          // Must list the seeder
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
npm run seed:all
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
- Data migrations: `src/migrations/`
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
