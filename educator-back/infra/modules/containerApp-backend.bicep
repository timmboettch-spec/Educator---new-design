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
// - Redis is a managed Azure Managed Redis instance (see modules/redisCache.bicep),
//   not a sidecar in this revision. Host/port/password come from KV secretRefs
//   (edu-redis-host/port/password), same access-key pattern as every other
//   credential below.
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

@description('Overrides resourceMap[environment].minReplicas when >= 0. Used by preview-deploy.bicep to pin 1 warm replica on the first deploy (avoids racing the smoke-test suite against a cold start) — callers scale this back to 0 via `az containerapp update` once their tests finish, since previews are ephemeral and otherwise sit warm indefinitely. -1 (default) = use the per-environment tier.')
param minReplicasOverride int = -1

@description('When non-empty, DB_NAME is set to this literal value instead of the edu-db-name Key Vault secret — used by previews to target a dedicated database on the same server. Empty (default) keeps the normal secret-backed DB name.')
param dbNameOverride string = ''

@description('Resource ID of the user-assigned managed identity to attach to the app.')
param userAssignedIdentityId string

@description('Principal (object) ID of the user-assigned managed identity.')
param userAssignedIdentityPrincipalId string

@description('Client ID of the user-assigned managed identity. Wired as AZURE_CLIENT_ID so ManagedIdentityCredential in TelemetryAnalyticsService can select this identity for App Insights Query API auth.')
param userAssignedIdentityClientId string

@description('ACS Communication Services endpoint (https://<name>.<region>.communication.azure.com) — wired as ACS_ENDPOINT for MailService\'s EmailClient. Resource-derived, not a KV secret. See infra/modules/acsEmail.bicep.')
param acsEndpoint string

