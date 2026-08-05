param communicationServiceName string
param emailServiceName string
param tags object

resource emailService 'Microsoft.Communication/emailServices@2025-09-01' = {
  name: emailServiceName
  location: 'global'
  tags: tags
  properties: {
    dataLocation: 'United States'
  }
}

resource managedDomain 'Microsoft.Communication/emailServices/domains@2025-09-01' = {
  parent: emailService
  name: 'AzureManagedDomain'
  location: 'global'
  tags: tags
  properties: {
    domainManagement: 'AzureManaged'
    userEngagementTracking: 'Disabled'
  }
}

resource communicationService 'Microsoft.Communication/communicationServices@2023-04-01' = {
  name: communicationServiceName
  location: 'global'
  tags: tags
  properties: {
    dataLocation: 'United States'
    linkedDomains: [managedDomain.id]
  }
}

output id string = communicationService.id
output endpoint string = 'https://${communicationService.properties.hostName}'
output senderAddress string = 'donotreply@${managedDomain.properties.mailFromSenderDomain}'
output name string = communicationService.name
output emailServiceName string = emailService.name
