param accountResourceId string
param functionPrincipalId string

resource account 'Microsoft.CognitiveServices/accounts@2024-10-01' existing = {
  name: last(split(accountResourceId, '/'))
}

resource cognitiveServicesUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(account.id, functionPrincipalId, 'CognitiveServicesUser')
  scope: account
  properties: {
    principalId: functionPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'a97b65f3-24c7-4388-baec-2e87135dc908')
  }
}
