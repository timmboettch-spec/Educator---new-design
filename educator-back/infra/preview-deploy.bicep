// =============================================================================
// PR/branch preview container (RG scope) — runs from GHA on feature-branch push.
// -----------------------------------------------------------------------------
// Stands up a DEDICATED, ephemeral Container App per branch on the DEV infra,
// isolated from the real dev app (aca-dev1-rwai-eduback). Reuses the exact same
// module as app-deploy.bicep (modules/containerApp-backend.bicep) so the preview
// inherits ALL of the app's wiring with zero drift: managed Redis creds, every env var,
// KV secret refs, probes, and scale-to-zero.
//
// Differences from app-deploy.bicep:
//   • App name is caller-supplied (aca-p-<slug>-<hash>-eduback) instead of derived.
//     The "edu" segment is what keeps this app's previews from colliding with
//     other apps' previews (e.g. the HA student app) on the shared dev RG/ACR —
//     matching branch names across repos would otherwise produce identical
//     Container App names.
//   • Single revision at 100% traffic (no blue/green) — stableRevisionName is
//     always empty, so the module routes 100% to the latest revision.
//   • No custom domain — previews are reachable on their revision/app FQDN only.
//
// The preview reuses the DEV user-assigned identity (id-dev1-rwai-eduback), which
// already holds AcrPull on the shared ACR and Key Vault Secrets User on the dev
// vault — so no per-preview identity or ACR admin credentials are needed.
// Cleanup (az containerapp delete) is handled by the workflow on branch delete /
// PR close, so these resources are never provisioned via a stack that needs
// teardown here.
// =============================================================================

// AVM-style metadata header per Organization-Standards-Policy MODULE-PATTERN.md.
metadata name        = 'Educator backend — PR/branch preview stack'
metadata description = 'Deploys a dedicated ephemeral Educator backend Container App for a feature branch, reusing modules/containerApp-backend.bicep on the dev environment.'
metadata version     = '1.0.0'
metadata owner       = 'platform@rwthrive.com'

targetScope = 'resourceGroup'

param location string = 'eastus'
param prefix string = 'rwai'
param app string = 'edu'
param azureVersion string = '1'

@description('Full Container App name for this preview, e.g. aca-p-<slug>-<hash>-eduback. Built by the workflow from the branch name.')
param previewAppName string

@description('Image tag for this preview build, e.g. prev-<slug>-<hash>-<sha7>.')
param backendImageTag string

@description('This branch\'s own preview database on the dev Postgres server (educator_p_<slug>_<hash>), created/migrated/seeded by the preview-db-check job before this deploy. Previews never use educator_dev.')
param previewDbName string

// Previews always target the DEV environment's shared infra.
var environment = 'dev'

// Revision suffix derived from the image tag — one addressable revision per
// build. MUST be unique per push to the same branch: backendImageTag is
// `prev-<slug>-<hash>-<sha7>`, and take(tag, 12) only ever captures "prev-"
// plus the first 7 chars of <slug> — never the <hash>/<sha7> portion, which
// are the only parts that change between pushes to the same branch. Every
// push to a given branch produced the byte-identical suffix, colliding with
// the still-existing revision from its previous push and failing the
// deployment ("revision with suffix ... already exists"). uniqueString()
// hashes the FULL tag deterministically (13 lowercase alphanumeric chars),
// so it changes whenever the tag does.
var revisionSuffix = 'p-${uniqueString(backendImageTag)}'

// ---------- derived names (same scheme as app-deploy.bicep, env pinned to dev) --
var sharedRgName        = 'ARG-all${azureVersion}-${prefix}'
var aenName             = 'AEN-${environment}${azureVersion}-${prefix}'
var acrName             = 'acrall${azureVersion}${prefix}'
var keyVaultName        = 'akv${environment}${azureVersion}${prefix}'
var appInsightsName     = 'appi-all${azureVersion}-${prefix}'
var backendIdentityName = 'id-${environment}${azureVersion}-${prefix}-${app}back'

var commonTags = {
  app: 'educator-app'
  component: 'backend'
  environment: environment
  managedBy: 'bicep'
  preview: 'true'
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

// Previews reuse dev's ACS Communication Services resource (see
// infra/modules/acsEmail.bicep) the same way they reuse its UAI/KV above —
// no per-preview ACS resource, just the same endpoint dev's real app uses.
resource acsCommunicationService 'Microsoft.Communication/communicationServices@2023-04-01' existing = {
  name: 'acs-${environment}-${prefix}-${app}'
}

module backend 'modules/containerApp-backend.bicep' = {
  // Keyed off previewAppName (unique per branch), not the static `app` param —
  // concurrent previews for different branches previously all resolved to the
  // literal name "aca-edu-back-preview" and collided in ARM with
  // "DeploymentActive" when two branches deployed at the same time.
  name: 'aca-${previewAppName}-back-preview'
  params: {
    name: previewAppName
    location: location
    tags: commonTags
    environment: environment
    managedEnvironmentId: aen.id
    acrLoginServer: acr.properties.loginServer
    imageName: 'educator-backend'
    imageTag: backendImageTag
    keyVaultName: keyVaultName
    appInsightsConnectionString: appi.properties.ConnectionString
    // No custom domain on previews.
    customDomain: ''
    customDomainCertificateId: ''
    userAssignedIdentityId: backendUai.id
    userAssignedIdentityPrincipalId: backendUai.properties.principalId
    userAssignedIdentityClientId: backendUai.properties.clientId
    acsEndpoint: 'https://${acsCommunicationService.properties.hostName}'
    revisionSuffix: revisionSuffix
    // Empty → module routes 100% traffic to the latest (only) revision.
    stableRevisionName: ''
    // Pin 1 warm replica explicitly on first deploy rather than relying on
    // dev's shared tier (resourceMap.dev.minReplicas), so previews don't
    // silently regress if that tier ever changes. The workflow scales this
    // back to 0 once the smoke-test job finishes, since previews are
    // ephemeral and would otherwise sit warm (billed) until branch delete /
    // PR close.
    minReplicasOverride: 1
    dbNameOverride: previewDbName
  }
}

output backendAppName string = backend.outputs.name
output backendFqdn string = backend.outputs.fqdn
output newRevisionName string = backend.outputs.newRevisionName
