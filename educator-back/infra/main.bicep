// =============================================================================
// Educator App Backend — subscription-scope entry point
// -----------------------------------------------------------------------------
// CI smoke: post-Bicep + post-provision deploy validation (2026-06-12).
// References the per-env Resource Group as `existing` (RG is owned by the
// HS-Online-AI deploy script and shared across multiple apps in this org).
// Deploys all Educator-owned resources via resources.bicep at RG scope.
//
// Source-of-truth design (mirrors Crexo-Educator-Backend):
//   • KV `akv{env}1rwai` is the single source of truth for runtime env vars.
//     The vault itself is referenced as `existing` (shared with other apps);
//     this template only writes Educator's `edu-*` secrets.
//   • Postgres server `psql-{env}1-rwai-edu` is reconciled by Bicep.
//   • Container App `aca-{env}1-rwai-eduback` is reconciled by Bicep with
//     all env vars wired as `secretRef:` to KV-backed container app secrets.
//   • App Insights `appi-all1-rwai`, Storage `asa{env}1rwai`, ACR, AEN,
//     and Log Analytics are referenced as `existing`.
// =============================================================================

targetScope = 'subscription'

@description('Deployment environment.')
@allowed(['dev', 'qa', 'prod'])
param environment string

@description('Azure region.')
param location string = 'eastus'

@description('Azure region for Postgres Flexible Server. Override when the subscription is restricted in the primary region.')
param postgresLocation string = 'eastus2'

@description('Org-level resource prefix.')
param prefix string = 'rwai'

@description('App-level resource token.')
param app string = 'edu'

@description('Azure resource version.')
param azureVersion string = '1'

@description('Image tag (commit SHA) for the backend container.')
param backendImageTag string = 'placeholder'

@description('Postgres administrator login.')
param postgresAdminLogin string = 'eduadmin'

@description('Postgres administrator password. Pass via -p on every provision.')
@secure()
param postgresAdminPassword string

// ---------- Sensitive runtime secrets (empty preserves existing KV value) ----
@secure()
param jwtSecret string = ''
@secure()
param azureStorageConnectionString string = ''
@secure()
param ltiFallbackKeyId string = ''
@secure()
param ltiFallbackPrivateKeyPem string = ''
@secure()
param openaiApiKey string = ''
@secure()
param appInsightsApiKey string = ''
@secure()
param speechEngineApiKey string = ''
@secure()
param emailUser string = ''
@secure()
param emailPass string = ''
@secure()
param lmsSecretsEncryptionKey string = ''
@secure()
param cryptoSecret string = ''
@secure()
param googleClassroomClientSecret string = ''

// ---------- Defaulted runtime values (always written to KV) ------------------
param nodeEnv string = 'production'
param appPort string = '3000'
param jwtExpiresIn string = '7d'
param mailFrom string = 'no-reply@realityworks.com'
param azureBlobContainerName string = 'json-data'
// Feature flag consumed by the backend as LMS_ENABLE_LTI_AUTO_PROVISION.
// Values are strings ('true' / 'false') so they can flow unchanged through KV.
param lmsEnableLtiAutoProvision string = 'true'

// ---------- Student-backend consolidation (defaulted, always written) --------
param azureBlobDataContainerName string = 'rwai-data-files'
param scenarioHydrationConcurrency string = '32'
param jsonCacheMetadataCheckIntervalMs string = '3000'
param localizedScenariosCacheTtlMs string = '30000'
// 'api-key' everywhere for now — 'managed-identity' would need the backend's
// UAI granted Monitoring Reader on App Insights, and no identity in this
// subscription currently holds the User Access Administrator/Owner rights
// needed to grant that role. Switch to 'managed-identity' (+ AZURE_CLIENT_ID,
// already wired) once that access is arranged.
param appinsightsAuthType string = 'api-key'
param telemetrySamplingPriority string = '100'
param telemetryLifecycleEnabled string = 'true'
param conversationProvider string = 'ai'

