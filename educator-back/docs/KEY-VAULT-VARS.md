# Key Vault — Source of Truth for Educator Backend Env Vars

Every per-environment runtime env var for the Educator backend Container App lives in the per-env Key Vault under the `edu-` prefix:

```
akv<env>1rwai        e.g. akvdev1rwai, akvqa1rwai, akvprod1rwai
```

This vault is **shared** with sibling apps (HS-Online-AI). The `edu-` prefix namespaces Educator's secrets so they coexist without collision.

The Container App reads every env var via `secretRef:` to KV using its system-assigned managed identity (granted `Key Vault Secrets User`).

> **Only 3 GitHub repository secrets exist for the backend**: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`. Everything else lives in Key Vault.

---

## Variable catalog

Authoritative source: [infra/modules/keyVaultSecrets.bicep](../infra/modules/keyVaultSecrets.bicep). The tables below mirror the three behavior tiers in that module.

### Resource-derived (always written by `provision`, do not edit manually)

| KV secret name        | Source                                            | Env var consumer       |
|-----------------------|---------------------------------------------------|------------------------|
| `edu-db-host`         | `psql-{env}1-rwai-edu.postgres.database.azure.com` | `DB_HOST`             |
| `edu-db-port`         | `5432`                                            | `DB_PORT`              |
| `edu-db-name`         | `educator_{env}`                                  | `DB_NAME`              |
| `edu-db-username`     | `educator_admin`                                  | `DB_USERNAME`          |
| `edu-redis-host`      | Azure Managed Redis hostname (`redis-{env}1-rwai-eduback.<region>.redis.azure.net`) | `REDIS_HOST` |
| `edu-redis-port`      | Azure Managed Redis TLS port (`10000`)            | `REDIS_PORT`           |
| `edu-redis-password`  | Azure Managed Redis primary access key (`database.listKeys().primaryKey`) | `REDIS_PASSWORD` |

> Redis auth is access-key based for now (`accessKeysAuthentication: 'Enabled'` on the database). `infra/modules/redisCache.bicep` also pre-provisions an Entra ID access policy assignment for the backend's managed identity, so switching `src/redis/redis.module.ts` to token-based auth later needs no further infra change — just app code plus flipping `accessKeysAuthentication` to `Disabled`.

### Defaulted (always written, override via bicepparam if needed)

| KV secret name          | Default              | Env var consumer       |
|-------------------------|----------------------|------------------------|
| `edu-node-env`          | `development`/`qa`/`production` per env | `NODE_ENV` |
| `edu-app-port`          | `3000`               | `APP_PORT`             |
| `edu-jwt-expires-in`    | `7d`                 | `JWT_EXPIRES_IN`       |
| `edu-mail-from`         | `noreply@realityworksai.com` | `MAIL_FROM`    |
| `edu-azure-blob-container-name` | `json-data` | `AZURE_BLOB_CONTAINER_NAME` (read by `tutor-patient.service.ts`, `health.service.ts`) |
| `edu-api-timeout-ms`             | `60000` | `API_TIMEOUT_MS` (read by `request-timeout.interceptor.ts`) |
| `edu-server-keep-alive-timeout-ms` | `65000` | `SERVER_KEEP_ALIVE_TIMEOUT_MS` (read by `main.ts`) |
| `edu-server-headers-timeout-ms`  | `66000` | `SERVER_HEADERS_TIMEOUT_MS` (read by `main.ts`) |
| `edu-db-pool-max`                | `10`    | `DB_POOL_MAX` (read by `db.config.ts`) |
| `edu-db-pool-idle-timeout-ms`    | `30000` | `DB_POOL_IDLE_TIMEOUT_MS` (read by `db.config.ts`) |
| `edu-db-pool-acquire-timeout-ms` | `5000`  | `DB_POOL_ACQUIRE_TIMEOUT_MS` (read by `db.config.ts`) |
| `edu-heap-log-interval-ms`       | `60000` | `HEAP_LOG_INTERVAL_MS` (read by `main.ts` heap logger) |

### Sensitive (prompted on `provision`, empty = preserve existing)

Pass via environment variable on the deployment caller; the `.bicepparam` files use `readEnvironmentVariable()`. Empty values skip the KV write entirely so the existing value is preserved.

| KV secret name                            | Env var on caller                   | Env var consumer                  |
|-------------------------------------------|-------------------------------------|-----------------------------------|
| `edu-db-password`                         | `POSTGRES_ADMIN_PASSWORD`           | `DB_PASSWORD`                     |
| `edu-jwt-secret`                          | `JWT_SECRET`                        | `JWT_SECRET`                      |
| `edu-graph-client-secret`                 | `GRAPH_CLIENT_SECRET`               | `GRAPH_CLIENT_SECRET`             |
| `edu-azure-storage-connection-string`     | `AZURE_STORAGE_CONNECTION_STRING`   | `AZURE_STORAGE_CONNECTION_STRING` |
| `edu-lms-secrets-encryption-key`          | `LMS_SECRETS_ENCRYPTION_KEY`        | `LMS_SECRETS_ENCRYPTION_KEY`      |

### Empty-allowed (only written when non-empty; fill in post-provision)

| KV secret name                | Env var on caller          | Env var consumer            | Purpose                              |
|-------------------------------|----------------------------|-----------------------------|--------------------------------------|
| `edu-app-url`                 | derived in `.bicepparam`   | `APP_URL`                   | Backend public URL                   |
| `edu-frontend-url`            | derived in `.bicepparam`   | `FRONTEND_URL`              | Frontend public URL                  |
| `edu-vite-api-url`            | derived in `.bicepparam`   | `VITE_API_URL`              | Used by FE build (mirrors backend)   |
| `edu-graph-tenant-id`         | `GRAPH_TENANT_ID`          | `GRAPH_TENANT_ID`           | Microsoft Graph app tenant           |
| `edu-graph-client-id`         | `GRAPH_CLIENT_ID`          | `GRAPH_CLIENT_ID`           | Microsoft Graph app client ID        |
| `edu-azure-storage-account`   | set in `.bicepparam`       | `AZURE_STORAGE_ACCOUNT`     | Storage account short name           |
| `edu-azure-storage-container` | set in `.bicepparam`       | `AZURE_STORAGE_CONTAINER`   | Blob container name                  |

---

## Bootstrap env (not in KV)

A handful of values must exist as **plain env vars** on the Container App so it can locate the vault and Application Insights before the SDK reads any secret. These are set directly in `infra/modules/containerApp-backend.bicep`:

| Env var                                 | Value                                                  |
|-----------------------------------------|--------------------------------------------------------|
| `AZURE_KEY_VAULT_URL`                   | `https://akv{env}1rwai.vault.azure.net/`               |
| `AZURE_KEY_VAULT_SECRET_PREFIX`         | `edu-`                                                 |
| `AZURE_SHARED_KEY_VAULT_URL`            | (same as `AZURE_KEY_VAULT_URL` today)                  |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | resolved from existing `appi-all1-rwai`                |

