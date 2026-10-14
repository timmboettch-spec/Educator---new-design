// =============================================================================
// Azure Database for PostgreSQL - Flexible Server (Educator backend).
// -----------------------------------------------------------------------------
// Tier policy: B1ms Burstable everywhere. Zone-redundant HA requires
// GeneralPurpose tier and is not enabled; revisit when prod traffic warrants.
// 30-day backup retention everywhere; geo-redundant backup on prod only.
//
// Idempotent: ARM reconciles by name. PostgreSQL major version (e.g. 15 → 17)
// CANNOT be changed in-place on an existing server — if `properties.version`
// here does not match the live server, the deploy will fail. To change major
// version: delete the server out-of-band, then re-run `provision` to recreate.
// =============================================================================

param serverName string
param databaseName string
param location string
@allowed(['dev', 'qa', 'prod'])
param environment string
param tags object = {}
param administratorLogin string
@secure()
param administratorPassword string
param workspaceId string

@description('Extra databases created on the same server alongside databaseName — e.g. a dev-only "educator_preview" DB that a CI preflight job migrates against, so a bad migration is caught before it ever touches databaseName. Same server/credentials, isolated schema.')
param additionalDatabaseNames array = []

@description('Dev-only: enables Entra ID (AAD token) auth ALONGSIDE password auth (both stay usable — this never disables passwordAuth). Lets callers that already have an Entra identity (the backend UAI, the CI/deploy SP) connect with a short-lived access token instead of a long-lived static password.')
param enableEntraAuth bool = false

@description('Entra principals granted DB administrator rights when enableEntraAuth is true. Each entry: { objectId, principalName, principalType (User|Group|ServicePrincipal) }.')
param aadAdmins array = []

var isProd = environment == 'prod'

var skuMap = {
  dev:  { name: 'Standard_B1ms', tier: 'Burstable' }
  qa:   { name: 'Standard_B1ms', tier: 'Burstable' }
  prod: { name: 'Standard_B1ms', tier: 'Burstable' }
}

resource pg 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: serverName
  location: location
  tags: tags
  sku: skuMap[environment]
  properties: {
    version: '17'
    administratorLogin: administratorLogin
    administratorLoginPassword: administratorPassword
    storage: {
      storageSizeGB: 32
      autoGrow: 'Enabled'
    }
    backup: {
      backupRetentionDays: 30
      geoRedundantBackup: isProd ? 'Enabled' : 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    network: {
      publicNetworkAccess: 'Enabled'
    }
    authConfig: {
      passwordAuth: 'Enabled'
      activeDirectoryAuth: enableEntraAuth ? 'Enabled' : 'Disabled'
      tenantId: subscription().tenantId
    }
  }
}

// Grants DB administrator rights to Entra principals (dev-only today — see
// enableEntraAuth). Password auth (administratorLogin/administratorPassword
// above) stays enabled regardless; this is additive, not a replacement.
resource aadAdminAssignments 'Microsoft.DBforPostgreSQL/flexibleServers/administrators@2024-11-01-preview' = [
  for admin in aadAdmins: if (enableEntraAuth) {
    parent: pg
    name: admin.objectId
    properties: {
      principalType: admin.principalType
      principalName: admin.principalName
      tenantId: subscription().tenantId
    }
  }
]

resource db 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: pg
  name: databaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

resource additionalDbs 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = [
  for dbName in additionalDatabaseNames: {
    parent: pg
    name: dbName
    properties: {
      charset: 'UTF8'
      collation: 'en_US.utf8'
    }
  }
]

// Allow Azure services (incl. Container Apps Environment outbound IPs) to
// reach the server. Tighten to a specific allowlist in a follow-up.
resource fwAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2024-08-01' = {
  parent: pg
  name: 'AllowAllAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// Enforce TLS in transit.
// Dev OFF to unblock testing without TypeORM SSL config; qa/prod ON.
resource cfgSsl 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2024-08-01' = {
  parent: pg
  name: 'require_secure_transport'
  properties: {
    value: environment == 'dev' ? 'OFF' : 'ON'
    source: 'user-override'
  }
}

// Allowlist `uuid-ossp` so the Educator backend can use UUID generation
// (TypeORM migrations call `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`).
// After the server is created, a superuser must run:
//   CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
// against the educator_{env} database (one-time, idempotent).
resource cfgExtensions 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2024-08-01' = {
  parent: pg
  name: 'azure.extensions'
  properties: {
    value: 'UUID-OSSP'
    source: 'user-override'
  }
  dependsOn: [
    cfgSsl
  ]
}

resource diag 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  scope: pg
  name: 'pg-to-law'
  properties: {
    workspaceId: workspaceId
    logs: [
      { category: 'PostgreSQLLogs',         enabled: true }
      { category: 'PostgreSQLFlexSessions', enabled: true }
    ]
    metrics: [
      { category: 'AllMetrics', enabled: true }
    ]
  }
}

output serverName string = pg.name
output id string = pg.id
output fqdn string = pg.properties.fullyQualifiedDomainName
output databaseName string = db.name
