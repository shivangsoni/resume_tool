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

@description('Azure AI Document Intelligence pricing tier. Use F0 for development or S0 when F0 is unavailable.')
@allowed(['F0', 'S0'])
param documentIntelligenceSku string = 'F0'

@description('Name of the existing Azure SQL logical server in this resource group.')
param sqlServerName string

@description('Database name created on the existing SQL server.')
param sqlDatabaseName string = 'applypilot'

@description('Tags applied to every supported resource.')
param tags object = {
  application: 'ApplyPilot'
  environment: 'dev'
  managedBy: 'Bicep'
}

var suffix = uniqueString(subscription().subscriptionId, resourceGroup().id, appName)
var safeBase = toLower(replace(appName, '-', ''))
var keyVaultName = take('${safeBase}vault${suffix}', 24)

module documentIntelligence 'modules/document-intelligence.bicep' = {
  name: 'documentIntelligence'
  params: {
    name: take('${safeBase}-docs-${suffix}', 64)
    location: location
    sku: documentIntelligenceSku
    tags: tags
  }
}

module frontend 'modules/frontend.bicep' = {
  name: 'frontend'
  params: {
    name: '${appName}-web-${suffix}'
    location: location
    sku: staticWebAppSku
    tags: tags
  }
}

module database 'modules/database.bicep' = {
  name: 'database'
  params: {
    sqlServerName: sqlServerName
    databaseName: sqlDatabaseName
    location: location
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
    sqlServerFqdn: database.outputs.serverFqdn
    sqlDatabaseName: database.outputs.name
    greenhouseBoards: 'stripe:Stripe,cloudflare:Cloudflare,figma:Figma,airbnb:Airbnb'
    documentIntelligenceEndpoint: documentIntelligence.outputs.endpoint
    tags: tags
  }
}

module documentIntelligenceAccess 'modules/document-intelligence-access.bicep' = {
  name: 'documentIntelligenceAccess'
  params: {
    accountResourceId: documentIntelligence.outputs.id
    functionPrincipalId: backend.outputs.principalId
  }
}


module keyVault 'modules/keyvault.bicep' = {
  name: 'keyVault'
  params: {
    name: keyVaultName
    location: location
    functionPrincipalId: backend.outputs.principalId
    tags: tags
  }
}

module linkedBackend 'modules/link-backend.bicep' = {
  name: 'linkedBackend'
  params: {
    staticWebAppName: frontend.outputs.name
    backendResourceId: backend.outputs.id
    backendRegion: location
  }
}

output frontendName string = frontend.outputs.name
output frontendUrl string = frontend.outputs.url
output frontendDeploymentTokenCommand string = 'az staticwebapp secrets list --name ${frontend.outputs.name} --query properties.apiKey -o tsv'
output backendName string = backend.outputs.name
output backendUrl string = backend.outputs.url
output sqlDatabase string = database.outputs.name
output keyVaultName string = keyVault.outputs.name
output documentIntelligenceName string = documentIntelligence.outputs.name
