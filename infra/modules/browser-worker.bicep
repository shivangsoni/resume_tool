param name string
param location string
param serviceBusNamespace string
param queueName string
param sqlServerFqdn string
param sqlDatabaseName string
param storageAccountName string
param tags object

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${name}-w2-logs'
  location: location
  tags: tags
  properties: {
    retentionInDays: 30
    features: { enableLogAccessUsingOnlyResourcePermissions: true }
  }
  sku: { name: 'PerGB2018' }
}

resource environment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${name}-w2-env'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
  }
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: '${replace(name, '-', '')}w2'
  location: location
  tags: tags
  sku: { name: 'Basic' }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
  }
}

resource worker 'Microsoft.App/containerApps@2025-07-01' = {
  name: name
  location: location
  tags: tags
  identity: { type: 'SystemAssigned' }
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      activeRevisionsMode: 'Single'
      registries: [{
        server: registry.properties.loginServer
        identity: 'system'
      }]
    }
    template: {
      containers: [{
        name: 'browser-worker'
        image: 'mcr.microsoft.com/playwright:v1.58.2-noble'
        command: ['/bin/sh', '-c', 'sleep 3600']
        env: [
          { name: 'SERVICE_BUS_NAMESPACE', value: serviceBusNamespace }
          { name: 'APPLICATION_SUBMISSION_QUEUE', value: queueName }
          { name: 'AZURE_SQL_SERVER', value: sqlServerFqdn }
          { name: 'AZURE_SQL_DATABASE', value: sqlDatabaseName }
          { name: 'AZURE_STORAGE_ACCOUNT', value: storageAccountName }
          { name: 'RESUME_CONTAINER', value: 'resumes' }
        ]
        resources: {
          cpu: json('1.0')
          memory: '2Gi'
        }
      }]
      scale: {
        minReplicas: 0
        maxReplicas: 2
        rules: [{
          name: 'submission-queue'
          custom: {
            type: 'azure-servicebus'
            metadata: {
              namespace: serviceBusNamespace
              queueName: queueName
              messageCount: '1'
            }
            identity: 'system'
          }
        }]
      }
    }
  }
}

resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, worker.id, 'acr-pull')
  scope: registry
  properties: {
    principalId: worker.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
  }
}

resource bus 'Microsoft.ServiceBus/namespaces@2024-01-01' existing = {
  name: first(split(serviceBusNamespace, '.'))
}

resource busReceiver 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(bus.id, worker.id, 'receiver')
  scope: bus
  properties: {
    principalId: worker.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '090c5cfd-751d-490a-894a-3ce6f1109419')
  }
}

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: storageAccountName
}

resource blobReader 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, worker.id, 'blob-reader')
  scope: storage
  properties: {
    principalId: worker.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '2a2b9908-6ea1-4ae2-8e65-a410df84e7d1')
  }
}

output workerName string = worker.name
output registryName string = registry.name
output registryServer string = registry.properties.loginServer