// ---------- API timeout handling (defaulted, always written) -----------------
// Cold-start / connection-pool hardening. Read directly via process.env in
// src/main.ts, src/config/db.config.ts, and request-timeout.interceptor.ts.
param apiTimeoutMs string = '60000'
param serverKeepAliveTimeoutMs string = '65000'
param serverHeadersTimeoutMs string = '66000'
param dbPoolMax string = '10'
param dbPoolIdleTimeoutMs string = '30000'
param dbPoolAcquireTimeoutMs string = '5000'
param heapLogIntervalMs string = '60000'
// Rolling send-rate limits enforced by MailRateLimiterService — mirrors
// ACS Email's own limits (30/min, 100/hour).
param mailRateLimitPerMinute string = '30'
param mailRateLimitPerHour string = '100'
// RWAI-3094: sole account allowed to see/launch the automation-only unit
// (AUTO-UNIT-001) and simulation ("Pressure Injury Prevention Assessment").
param automationTesterEmail string = 'test@curionn.com'
// RWAI-3018: forgot-password abuse-prevention — 60s per-request cooldown, a
// 6 requests/15min per-account cap, and a 10 requests/15min per-source-IP cap.
param authForgotPasswordCooldownSeconds string = '60'
param authForgotPasswordLimit string = '6'
param authForgotPasswordTtl string = '900000'
param authForgotPasswordIpLimit string = '10'
param authForgotPasswordIpWindowSeconds string = '900'
// Path (relative to FRONTEND_URL) the frontend redirects to after a
// successful Google Classroom OAuth connect.
param googleClassroomSuccessRedirectPath string = '/google-classroom'
// RWAI-3154: LTI classroom-burst rate limit (shared IP bucket for login →
// callback → launch → session/exchange). TTL is seconds.
param ltiLaunchRateLimit string = '60'
param ltiLaunchRateTtl string = '10'

// ---------- Empty-allowed runtime (only written to KV when non-empty) --------
param appUrl string = ''
param frontendUrl string = ''
param viteApiUrl string = ''
param azureStorageAccount string = ''
param azureStorageContainer string = ''
param aiModel string = ''
param appInsightsAppId string = ''
param speechEngineProvider string = ''
param speechEngineApiUrl string = ''
param speechEngineModel string = ''
param speechEngineLanguage string = ''
param reportEmailTo string = ''
param emailHost string = ''
param emailPort string = ''
param emailFrom string = ''
param emailMode string = ''
param googleClassroomClientId string = ''
param googleClassroomRedirectUri string = ''

// ---------- Custom domain bindings ------------------------------------------
@description('Custom domain for the backend API (optional). Used to derive APP_URL when set.')
param backendCustomDomain string = ''

@description('ARM resource ID of an existing managed certificate for backendCustomDomain. Empty on first provision.')
param backendCustomDomainCertificateId string = ''

// ---------- hs-online weekly snapshot-to-git job (all optional) -------------
@description('"owner/repo" of the private snapshot repo. Empty skips deploying the job — see docs/WEEKLY-SNAPSHOT.md.')
param snapshotRepo string = ''
param snapshotGitAppId string = ''
param snapshotGitAppInstallationId string = ''
param snapshotCronExpression string = '0 11 * * *'
param snapshotImageTag string = 'placeholder'
@secure()
param snapshotGitAppPrivateKey string = ''
@description('Teams incoming-webhook URL for push notifications. Empty skips wiring notifications for this deploy — see docs/WEEKLY-SNAPSHOT.md.')
@secure()
param snapshotTeamsWebhookUrl string = ''
@description('Optional literal text prefixed onto FAILURE Teams notifications only (e.g. an @mention). Not secret.')
param snapshotTeamsMention string = ''

// ---------- derived names ---------------------------------------------------
var rgName        = 'ARG-${environment}${azureVersion}-${prefix}'
var sharedRgName  = 'ARG-all${azureVersion}-${prefix}'
var aenName       = 'AEN-${environment}${azureVersion}-${prefix}'
var aenRgName     = rgName
var acrName       = 'acrall${azureVersion}${prefix}'
var lawName       = 'ALA-all${azureVersion}-${prefix}'
var lawRgName     = sharedRgName
var appInsightsName   = 'appi-all${azureVersion}-${prefix}'
var appInsightsRgName = sharedRgName
var keyVaultName  = 'akv${environment}${azureVersion}${prefix}'
var storageName   = empty(azureStorageAccount) ? 'asa${environment}${azureVersion}${prefix}' : azureStorageAccount

// ---------- existing resource group (created by HS-Online-AI deploy script) -
resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' existing = {
  name: rgName
}

