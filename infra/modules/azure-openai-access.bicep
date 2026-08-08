param accountResourceId string
param workerPrincipalId string
param functionPrincipalId string = ''

resource account 'Microsoft.CognitiveServices/accounts@2024-10-01' existing = {
  name: last(split(accountResourceId, '/'))
}

// Cognitive Services OpenAI User
var openAiUserRoleId = '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd'

resource workerOpenAiUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(account.id, workerPrincipalId, 'OpenAIUser')
  scope: account
  properties: {
    principalId: workerPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', openAiUserRoleId)
  }
}

resource functionOpenAiUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(functionPrincipalId)) {
  name: guid(account.id, functionPrincipalId, 'OpenAIUser')
  scope: account
  properties: {
    principalId: functionPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', openAiUserRoleId)
  }
}
