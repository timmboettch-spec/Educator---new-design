using '../main.bicep'

param environment = 'prod'
param location = 'eastus'
param postgresLocation = 'eastus2'
param backendImageTag = readEnvironmentVariable('IMAGE_TAG', 'placeholder')

// Sensitive — pass via env var on `provision`; empty preserves existing KV value.
param postgresAdminPassword = readEnvironmentVariable('POSTGRES_ADMIN_PASSWORD', '')
param jwtSecret = readEnvironmentVariable('JWT_SECRET', '')
param graphClientSecret = readEnvironmentVariable('GRAPH_CLIENT_SECRET', '')
param azureStorageConnectionString = readEnvironmentVariable('AZURE_STORAGE_CONNECTION_STRING', '')
param ltiFallbackKeyId = readEnvironmentVariable('LTI_FALLBACK_KEY_ID', '')
param ltiFallbackPrivateKeyPem = readEnvironmentVariable('LTI_FALLBACK_PRIVATE_KEY_PEM', '')

// Defaulted runtime — written every provision.
param nodeEnv = 'production'
param appPort = '3000'
param jwtExpiresIn = '7d'
param mailFrom = 'no-reply@realityworks.com'
param azureBlobContainerName = 'json-data'
// Feature flag: gate LTI auto-provisioning of classes/students on launch.
// Read by src/lti/lti.controller.ts as LMS_ENABLE_LTI_AUTO_PROVISION.
param lmsEnableLtiAutoProvision = 'true'
// "Student Report Available" email gating. Flip reportEmailsDisabled to 'true'
// to stop ALL report email while the shared no-reply mailbox drains.
param reportEmailsDisabled = 'false'
param reportEmailsTestSchools = 'Beta Test,Test'

// Empty-allowed runtime — pass via env var to seed, or leave to preserve KV.
param appUrl = 'https://educatorbe.realityworksai.com'
param frontendUrl = 'https://educator.realityworksai.com'
param viteApiUrl = 'https://educatorbe.realityworksai.com/api'
param graphTenantId = readEnvironmentVariable('GRAPH_TENANT_ID', '')
param graphClientId = readEnvironmentVariable('GRAPH_CLIENT_ID', '')
// Existing StorageV2 account in ARG-prod1-rwai shared with other apps.
// asaprod1rwai and asaprod2rwai are FileStorage (wrong kind for blob uploads).
param azureStorageAccount = 'asaprodrwai'
param azureStorageContainer = 'edu-uploads'

// Custom domain (optional; populated by Provision-Bicep.ps1 wrapper or Deploy-Backend.ps1 on re-provisions).
// Empty (default) preserves whatever main.bicep computes; non-empty re-applies the binding.
param backendCustomDomain = readEnvironmentVariable('BACKEND_CUSTOM_DOMAIN', '')
param backendCustomDomainCertificateId = readEnvironmentVariable('BACKEND_CUSTOM_DOMAIN_CERT_ID', '')
