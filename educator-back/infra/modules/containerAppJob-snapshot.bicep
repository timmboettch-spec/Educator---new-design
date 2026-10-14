// =============================================================================
// hs-online weekly snapshot-to-git Container Apps Job.
// -----------------------------------------------------------------------------
// Scheduled job (cron, default Thursdays 12:00 UTC) that pulls the backend's
// JSON blob data and pushes a dated commit to the private
// student-app-scenario-snapshot repo, for the same reasons/conventions as the
// backend Container App:
//   - User-assigned managed identity, created up-front in resources.bicep so
//     AcrPull + Storage Blob Data Reader + Key Vault Secrets User can all be
//     granted BEFORE the Job is created.
//   - The GitHub App private key (and, optionally, a Teams webhook URL for
//     push notifications) are Key Vault-referenced Job secrets, resolved by
//     the Container Apps platform itself using the Job's identity — never a
//     plain env var, never baked into the image, and never fetched a second
//     time by the script (it just reads the env var the platform injects).
//   - GIT_APP_ID / GIT_APP_INSTALLATION_ID are identifiers, not credentials —
//     plain env vars like the backend's bootstrap KV env vars.
// =============================================================================

param name string
param location string
param tags object = {}

param managedEnvironmentId string
param acrLoginServer string
param imageName string
param imageTag string

param userAssignedIdentityId string
@description('Client ID (GUID) of the user-assigned identity above. Required so the container requests a token for THIS identity from the Container Apps MSI endpoint instead of defaulting to a (nonexistent) system-assigned one.')
param userAssignedIdentityClientId string

param keyVaultName string
@description('Name of the Key Vault secret holding the GitHub App private key (PEM).')
param gitAppPrivateKeySecretName string = 'snap-git-app-private-key'

@description('Name of the Key Vault secret holding the Teams incoming-webhook URL. Only wired up when non-empty — leave empty to run without push notifications.')
param teamsWebhookSecretName string = ''

@description('Optional literal text prefixed onto FAILURE Teams notifications only (e.g. an @mention, once/if the webhook is upgraded to a Workflows connector that renders them). Not secret. Never applied to success notifications.')
param teamsMention string = ''

param sourceStorageAccountName string
param sourceContainerName string

@description('GitHub App ID (not secret).')
param gitAppId string

@description('GitHub App installation ID for the target repo (not secret).')
param gitAppInstallationId string

@description('"owner/repo" of the private snapshot repo, e.g. Realityworks-AI/student-app-scenario-snapshot.')
param snapshotRepo string

@description('Cron expression for the schedule trigger. Default: daily 11:00 UTC (~6:00 AM US Central, CDT UTC-5) — scenario files are the priority use case and need to land daily, not weekly. Container Apps cron is UTC-only with no DST awareness, so this drifts to ~7:00 AM once CST (UTC-6) kicks in for winter — revisit then if that matters.')
param cronExpression string = '0 11 * * *'

// Compose vaultUri from name+suffix — matches containerApp-backend.bicep's
// approach (BCP182: can't use kv.properties.vaultUri inline where needed).
var kvUri = 'https://${keyVaultName}${az.environment().suffixes.keyvaultDns}/'

// Image strategy: first provision has no image in ACR yet, so fall back to
// a placeholder rather than fail — matches containerApp-backend.bicep.
var placeholderImage = 'mcr.microsoft.com/k8se/quickstart:latest'
var useRealImage     = !empty(imageTag) && imageTag != 'placeholder'
var imageRef         = useRealImage ? '${acrLoginServer}/${imageName}:${imageTag}' : placeholderImage

var hasTeamsWebhook = !empty(teamsWebhookSecretName)

var baseSecrets = [
  {
    name: 'git-app-private-key'
    keyVaultUrl: '${kvUri}secrets/${gitAppPrivateKeySecretName}'
    identity: userAssignedIdentityId
  }
]
var teamsSecrets = hasTeamsWebhook ? [
  {
    name: 'teams-webhook-url'
    keyVaultUrl: '${kvUri}secrets/${teamsWebhookSecretName}'
    identity: userAssignedIdentityId
  }
] : []

var baseEnv = [
  { name: 'SOURCE_STORAGE_ACCOUNT',    value: sourceStorageAccountName }
  { name: 'SOURCE_CONTAINER',          value: sourceContainerName }
  { name: 'GIT_APP_ID',                value: gitAppId }
  { name: 'GIT_APP_INSTALLATION_ID',   value: gitAppInstallationId }
  { name: 'SNAPSHOT_REPO',             value: snapshotRepo }
  { name: 'GIT_APP_PRIVATE_KEY',       secretRef: 'git-app-private-key' }
  // Container Apps' MSI token endpoint defaults to the system-assigned
  // identity (which doesn't exist here) unless a specific identity is
  // requested — entrypoint.ps1 passes this as client_id on the token call.
  { name: 'SNAPSHOT_UAI_CLIENT_ID',    value: userAssignedIdentityClientId }
]
var teamsEnv = hasTeamsWebhook ? concat(
  [{ name: 'TEAMS_WEBHOOK_URL', secretRef: 'teams-webhook-url' }],
  !empty(teamsMention) ? [{ name: 'SNAPSHOT_TEAMS_MENTION', value: teamsMention }] : []
) : []

resource job 'Microsoft.App/jobs@2024-03-01' = {
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
    environmentId: managedEnvironmentId
    configuration: {
      // Individually downloading thousands of per-record report/transcript
      // blobs (in addition to the bulk files, for readable weekly diffs)
      // pushed a real run past the original 600s ceiling — a 7,515-file
      // reports/ listing alone didn't finish in time. It's a weekly job,
      // so a longer ceiling doesn't risk piling up runs; 1800s gives real
      // headroom without leaving a truly hung run unbounded.
      replicaTimeout: 1800
      replicaRetryLimit: 1
      triggerType: 'Schedule'
      scheduleTriggerConfig: {
        cronExpression: cronExpression
        parallelism: 1
        replicaCompletionCount: 1
      }
      registries: useRealImage ? [
        { server: acrLoginServer, identity: userAssignedIdentityId }
      ] : []
      secrets: concat(baseSecrets, teamsSecrets)
    }
    template: {
      containers: [
        {
          name: 'snapshot'
          image: imageRef
          // reports.json alone OOM'd a 1Gi container even just parsing the
          // JSON (before any of our own processing) — bumped to the AEN's
          // Consumption workload-profile ceiling minus headroom.
          resources: {
            cpu: json('2.0')
            memory: '4Gi'
          }
          env: concat(baseEnv, teamsEnv)
        }
      ]
    }
  }
}

output id string = job.id
output name string = job.name
