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

module backend 'modules/containerApp-backend.bicep' = {
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
    revisionSuffix: revisionSuffix
    stableRevisionName: stableRevisionName
  }
}

output backendAppName string = backend.outputs.name
output backendFqdn string = backend.outputs.fqdn
output newRevisionName string = backend.outputs.newRevisionName
