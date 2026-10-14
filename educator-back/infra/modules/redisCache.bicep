// =============================================================================
// Azure Managed Redis (Educator backend).
// -----------------------------------------------------------------------------
// Replaces the old in-revision Redis sidecar container (see git history on
// containerApp-backend.bicep) with a managed cache: independent lifecycle,
// its own health/restart tracking, and no longer counted against the
// backend Container App's per-replica CPU/memory budget.
//
// This is the current Azure Managed Redis product (`Microsoft.Cache/redisEnterprise`
// + a `databases` child resource) — the successor to the classic "Azure Cache
// for Redis" (`Microsoft.Cache/redis`), which Microsoft has announced a future
// retirement timeline for.
//
// Tier: Balanced_B0 for dev/qa (smallest tier, cache-only workload, no
// persistence requirement). Balanced_B1 for prod (a bit more headroom).
// `highAvailability` stays Enabled everywhere — it's the cluster default and
// keeping it on avoids per-SKU HA-support edge cases.
//
// Auth: access-key based for now (`accessKeysAuthentication: 'Enabled'`,
// primary key written to Key Vault as `edu-redis-password` — same pattern as
// every other credential in this repo) since src/redis/redis.module.ts only
// knows how to AUTH with a static password today. A `accessPolicyAssignments`
// child resource is still provisioned below, granting the backend's
// user-assigned managed identity Entra ID data-plane access ahead of time —
// switching the app to token-based auth later (scope
// `https://redis.azure.com/.default`) is then just an app-code change plus
// flipping `accessKeysAuthentication` to `Disabled`, with no further infra
// rework.
//
// Network: the shared Container App Environment this app deploys into is
// NOT VNet-integrated, so Private Link isn't reachable from the backend.
// `publicNetworkAccess` stays Enabled; unlike the classic tier, Azure Managed
// Redis has no IP-based firewall — access control is TLS + the access key
// (and, once adopted, Entra ID).
//
// No persistence: `persistence` is left with both aofEnabled/rdbEnabled off,
// matching the old sidecar's `--save "" --appendonly no`. `clusteringPolicy`
// is `NoCluster` so the existing single-endpoint `ioredis.Redis` client
// (not `ioredis.Cluster`) in src/redis/redis.module.ts keeps working as-is.
// =============================================================================

param name string
param location string
param tags object = {}
@allowed(['dev', 'qa', 'prod'])
param environment string
param workspaceId string

@description('Principal (object) ID of the backend user-assigned managed identity, granted Entra ID data-plane access to this cache for a future switch off access keys.')
param principalId string

var skuMap = {
  dev:  { name: 'Balanced_B0' }
  qa:   { name: 'Balanced_B0' }
  prod: { name: 'Balanced_B1' }
}

var redisPort = 10000

resource redisEnterprise 'Microsoft.Cache/redisEnterprise@2025-07-01' = {
  name: name
  location: location
  tags: tags
  sku: skuMap[environment]
  properties: {
    encryption: {}
    highAvailability: 'Enabled'
    minimumTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
  }
}

resource database 'Microsoft.Cache/redisEnterprise/databases@2025-07-01' = {
  name: 'default'
  parent: redisEnterprise
  properties: {
    clientProtocol: 'Encrypted'
    port: redisPort
    clusteringPolicy: 'NoCluster'
    evictionPolicy: 'AllKeysLRU'
    accessKeysAuthentication: 'Enabled'
    persistence: {
      aofEnabled: false
      rdbEnabled: false
    }
  }
}

// Grants the backend UAI read/write data-plane access via Entra ID ahead of
// time — not yet used by the app (see module header), but in place so the
// switch away from access keys later doesn't need an infra change.
resource backendAccess 'Microsoft.Cache/redisEnterprise/databases/accessPolicyAssignments@2025-07-01' = {
  name: 'backendUai'
  parent: database
  properties: {
    accessPolicyName: 'default'
    user: {
      objectId: principalId
    }
  }
}

resource diag 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  scope: redisEnterprise
  name: 'redis-to-law'
  properties: {
    workspaceId: workspaceId
    metrics: [
      { category: 'AllMetrics', enabled: true }
    ]
  }
}

output name string = redisEnterprise.name
output hostName string = redisEnterprise.properties.hostName
output port int = database.properties.port

@secure()
output primaryKey string = database.listKeys().primaryKey
