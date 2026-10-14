// =============================================================================
// Educator App Backend — RG-scope resources
// -----------------------------------------------------------------------------
// References pre-existing shared infra (KV, Storage, AEN, ACR, AAI, LAW) and
// reconciles Educator-owned resources (Postgres, Redis cache, KV secrets,
// Container App, AcrPull role assignment).
// =============================================================================

targetScope = 'resourceGroup'

@allowed(['dev', 'qa', 'prod'])
param environment string
param location string
param postgresLocation string = location
param prefix string
param app string
param azureVersion string

param aenName string
param aenRgName string
param sharedRgName string
param acrName string
param lawName string
param lawRgName string
param appInsightsName string
param appInsightsRgName string
param keyVaultName string
param storageName string

param backendImageTag string

// Blue/green revision suffix derived from the image tag, matching app-deploy.bicep.
var backendRevisionSuffix = 'bg-${take(backendImageTag, 7)}'

param postgresAdminLogin string
@secure()
param postgresAdminPassword string

param backendCustomDomain string
param backendCustomDomainCertificateId string = ''

// ---------- hs-online weekly snapshot-to-git job (all optional) -------------
// The job module only deploys when snapshotRepo is non-empty, so it's safe to
// leave these unset until the GitHub App side (repo + App + installation) is
// ready — see docs/WEEKLY-SNAPSHOT.md.
@description('"owner/repo" of the private snapshot repo, e.g. Realityworks-AI/student-app-scenario-snapshot. Empty skips deploying the job.')
param snapshotRepo string = ''
param snapshotGitAppId string = ''
param snapshotGitAppInstallationId string = ''
param snapshotCronExpression string = '0 11 * * *'
param snapshotImageTag string = 'placeholder'
@secure()
param snapshotGitAppPrivateKey string = ''
@description('Teams incoming-webhook URL for push notifications. Empty preserves existing KV value; leave unset entirely to run without notifications.')
@secure()
param snapshotTeamsWebhookUrl string = ''
@description('Optional literal text prefixed onto FAILURE Teams notifications only (e.g. an @mention). Not secret.')
param snapshotTeamsMention string = ''

// ---------- Sensitive runtime secrets (empty preserves existing KV value) ---
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

// ---------- Defaulted runtime values (always written to KV) -----------------
param nodeEnv string
param appPort string
param jwtExpiresIn string
param mailFrom string
param azureBlobContainerName string
// Feature flag consumed by the backend as LMS_ENABLE_LTI_AUTO_PROVISION.
param lmsEnableLtiAutoProvision string

// ---------- Student-backend consolidation (defaulted, always written) -------
param azureBlobDataContainerName string
param scenarioHydrationConcurrency string
param jsonCacheMetadataCheckIntervalMs string
param localizedScenariosCacheTtlMs string
param appinsightsAuthType string
param telemetrySamplingPriority string
param telemetryLifecycleEnabled string
param conversationProvider string

// ---------- API timeout handling (defaulted, always written) ---------------
param apiTimeoutMs string
param serverKeepAliveTimeoutMs string
param serverHeadersTimeoutMs string
param dbPoolMax string
param dbPoolIdleTimeoutMs string
param dbPoolAcquireTimeoutMs string
param heapLogIntervalMs string
param mailRateLimitPerMinute string
param mailRateLimitPerHour string
param automationTesterEmail string
param authForgotPasswordCooldownSeconds string
param authForgotPasswordLimit string
param authForgotPasswordTtl string
param authForgotPasswordIpLimit string
param authForgotPasswordIpWindowSeconds string
param googleClassroomSuccessRedirectPath string
param ltiLaunchRateLimit string
param ltiLaunchRateTtl string

// ---------- Empty-allowed runtime (only written to KV when non-empty) -------
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

// ---------- derived names ---------------------------------------------------
var postgresServerName = 'psql-${environment}${azureVersion}-${prefix}-${app}'
var redisCacheName = 'redis-${environment}${azureVersion}-${prefix}-${app}back'
var postgresDbNameMap = {
  dev:  'educator_dev'
  qa:   'educator_qa'
  prod: 'educator_prod'
}
var postgresDbName = postgresDbNameMap[environment]

// Dev-only preview DB, same server as postgresDbName. A CI preflight job
// (test-integration in deploy-backend.yml) runs `migration:run` against it
// before build-and-deploy, so a broken migration fails there instead of
// against the real educator_dev the moment the staging revision boots.
var previewDbName = environment == 'dev' ? 'educator_preview' : ''

