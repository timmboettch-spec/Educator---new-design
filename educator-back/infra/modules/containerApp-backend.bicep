// =============================================================================
// Educator backend NestJS Container App.
// -----------------------------------------------------------------------------
// - User-assigned managed identity (created up-front so AcrPull can be granted
//   BEFORE the app is created — avoids the chicken/egg race that system MI hits).
// - All Educator runtime env vars sourced from per-env KV `akv{env}1rwai`
//   via `secretRef:` (KV is single source of truth).
// - Bootstrap env vars for the Azure KV client itself are written as plain
//   `value:` (these tell the app WHERE to find the KV, so they can't live
//   inside it).
// - App Insights connection string is wired as a plain env var (the value
//   comes from the existing shared `appi-all1-rwai` resource).
// - Redis runs as a sidecar container in this same revision (not baked into
//   the app image, not a separate Container App) — see the `redis` entry in
//   `template.containers` below.
//
// Image strategy: on first provision (when no image is in ACR yet), uses an
// upstream placeholder so the resource can be created without pulling from
// ACR. Subsequent runs (with `useRealImage`) wire the registry config and
// pull from ACR via the UAI.
// =============================================================================

param name string
param location string
param tags object = {}
@allowed(['dev', 'qa', 'prod'])
param environment string

param managedEnvironmentId string
param acrLoginServer string
param imageName string
param imageTag string

param keyVaultName string
param appInsightsConnectionString string
param customDomain string = ''
param customDomainCertificateId string = ''

@description('Suffix for the revision created by this deploy (blue/green).')
param revisionSuffix string

@description('Name of the currently-live (stable) revision. When set, that revision keeps 100% traffic and the new revision gets 0% until promoted by the workflow. Empty on first deploy — the new revision then gets 100%.')
param stableRevisionName string = ''

@description('Resource ID of the user-assigned managed identity to attach to the app.')
param userAssignedIdentityId string

@description('Principal (object) ID of the user-assigned managed identity.')
param userAssignedIdentityPrincipalId string

// CPU / memory / replica policy per env. Total per replica is split between
// the backend container and the Redis sidecar (see redisResCfg below) — the
// figures here are what's left for the backend after carving out Redis's
// share, so the combined footprint per replica is unchanged from before
// Redis was added.
// Dev scales to zero (minReplicas: 0) so it costs nothing when idle.
// NestJS idle heap is ~150-250 MB; 1 Gi gives plenty of headroom per replica.
//
// Bumped a tier across all envs (from 1.0/2.0Gi, 1.25/2.5Gi, 1.5/3.0Gi):
// code review found unbounded-growth endpoints (simulation-reports.service.ts
// findAll()/getMergedReports() load full tables + full blob report sets with
// no pagination; students.service.ts bulk PDF/email generation runs
// Promise.all with no concurrency cap) that make heap usage scale with total
// data/class size rather than being fixed. This buys headroom until those
// are paginated/concurrency-limited in app code — it does not fix the root
// cause. CPU bumped alongside memory since PDF generation is CPU-bound too.
//
// IMPORTANT: Container Apps Consumption plan only accepts combined
// (backend + redis) CPU/memory totals matching its fixed ratio tiers (see
// https://aka.ms/azure-container-apps-billing) — e.g. 1.5 vCPU must pair with
// exactly 3.0Gi, not 3.5Gi. Backend values below are chosen so
// backend + redisResCfg (0.25 vCPU / 0.5Gi) always lands on a valid tier.
//
// nodeMaxOldSpaceMB: value passed to NODE_OPTIONS=--max-old-space-size.
// Sized as (backend container memory - ~256 MiB native RSS headroom) — Redis
// runs in its own container with its own memory allocation in this
// multi-container revision, so it isn't subtracted from the backend's heap
// budget. Without this, V8 defaults to ~1 GiB old-space regardless of
// container size and Node OOMs before the cgroup limit is reached.
//
// TEMP (2026-07-24): dev bumped to match qa's tier — dev backend was
// crash-looping on liveness/readiness probe timeouts (15 restarts) while qa
// at the same commit had 0 restarts. Revert dev to its own tier once the
// underlying cause is confirmed and fixed.
var resourceMap = {
  dev:  { cpu: json('1.5'),  memory: '3.0Gi', minReplicas: 0, maxReplicas: 1, nodeMaxOldSpaceMB: 2816 }
  qa:   { cpu: json('1.5'),  memory: '3.0Gi', minReplicas: 0, maxReplicas: 2, nodeMaxOldSpaceMB: 2816 }
  prod: { cpu: json('1.75'), memory: '3.5Gi', minReplicas: 1, maxReplicas: 8, nodeMaxOldSpaceMB: 3328 }
}
var resCfg = resourceMap[environment]