// CPU / memory / replica policy per env.
// Dev is back to scaling to zero (minReplicas: 0) to cost nothing when idle.
// It was previously pinned to 1 warm replica because the cold start from
// zero was slow enough to blow past frontend E2E smoke timeouts (e.g.
// https://github.com/Realityworks-AI/HS-online-AI-app/actions/runs/32708020933/job/97374631022).
// Re-enabled now that this repo's own test-api job (deploy-backend.yml)
// warms the target backend with a retrying /health curl before running the
// API suite against it — the same mitigation preview-deploy.yml uses for
// preview environments. This does NOT cover HS-online-AI-app's own E2E
// pipeline hitting dev.educatorbe.realityworksai.com directly — that repo
// should add an equivalent warm-up curl on its side before this lands, or
// its smoke tests may flake against a cold dev backend again.
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
// IMPORTANT: Container Apps Consumption plan only accepts CPU/memory totals
// matching its fixed ratio tiers (see
// https://aka.ms/azure-container-apps-billing) — a 1:2 cpu:memory ratio,
// e.g. 1.75 vCPU must pair with exactly 3.5Gi, not 3.75Gi.
//
// Redis moved out to a managed Azure Cache for Redis instance (see
// modules/redisCache.bicep) — the 0.25 vCPU / 0.5Gi that used to be carved
// out of these figures for the sidecar has been folded back in below.
//
// nodeMaxOldSpaceMB: value passed to NODE_OPTIONS=--max-old-space-size.
// Sized as (backend container memory - ~256 MiB native RSS headroom).
// Without this, V8 defaults to ~1 GiB old-space regardless of container
// size and Node OOMs before the cgroup limit is reached.
//
// TEMP (2026-07-24): dev bumped to match qa's tier — dev backend was
// crash-looping on liveness/readiness probe timeouts (15 restarts) while qa
// at the same commit had 0 restarts. Revert dev to its own tier once the
// underlying cause is confirmed and fixed.
var resourceMap = {
  dev:  { cpu: json('1.75'), memory: '3.5Gi', minReplicas: 0, maxReplicas: 1, nodeMaxOldSpaceMB: 3328 }
  qa:   { cpu: json('1.75'), memory: '3.5Gi', minReplicas: 0, maxReplicas: 2, nodeMaxOldSpaceMB: 3328 }
  prod: { cpu: json('2.0'),  memory: '4.0Gi', minReplicas: 1, maxReplicas: 8, nodeMaxOldSpaceMB: 3840 }
}
var resCfg = resourceMap[environment]
var effectiveMinReplicas = minReplicasOverride >= 0 ? minReplicasOverride : resCfg.minReplicas

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
  // edu-mail-from: no longer read by MAIL_FROM (see edu-acs-mail-from below)
  // — kept declared only because the currently-live pre-ACS revision still
  // references it; same ContainerAppSecretInUse constraint as edu-graph-*
  // below. Drop it for real once that revision rotates out.
  'edu-mail-from'
  'edu-acs-mail-from'
  'edu-jwt-secret'
  'edu-jwt-expires-in'
  // edu-graph-tenant-id / edu-graph-client-id / edu-graph-client-secret: no
  // longer read by app code (mail auth moved to ManagedIdentityCredential),
  // but the currently-live revision predates this change and still has these
  // baked into its own env — Container Apps refuses to remove a secret an
  // active revision references (ContainerAppSecretInUse), which would block
  // this exact deploy. Keep these as harmless unused secretRefs until this
  // revision is the only one active, then drop them for real in a follow-up
  // change (matches the same pattern used to unwind PR #585's fallout).
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
  'edu-lms-secrets-encryption-key'
  // AES-256-GCM key for the stateless time-bound token codec in
  // src/common/utils/crypto.utils.ts (invite links). Dedicated secret, never
  // chained to edu-jwt-secret — rotating it invalidates outstanding invites.
  'edu-crypto-secret'
  'edu-rate-limit-public-limit'
  'edu-rate-limit-public-ttl'
  'edu-rate-limit-auth-limit'
  'edu-rate-limit-auth-ttl'
  'edu-default-throttle-limit'
  'edu-default-throttle-ttl-ms'
  'edu-rate-limit-fallback-retry-after-seconds'
  'edu-lti-launch-rate-limit'
  'edu-lti-launch-rate-ttl'
  'edu-azure-blob-data-container-name'
  'edu-scenario-hydration-concurrency'
  'edu-json-cache-metadata-check-interval-ms'
  'edu-localized-scenarios-cache-ttl-ms'
  'edu-appinsights-auth-type'
  'edu-telemetry-sampling-priority'
  'edu-telemetry-lifecycle-enabled'
  'edu-conversation-provider'
  'edu-ai-model'
  'edu-api-timeout-ms'
  'edu-server-keep-alive-timeout-ms'
  'edu-server-headers-timeout-ms'
  'edu-db-pool-max'
  'edu-db-pool-idle-timeout-ms'
  'edu-db-pool-acquire-timeout-ms'
  'edu-heap-log-interval-ms'
  'edu-mail-rate-limit-per-minute'
  'edu-mail-rate-limit-per-hour'
  'edu-automation-tester-email'
  'edu-auth-forgot-password-cooldown-seconds'
  'edu-auth-forgot-password-limit'
  'edu-auth-forgot-password-ttl'
  'edu-auth-forgot-password-ip-limit'
  'edu-auth-forgot-password-ip-window-seconds'
  'edu-google-classroom-success-redirect-path'
  'edu-google-classroom-oauth-client-id'
  'edu-google-classroom-oauth-client-secret'
  'edu-google-classroom-oauth-redirect-uri'
  // edu-openai-api-key: Educator's own edu-prefixed copy, seeded with the same
  // value as HS-Online-AI's shared OPENAI-API-KEY secret (same underlying
  // account/key) — kept under Educator's own name rather than referencing the
  // shared secret directly, consistent with every other edu-* secret here.
  'edu-openai-api-key'
  'edu-email-host'
  'edu-email-port'
  'edu-email-mode'
  // NOTE: edu-appinsights-app-id / edu-appinsights-api-key / edu-speech-engine-*
  // / edu-report-email-to / edu-email-user / edu-email-pass / edu-email-from
  // are intentionally NOT referenced here. Azure Container Apps
  // fails to provision a revision if a keyVaultUrl secret resolves to an empty
  // string ("Unable to get value using Managed identity ... unable to fetch
  // secret") — confirmed by a live deployment failure. None of these have a
  // real value yet (no HS equivalent, no safe non-empty placeholder — several
  // of the reading code paths, e.g. reports.service.ts's smtpConfigured check,
  // treat ANY non-empty string as "configured" and would attempt to use it).
  // Add them back here once real values exist in KV.
  'edu-redis-host'
  'edu-redis-port'
  'edu-redis-password'
]

