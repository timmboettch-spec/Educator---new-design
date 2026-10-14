using '../main.bicep'

param environment = 'prod'
param location = 'eastus'
param postgresLocation = 'eastus2'
param backendImageTag = readEnvironmentVariable('IMAGE_TAG', 'placeholder')

// Sensitive — pass via env var on `provision`; empty preserves existing KV value.
param postgresAdminPassword = readEnvironmentVariable('POSTGRES_ADMIN_PASSWORD', '')
param jwtSecret = readEnvironmentVariable('JWT_SECRET', '')
param azureStorageConnectionString = readEnvironmentVariable('AZURE_STORAGE_CONNECTION_STRING', '')
param ltiFallbackKeyId = readEnvironmentVariable('LTI_FALLBACK_KEY_ID', '')
param ltiFallbackPrivateKeyPem = readEnvironmentVariable('LTI_FALLBACK_PRIVATE_KEY_PEM', '')
param openaiApiKey = readEnvironmentVariable('OPENAI_API_KEY', '')
param appInsightsApiKey = readEnvironmentVariable('APPLICATIONINSIGHTS_API_KEY', '')
param speechEngineApiKey = readEnvironmentVariable('SPEECH_ENGINE_API_KEY', '')
param emailUser = readEnvironmentVariable('EMAIL_USER', '')
param emailPass = readEnvironmentVariable('EMAIL_PASS', '')
param lmsSecretsEncryptionKey = readEnvironmentVariable('LMS_SECRETS_ENCRYPTION_KEY', '')
param cryptoSecret = readEnvironmentVariable('CRYPTO_SECRET', '')
param googleClassroomClientSecret = readEnvironmentVariable('GOOGLE_CLASSROOM_CLIENT_SECRET', '')

// Defaulted runtime — written every provision.
param nodeEnv = 'production'
param appPort = '3000'
param jwtExpiresIn = '7d'
param mailFrom = 'no-reply@realityworks.com'
param azureBlobContainerName = 'json-data'
// Feature flag: gate LTI auto-provisioning of classes/students on launch.
// Read by src/lti/lti.controller.ts as LMS_ENABLE_LTI_AUTO_PROVISION.
param lmsEnableLtiAutoProvision = 'true'

// Student-backend consolidation — defaulted, written every provision.
param azureBlobDataContainerName = 'rwai-data-files'
param scenarioHydrationConcurrency = '32'
param jsonCacheMetadataCheckIntervalMs = '3000'
param localizedScenariosCacheTtlMs = '30000'
param appinsightsAuthType = 'api-key'
param telemetrySamplingPriority = '100'
param telemetryLifecycleEnabled = 'true'
param conversationProvider = 'ai'

// API timeout handling — defaulted, written every provision.
param apiTimeoutMs = readEnvironmentVariable('API_TIMEOUT_MS', '60000')
param serverKeepAliveTimeoutMs = readEnvironmentVariable('SERVER_KEEP_ALIVE_TIMEOUT_MS', '65000')
param serverHeadersTimeoutMs = readEnvironmentVariable('SERVER_HEADERS_TIMEOUT_MS', '66000')
param dbPoolMax = readEnvironmentVariable('DB_POOL_MAX', '10')
param dbPoolIdleTimeoutMs = readEnvironmentVariable('DB_POOL_IDLE_TIMEOUT_MS', '30000')
param dbPoolAcquireTimeoutMs = readEnvironmentVariable('DB_POOL_ACQUIRE_TIMEOUT_MS', '5000')
param heapLogIntervalMs = readEnvironmentVariable('HEAP_LOG_INTERVAL_MS', '60000')
param mailRateLimitPerMinute = readEnvironmentVariable('MAIL_RATE_LIMIT_PER_MINUTE', '30')
param mailRateLimitPerHour = readEnvironmentVariable('MAIL_RATE_LIMIT_PER_HOUR', '100')