// Dev-only: Entra ID auth on Postgres, additive alongside password auth
// (see postgres.bicep's enableEntraAuth doc comment). Object ID is the
// `github-actions-sp` App Registration's service principal object ID (the
// deploy workflow's OIDC identity across every Realityworks-AI repo) — not
// a secret, an AAD object ID is just an identifier. Lets the CI
// preview-db-check job (preview-deploy.yml) mint a short-lived access token instead of reading
// a long-lived password out of Key Vault.
var enableEntraAuth = environment == 'dev'
var deploySpObjectId = '510aefcf-2313-448f-b8b6-48d06ed18644'
var deploySpDisplayName = 'github-actions-sp'
var backendAppName = 'aca-${environment}${azureVersion}-${prefix}-${app}back'
var backendIdentityName = 'id-${environment}${azureVersion}-${prefix}-${app}back'
// 'acj' (Azure Container App Job) matches the org-wide convention used by
// every other Container Apps Job (e.g. acj-{env}1-rwai-crxmigrate) — not 'job'.
var snapshotJobName = 'acj-${environment}${azureVersion}-${prefix}-${app}snap'
var snapshotIdentityName = 'id-${environment}${azureVersion}-${prefix}-${app}snap'
var snapshotGitAppPrivateKeySecretName = 'snap-git-app-private-key'
var snapshotTeamsWebhookSecretName = 'snap-teams-webhook-url'
var deploySnapshotJob = !empty(snapshotRepo)

// ---------- derived URLs ----------------------------------------------------
// Prefer the custom domain when bound; fall back to the param value the
// caller supplied (which may be empty on first provision).
var derivedAppUrl = !empty(backendCustomDomain) ? 'https://${backendCustomDomain}' : appUrl

// ACS Email's sender domain + username — derived from mailFrom (e.g.
// 'no-reply@dev.curionn.com' -> 'dev.curionn.com' / 'no-reply') rather than
// two more redundant params.
var mailDomain = split(mailFrom, '@')[1]
var mailUsername = split(mailFrom, '@')[0]

var commonTags = {
  app: 'educator-app'
  component: 'backend'
  environment: environment
  managedBy: 'bicep'
}

// ---------- references to existing shared infra -----------------------------
resource law 'Microsoft.OperationalInsights/workspaces@2023-09-01' existing = {
  name: lawName
  scope: resourceGroup(lawRgName)
}

resource aen 'Microsoft.App/managedEnvironments@2024-03-01' existing = {
  name: aenName
  scope: resourceGroup(aenRgName)
}

resource acr 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' existing = {
  name: acrName
  scope: resourceGroup(sharedRgName)
}

resource appi 'Microsoft.Insights/components@2020-02-02' existing = {
  name: appInsightsName
  scope: resourceGroup(appInsightsRgName)
}

resource kv 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

resource sa 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: storageName
}

// ---------- modules ---------------------------------------------------------

// Postgres Flexible Server (owned by Educator; reconciled idempotently).
module postgres 'modules/postgres.bicep' = {
  name: 'pg-${app}-${environment}'
  params: {
    serverName: postgresServerName
    databaseName: postgresDbName
    location: postgresLocation
    environment: environment
    tags: commonTags
    administratorLogin: postgresAdminLogin
    administratorPassword: postgresAdminPassword
    workspaceId: law.id
    additionalDatabaseNames: !empty(previewDbName) ? [previewDbName] : []
    enableEntraAuth: enableEntraAuth
    aadAdmins: enableEntraAuth ? [
      {
        objectId: backendIdentity.outputs.principalId
        principalName: backendIdentityName
        principalType: 'ServicePrincipal'
      }
      {
        objectId: deploySpObjectId
        principalName: deploySpDisplayName
        principalType: 'ServicePrincipal'
      }
    ] : []
  }
}

// Managed Redis cache (owned by Educator; replaces the old ACA sidecar).
// Entra ID auth against the backend UAI — no access key is issued or stored.
module redisCache 'modules/redisCache.bicep' = {
  name: 'redis-${app}-${environment}'
  params: {
    name: redisCacheName
    location: location
    environment: environment
    tags: commonTags
    workspaceId: law.id
    principalId: backendIdentity.outputs.principalId
  }
}

