// =============================================================================
// Azure Communication Services Email — Communication Services resource +
// Email Communication Service + a customer-managed Domain, linked together
// and ready for Email API sends authenticated with this app's existing
// user-assigned managed identity (see src/mail/mail.service.ts).
// -----------------------------------------------------------------------------
// Unlike PR #585's reverted acsEmail.bicep, this module does NOT provision
// anything for SMTP AUTH (no Entra app registration wiring, no SMTP
// Username resource) — MailService authenticates via the Email REST API
// using a TokenCredential (ManagedIdentityCredential/DefaultAzureCredential),
// the same pattern already used for Redis and the App Insights Query API.
// That only needs an RBAC role grant on the Communication Services resource,
// which this module does provision below.
//
// domainManagement is CustomerManaged by default — this app's sender domains
// (dev.curionn.com / qa.curionn.com / realityworks.com) are real domains
// already, not synthetic *.azurecomm.net addresses. The custom domain is
// created here in an Unverified state; the DNS verification/DKIM/SPF records
// it requires are read back post-deploy and written via
// scripts/Setup-AcsDomain.ps1 — see docs/DEPLOYMENT.md "Azure Communication
// Services mail".
//
// NOTE: resources.bicep passes `tags: commonTags` automatically when this
// module runs as part of the normal main.bicep flow. If deploying this
// module standalone (`az deployment group create --template-file
// infra/modules/acsEmail.bicep ...`, e.g. for the provision-then-link
// two-phase flow above), pass -tags explicitly — it defaults to `{}` and
// won't match the org-wide {app, component, environment, managedBy}
// convention otherwise (hit once already for dev/qa/prod, fixed after the
// fact with a tags-only redeploy).
// =============================================================================

@allowed(['dev', 'qa', 'prod'])
param environment string

@description('Communication/Email resources are global-only.')
param location string = 'global'

param prefix string = 'rwai'
param app string = 'edu'
param tags object = {}

@description('Real sender domain for this environment, e.g. dev.curionn.com.')
param customDomainName string

@description('Local part of MAIL_FROM (e.g. "no-reply" for no-reply@dev.curionn.com) — registered as an allowed sender username on the domain.')
param senderUsername string = 'no-reply'

@description('Object (principal) ID of the backend UAI to grant Email API access to. Same identity already used for Redis / App Insights Query API.')
param principalId string

@description('Resource ID of the shared Log Analytics workspace — same one Redis/Postgres diagnostics already flow to (see modules/redisCache.bicep).')
param workspaceId string

@description('''
Azure rejects linking a CustomerManaged domain to the Communication Services
resource until that domain's DNS records are verified (DomainValidationError
"Requested domain is not in a valid state for linking"), and there is no way
to react to live verification state within a single Bicep deployment. So this
defaults to false on first apply (provisions the domain + emailService +
RBAC role, all independent of the link) — after scripts/Setup-AcsDomain.ps1
has written the DNS records and the domain's verificationStates report
Verified, re-run this module with linkCustomDomain: true to complete the
link (idempotent either way).
''')
param linkCustomDomain bool = false

// One base name (acs-{prefix}-{app}-{env}) shared by both resources, with
// "-mail" distinguishing the Email Communication Service child resource from
// the Communication Services resource proper — matches the naming already
// used elsewhere in this module set (redisCacheName, backendIdentityName).
var communicationServiceName = 'acs-${environment}-${prefix}-${app}'
var emailServiceName = 'acs-${environment}-${prefix}-${app}-mail'

resource emailService 'Microsoft.Communication/emailServices@2023-04-01' = {
  name: emailServiceName
  location: location
  tags: tags
  properties: {
    dataLocation: 'United States'
  }
}

resource domain 'Microsoft.Communication/emailServices/domains@2023-04-01' = {
  parent: emailService
  name: customDomainName
  location: location
  tags: tags
  properties: {
    domainManagement: 'CustomerManaged'
    userEngagementTracking: 'Disabled'
  }
}

// Registers the sender username (the local part of MAIL_FROM, e.g.
// "no-reply") as valid to send from this domain — matches
// infra/env/<env>.bicepparam's mailFrom local part.
resource senderUsernameResource 'Microsoft.Communication/emailServices/domains/senderUsernames@2023-04-01' = {
  parent: domain
  name: senderUsername
  properties: {
    username: senderUsername
    displayName: senderUsername
  }
}

resource communicationService 'Microsoft.Communication/communicationServices@2023-04-01' = {
  name: communicationServiceName
  location: location
  tags: tags
  properties: {
    dataLocation: 'United States'
    linkedDomains: linkCustomDomain ? [
      domain.id
    ] : []
  }
}

// Built-in "Communication and Email Service Owner" role — its actions include
// Microsoft.Communication/CommunicationServices/{read,write}, which is what
// the Email API's AAD-token auth path requires (confirmed via
// `az role definition list --name "Communication and Email Service Owner"`).
// Scoped to this Communication Services resource only, not the resource group.
var communicationAndEmailServiceOwnerRoleId = '09976791-48a7-449e-bb21-39d1a415f350'

resource emailSendRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(communicationService.id, principalId, communicationAndEmailServiceOwnerRoleId)
  scope: communicationService
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', communicationAndEmailServiceOwnerRoleId)
    principalId: principalId
    principalType: 'ServicePrincipal'
  }
}

// Email send/status/engagement operational logs + traffic metrics — same
// "<resource>-to-law" pattern as modules/redisCache.bicep's diagnostic
// setting. Without this, a real send failure (e.g. DomainNotLinked) is
// invisible outside the app's own caught-exception log line — no record on
// the ACS side to correlate against.
resource diag 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  scope: communicationService
  name: 'acs-email-to-law'
  properties: {
    workspaceId: workspaceId
    logs: [
      { category: 'EmailSendMailOperational', enabled: true }
      { category: 'EmailStatusUpdateOperational', enabled: true }
      { category: 'EmailUserEngagementOperational', enabled: true }
    ]
    metrics: [
      { category: 'Traffic', enabled: true }
    ]
  }
}

output communicationServiceName string = communicationService.name
output communicationServiceId string = communicationService.id
// EmailClient(endpoint, credential) needs a full https:// endpoint, not just
// the bare hostname.
output endpoint string = 'https://${communicationService.properties.hostName}'
output emailServiceName string = emailService.name
output domainResourceName string = domain.name
