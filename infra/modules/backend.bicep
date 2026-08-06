param functionAppName string
param storageAccountName string
param appInsightsName string
param planName string
param location string
param allowedOrigins array
param sqlServerFqdn string
param sqlDatabaseName string
param greenhouseBoards string
param documentIntelligenceEndpoint string
param emailEndpoint string
param emailSenderAddress string
param postmarkInboundAddress string = ''
param mailboxDomain string = ''
param serviceBusNamespace string
param submissionQueueName string
param deploymentEnvironment string = 'production'
param tags object

resource functionIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${functionAppName}-id'
  location: location
  tags: tags
}

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

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource resumes 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'resumes'
  properties: { publicAccess: 'None' }
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
  identity: {
    type: 'SystemAssigned, UserAssigned'
    userAssignedIdentities: { '${functionIdentity.id}': {} }
  }
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
        { name: 'AZURE_STORAGE_ACCOUNT', value: storage.name }
        { name: 'RESUME_CONTAINER', value: resumes.name }
        { name: 'DOCUMENT_INTELLIGENCE_ENDPOINT', value: documentIntelligenceEndpoint }
        { name: 'EMAIL_COMMUNICATION_ENDPOINT', value: emailEndpoint }
        { name: 'EMAIL_SENDER_ADDRESS', value: emailSenderAddress }
        { name: 'POSTMARK_INBOUND_ADDRESS', value: postmarkInboundAddress }
        { name: 'MAILBOX_DOMAIN', value: mailboxDomain }
        { name: 'SERVICE_BUS_NAMESPACE', value: serviceBusNamespace }
        { name: 'SERVICE_BUS__fullyQualifiedNamespace', value: serviceBusNamespace }
        { name: 'APPLICATION_SUBMISSION_QUEUE', value: submissionQueueName }
        { name: 'DEPLOYMENT_ENVIRONMENT', value: deploymentEnvironment }
        { name: 'AZURE_CLIENT_ID', value: functionIdentity.properties.clientId }
      ]
    }
  }
}

resource blobContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, functionApp.name, 'StorageBlobDataContributor')
  scope: storage
  properties: {
    principalId: functionIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
  }
}

resource packageBlobReader 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, functionApp.name, 'PackageStorageBlobDataReader')
  scope: storage
  properties: {
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '2a2b9908-6ea1-4ae2-8e65-a410df84e7d1')
  }
}

output name string = functionApp.name
output hostname string = functionApp.properties.defaultHostName
output url string = 'https://${functionApp.properties.defaultHostName}'
output principalId string = functionIdentity.properties.principalId
output identityName string = functionIdentity.name
output identityClientId string = functionIdentity.properties.clientId
output storageAccountName string = storage.name
output id string = functionApp.id