// Seed/refresh Educator's `edu-*` secrets in the shared per-env KV.
// Sensitive params: empty preserves existing value; non-empty overwrites.
// Resource-derived params: always written (postgres FQDN, etc.).
module keyVaultSecrets 'modules/keyVaultSecrets.bicep' = {
  name: 'kv-secrets-${app}-${environment}'
  params: {
    keyVaultName: kv.name
    secretPrefix: 'edu-'

    // resource-derived (always written)
    dbHost: postgres.outputs.fqdn
    dbPort: '5432'
    dbName: postgresDbName
    dbUsername: postgresAdminLogin
    dbNamePreview: previewDbName
    redisHost: redisCache.outputs.hostName
    redisPort: string(redisCache.outputs.port)
    redisPassword: redisCache.outputs.primaryKey

    // defaulted (always written)
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

    // sensitive (empty preserves existing)
    dbPassword: postgresAdminPassword
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

    // empty-allowed (only written when non-empty)
    appUrl: derivedAppUrl
    frontendUrl: frontendUrl
    viteApiUrl: viteApiUrl
    azureStorageAccount: azureStorageAccount
    azureStorageContainer: azureStorageContainer
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

// User-assigned managed identity for the backend ACA. Created up-front so
// AcrPull (cross-RG) can be granted BEFORE the ACA tries to pull, avoiding
// the system-MI race.
module backendIdentity 'modules/userAssignedIdentity.bicep' = {
  name: 'id-${app}-back-${environment}'
  params: {
    name: backendIdentityName
    location: location
    tags: commonTags
  }
}

// AcrPull role assignment for the backend's UAI on the shared ACR.
// Done BEFORE the backend ACA module runs.
module backendAcrPull 'modules/acrPullRoleAssignment.bicep' = {
  name: 'acrpull-${app}-back-${environment}'
  scope: resourceGroup(sharedRgName)
  params: {
    acrName: acrName
    principalId: backendIdentity.outputs.principalId
  }
}

// Key Vault Secrets User role assignment for the backend's UAI on the per-env KV.
// Done BEFORE the backend ACA module runs (so the ACA can fetch secrets on
// its first revision provision).
module backendKvRole 'modules/kvSecretsUserRoleAssignment.bicep' = {
  name: 'kvrole-${app}-back-${environment}'
  params: {
    keyVaultName: kv.name
    principalId: backendIdentity.outputs.principalId
  }
}

// Azure Communication Services Email — custom domain + MI role grant for the
// backend's own Email API sends (see infra/modules/acsEmail.bicep,
// src/mail/mail.service.ts). dev/qa/prod only differ in customDomainName,
// derived from mailFrom above.
module acsEmail 'modules/acsEmail.bicep' = {
  name: 'acs-email-${app}-${environment}'
  params: {
    environment: environment
    tags: commonTags
    prefix: prefix
    app: app
    customDomainName: mailDomain
    senderUsername: mailUsername
    principalId: backendIdentity.outputs.principalId
    workspaceId: law.id
  }
}

// Backend Container App.
module backend 'modules/containerApp-backend.bicep' = {
  name: 'aca-${app}-back-${environment}'
  params: {
    name: backendAppName
    location: location
    tags: commonTags
    environment: environment
    managedEnvironmentId: aen.id
    acrLoginServer: acr.properties.loginServer
    imageName: 'educator-backend'
    imageTag: backendImageTag
    keyVaultName: kv.name
    appInsightsConnectionString: appi.properties.ConnectionString
    customDomain: backendCustomDomain
    customDomainCertificateId: backendCustomDomainCertificateId
    userAssignedIdentityId: backendIdentity.outputs.id
    userAssignedIdentityPrincipalId: backendIdentity.outputs.principalId
    userAssignedIdentityClientId: backendIdentity.outputs.clientId
    acsEndpoint: acsEmail.outputs.endpoint
    revisionSuffix: backendRevisionSuffix
  }
  dependsOn: [
    // Make sure KV has the Educator secrets before the app tries to resolve them
    keyVaultSecrets
    // Make sure AcrPull is granted before ACA attempts its first pull
    backendAcrPull
    // Make sure KV Secrets User is granted before ACA fetches secrets
    backendKvRole
    // Make sure the Redis access policy assignment is granted before the
    // ACA tries to authenticate via Entra ID
    redisCache
    // acsEmail is already an implicit dependency via acsEndpoint:
    // acsEmail.outputs.endpoint above — no explicit dependsOn needed.
  ]
}

// ---------- hs-online weekly snapshot-to-git job ----------------------------
// Everything below is conditional on `deploySnapshotJob` (snapshotRepo set)
// so this can ship dormant until the GitHub App side is ready.

// GitHub App private key: written only when non-empty, same "empty preserves
// existing" convention as the sensitive secrets in keyVaultSecrets.bicep.
resource snapshotGitAppKeySecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(snapshotGitAppPrivateKey)) {
  parent: kv
  name: snapshotGitAppPrivateKeySecretName
  properties: { value: snapshotGitAppPrivateKey, contentType: 'text/plain' }
}

// Teams incoming-webhook URL for push notifications on each run. Optional —
// only wired into the Job (see snapshotJob below) when a value is supplied.
// Unlike the GitHub App key (needed every run, so it's fine to set-once and
// rely on "empty preserves existing"), this secretRef is only present on
// deploys where snapshotTeamsWebhookUrl is passed — a later re-provision
// that omits it will un-wire notifications until it's passed again.
resource snapshotTeamsWebhookSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(snapshotTeamsWebhookUrl)) {
  parent: kv
  name: snapshotTeamsWebhookSecretName
  properties: { value: snapshotTeamsWebhookUrl, contentType: 'text/plain' }
}

