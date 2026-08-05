param name string
param location string
param sku string
param tags object

resource staticWebApp 'Microsoft.Web/staticSites@2023-12-01' = {
  name: name
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  sku: {
    name: sku
    tier: sku
  }
  properties: {
    allowConfigFileUpdates: true
    stagingEnvironmentPolicy: sku == 'Free' ? 'Disabled' : 'Enabled'
  }
}

output name string = staticWebApp.name
output hostname string = staticWebApp.properties.defaultHostname
output url string = 'https://${staticWebApp.properties.defaultHostname}'
output id string = staticWebApp.id
output principalId string = staticWebApp.identity.principalId
