targetScope = 'resourceGroup'

@description('Base name used to generate globally unique Azure resource names.')
@minLength(3)
@maxLength(20)
param appName string = 'applypilot'

@description('Azure region for the Function App and related resources.')
param location string = resourceGroup().location

@description('Static Web Apps plan. Free is appropriate for development.')
@allowed(['Free', 'Standard'])
param staticWebAppSku string = 'Free'

@description('Tags applied to every supported resource.')
param tags object = {
  application: 'ApplyPilot'
  environment: 'dev'
  managedBy: 'Bicep'
}

var suffix = uniqueString(subscription().subscriptionId, resourceGroup().id, appName)
var safeBase = toLower(replace(appName, '-', ''))

module frontend 'modules/frontend.bicep' = {
  name: 'frontend'
  params: {
    name: '${appName}-web-${suffix}'
    location: location
    sku: staticWebAppSku
    tags: tags
  }
}

module backend 'modules/backend.bicep' = {
  name: 'backend'
  params: {
    functionAppName: '${appName}-api-${suffix}'
    storageAccountName: take('${safeBase}${suffix}', 24)
    appInsightsName: '${appName}-insights-${suffix}'
    planName: '${appName}-plan-${suffix}'
    location: location
    allowedOrigins: [frontend.outputs.url]
    tags: tags
  }
}

output frontendName string = frontend.outputs.name
output frontendUrl string = frontend.outputs.url
output frontendDeploymentTokenCommand string = 'az staticwebapp secrets list --name ${frontend.outputs.name} --query properties.apiKey -o tsv'
output backendName string = backend.outputs.name
output backendUrl string = backend.outputs.url