// User-assigned managed identity for the snapshot job. Created up-front so
// AcrPull / Storage Blob Data Reader / KV Secrets User can all be granted
// BEFORE the job is created, same reasoning as the backend's UAI.
module snapshotIdentity 'modules/userAssignedIdentity.bicep' = if (deploySnapshotJob) {
  name: 'id-${app}-snap-${environment}'
  params: {
    name: snapshotIdentityName
    location: location
    tags: commonTags
  }
}

module snapshotAcrPull 'modules/acrPullRoleAssignment.bicep' = if (deploySnapshotJob) {
  name: 'acrpull-${app}-snap-${environment}'
  scope: resourceGroup(sharedRgName)
  params: {
    acrName: acrName
    principalId: snapshotIdentity.outputs.principalId
  }
}

module snapshotKvRole 'modules/kvSecretsUserRoleAssignment.bicep' = if (deploySnapshotJob) {
  name: 'kvrole-${app}-snap-${environment}'
  params: {
    keyVaultName: kv.name
    principalId: snapshotIdentity.outputs.principalId
  }
}

// Read-only access to the backend's own blob container — the snapshot job
// reads the same JSON data the backend writes, so this scopes to the
// existing per-env storage account rather than provisioning a new one.
module snapshotStorageRole 'modules/storageBlobDataReaderRoleAssignment.bicep' = if (deploySnapshotJob) {
  name: 'blobrole-${app}-snap-${environment}'
  params: {
    storageAccountName: sa.name
    principalId: snapshotIdentity.outputs.principalId
  }
}

module snapshotJob 'modules/containerAppJob-snapshot.bicep' = if (deploySnapshotJob) {
  name: 'job-${app}-snap-${environment}'
  params: {
    name: snapshotJobName
    location: location
    tags: commonTags
    managedEnvironmentId: aen.id
    acrLoginServer: acr.properties.loginServer
    imageName: 'hs-snapshot'
    imageTag: snapshotImageTag
    userAssignedIdentityId: snapshotIdentity.outputs.id
    userAssignedIdentityClientId: snapshotIdentity.outputs.clientId
    keyVaultName: kv.name
    gitAppPrivateKeySecretName: snapshotGitAppPrivateKeySecretName
    teamsWebhookSecretName: !empty(snapshotTeamsWebhookUrl) ? snapshotTeamsWebhookSecretName : ''
    teamsMention: snapshotTeamsMention
    sourceStorageAccountName: sa.name
    sourceContainerName: azureBlobContainerName
    gitAppId: snapshotGitAppId
    gitAppInstallationId: snapshotGitAppInstallationId
    snapshotRepo: snapshotRepo
    cronExpression: snapshotCronExpression
  }
  dependsOn: [
    // Make sure AcrPull is granted before the Job attempts its first pull
    snapshotAcrPull
    // Make sure KV Secrets User is granted before the Job fetches the git credential
    snapshotKvRole
    // Make sure Storage Blob Data Reader is granted before the Job reads blobs
    snapshotStorageRole
    // Make sure the KV secrets exist before the Job references them by
    // keyVaultUrl — these have no implicit ARM dependency on the Job module
    // since the reference is a hand-built URL string, not a resource ID.
    snapshotGitAppKeySecret
    snapshotTeamsWebhookSecret
  ]
}

output backendAppName string = backend.outputs.name
output backendFqdn string = backend.outputs.fqdn
output keyVaultName string = kv.name
output postgresServerName string = postgres.outputs.serverName
output postgresFqdn string = postgres.outputs.fqdn
output redisCacheName string = redisCache.outputs.name
output redisHostName string = redisCache.outputs.hostName
output storageAccountName string = sa.name