module resources 'resources.bicep' = {
  name: 'edu-back-${environment}-resources'
  scope: rg
  params: {
    environment: environment
    location: location
    postgresLocation: postgresLocation
    prefix: prefix
    app: app
    azureVersion: azureVersion
    aenName: aenName
    aenRgName: aenRgName
    sharedRgName: sharedRgName
    acrName: acrName
    lawName: lawName
    lawRgName: lawRgName
    appInsightsName: appInsightsName
    appInsightsRgName: appInsightsRgName
    keyVaultName: keyVaultName
    storageName: storageName
    backendImageTag: backendImageTag
    postgresAdminLogin: postgresAdminLogin
    postgresAdminPassword: postgresAdminPassword
    backendCustomDomain: backendCustomDomain
    backendCustomDomainCertificateId: backendCustomDomainCertificateId

    jwtSecret: jwtSecret
    azureStorageConnectionString: azureStorageConnectionString
    ltiFallbackKeyId: ltiFallbackKeyId
    ltiFallbackPrivateKeyPem: ltiFallbackPrivateKeyPem
    openaiApiKey: openaiApiKey
    appInsightsApiKey: appInsightsApiKey
    speechEngineApiKey: speechEngineApiKey
    emailUser: emailUser
    emailPass: emailPass
    lmsSecretsEncryptionKey: lmsSecretsEncryptionKey
    cryptoSecret: cryptoSecret
    googleClassroomClientSecret: googleClassroomClientSecret

    nodeEnv: nodeEnv
    appPort: appPort
    jwtExpiresIn: jwtExpiresIn
    mailFrom: mailFrom
    azureBlobContainerName: azureBlobContainerName
    lmsEnableLtiAutoProvision: lmsEnableLtiAutoProvision
    azureBlobDataContainerName: azureBlobDataContainerName
    scenarioHydrationConcurrency: scenarioHydrationConcurrency
    jsonCacheMetadataCheckIntervalMs: jsonCacheMetadataCheckIntervalMs
    localizedScenariosCacheTtlMs: localizedScenariosCacheTtlMs
    appinsightsAuthType: appinsightsAuthType
    telemetrySamplingPriority: telemetrySamplingPriority
    telemetryLifecycleEnabled: telemetryLifecycleEnabled
    conversationProvider: conversationProvider
    apiTimeoutMs: apiTimeoutMs
    serverKeepAliveTimeoutMs: serverKeepAliveTimeoutMs
    serverHeadersTimeoutMs: serverHeadersTimeoutMs
    dbPoolMax: dbPoolMax
    dbPoolIdleTimeoutMs: dbPoolIdleTimeoutMs
    dbPoolAcquireTimeoutMs: dbPoolAcquireTimeoutMs
    heapLogIntervalMs: heapLogIntervalMs
    mailRateLimitPerMinute: mailRateLimitPerMinute
    mailRateLimitPerHour: mailRateLimitPerHour
    automationTesterEmail: automationTesterEmail
    authForgotPasswordCooldownSeconds: authForgotPasswordCooldownSeconds
    authForgotPasswordLimit: authForgotPasswordLimit
    authForgotPasswordTtl: authForgotPasswordTtl
    authForgotPasswordIpLimit: authForgotPasswordIpLimit
    authForgotPasswordIpWindowSeconds: authForgotPasswordIpWindowSeconds
    googleClassroomSuccessRedirectPath: googleClassroomSuccessRedirectPath
    ltiLaunchRateLimit: ltiLaunchRateLimit
    ltiLaunchRateTtl: ltiLaunchRateTtl

    appUrl: appUrl
    frontendUrl: frontendUrl
    viteApiUrl: viteApiUrl
    azureStorageAccount: azureStorageAccount
    azureStorageContainer: azureStorageContainer

    snapshotRepo: snapshotRepo
    snapshotGitAppId: snapshotGitAppId
    snapshotGitAppInstallationId: snapshotGitAppInstallationId
    snapshotCronExpression: snapshotCronExpression
    snapshotImageTag: snapshotImageTag
    snapshotGitAppPrivateKey: snapshotGitAppPrivateKey
    snapshotTeamsWebhookUrl: snapshotTeamsWebhookUrl
    snapshotTeamsMention: snapshotTeamsMention

    aiModel: aiModel
    appInsightsAppId: appInsightsAppId
    speechEngineProvider: speechEngineProvider
    speechEngineApiUrl: speechEngineApiUrl
    speechEngineModel: speechEngineModel
    speechEngineLanguage: speechEngineLanguage
    reportEmailTo: reportEmailTo
    emailHost: emailHost
    emailPort: emailPort
    emailFrom: emailFrom
    emailMode: emailMode
    googleClassroomClientId: googleClassroomClientId
    googleClassroomRedirectUri: googleClassroomRedirectUri
  }
}

output resourceGroupName string = rg.name
output backendAppName string = resources.outputs.backendAppName
output backendFqdn string = resources.outputs.backendFqdn
output keyVaultName string = resources.outputs.keyVaultName
output postgresServerName string = resources.outputs.postgresServerName
output postgresFqdn string = resources.outputs.postgresFqdn
output redisCacheName string = resources.outputs.redisCacheName
output redisHostName string = resources.outputs.redisHostName