// RWAI-3094: sole account allowed to see/launch the automation-only unit/simulation.
param automationTesterEmail = readEnvironmentVariable('AUTOMATION_TESTER_EMAIL', 'test@curionn.com')
// RWAI-3018: forgot-password abuse-prevention — 60s cooldown, 6 requests/15min per account, 10 requests/15min per IP.
param authForgotPasswordCooldownSeconds = readEnvironmentVariable('AUTH_FORGOT_PASSWORD_COOLDOWN_SECONDS', '60')
param authForgotPasswordLimit = readEnvironmentVariable('AUTH_FORGOT_PASSWORD_LIMIT', '6')
param authForgotPasswordTtl = readEnvironmentVariable('AUTH_FORGOT_PASSWORD_TTL', '900000')
param authForgotPasswordIpLimit = readEnvironmentVariable('AUTH_FORGOT_PASSWORD_IP_LIMIT', '10')
param authForgotPasswordIpWindowSeconds = readEnvironmentVariable('AUTH_FORGOT_PASSWORD_IP_WINDOW_SECONDS', '900')
param googleClassroomSuccessRedirectPath = readEnvironmentVariable('GOOGLE_CLASSROOM_SUCCESS_REDIRECT_PATH', '/google-classroom')
param ltiLaunchRateLimit = readEnvironmentVariable('LTI_LAUNCH_RATE_LIMIT', '60')
param ltiLaunchRateTtl = readEnvironmentVariable('LTI_LAUNCH_RATE_TTL', '10')

// Empty-allowed runtime — pass via env var to seed, or leave to preserve KV.
param appUrl = 'https://educatorbe.realityworksai.com'
param frontendUrl = 'https://educator.realityworksai.com'
param viteApiUrl = 'https://educatorbe.realityworksai.com/api'
// Existing StorageV2 account in ARG-prod1-rwai shared with other apps.
// asaprod1rwai and asaprod2rwai are FileStorage (wrong kind for blob uploads).
param azureStorageAccount = 'asaprodrwai'
param azureStorageContainer = 'edu-uploads'
param aiModel = readEnvironmentVariable('AI_MODEL', '')
param appInsightsAppId = readEnvironmentVariable('APPLICATIONINSIGHTS_APP_ID', '')
param speechEngineProvider = ''
param speechEngineApiUrl = ''
param speechEngineModel = ''
param speechEngineLanguage = ''
param reportEmailTo = readEnvironmentVariable('REPORT_EMAIL_TO', '')
param emailHost = readEnvironmentVariable('EMAIL_HOST', 'smtp.gmail.com')
param emailPort = readEnvironmentVariable('EMAIL_PORT', '587')
param emailFrom = readEnvironmentVariable('EMAIL_FROM', '')
// Not secret, but only meaningful once a real Google OAuth web client exists.
param googleClassroomClientId = readEnvironmentVariable('GOOGLE_CLASSROOM_CLIENT_ID', '')
// Must match an authorized redirect URI on that OAuth client. Not yet
// confirmed for this environment — set via env var once known.
param googleClassroomRedirectUri = readEnvironmentVariable('GOOGLE_CLASSROOM_REDIRECT_URI', '')
// `live` sends real mail via Graph; do NOT set to `skip` in prod.
param emailMode = readEnvironmentVariable('EMAIL_MODE', 'live')

// Custom domain (optional; populated by Provision-Bicep.ps1 wrapper or Deploy-Backend.ps1 on re-provisions).
// Empty (default) preserves whatever main.bicep computes; non-empty re-applies the binding.
param backendCustomDomain = readEnvironmentVariable('BACKEND_CUSTOM_DOMAIN', '')
param backendCustomDomainCertificateId = readEnvironmentVariable('BACKEND_CUSTOM_DOMAIN_CERT_ID', '')

// hs-online weekly snapshot-to-git job — dormant (job not deployed) until
// SNAPSHOT_REPO is set. See docs/WEEKLY-SNAPSHOT.md.
param snapshotRepo = readEnvironmentVariable('SNAPSHOT_REPO', '')
param snapshotGitAppId = readEnvironmentVariable('SNAPSHOT_GIT_APP_ID', '')
param snapshotGitAppInstallationId = readEnvironmentVariable('SNAPSHOT_GIT_APP_INSTALLATION_ID', '')
param snapshotImageTag = readEnvironmentVariable('SNAPSHOT_IMAGE_TAG', 'placeholder')
param snapshotGitAppPrivateKey = readEnvironmentVariable('SNAPSHOT_GIT_APP_PRIVATE_KEY', '')
param snapshotTeamsWebhookUrl = readEnvironmentVariable('SNAPSHOT_TEAMS_WEBHOOK_URL', '')
param snapshotTeamsMention = readEnvironmentVariable('SNAPSHOT_TEAMS_MENTION', '')
