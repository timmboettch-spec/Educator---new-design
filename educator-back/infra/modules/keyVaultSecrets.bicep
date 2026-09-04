// =============================================================================
// Educator KV secrets — writes `edu-*` runtime secrets to an EXISTING vault.
// -----------------------------------------------------------------------------
// The vault itself is shared with other apps (e.g. HS-Online-AI) and not
// owned by Educator, so this module does NOT create it — only writes child
// `vaults/secrets` resources scoped to the existing vault.
//
// Naming: Educator's per-env vault `akv{env}1rwai` uses the `edu-` prefix to
// namespace Educator's secrets away from sibling apps in the same vault.
//
// Conditional writes (`if (!empty(...))`) protect existing values on re-runs:
//   • Resource-derived (DB host/port/name, etc.) and defaulted values are
//     written every run.
//   • Sensitive values (passwords, secrets) are written only when the caller
//     passes a non-empty value — empty preserves what's already in KV.
//   • Empty-allowed values (URLs, account names) are written only when the
//     caller passes a non-empty value.
// =============================================================================

param keyVaultName string

@description('Prefix applied to every secret name written by this module.')
#disable-next-line secure-secrets-in-params
param secretPrefix string = 'edu-'

// ---------- Resource-derived (always written) -------------------------------
param dbHost string
param dbPort string
param dbName string
param dbUsername string

// ---------- Defaulted runtime (always written) ------------------------------
param nodeEnv string
param appPort string
param jwtExpiresIn string
param mailFrom string
param azureBlobContainerName string
// Feature flag consumed by the backend as LMS_ENABLE_LTI_AUTO_PROVISION.
// Kept as a string ('true' / 'false') so it round-trips through KV unchanged.
param lmsEnableLtiAutoProvision string
// Kill switch consumed by the backend as REPORT_EMAILS_DISABLED. 'true' stops
// ALL "Student Report Available" email; any other value means normal sending.
// String for the same round-trip reason as the flag above.
param reportEmailsDisabled string
// Consumed as REPORT_EMAILS_TEST_SCHOOLS: comma-separated school-name patterns
// whose traffic never generates report email. Matched on whole words.
param reportEmailsTestSchools string

// ---------- Sensitive (empty preserves existing KV value) -------------------
@secure()
param dbPassword string = ''
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

// ---------- Empty-allowed runtime (only written when non-empty) -------------
param appUrl string = ''
param frontendUrl string = ''
param viteApiUrl string = ''
param graphTenantId string = ''
param graphClientId string = ''
param azureStorageAccount string = ''
param azureStorageContainer string = ''

resource kv 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

// ---------- Always-written (resource-derived) -------------------------------
resource sDbHost 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: '${secretPrefix}db-host'
  properties: { value: dbHost, contentType: 'text/plain' }
}
resource sDbPort 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: '${secretPrefix}db-port'
  properties: { value: dbPort, contentType: 'text/plain' }
}
resource sDbName 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: '${secretPrefix}db-name'
  properties: { value: dbName, contentType: 'text/plain' }
}
resource sDbUsername 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: '${secretPrefix}db-username'
  properties: { value: dbUsername, contentType: 'text/plain' }
}

// ---------- Always-written defaults -----------------------------------------
resource sNodeEnv 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: '${secretPrefix}node-env'
  properties: { value: nodeEnv, contentType: 'text/plain' }
}
resource sAppPort 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: '${secretPrefix}app-port'
  properties: { value: appPort, contentType: 'text/plain' }
}
resource sJwtExpiresIn 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: '${secretPrefix}jwt-expires-in'
  properties: { value: jwtExpiresIn, contentType: 'text/plain' }
}
resource sMailFrom 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: '${secretPrefix}mail-from'
  properties: { value: mailFrom, contentType: 'text/plain' }
}
resource sAzureBlobContainerName 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: '${secretPrefix}azure-blob-container-name'
  properties: { value: azureBlobContainerName, contentType: 'text/plain' }
}
resource sLmsEnableLtiAutoProvision 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: '${secretPrefix}lms-enable-lti-auto-provision'
  properties: { value: lmsEnableLtiAutoProvision, contentType: 'text/plain' }
}
resource sReportEmailsDisabled 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: '${secretPrefix}report-emails-disabled'
  properties: { value: reportEmailsDisabled, contentType: 'text/plain' }
}
resource sReportEmailsTestSchools 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: '${secretPrefix}report-emails-test-schools'
  properties: { value: reportEmailsTestSchools, contentType: 'text/plain' }
}

// ---------- Sensitive (empty preserves existing) ----------------------------
resource sDbPassword 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(dbPassword)) {
  parent: kv
  name: '${secretPrefix}db-password'
  properties: { value: dbPassword, contentType: 'text/plain' }
}
resource sJwtSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(jwtSecret)) {
  parent: kv
  name: '${secretPrefix}jwt-secret'
  properties: { value: jwtSecret, contentType: 'text/plain' }
}
resource sGraphClientSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(graphClientSecret)) {
  parent: kv
  name: '${secretPrefix}graph-client-secret'
  properties: { value: graphClientSecret, contentType: 'text/plain' }
}
resource sStorageConn 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(azureStorageConnectionString)) {
  parent: kv
  name: '${secretPrefix}azure-storage-connection-string'
  properties: { value: azureStorageConnectionString, contentType: 'text/plain' }
}
resource sLtiFallbackKeyId 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(ltiFallbackKeyId)) {
  parent: kv
  name: '${secretPrefix}lti-fallback-key-id'
  properties: { value: ltiFallbackKeyId, contentType: 'text/plain' }
}
resource sLtiFallbackPrivateKeyPem 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(ltiFallbackPrivateKeyPem)) {
  parent: kv
  name: '${secretPrefix}lti-fallback-private-key-pem'
  properties: { value: ltiFallbackPrivateKeyPem, contentType: 'text/plain' }
}

// ---------- Empty-allowed (only written when non-empty) ---------------------
resource sAppUrl 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(appUrl)) {
  parent: kv
  name: '${secretPrefix}app-url'
  properties: { value: appUrl, contentType: 'text/plain' }
}
resource sFrontendUrl 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(frontendUrl)) {
  parent: kv
  name: '${secretPrefix}frontend-url'
  properties: { value: frontendUrl, contentType: 'text/plain' }
}
resource sViteApiUrl 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(viteApiUrl)) {
  parent: kv
  name: '${secretPrefix}vite-api-url'
  properties: { value: viteApiUrl, contentType: 'text/plain' }
}
resource sGraphTenant 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(graphTenantId)) {
  parent: kv
  name: '${secretPrefix}graph-tenant-id'
  properties: { value: graphTenantId, contentType: 'text/plain' }
}
resource sGraphClient 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(graphClientId)) {
  parent: kv
  name: '${secretPrefix}graph-client-id'
  properties: { value: graphClientId, contentType: 'text/plain' }
}
resource sStorageAcct 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(azureStorageAccount)) {
  parent: kv
  name: '${secretPrefix}azure-storage-account'
  properties: { value: azureStorageAccount, contentType: 'text/plain' }
}
resource sStorageContainer 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(azureStorageContainer)) {
  parent: kv
  name: '${secretPrefix}azure-storage-container'
  properties: { value: azureStorageContainer, contentType: 'text/plain' }
}

output keyVaultName string = kv.name
