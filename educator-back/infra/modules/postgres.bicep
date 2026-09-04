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
      activeDirectoryAuth: 'Disabled'
      tenantId: subscription().tenantId
    }
  }
}

resource db 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: pg
  name: databaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

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
