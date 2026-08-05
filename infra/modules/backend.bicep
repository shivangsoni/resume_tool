param functionAppName string
param storageAccountName string
param appInsightsName string
param planName string
param location string
param allowedOrigins array
param sqlServerFqdn string
param sqlDatabaseName string
param greenhouseBoards string
param tags object

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  tags: tags
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

resource insights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    RetentionInDays: 30
  }
}

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: planName
  location: location
  tags: tags
  kind: 'linux'
  sku: {
    name: 'Y1'
    tier: 'Dynamic'
  }
  properties: { reserved: true }
}

resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: functionAppName
  location: location
  tags: tags
  kind: 'functionapp,linux'
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    clientAffinityEnabled: false
    siteConfig: {
      alwaysOn: false
      ftpsState: 'Disabled'
      http20Enabled: true
      minimumElasticInstanceCount: 0
      linuxFxVersion: 'NODE|22'
      cors: {
        allowedOrigins: allowedOrigins
        supportCredentials: false
      }
      appSettings: [
        { name: 'FUNCTIONS_EXTENSION_VERSION', value: '~4' }
        { name: 'FUNCTIONS_WORKER_RUNTIME', value: 'node' }
        { name: 'WEBSITE_NODE_DEFAULT_VERSION', value: '~22' }
        { name: 'AzureWebJobsStorage', value: 'DefaultEndpointsProtocol=https;AccountName=${storage.name};EndpointSuffix=${environment().suffixes.storage};AccountKey=${storage.listKeys().keys[0].value}' }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: insights.properties.ConnectionString }
        { name: 'AZURE_SQL_SERVER', value: sqlServerFqdn }
        { name: 'AZURE_SQL_DATABASE', value: sqlDatabaseName }
        { name: 'GREENHOUSE_BOARDS', value: greenhouseBoards }
      ]
    }
  }
}

output name string = functionApp.name
output hostname string = functionApp.properties.defaultHostName
output url string = 'https://${functionApp.properties.defaultHostName}'
output principalId string = functionApp.identity.principalId
