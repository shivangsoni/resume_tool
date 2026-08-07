param communicationServiceName string
param functionPrincipalId string
param workerPrincipalId string = ''

resource communicationService 'Microsoft.Communication/communicationServices@2023-04-01' existing = {
  name: communicationServiceName
}

resource emailSender 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(communicationService.id, functionPrincipalId, 'CommunicationAndEmailServiceOwner')
  scope: communicationService
  properties: {
    principalId: functionPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '09976791-48a7-449e-bb21-39d1a415f350')
  }
}

resource workerEmailSender 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(workerPrincipalId)) {
  name: guid(communicationService.id, workerPrincipalId, 'CommunicationAndEmailServiceOwner-worker')
  scope: communicationService
  properties: {
    principalId: workerPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '09976791-48a7-449e-bb21-39d1a415f350')
  }
}
