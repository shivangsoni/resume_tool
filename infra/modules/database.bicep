param sqlServerName string
param databaseName string
param location string
param tags object

resource server 'Microsoft.Sql/servers@2023-08-01-preview' existing = {
  name: sqlServerName
}

resource database 'Microsoft.Sql/servers/databases@2023-08-01-preview' = {
  parent: server
  name: databaseName
  location: location
  tags: tags
  sku: {
    name: 'Basic'
    tier: 'Basic'
    capacity: 5
  }
  properties: {
    maxSizeBytes: 2147483648
    zoneRedundant: false
    readScale: 'Disabled'
  }
}

resource allowAzureServices 'Microsoft.Sql/servers/firewallRules@2023-08-01-preview' = {
  parent: server
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

output name string = database.name
output serverFqdn string = server.properties.fullyQualifiedDomainName