// Redis sidecar: small, fixed footprint across all envs. It's an in-memory
// cache with no persistence (see `--save ""` below), so 0.5 Gi is ample —
// maxmemory is capped below that so Redis never gets OOM-killed by ACA.
var redisResCfg = { cpu: json('0.25'), memory: '0.5Gi' }

// Role IDs
// (KV Secrets User and AcrPull are granted in resources.bicep BEFORE the ACA
// is created, against the user-assigned MI — avoids the chicken/egg races
// that system MI hits.)

// Image strategy.
var placeholderImage = 'mcr.microsoft.com/k8se/quickstart:latest'
var useRealImage     = !empty(imageTag) && imageTag != 'placeholder'
var imageRef         = useRealImage ? '${acrLoginServer}/${imageName}:${imageTag}' : placeholderImage

// Compose vaultUri from name+suffix so it's known at template start (BCP182:
// can't use kv.properties.vaultUri inside a `for` loop).
var kvUri = 'https://${keyVaultName}${az.environment().suffixes.keyvaultDns}/'

// Prod Postgres enforces `require_secure_transport = ON`, so the app must
// connect over TLS there. Dev/QA Postgres don't enforce it, and their
// firewall/vnet rules aren't set up for the app's TLS trust chain, so SSL
// stays off there. Not a secret — derived per-env, no KV entry needed.
// App code (PR #368) reads this as `ALLOW_NONSSL` instead of `DB_SSL`.
var dbSslEnabled = environment == 'prod' ? 'true' : 'false'

// Blue/green traffic: pin the stable revision at 100% and hold the new
// revision at 0% until the workflow's staging smoke gate passes and
// promote-live flips it over via `az containerapp ingress traffic set`.
// On first deploy (no stable revision yet) the new revision gets 100%
// directly — there's nothing to blue/green against.
var trafficConfig = !empty(stableRevisionName) ? [
  { revisionName: stableRevisionName, weight: 100 }
  { latestRevision: true, weight: 0 }
] : [
  { latestRevision: true, weight: 100 }
]

// Custom domain binding. When customDomain/customDomainCertificateId aren't
// supplied, omit the `customDomains` key entirely rather than setting it to
// null — a full-template redeploy without these params (e.g. a manual
// `az deployment group create` run) would otherwise unbind any existing
// hostname instead of leaving it untouched.
var hasCustomDomain = !empty(customDomain) && !empty(customDomainCertificateId)
var ingressBase = {
  external: true
  targetPort: 3000
  transport: 'auto'
  allowInsecure: false
  traffic: trafficConfig
}
var ingressConfig = hasCustomDomain ? union(ingressBase, {
  customDomains: [
    {
      name: customDomain
      bindingType: 'SniEnabled'
      certificateId: customDomainCertificateId
    }
  ]
}) : ingressBase

// KV secret names this app reads. Lower-case `edu-*` to match the existing
// vault inventory.
var kvSecretNames = [
  'edu-db-host'
  'edu-db-port'
  'edu-db-name'
  'edu-db-username'
  'edu-db-password'
  'edu-node-env'
  'edu-app-port'
  'edu-app-url'
  'edu-frontend-url'
  'edu-mail-from'
  'edu-jwt-secret'
  'edu-jwt-expires-in'
  'edu-graph-tenant-id'
  'edu-graph-client-id'
  'edu-graph-client-secret'
  'edu-azure-storage-connection-string'
  'edu-azure-storage-account'
  'edu-azure-storage-container'
  'edu-azure-blob-container-name'
  'edu-vite-api-url'
  'edu-api-base-url'
  'edu-student-frontend-url'
  'edu-lti-fallback-key-id'
  'edu-lti-fallback-private-key-pem'
  'edu-lms-enable-lti-auto-provision'
  'edu-report-emails-disabled'
  'edu-report-emails-test-schools'
]