---

## How to add or update a value

### Option A — single var via CLI

```powershell
az keyvault secret set `
  --vault-name akvdev1rwai `
  --name edu-jwt-secret `
  --value '<value>'
```

Then restart the active revision so the Container App refreshes its secret cache:

```powershell
az containerapp revision restart `
  -n aca-dev1-rwai-eduback `
  -g ARG-dev1-rwai `
  --revision (az containerapp show -n aca-dev1-rwai-eduback -g ARG-dev1-rwai --query 'properties.latestRevisionName' -o tsv)
```

### Option B — re-run provision

Re-provisioning is non-destructive. Empty Bicep params preserve existing KV values; non-empty values overwrite.

```powershell
$env:POSTGRES_ADMIN_PASSWORD = '<value>'   # or leave unset to preserve
$env:JWT_SECRET              = '<value>'   # or leave unset to preserve
.\scripts\Deploy-Backend.ps1 -Environment dev -Action provision
```

### Option C — add a new secret

1. Add the `param` + child `Microsoft.KeyVault/vaults/secrets` resource to [infra/modules/keyVaultSecrets.bicep](../infra/modules/keyVaultSecrets.bicep) under the appropriate tier (resource-derived / sensitive / empty-allowed).
2. Add a `param` + module input wiring in [infra/resources.bicep](../infra/resources.bicep).
3. Add the secret name to the `kvSecretNames` array in [infra/modules/containerApp-backend.bicep](../infra/modules/containerApp-backend.bicep) and add the corresponding `env` entry with `secretRef:`.
4. Wire the param through [infra/main.bicep](../infra/main.bicep) and [app-deploy.bicep](../infra/app-deploy.bicep) if it needs to flow from the caller.
5. Add the env-var binding in [infra/env/{env}.bicepparam](../infra/env/) for each env.
6. Re-run `provision` once per env to write the initial value.
