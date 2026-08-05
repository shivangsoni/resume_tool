param namespaceResourceId string
param functionPrincipalId string

resource serviceBus 'Microsoft.ServiceBus/namespaces@2024-01-01' existing = {
  name: last(split(namespaceResourceId, '/'))
}

resource sender 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(serviceBus.id, functionPrincipalId, 'AzureServiceBusDataSender')
  scope: serviceBus
  properties: {
    principalId: functionPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '69a216fc-b8fb-44d8-bc22-1f3c2cd27a39')
  }
}

resource receiver 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(serviceBus.id, functionPrincipalId, 'AzureServiceBusDataReceiver')
  scope: serviceBus
  properties: {
    principalId: functionPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4f6d3b9b-027b-4f4c-9142-0e5a2a2247e0')
  }
}