// AVATAR_SERVICE_KEY (@ServiceAuth, ADR-0007). Was dev-only while
// edu-avatar-service-key existed only in akvdev1rwai; it is now seeded in all
// three vaults (akvdev1rwai 30 Sep, akvqa1rwai and akvprod1rwai 1 Oct), which
// is the precondition the previous comment named for widening this.
//
// Kept as a flag rather than deleted: ACA fails to provision a revision when a
// keyVaultUrl secret is missing or empty (see the kvSecretNames comment), so a
// future environment without the secret seeded must be excluded here BEFORE it
// is first deployed, not after.
var avatarServiceKeyEnabled = true
var avatarServiceKeySecretName = 'edu-avatar-service-key'

var baseAppSecrets = [for s in kvSecretNames: {
  name: s
  keyVaultUrl: '${kvUri}secrets/${s}'
  identity: userAssignedIdentityId
}]

var avatarServiceKeySecrets = avatarServiceKeyEnabled ? [
  {
    name: avatarServiceKeySecretName
    keyVaultUrl: '${kvUri}secrets/${avatarServiceKeySecretName}'
    identity: userAssignedIdentityId
  }
] : []

var appSecrets = concat(baseAppSecrets, avatarServiceKeySecrets)

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
          env: concat([
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
            // Managed Azure Managed Redis. TLS is always on (clientProtocol:
            // Encrypted), so REDIS_TLS is a plain value, not a secretRef.
            { name: 'REDIS_TLS', value: 'true' }
            // Entra ID auth (see src/redis/redis.provider.ts): IS_MANAGED_REDIS
            // switches the client off static access-key/password auth onto a
            // token obtained via this app's user-assigned managed identity.
            // REDIS_USERNAME is that identity's object (principal) ID — the
            // same one granted data-plane access in redisCache.bicep's
            // accessPolicyAssignments. Resource-derived, not a KV secret.
            { name: 'IS_MANAGED_REDIS', value: 'true' }
            { name: 'REDIS_USERNAME', value: userAssignedIdentityPrincipalId }
            // Client ID of this app's own user-assigned managed identity —
            // lets ManagedIdentityCredential (here, and in
            // TelemetryAnalyticsService for the App Insights Query API)
            // select this identity instead of a system-assigned one, which
            // this app doesn't have. Resource-derived, not a KV secret.
            { name: 'AZURE_CLIENT_ID', value: userAssignedIdentityClientId }
            // ACS Communication Services endpoint for MailService's
            // EmailClient — resource-derived, not a KV secret (see
            // infra/modules/acsEmail.bicep).
            { name: 'ACS_ENDPOINT', value: acsEndpoint }
            // Everything else — sourced from Key Vault via system MI.
            { name: 'DB_HOST',                          secretRef: 'edu-db-host' }
            { name: 'DB_PORT',                          secretRef: 'edu-db-port' }
            empty(dbNameOverride) ? { name: 'DB_NAME', secretRef: 'edu-db-name' } : { name: 'DB_NAME', value: dbNameOverride }
            { name: 'DB_USERNAME',                      secretRef: 'edu-db-username' }
            { name: 'DB_PASSWORD',                      secretRef: 'edu-db-password' }
            { name: 'ALLOW_NONSSL',                     value: dbSslEnabled }
            { name: 'NODE_ENV',                         secretRef: 'edu-node-env' }
            { name: 'APP_PORT',                         secretRef: 'edu-app-port' }
            { name: 'APP_URL',                          secretRef: 'edu-app-url' }
            { name: 'FRONTEND_URL',                     secretRef: 'edu-frontend-url' }
            { name: 'MAIL_FROM',                        secretRef: 'edu-acs-mail-from' }
            { name: 'JWT_SECRET',                       secretRef: 'edu-jwt-secret' }
            { name: 'JWT_EXPIRES_IN',                   secretRef: 'edu-jwt-expires-in' }
            // Unused by app code — see the kvSecretNames comment above.
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
            { name: 'LMS_SECRETS_ENCRYPTION_KEY',       secretRef: 'edu-lms-secrets-encryption-key' }
            { name: 'CRYPTO_SECRET',                    secretRef: 'edu-crypto-secret' }
            { name: 'RATE_LIMIT_PUBLIC_LIMIT',                 secretRef: 'edu-rate-limit-public-limit' }
            { name: 'RATE_LIMIT_PUBLIC_TTL',                   secretRef: 'edu-rate-limit-public-ttl' }
            { name: 'RATE_LIMIT_AUTH_LIMIT',                   secretRef: 'edu-rate-limit-auth-limit' }
            { name: 'RATE_LIMIT_AUTH_TTL',                     secretRef: 'edu-rate-limit-auth-ttl' }
            { name: 'DEFAULT_THROTTLE_LIMIT',                  secretRef: 'edu-default-throttle-limit' }
            { name: 'DEFAULT_THROTTLE_TTL_MS',                 secretRef: 'edu-default-throttle-ttl-ms' }
            { name: 'RATE_LIMIT_FALLBACK_RETRY_AFTER_SECONDS', secretRef: 'edu-rate-limit-fallback-retry-after-seconds' }
            { name: 'LTI_LAUNCH_RATE_LIMIT',                   secretRef: 'edu-lti-launch-rate-limit' }
            { name: 'LTI_LAUNCH_RATE_TTL',                     secretRef: 'edu-lti-launch-rate-ttl' }
            // Student-backend consolidation (blob/cache tuning, telemetry, AI conversation, email).
            { name: 'AZURE_BLOB_DATA_CONTAINER_NAME',   secretRef: 'edu-azure-blob-data-container-name' }
            // Not a secret and identical in every environment, so a plain value rather than a KV chain.
            { name: 'AZURE_BLOB_VOICE_PROFILES_CONTAINER_NAME', value: 'voice-profiles' }
            { name: 'SCENARIO_HYDRATION_CONCURRENCY',   secretRef: 'edu-scenario-hydration-concurrency' }
            { name: 'JSON_CACHE_METADATA_CHECK_INTERVAL_MS', secretRef: 'edu-json-cache-metadata-check-interval-ms' }
            { name: 'LOCALIZED_SCENARIOS_CACHE_TTL_MS', secretRef: 'edu-localized-scenarios-cache-ttl-ms' }
            { name: 'APPINSIGHTS_AUTH_TYPE',            secretRef: 'edu-appinsights-auth-type' }
            { name: 'TELEMETRY_SAMPLING_PRIORITY',      secretRef: 'edu-telemetry-sampling-priority' }
            { name: 'TELEMETRY_LIFECYCLE_ENABLED',      secretRef: 'edu-telemetry-lifecycle-enabled' }
            { name: 'CONVERSATION_PROVIDER',            secretRef: 'edu-conversation-provider' }
            { name: 'AI_MODEL',                         secretRef: 'edu-ai-model' }
            { name: 'OPENAI_API_KEY',                   secretRef: 'edu-openai-api-key' }
            { name: 'EMAIL_HOST',                       secretRef: 'edu-email-host' }
            { name: 'EMAIL_PORT',                       secretRef: 'edu-email-port' }
            // `skip` in dev/qa suppresses Graph delivery so API tests don't burn the sender's daily quota;
            // prod defaults to `live`. Value comes from the per-env `.bicepparam` emailMode.
            { name: 'EMAIL_MODE',                       secretRef: 'edu-email-mode' }
            // API timeout handling (cold-start / connection-pool hardening).
            { name: 'API_TIMEOUT_MS',                   secretRef: 'edu-api-timeout-ms' }
            { name: 'SERVER_KEEP_ALIVE_TIMEOUT_MS',     secretRef: 'edu-server-keep-alive-timeout-ms' }
            { name: 'SERVER_HEADERS_TIMEOUT_MS',        secretRef: 'edu-server-headers-timeout-ms' }
            { name: 'DB_POOL_MAX',                      secretRef: 'edu-db-pool-max' }
            { name: 'DB_POOL_IDLE_TIMEOUT_MS',          secretRef: 'edu-db-pool-idle-timeout-ms' }
            { name: 'DB_POOL_ACQUIRE_TIMEOUT_MS',       secretRef: 'edu-db-pool-acquire-timeout-ms' }
            { name: 'HEAP_LOG_INTERVAL_MS',             secretRef: 'edu-heap-log-interval-ms' }
            // Rolling send-rate limits enforced by MailRateLimiterService —
            // see src/mail/mail-rate-limit.constants.ts.
            { name: 'MAIL_RATE_LIMIT_PER_MINUTE',       secretRef: 'edu-mail-rate-limit-per-minute' }
            { name: 'MAIL_RATE_LIMIT_PER_HOUR',         secretRef: 'edu-mail-rate-limit-per-hour' }
            // RWAI-3094: sole account allowed to see/launch the automation-only
            // unit/simulation — see src/common/utils/automation-access.service.ts.
            { name: 'AUTOMATION_TESTER_EMAIL',          secretRef: 'edu-automation-tester-email' }
            // RWAI-3018: forgot-password abuse-prevention thresholds — see
            // src/common/constants/throttle.constants.ts.
            { name: 'AUTH_FORGOT_PASSWORD_COOLDOWN_SECONDS', secretRef: 'edu-auth-forgot-password-cooldown-seconds' }
            { name: 'AUTH_FORGOT_PASSWORD_LIMIT',            secretRef: 'edu-auth-forgot-password-limit' }
            { name: 'AUTH_FORGOT_PASSWORD_TTL',              secretRef: 'edu-auth-forgot-password-ttl' }
            { name: 'AUTH_FORGOT_PASSWORD_IP_LIMIT',         secretRef: 'edu-auth-forgot-password-ip-limit' }
            { name: 'AUTH_FORGOT_PASSWORD_IP_WINDOW_SECONDS', secretRef: 'edu-auth-forgot-password-ip-window-seconds' }
            { name: 'GOOGLE_CLASSROOM_SUCCESS_REDIRECT_PATH', secretRef: 'edu-google-classroom-success-redirect-path' }
            { name: 'GOOGLE_CLASSROOM_CLIENT_ID',             secretRef: 'edu-google-classroom-oauth-client-id' }
            { name: 'GOOGLE_CLASSROOM_CLIENT_SECRET',         secretRef: 'edu-google-classroom-oauth-client-secret' }
            { name: 'GOOGLE_CLASSROOM_REDIRECT_URI',          secretRef: 'edu-google-classroom-oauth-redirect-uri' }
            // APPLICATIONINSIGHTS_APP_ID / APPLICATIONINSIGHTS_API_KEY / SPEECH_ENGINE_* /
            // REPORT_EMAIL_TO / EMAIL_USER / EMAIL_PASS / EMAIL_FROM:
            // deliberately omitted — see the kvSecretNames comment above. None
            // has a real value yet, and ACA cannot resolve an empty-string KV
            // secret (confirmed by a live deployment failure).
            { name: 'REDIS_HOST',                       secretRef: 'edu-redis-host' }
            { name: 'REDIS_PORT',                       secretRef: 'edu-redis-port' }
            { name: 'REDIS_PASSWORD',                   secretRef: 'edu-redis-password' }
          ], avatarServiceKeyEnabled ? [
            { name: 'AVATAR_SERVICE_KEY',               secretRef: avatarServiceKeySecretName }
          ] : [])
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
      ]
      scale: {
        minReplicas: effectiveMinReplicas
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
