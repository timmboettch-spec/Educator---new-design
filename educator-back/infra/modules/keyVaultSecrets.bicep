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
param redisHost string
param redisPort string
@secure()
param redisPassword string

// ---------- Defaulted runtime (always written) ------------------------------
param nodeEnv string
param appPort string
param jwtExpiresIn string
param mailFrom string
param azureBlobContainerName string
// Feature flag consumed by the backend as LMS_ENABLE_LTI_AUTO_PROVISION.
// Kept as a string ('true' / 'false') so it round-trips through KV unchanged.
param lmsEnableLtiAutoProvision string

// ---------- Student-backend consolidation (defaulted, always written) -------
// Blob container for student uploads (distinct from azureBlobContainerName's
// scenario/report JSON container). Read by uploads.service.ts.
param azureBlobDataContainerName string
// Bounded concurrency for scenario JSON hydration from blob storage.
param scenarioHydrationConcurrency string
// Cache tuning for the scenario JSON data service.
param jsonCacheMetadataCheckIntervalMs string
param localizedScenariosCacheTtlMs string
// Application Insights Query API auth mode: 'api-key' or 'managed-identity'.
param appinsightsAuthType string
// Lifecycle telemetry tuning/feature-flag (both round-trip as strings).
param telemetrySamplingPriority string
param telemetryLifecycleEnabled string
// AI conversation provider selector: 'ai' | 'static' | 'speech-engine'.
param conversationProvider string

// ---------- API timeout handling (defaulted, always written) ---------------
// Read directly via process.env in src/main.ts, src/config/db.config.ts, and
// src/common/interceptors/request-timeout.interceptor.ts.
param apiTimeoutMs string
param serverKeepAliveTimeoutMs string
param serverHeadersTimeoutMs string
param dbPoolMax string
param dbPoolIdleTimeoutMs string
param dbPoolAcquireTimeoutMs string
param heapLogIntervalMs string

// Rolling send-rate limits enforced by MailRateLimiterService — mirrors
// ACS Email's own limits so a burst of mail queues instead of ever tripping
// Azure's throttle. Read directly via process.env in
// src/mail/mail-rate-limit.constants.ts.
param mailRateLimitPerMinute string
param mailRateLimitPerHour string

// RWAI-3094: sole account allowed to see/launch the automation-only unit
// (AUTO-UNIT-001) and simulation. Read directly via process.env in
// src/common/config/automation.config.ts — fails closed when unset.
param automationTesterEmail string
// RWAI-3018: forgot-password abuse-prevention thresholds — read directly via
// process.env in src/common/constants/throttle.constants.ts.
param authForgotPasswordCooldownSeconds string
param authForgotPasswordLimit string
param authForgotPasswordTtl string
param authForgotPasswordIpLimit string
param authForgotPasswordIpWindowSeconds string
// Path (relative to FRONTEND_URL) the frontend redirects to after a
// successful Google Classroom OAuth connect.
param googleClassroomSuccessRedirectPath string
// RWAI-3154: LTI classroom-burst rate limit (login/callback/launch/session-exchange).
// Read via process.env in src/common/constants/throttle.constants.ts.
param ltiLaunchRateLimit string
param ltiLaunchRateTtl string

// ---------- Sensitive (empty preserves existing KV value) -------------------
@secure()
param dbPassword string = ''
@secure()
param jwtSecret string = ''
@secure()
param azureStorageConnectionString string = ''
@secure()
param ltiFallbackKeyId string = ''
@secure()
param ltiFallbackPrivateKeyPem string = ''
@secure()
param openaiApiKey string = ''
@secure()
param appInsightsApiKey string = ''
@secure()
param speechEngineApiKey string = ''
@secure()
param emailUser string = ''
@secure()
param emailPass string = ''
@secure()
param lmsSecretsEncryptionKey string = ''
// AES-256-GCM key backing src/common/utils/crypto.utils.ts (invite-link tokens),
// read as CRYPTO_SECRET via app.config.ts. Deliberately its own secret, never
// chained to jwtSecret — rotating it makes outstanding invite links undecryptable.
@secure()
param cryptoSecret string = ''
// Google Classroom OAuth web client secret (Google Cloud Console). Read by
// src/common/config/google.config.ts as GOOGLE_CLASSROOM_CLIENT_SECRET.
@secure()
param googleClassroomClientSecret string = ''