var appSecrets = [for s in kvSecretNames: {
  name: s
  keyVaultUrl: '${kvUri}secrets/${s}'
  identity: userAssignedIdentityId
}]

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: name
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${userAssignedIdentityId}': {}
    }
  }
  properties: {
    managedEnvironmentId: managedEnvironmentId
    configuration: {
      activeRevisionsMode: 'Multiple'
      ingress: ingressConfig
      registries: useRealImage ? [
        { server: acrLoginServer, identity: userAssignedIdentityId }
      ] : []
      secrets: appSecrets
    }
    template: {
      revisionSuffix: revisionSuffix
      containers: [
        {
          name: 'backend'
          image: imageRef
          resources: {
            cpu: resCfg.cpu
            memory: resCfg.memory
          }
          env: [
            // Bootstrap env for the Azure Key Vault SDK inside the app —
            // can't live in KV (chicken/egg).
            { name: 'AZURE_KEY_VAULT_URL',           value: kvUri }
            { name: 'AZURE_KEY_VAULT_SECRET_PREFIX', value: 'edu-' }
            { name: 'AZURE_SHARED_KEY_VAULT_URL',    value: kvUri }
            // Raise V8 old-space heap ceiling to match the cgroup memory
            // budget minus the Redis sidecar's share (2.0/2.5/3.0 GiB total
            // per replica, less 0.5 GiB for Redis and headroom for native
            // RSS / buffers / code). Without this, Node caps its heap at
            // ~1 GiB regardless of container size and OOMs long before the
            // cgroup limit — the exact failure mode seen in dev.
            { name: 'NODE_OPTIONS', value: '--max-old-space-size=${resCfg.nodeMaxOldSpaceMB}' }
            // App Insights connection string — sourced from the existing
            // shared `appi-all1-rwai` resource via Bicep.
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
            // Redis runs as a sidecar container in this same revision —
            // containers in one ACA replica share a network namespace, so
            // it's reachable over loopback. Not a secret; no KV entry needed.
            { name: 'REDIS_HOST', value: '127.0.0.1' }
            { name: 'REDIS_PORT', value: '6379' }
            // Everything else — sourced from Key Vault via system MI.
            { name: 'DB_HOST',                          secretRef: 'edu-db-host' }
            { name: 'DB_PORT',                          secretRef: 'edu-db-port' }
            { name: 'DB_NAME',                          secretRef: 'edu-db-name' }
            { name: 'DB_USERNAME',                      secretRef: 'edu-db-username' }
            { name: 'DB_PASSWORD',                      secretRef: 'edu-db-password' }
            { name: 'ALLOW_NONSSL',                     value: dbSslEnabled }
            { name: 'NODE_ENV',                         secretRef: 'edu-node-env' }
            { name: 'APP_PORT',                         secretRef: 'edu-app-port' }
            { name: 'APP_URL',                          secretRef: 'edu-app-url' }
            { name: 'FRONTEND_URL',                     secretRef: 'edu-frontend-url' }
            { name: 'MAIL_FROM',                        secretRef: 'edu-mail-from' }
            { name: 'JWT_SECRET',                       secretRef: 'edu-jwt-secret' }
            { name: 'JWT_EXPIRES_IN',                   secretRef: 'edu-jwt-expires-in' }
            { name: 'GRAPH_TENANT_ID',                  secretRef: 'edu-graph-tenant-id' }
            { name: 'GRAPH_CLIENT_ID',                  secretRef: 'edu-graph-client-id' }
            { name: 'GRAPH_CLIENT_SECRET',              secretRef: 'edu-graph-client-secret' }
            { name: 'AZURE_STORAGE_CONNECTION_STRING',  secretRef: 'edu-azure-storage-connection-string' }
            { name: 'AZURE_STORAGE_ACCOUNT',            secretRef: 'edu-azure-storage-account' }
            { name: 'AZURE_STORAGE_CONTAINER',          secretRef: 'edu-azure-storage-container' }
            { name: 'AZURE_BLOB_CONTAINER_NAME',        secretRef: 'edu-azure-blob-container-name' }
            { name: 'VITE_API_URL',                     secretRef: 'edu-vite-api-url' }
            { name: 'API_BASE_URL',                     secretRef: 'edu-api-base-url' }
            { name: 'STUDENT_FRONTEND_URL',              secretRef: 'edu-student-frontend-url' }
            { name: 'LTI_FALLBACK_KEY_ID',              secretRef: 'edu-lti-fallback-key-id' }
            { name: 'LTI_FALLBACK_PRIVATE_KEY_PEM',     secretRef: 'edu-lti-fallback-private-key-pem' }
            { name: 'LMS_ENABLE_LTI_AUTO_PROVISION',    secretRef: 'edu-lms-enable-lti-auto-provision' }
            // "Student Report Available" email gating. Declared here so the
            // per-deploy reconcile in app-deploy.bicep cannot strip them —
            // an imperative `az containerapp update --set-env-vars` would be
            // reverted on the next merge to main.
            { name: 'REPORT_EMAILS_DISABLED',           secretRef: 'edu-report-emails-disabled' }
            { name: 'REPORT_EMAILS_TEST_SCHOOLS',       secretRef: 'edu-report-emails-test-schools' }
          ]
          probes: [
            // Startup probe: gives migrations + seeding up to 120 s to finish
            // (12 retries × 10 s period) before liveness takes over.
            {
              type: 'Startup'
              httpGet: { path: '/healthz', port: 3000 }
              initialDelaySeconds: 15
              periodSeconds: 10
              timeoutSeconds: 5
              failureThreshold: 12
            }
            // Liveness: restart the container if the app stops responding.
            {
              type: 'Liveness'
              httpGet: { path: '/healthz', port: 3000 }
              periodSeconds: 10
              timeoutSeconds: 5
              failureThreshold: 3
            }
            // Readiness: stop sending traffic until DB + deps report healthy.
            {
              type: 'Readiness'
              httpGet: { path: '/readyz', port: 3000 }
              periodSeconds: 5
              timeoutSeconds: 3
              failureThreshold: 3
            }
          ]
        }
        {
          // Redis sidecar: cache-only, no persistence. Runs in the same
          // revision as the backend container and shares its network
          // namespace, so the backend reaches it at 127.0.0.1:6379 with no
          // ingress, DNS, or extra Container App resource required.
          name: 'redis'
          image: 'docker.io/library/redis:7-alpine'
          command: ['redis-server']
          args: [
            '--save', ''
            '--appendonly', 'no'
            '--maxmemory', '384mb'
            '--maxmemory-policy', 'allkeys-lru'
          ]
          resources: {
            cpu: redisResCfg.cpu
            memory: redisResCfg.memory
          }
          probes: [
            {
              type: 'Startup'
              tcpSocket: { port: 6379 }
              initialDelaySeconds: 5
              periodSeconds: 5
              failureThreshold: 6
            }
            {
              type: 'Liveness'
              tcpSocket: { port: 6379 }
              periodSeconds: 15
              failureThreshold: 3
            }
          ]
        }
      ]
      scale: {
        minReplicas: resCfg.minReplicas
        maxReplicas: resCfg.maxReplicas
        rules: [
          {
            name: 'http-rule'
            http: { metadata: { concurrentRequests: '50' } }
          }
        ]
      }
    }
  }
}

// Role: Key Vault Secrets User on the shared per-env vault.
// Granted in resources.bicep BEFORE this module runs (against the UAI), so
// the ACA can fetch secrets on its first revision provision.

output name string = app.name
output fqdn string = app.properties.configuration.ingress.fqdn
output principalId string = userAssignedIdentityPrincipalId
output customDomainConfigured bool = !empty(customDomain)
output newRevisionName string = app.properties.latestRevisionName
