// Grants Key Vault Secrets User on the per-env KV to a managed identity.
// Granted up-front (before the Container App is created) so the ACA can fetch
// secrets immediately on first revision provision.

targetScope = 'resourceGroup'

param keyVaultName string
param principalId string

var kvSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'

resource kv 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

resource assign 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(kv.id, principalId, kvSecretsUserRoleId)
  scope: kv
  properties: {
    principalId: principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', kvSecretsUserRoleId)
  }
}
