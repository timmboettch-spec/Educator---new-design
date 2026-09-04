// =============================================================================
// Educator App Backend — RG-scope resources
// -----------------------------------------------------------------------------
// References pre-existing shared infra (KV, Storage, AEN, ACR, AAI, LAW) and
// reconciles Educator-owned resources (Postgres, KV secrets, Container App,
// AcrPull role assignment).
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

// ---------- Sensitive runtime secrets (empty preserves existing KV value) ---
@secure()
param jwtSecret string = ''
@secure()
param graphClientSecret string = ''
@secure()
param azureStorageConnectionString string = ''
@secure()
param ltiFallbackKeyId string = ''
@secure()
param ltiFallbackPrivateKeyPem string = ''

// ---------- Defaulted runtime values (always written to KV) -----------------
param nodeEnv string
param appPort string
param jwtExpiresIn string
param mailFrom string
param azureBlobContainerName string
// Feature flag consumed by the backend as LMS_ENABLE_LTI_AUTO_PROVISION.
param lmsEnableLtiAutoProvision string
// "Student Report Available" email gating — REPORT_EMAILS_DISABLED (kill
// switch) and REPORT_EMAILS_TEST_SCHOOLS (never-email school patterns).
param reportEmailsDisabled string
param reportEmailsTestSchools string

// ---------- Empty-allowed runtime (only written to KV when non-empty) -------
param appUrl string = ''
param frontendUrl string = ''
param viteApiUrl string = ''
param graphTenantId string = ''
param graphClientId string = ''
param azureStorageAccount string = ''
param azureStorageContainer string = ''

// ---------- derived names ---------------------------------------------------
var postgresServerName = 'psql-${environment}${azureVersion}-${prefix}-${app}'
var postgresDbNameMap = {
  dev:  'educator_dev'
  qa:   'educator_qa'
  prod: 'educator_prod'
}
var postgresDbName = postgresDbNameMap[environment]
var backendAppName = 'aca-${environment}${azureVersion}-${prefix}-${app}back'
var backendIdentityName = 'id-${environment}${azureVersion}-${prefix}-${app}back'

// ---------- derived URLs ----------------------------------------------------
// Prefer the custom domain when bound; fall back to the param value the
// caller supplied (which may be empty on first provision).
var derivedAppUrl = !empty(backendCustomDomain) ? 'https://${backendCustomDomain}' : appUrl

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

    // defaulted (always written)
    nodeEnv: nodeEnv
    appPort: appPort
    jwtExpiresIn: jwtExpiresIn
    mailFrom: mailFrom
    azureBlobContainerName: azureBlobContainerName
    lmsEnableLtiAutoProvision: lmsEnableLtiAutoProvision
    reportEmailsDisabled: reportEmailsDisabled
    reportEmailsTestSchools: reportEmailsTestSchools

    // sensitive (empty preserves existing)
    dbPassword: postgresAdminPassword
    jwtSecret: jwtSecret
    graphClientSecret: graphClientSecret
    azureStorageConnectionString: azureStorageConnectionString
    ltiFallbackKeyId: ltiFallbackKeyId
    ltiFallbackPrivateKeyPem: ltiFallbackPrivateKeyPem

    // empty-allowed (only written when non-empty)
    appUrl: derivedAppUrl
    frontendUrl: frontendUrl
    viteApiUrl: viteApiUrl
    graphTenantId: graphTenantId
    graphClientId: graphClientId
    azureStorageAccount: azureStorageAccount
    azureStorageContainer: azureStorageContainer
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
    revisionSuffix: backendRevisionSuffix
  }
  dependsOn: [
    // Make sure KV has the Educator secrets before the app tries to resolve them
    keyVaultSecrets
    // Make sure AcrPull is granted before ACA attempts its first pull
    backendAcrPull
    // Make sure KV Secrets User is granted before ACA fetches secrets
    backendKvRole
  ]
}

output backendAppName string = backend.outputs.name
output backendFqdn string = backend.outputs.fqdn
output keyVaultName string = kv.name
output postgresServerName string = postgres.outputs.serverName
output postgresFqdn string = postgres.outputs.fqdn
output storageAccountName string = sa.name
