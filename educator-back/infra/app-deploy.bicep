// =============================================================================
// Backend container-app redeploy (RG scope) — runs from GHA on every push.
// -----------------------------------------------------------------------------
// Reconciles ONLY the Container App spec: image tag, env array, secret refs,
// cpu/memory, probes. Does not touch KV values, Postgres, or role assignments.
// Those are owned by resources.bicep, invoked manually via Deploy-Backend.ps1.
// =============================================================================

targetScope = 'resourceGroup'

@allowed(['dev', 'qa', 'prod'])
param environment string
param location string = 'eastus'
param prefix string = 'rwai'
param app string = 'edu'
param azureVersion string = '1'

@description('Image tag (commit SHA).')
param backendImageTag string

@description('Custom domain bound to the container app (optional).')
param backendCustomDomain string = ''

@description('ARM resource ID of the managed certificate for backendCustomDomain.')
param backendCustomDomainCertificateId string = ''

@description('false = deploy ONLY the migrate job (new image tag), skipping the Container App. The workflow does this first and runs the job to completion, so migrations are applied before the new revision is created.')
param deployApp bool = true

@description('Name of the currently-live (stable) revision, captured by the workflow before this deploy. Empty on first deploy.')
param stableRevisionName string = ''

// Blue/green revision suffix derived from the image tag (commit SHA) so every
// deploy creates a distinct, addressable revision for the staging smoke gate.
var revisionSuffix = 'bg-${take(backendImageTag, 7)}'

// ---------- derived names ---------------------------------------------------
var sharedRgName       = 'ARG-all${azureVersion}-${prefix}'
var aenName            = 'AEN-${environment}${azureVersion}-${prefix}'
var acrName            = 'acrall${azureVersion}${prefix}'
var keyVaultName       = 'akv${environment}${azureVersion}${prefix}'
var appInsightsName    = 'appi-all${azureVersion}-${prefix}'
var backendAppName     = 'aca-${environment}${azureVersion}-${prefix}-${app}back'
var backendIdentityName = 'id-${environment}${azureVersion}-${prefix}-${app}back'
var migrateJobName     = 'acj-${environment}${azureVersion}-${prefix}-${app}migrate'

var commonTags = {
  app: 'educator-app'
  component: 'backend'
  environment: environment
  managedBy: 'bicep'
}

resource aen 'Microsoft.App/managedEnvironments@2024-03-01' existing = {
  name: aenName
}

resource acr 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' existing = {
  name: acrName
  scope: resourceGroup(sharedRgName)
}

resource appi 'Microsoft.Insights/components@2020-02-02' existing = {
  name: appInsightsName
  scope: resourceGroup(sharedRgName)
}

resource backendUai 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: backendIdentityName
}

// ACS Communication Services resource for this environment — provisioned by
// resources.bicep (infra/modules/acsEmail.bicep), NOT by this file (this
// template only reconciles the Container App spec, per the header above).
// Must already exist for `environment` before this redeploy path can run.
// Provisioned for dev/qa/prod (see docs/adr/0001-mail-service-managed-identity.md
// "Domains & DNS") — prod's domain isn't linked yet (blocked on Porkbun API
// access for realityworks.com), but the Communication Services resource
// this `existing` reference needs already exists.
resource acsCommunicationService 'Microsoft.Communication/communicationServices@2023-04-01' existing = {
  name: 'acs-${environment}-${prefix}-${app}'
}

module backend 'modules/containerApp-backend.bicep' = if (deployApp) {
  name: 'aca-${app}-back-${environment}-redeploy'
  params: {
    name: backendAppName
    location: location
    tags: commonTags
    environment: environment
    managedEnvironmentId: aen.id
    acrLoginServer: acr.properties.loginServer
    imageName: 'educator-backend'
    imageTag: backendImageTag
    keyVaultName: keyVaultName
    appInsightsConnectionString: appi.properties.ConnectionString
    customDomain: backendCustomDomain
    customDomainCertificateId: backendCustomDomainCertificateId
    userAssignedIdentityId: backendUai.id
    userAssignedIdentityPrincipalId: backendUai.properties.principalId
    userAssignedIdentityClientId: backendUai.properties.clientId
    acsEndpoint: 'https://${acsCommunicationService.properties.hostName}'
    revisionSuffix: revisionSuffix
    stableRevisionName: stableRevisionName
  }
}

// Migrate + seed Container Apps Job — same image tag as the app, started by the
// workflow after this deploy (migrations no longer run at container startup).
module migrateJob 'modules/containerAppsJob-migrate.bicep' = {
  name: 'acj-${app}-migrate-${environment}-redeploy'
  params: {
    name: migrateJobName
    location: location
    tags: commonTags
    environment: environment
    managedEnvironmentId: aen.id
    acrLoginServer: acr.properties.loginServer
    imageName: 'educator-backend'
    imageTag: backendImageTag
    keyVaultName: keyVaultName
    userAssignedIdentityId: backendUai.id
    userAssignedIdentityClientId: backendUai.properties.clientId
  }
}

output backendAppName string = backend.?outputs.name ?? ''
output backendFqdn string = backend.?outputs.fqdn ?? ''
output newRevisionName string = backend.?outputs.newRevisionName ?? ''
output migrateJobName string = migrateJob.outputs.name
