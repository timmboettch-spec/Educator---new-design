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
param graphClientSecret string = ''
@secure()
param azureStorageConnectionString string = ''
@secure()
param ltiFallbackKeyId string = ''
@secure()
param ltiFallbackPrivateKeyPem string = ''

// ---------- Defaulted runtime values (always written to KV) ------------------
param nodeEnv string = 'production'
param appPort string = '3000'
param jwtExpiresIn string = '7d'
param mailFrom string = 'no-reply@realityworks.com'
param azureBlobContainerName string = 'json-data'
// Feature flag consumed by the backend as LMS_ENABLE_LTI_AUTO_PROVISION.
// Values are strings ('true' / 'false') so they can flow unchanged through KV.
param lmsEnableLtiAutoProvision string = 'true'
// "Student Report Available" email gating, both strings for the same reason.
// reportEmailsDisabled='true' stops ALL report email (mailbox drain lever).
// reportEmailsTestSchools lists school-name patterns that never get email.
param reportEmailsDisabled string = 'false'
param reportEmailsTestSchools string = 'Beta Test,Test'

// ---------- Empty-allowed runtime (only written to KV when non-empty) --------
param appUrl string = ''
param frontendUrl string = ''
param viteApiUrl string = ''
param graphTenantId string = ''
param graphClientId string = ''
param azureStorageAccount string = ''
param azureStorageContainer string = ''

// ---------- Custom domain bindings ------------------------------------------
@description('Custom domain for the backend API (optional). Used to derive APP_URL when set.')
param backendCustomDomain string = ''

@description('ARM resource ID of an existing managed certificate for backendCustomDomain. Empty on first provision.')
param backendCustomDomainCertificateId string = ''

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
    graphClientSecret: graphClientSecret
    azureStorageConnectionString: azureStorageConnectionString
    ltiFallbackKeyId: ltiFallbackKeyId
    ltiFallbackPrivateKeyPem: ltiFallbackPrivateKeyPem

    nodeEnv: nodeEnv
    appPort: appPort
    jwtExpiresIn: jwtExpiresIn
    mailFrom: mailFrom
    azureBlobContainerName: azureBlobContainerName
    lmsEnableLtiAutoProvision: lmsEnableLtiAutoProvision
    reportEmailsDisabled: reportEmailsDisabled
    reportEmailsTestSchools: reportEmailsTestSchools

    appUrl: appUrl
    frontendUrl: frontendUrl
    viteApiUrl: viteApiUrl
    graphTenantId: graphTenantId
    graphClientId: graphClientId
    azureStorageAccount: azureStorageAccount
    azureStorageContainer: azureStorageContainer
  }
}

output resourceGroupName string = rg.name
output backendAppName string = resources.outputs.backendAppName
output backendFqdn string = resources.outputs.backendFqdn
output keyVaultName string = resources.outputs.keyVaultName
output postgresServerName string = resources.outputs.postgresServerName
output postgresFqdn string = resources.outputs.postgresFqdn