// ---------- Empty-allowed runtime (only written when non-empty) -------------
param appUrl string = ''
param frontendUrl string = ''
param viteApiUrl string = ''
param azureStorageAccount string = ''
param azureStorageContainer string = ''
param aiModel string = ''
param appInsightsAppId string = ''
param speechEngineProvider string = ''
param speechEngineApiUrl string = ''
param speechEngineModel string = ''
param speechEngineLanguage string = ''
param reportEmailTo string = ''
param emailHost string = ''
param emailPort string = ''
param emailFrom string = ''
param emailMode string = ''
// Google Classroom OAuth web client ID (not secret, but only meaningful once
// a real OAuth client exists). Read as GOOGLE_CLASSROOM_CLIENT_ID.
param googleClassroomClientId string = ''
// Must match an authorized redirect URI on the same Google OAuth web client.
// Read as GOOGLE_CLASSROOM_REDIRECT_URI.
param googleClassroomRedirectUri string = ''

// Dev-only: name of the preview database (see resources.bicep's
// previewDbName) that preview-deploy.yml's preview-db-check job migrates
// against before build-and-deploy. Empty on qa/prod. Not read by the app
// itself — the CI job reads it directly via `az keyvault secret show`.
param dbNamePreview string = ''

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
resource sRedisHost 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: '${secretPrefix}redis-host'
  properties: { value: redisHost, contentType: 'text/plain' }
}
resource sRedisPort 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: '${secretPrefix}redis-port'
  properties: { value: redisPort, contentType: 'text/plain' }
}
resource sRedisPassword 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: '${secretPrefix}redis-password'
  properties: { value: redisPassword, contentType: 'text/plain' }
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
resource sAutomationTesterEmail 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: '${secretPrefix}automation-tester-email'
  properties: { value: automationTesterEmail, contentType: 'text/plain' }
}
// Dedicated ACS-Email sender secret — same value as edu-mail-from, but its
// own secret name so the MailProvider's MAIL_FROM env var can be repointed
// at it independently of edu-mail-from (which the currently-live revision's
// pre-ACS code path still references — see the kvSecretNames comment in
// containerApp-backend.bicep for why that one can't just be repointed
// in place without a ContainerAppSecretInUse failure).
resource sAcsMailFrom 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: '${secretPrefix}acs-mail-from'
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
resource sAzureBlobDataContainerName 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: '${secretPrefix}azure-blob-data-container-name'
  properties: { value: azureBlobDataContainerName, contentType: 'text/plain' }
}
resource sScenarioHydrationConcurrency 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: '${secretPrefix}scenario-hydration-concurrency'
  properties: { value: scenarioHydrationConcurrency, contentType: 'text/plain' }
}
resource sJsonCacheMetadataCheckIntervalMs 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: '${secretPrefix}json-cache-metadata-check-interval-ms'
  properties: { value: jsonCacheMetadataCheckIntervalMs, contentType: 'text/plain' }
}
resource sLocalizedScenariosCacheTtlMs 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: '${secretPrefix}localized-scenarios-cache-ttl-ms'
  properties: { value: localizedScenariosCacheTtlMs, contentType: 'text/plain' }
}
resource sAppinsightsAuthType 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: '${secretPrefix}appinsights-auth-type'
  properties: { value: appinsightsAuthType, contentType: 'text/plain' }
}
resource sTelemetrySamplingPriority 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: '${secretPrefix}telemetry-sampling-priority'
  properties: { value: telemetrySamplingPriority, contentType: 'text/plain' }
}
resource sTelemetryLifecycleEnabled 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: '${secretPrefix}telemetry-lifecycle-enabled'
  properties: { value: telemetryLifecycleEnabled, contentType: 'text/plain' }
}
resource sConversationProvider 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: '${secretPrefix}conversation-provider'
  properties: { value: conversationProvider, contentType: 'text/plain' }
}
resource sApiTimeoutMs 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: '${secretPrefix}api-timeout-ms'
  properties: { value: apiTimeoutMs, contentType: 'text/plain' }
}
resource sServerKeepAliveTimeoutMs 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: '${secretPrefix}server-keep-alive-timeout-ms'
  properties: { value: serverKeepAliveTimeoutMs, contentType: 'text/plain' }
}
resource sServerHeadersTimeoutMs 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: '${secretPrefix}server-headers-timeout-ms'
  properties: { value: serverHeadersTimeoutMs, contentType: 'text/plain' }
}
resource sDbPoolMax 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: '${secretPrefix}db-pool-max'
  properties: { value: dbPoolMax, contentType: 'text/plain' }
}
resource sDbPoolIdleTimeoutMs 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: '${secretPrefix}db-pool-idle-timeout-ms'
  properties: { value: dbPoolIdleTimeoutMs, contentType: 'text/plain' }
}
resource sDbPoolAcquireTimeoutMs 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: '${secretPrefix}db-pool-acquire-timeout-ms'
  properties: { value: dbPoolAcquireTimeoutMs, contentType: 'text/plain' }
}
resource sHeapLogIntervalMs 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: '${secretPrefix}heap-log-interval-ms'
  properties: { value: heapLogIntervalMs, contentType: 'text/plain' }
}
resource sMailRateLimitPerMinute 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: '${secretPrefix}mail-rate-limit-per-minute'
  properties: { value: mailRateLimitPerMinute, contentType: 'text/plain' }
}
resource sMailRateLimitPerHour 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: '${secretPrefix}mail-rate-limit-per-hour'
  properties: { value: mailRateLimitPerHour, contentType: 'text/plain' }
}
resource sAuthForgotPasswordCooldownSeconds 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: '${secretPrefix}auth-forgot-password-cooldown-seconds'
  properties: { value: authForgotPasswordCooldownSeconds, contentType: 'text/plain' }
}
resource sAuthForgotPasswordLimit 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: '${secretPrefix}auth-forgot-password-limit'
  properties: { value: authForgotPasswordLimit, contentType: 'text/plain' }
}
resource sAuthForgotPasswordTtl 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: '${secretPrefix}auth-forgot-password-ttl'
  properties: { value: authForgotPasswordTtl, contentType: 'text/plain' }
}
resource sAuthForgotPasswordIpLimit 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: '${secretPrefix}auth-forgot-password-ip-limit'
  properties: { value: authForgotPasswordIpLimit, contentType: 'text/plain' }
}
resource sAuthForgotPasswordIpWindowSeconds 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: '${secretPrefix}auth-forgot-password-ip-window-seconds'
  properties: { value: authForgotPasswordIpWindowSeconds, contentType: 'text/plain' }
}
resource sGoogleClassroomSuccessRedirectPath 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: '${secretPrefix}google-classroom-success-redirect-path'
  properties: { value: googleClassroomSuccessRedirectPath, contentType: 'text/plain' }
}
resource sLtiLaunchRateLimit 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: '${secretPrefix}lti-launch-rate-limit'
  properties: { value: ltiLaunchRateLimit, contentType: 'text/plain' }
}
resource sLtiLaunchRateTtl 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: '${secretPrefix}lti-launch-rate-ttl'
  properties: { value: ltiLaunchRateTtl, contentType: 'text/plain' }
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
resource sOpenaiApiKey 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(openaiApiKey)) {
  parent: kv
  name: '${secretPrefix}openai-api-key'
  properties: { value: openaiApiKey, contentType: 'text/plain' }
}
resource sAppInsightsApiKey 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(appInsightsApiKey)) {
  parent: kv
  name: '${secretPrefix}appinsights-api-key'
  properties: { value: appInsightsApiKey, contentType: 'text/plain' }
}
resource sSpeechEngineApiKey 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(speechEngineApiKey)) {
  parent: kv
  name: '${secretPrefix}speech-engine-api-key'
  properties: { value: speechEngineApiKey, contentType: 'text/plain' }
}
resource sEmailUser 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(emailUser)) {
  parent: kv
  name: '${secretPrefix}email-user'
  properties: { value: emailUser, contentType: 'text/plain' }
}
resource sEmailPass 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(emailPass)) {
  parent: kv
  name: '${secretPrefix}email-pass'
  properties: { value: emailPass, contentType: 'text/plain' }
}
resource sLmsSecretsEncryptionKey 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(lmsSecretsEncryptionKey)) {
  parent: kv
  name: '${secretPrefix}lms-secrets-encryption-key'
  properties: { value: lmsSecretsEncryptionKey, contentType: 'text/plain' }
}
resource sCryptoSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(cryptoSecret)) {
  parent: kv
  name: '${secretPrefix}crypto-secret'
  properties: { value: cryptoSecret, contentType: 'text/plain' }
}
resource sGoogleClassroomClientSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(googleClassroomClientSecret)) {
  parent: kv
  name: '${secretPrefix}google-classroom-oauth-client-secret'
  properties: { value: googleClassroomClientSecret, contentType: 'text/plain' }
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
resource sAiModel 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(aiModel)) {
  parent: kv
  name: '${secretPrefix}ai-model'
  properties: { value: aiModel, contentType: 'text/plain' }
}
resource sAppInsightsAppId 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(appInsightsAppId)) {
  parent: kv
  name: '${secretPrefix}appinsights-app-id'
  properties: { value: appInsightsAppId, contentType: 'text/plain' }
}
resource sSpeechEngineProvider 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(speechEngineProvider)) {
  parent: kv
  name: '${secretPrefix}speech-engine-provider'
  properties: { value: speechEngineProvider, contentType: 'text/plain' }
}
resource sSpeechEngineApiUrl 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(speechEngineApiUrl)) {
  parent: kv
  name: '${secretPrefix}speech-engine-api-url'
  properties: { value: speechEngineApiUrl, contentType: 'text/plain' }
}
resource sSpeechEngineModel 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(speechEngineModel)) {
  parent: kv
  name: '${secretPrefix}speech-engine-model'
  properties: { value: speechEngineModel, contentType: 'text/plain' }
}
resource sSpeechEngineLanguage 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(speechEngineLanguage)) {
  parent: kv
  name: '${secretPrefix}speech-engine-language'
  properties: { value: speechEngineLanguage, contentType: 'text/plain' }
}
resource sReportEmailTo 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(reportEmailTo)) {
  parent: kv
  name: '${secretPrefix}report-email-to'
  properties: { value: reportEmailTo, contentType: 'text/plain' }
}
resource sEmailHost 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(emailHost)) {
  parent: kv
  name: '${secretPrefix}email-host'
  properties: { value: emailHost, contentType: 'text/plain' }
}
resource sEmailPort 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(emailPort)) {
  parent: kv
  name: '${secretPrefix}email-port'
  properties: { value: emailPort, contentType: 'text/plain' }
}
resource sEmailFrom 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(emailFrom)) {
  parent: kv
  name: '${secretPrefix}email-from'
  properties: { value: emailFrom, contentType: 'text/plain' }
}
resource sEmailMode 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(emailMode)) {
  parent: kv
  name: '${secretPrefix}email-mode'
  properties: { value: emailMode, contentType: 'text/plain' }
}
resource sGoogleClassroomClientId 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(googleClassroomClientId)) {
  parent: kv
  name: '${secretPrefix}google-classroom-oauth-client-id'
  properties: { value: googleClassroomClientId, contentType: 'text/plain' }
}
resource sGoogleClassroomRedirectUri 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(googleClassroomRedirectUri)) {
  parent: kv
  name: '${secretPrefix}google-classroom-oauth-redirect-uri'
  properties: { value: googleClassroomRedirectUri, contentType: 'text/plain' }
}
resource sDbNamePreview 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(dbNamePreview)) {
  parent: kv
  name: '${secretPrefix}db-name-preview'
  properties: { value: dbNamePreview, contentType: 'text/plain' }
}

output keyVaultName string = kv.name
