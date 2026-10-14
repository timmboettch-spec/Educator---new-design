// Grants Storage Blob Data Reader on the existing per-env storage account to
// a managed identity. Used by the weekly snapshot job's UAI to read the
// backend's JSON blobs without a connection-string secret.

targetScope = 'resourceGroup'

param storageAccountName string
param principalId string

var storageBlobDataReaderRoleId = '2a2b9908-6ea1-4ae2-8e65-a410df84e7d1'

resource sa 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: storageAccountName
}

resource assign 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(sa.id, principalId, storageBlobDataReaderRoleId)
  scope: sa
  properties: {
    principalId: principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataReaderRoleId)
  }
}
