param name string
param location string
param functionPrincipalId string
param secretName string
@secure()
param secretValue string
param tags object

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enablePurgeProtection: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 30
    publicNetworkAccess: 'Enabled'
    sku: { family: 'A', name: 'standard' }
  }
}

resource secretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(vault.id, functionPrincipalId, 'KeyVaultSecretsUser')
  scope: vault
  properties: {
    principalId: functionPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
  }
}

resource aadSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (secretValue != '') {
  name: '${vault.name}/${secretName}'
  properties: {
    value: secretValue
  }
}

output name string = vault.name
output id string = vault.id
output uri string = vault.properties.vaultUri
