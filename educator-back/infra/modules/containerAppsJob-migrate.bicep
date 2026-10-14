// =============================================================================
// Educator backend migrate + seed Container Apps Job.
// -----------------------------------------------------------------------------
// Manual-trigger job that runs TypeORM migrations followed by the idempotent
// seeders (`sh migrate.sh && sh seed.sh`), separate from container startup.
// The deploy pipeline (deploy-backend.yml) starts it after reconciling the
// app/job via Bicep and waits for it to succeed before the new revision is
// health-checked, so a slow or failing migration never blocks (or races) app
// boot and can't take down the live revision.
//
// Same image as the backend, same user-assigned identity (already holds AcrPull
// + Key Vault Secrets User — see resources.bicep) and the same edu-* Key Vault
// secrets for the settings migrations/seeders actually read: DB connection and
// the blob storage the units/simulation/transcript seeders pull from.
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

@description('Resource ID of the backend user-assigned managed identity (AcrPull + Key Vault Secrets User already granted).')
param userAssignedIdentityId string

@description('Client ID of the user-assigned identity above.')
param userAssignedIdentityClientId string

// Same per-env TLS rule as containerApp-backend.bicep (prod Postgres enforces
// require_secure_transport).
var dbSslEnabled = environment == 'prod' ? 'true' : 'false'

var placeholderImage = 'mcr.microsoft.com/k8se/quickstart:latest'
var useRealImage     = !empty(imageTag) && imageTag != 'placeholder'
var imageRef         = useRealImage ? '${acrLoginServer}/${imageName}:${imageTag}' : placeholderImage

var kvUri = 'https://${keyVaultName}${az.environment().suffixes.keyvaultDns}/'

// Subset of the backend's KV secrets that migrations + seeders read.
var kvSecretNames = [
  'edu-db-host'
  'edu-db-port'
  'edu-db-name'
  'edu-db-username'
  'edu-db-password'
  'edu-node-env'
  'edu-azure-storage-connection-string'
  'edu-azure-blob-container-name'
]

var jobSecrets = [for s in kvSecretNames: {
  name: s
  keyVaultUrl: '${kvUri}secrets/${s}'
  identity: userAssignedIdentityId
}]

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
      triggerType: 'Manual'
      replicaTimeout: 1800
      replicaRetryLimit: 0
      manualTriggerConfig: {
        parallelism: 1
        replicaCompletionCount: 1
      }
      registries: useRealImage ? [
        { server: acrLoginServer, identity: userAssignedIdentityId }
      ] : []
      secrets: jobSecrets
    }
    template: {
      containers: [
        {
          name: 'migrate'
          image: imageRef
          command: [ 'sh', '-c' ]
          args:    [ 'sh migrate.sh && sh seed.sh' ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'AZURE_CLIENT_ID',                  value: userAssignedIdentityClientId }
            { name: 'ALLOW_NONSSL',                     value: dbSslEnabled }
            { name: 'DB_HOST',                          secretRef: 'edu-db-host' }
            { name: 'DB_PORT',                          secretRef: 'edu-db-port' }
            { name: 'DB_NAME',                          secretRef: 'edu-db-name' }
            { name: 'DB_USERNAME',                      secretRef: 'edu-db-username' }
            { name: 'DB_PASSWORD',                      secretRef: 'edu-db-password' }
            { name: 'NODE_ENV',                         secretRef: 'edu-node-env' }
            { name: 'AZURE_STORAGE_CONNECTION_STRING',  secretRef: 'edu-azure-storage-connection-string' }
            { name: 'AZURE_BLOB_CONTAINER_NAME',        secretRef: 'edu-azure-blob-container-name' }
          ]
        }
      ]
    }
  }
}

output id string = job.id
output name string = job.name
