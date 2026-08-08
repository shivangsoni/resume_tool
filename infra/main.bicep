targetScope = 'resourceGroup'

@description('Base name used to generate globally unique Azure resource names.')
@minLength(3)
@maxLength(20)
param appName string = 'applypilot'

@description('Azure region for the Function App and related resources.')
param location string = resourceGroup().location

@description('Region for the isolated browser worker; separated to avoid Container Apps capacity constraints.')
param browserWorkerLocation string = 'westus2'

@description('Container image retained by infrastructure deployments until the application deployment publishes a new worker revision.')
param browserWorkerImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

@description('Existing backend release package URL retained during infrastructure-only deployments.')
param backendPackageUrl string = ''

@description('Static Web Apps plan. Free is appropriate for development.')
@allowed(['Free', 'Standard'])
param staticWebAppSku string = 'Free'

@description('Azure AD client ID used by the Static Web App authentication provider.')
param azureClientId string = ''

@description('Name of the Key Vault secret that stores the Azure AD client secret.')
param azureClientSecretName string = 'azure-client-secret'

@description('Optional Azure AD client secret value used to populate the Key Vault secret if it does not already exist.')
@secure()
param azureClientSecretValue string = ''

@description('Optional Google OAuth web client ID for Static Web Apps custom auth.')
param googleClientId string = ''

@secure()
param googleClientSecret string = ''

@description('Optional GitHub OAuth app client ID for Static Web Apps custom auth.')
param githubClientId string = ''

@secure()
param githubClientSecret string = ''

@description('When true, SWA keeps Google/GitHub settings as Key Vault references so infrastructure deploys do not wipe social auth.')
param persistSocialAuthInKeyVault bool = false

@description('Ops alert destination for Application Insights action-group emails and runtime failure notices.')
param opsAlertEmail string = 'shivangsoni22@gmail.com'

@description('Azure AI Document Intelligence pricing tier. Use F0 for development or S0 when F0 is unavailable.')
@allowed(['F0', 'S0'])
param documentIntelligenceSku string = 'F0'

@description('Azure OpenAI pricing tier for worker option-matching.')
@allowed(['S0'])
param azureOpenAiSku string = 'S0'

@description('Azure OpenAI chat deployment name.')
param azureOpenAiDeploymentName string = 'gpt-5-mini'

@description('Azure OpenAI model name.')
param azureOpenAiModelName string = 'gpt-5-mini'

@description('Azure OpenAI model version.')
param azureOpenAiModelVersion string = '2025-08-07'

@description('When false, skip provisioning Azure OpenAI (local/dev without quota).')
param provisionAzureOpenAi bool = true

@description('Name of the existing Azure SQL logical server.')
param sqlServerName string

@description('Resource group containing the existing Azure SQL logical server.')
param sqlServerResourceGroupName string = resourceGroup().name

@description('Database name created on the existing SQL server.')
param sqlDatabaseName string = 'applypilot'

@description('Postmark server inbound address used for plus-addressed user mailboxes.')
param postmarkInboundAddress string = ''

@description('Custom inbound domain after its MX record is connected to Postmark.')
param mailboxDomain string = ''

@description('Runtime environment label. Non-production values cause outbound email to be marked TEST.')
param deploymentEnvironment string = 'production'

@description('Tags applied to every supported resource.')
param tags object = {
  application: 'ApplyPilot'
  environment: 'dev'
  managedBy: 'Bicep'
}

var suffix = uniqueString(subscription().subscriptionId, resourceGroup().id, appName)
var safeBase = toLower(replace(appName, '-', ''))
var keyVaultName = take('${safeBase}vault${suffix}', 24)
var frontendResourceName = '${appName}-web-${suffix}'
var enabledAuthProviders = join(concat(
  ['aad'],
  persistSocialAuthInKeyVault || !(empty(googleClientId) || empty(googleClientSecret)) ? ['google'] : [],
  persistSocialAuthInKeyVault || !(empty(githubClientId) || empty(githubClientSecret)) ? ['github'] : []
), ',')
var swaAuthSettings = union(
  {
    AZURE_CLIENT_ID: azureClientId
    AZURE_CLIENT_SECRET: '@Microsoft.KeyVault(SecretUri=${keyVault.outputs.uri}secrets/${azureClientSecretName})'
  },
  persistSocialAuthInKeyVault ? {
    GOOGLE_CLIENT_ID: '@Microsoft.KeyVault(SecretUri=${keyVault.outputs.uri}secrets/google-client-id)'
    GOOGLE_CLIENT_SECRET: '@Microsoft.KeyVault(SecretUri=${keyVault.outputs.uri}secrets/google-client-secret)'
    GITHUB_CLIENT_ID: '@Microsoft.KeyVault(SecretUri=${keyVault.outputs.uri}secrets/github-client-id)'
    GITHUB_CLIENT_SECRET: '@Microsoft.KeyVault(SecretUri=${keyVault.outputs.uri}secrets/github-client-secret)'
  } : union(
    empty(googleClientId) || empty(googleClientSecret) ? {} : {
      GOOGLE_CLIENT_ID: googleClientId
      GOOGLE_CLIENT_SECRET: googleClientSecret
    },
    empty(githubClientId) || empty(githubClientSecret) ? {} : {
      GITHUB_CLIENT_ID: githubClientId
      GITHUB_CLIENT_SECRET: githubClientSecret
    }
  )
)

module serviceBus 'modules/service-bus.bicep' = {
  name: 'serviceBus'
  params: {
    namespaceName: take('${safeBase}-bus-${suffix}', 50)
    location: location
    tags: tags
  }
}

module email 'modules/email.bicep' = {
  name: 'email'
  params: {
    communicationServiceName: take('${safeBase}-comm-${suffix}', 63)
    emailServiceName: take('${safeBase}-email-${suffix}', 63)
    tags: tags
  }
}

module documentIntelligence 'modules/document-intelligence.bicep' = {
  name: 'documentIntelligence'
  params: {
    name: take('${safeBase}-docs-${suffix}', 64)
    location: location
    sku: documentIntelligenceSku
    tags: tags
  }
}

module azureOpenAi 'modules/azure-openai.bicep' = if (provisionAzureOpenAi) {
  name: 'azureOpenAi'
  params: {
    name: take('${safeBase}oai${suffix}', 24)
    location: location
    sku: azureOpenAiSku
    deploymentName: azureOpenAiDeploymentName
    modelName: azureOpenAiModelName
    modelVersion: azureOpenAiModelVersion
    tags: tags
  }
}

module frontend 'modules/frontend.bicep' = {
  name: 'frontend'
  params: {
    name: frontendResourceName
    location: location
    sku: staticWebAppSku
    tags: tags
  }
}

module keyVault 'modules/keyvault.bicep' = {
  name: 'keyVault'
  params: {
    name: keyVaultName
    location: location
    functionPrincipalId: frontend.outputs.principalId
    secretName: azureClientSecretName
    secretValue: azureClientSecretValue
    tags: tags
  }
}

resource staticWebAppConfig 'Microsoft.Web/staticSites/config@2023-12-01' = {
  name: '${frontendResourceName}/appsettings'
  properties: swaAuthSettings
}

module database 'modules/database.bicep' = {
  name: 'database'
  scope: resourceGroup(sqlServerResourceGroupName)
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
    emailEndpoint: email.outputs.endpoint
    emailSenderAddress: email.outputs.senderAddress
    postmarkInboundAddress: postmarkInboundAddress
    mailboxDomain: mailboxDomain
    serviceBusNamespace: serviceBus.outputs.namespace
    submissionQueueName: serviceBus.outputs.queueName
    deploymentEnvironment: deploymentEnvironment
    applicationBaseUrl: frontend.outputs.url
    packageUrl: backendPackageUrl
    opsAlertEmail: opsAlertEmail
    authProviders: enabledAuthProviders
    tags: tags
  }
}

module browserWorker 'modules/browser-worker.bicep' = {
  name: 'browserWorker'
  params: {
    name: take('${appName}-browser-${suffix}', 32)
    location: browserWorkerLocation
    serviceBusNamespace: serviceBus.outputs.namespace
    queueName: serviceBus.outputs.queueName
    sqlServerFqdn: database.outputs.serverFqdn
    sqlDatabaseName: database.outputs.name
    storageAccountName: backend.outputs.storageAccountName
    image: browserWorkerImage
    postmarkInboundAddress: postmarkInboundAddress
    mailboxDomain: mailboxDomain
    emailEndpoint: email.outputs.endpoint
    emailSenderAddress: email.outputs.senderAddress
    deploymentEnvironment: deploymentEnvironment
    applicationBaseUrl: frontend.outputs.url
    azureOpenAiEndpoint: provisionAzureOpenAi ? azureOpenAi.outputs.endpoint : ''
    azureOpenAiDeployment: provisionAzureOpenAi ? azureOpenAi.outputs.deploymentName : ''
    tags: tags
  }
}

module alerting 'modules/alerting.bicep' = {
  name: 'alerting'
  params: {
    appInsightsId: backend.outputs.appInsightsId
    actionGroupName: take('${appName}-ops', 60)
    alertEmail: opsAlertEmail
    tags: tags
  }
}

module serviceBusAccess 'modules/service-bus-access.bicep' = {
  name: 'serviceBusAccess'
  params: {
    namespaceResourceId: serviceBus.outputs.id
    functionPrincipalId: backend.outputs.principalId
  }
}

module emailAccess 'modules/email-access.bicep' = {
  name: 'emailAccess'
  params: {
    communicationServiceName: email.outputs.name
    functionPrincipalId: backend.outputs.principalId
    workerPrincipalId: browserWorker.outputs.identityPrincipalId
  }
}

module documentIntelligenceAccess 'modules/document-intelligence-access.bicep' = {
  name: 'documentIntelligenceAccess'
  params: {
    accountResourceId: documentIntelligence.outputs.id
    functionPrincipalId: backend.outputs.principalId
  }
}

module azureOpenAiAccess 'modules/azure-openai-access.bicep' = if (provisionAzureOpenAi) {
  name: 'azureOpenAiAccess'
  params: {
    accountResourceId: azureOpenAi.outputs.id
    workerPrincipalId: browserWorker.outputs.identityPrincipalId
    functionPrincipalId: backend.outputs.principalId
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
output azureOpenAiEndpoint string = provisionAzureOpenAi ? azureOpenAi.outputs.endpoint : ''
output azureOpenAiDeployment string = provisionAzureOpenAi ? azureOpenAi.outputs.deploymentName : ''
output azureOpenAiName string = provisionAzureOpenAi ? azureOpenAi.outputs.name : ''
output communicationServiceName string = email.outputs.name
output emailServiceName string = email.outputs.emailServiceName
output emailSenderAddress string = email.outputs.senderAddress
output serviceBusNamespace string = serviceBus.outputs.namespace
output applicationSubmissionQueue string = serviceBus.outputs.queueName
output browserWorkerName string = browserWorker.outputs.workerName
output browserRegistryName string = browserWorker.outputs.registryName
output browserWorkerIdentityName string = browserWorker.outputs.identityName
output backendStorageAccount string = backend.outputs.storageAccountName
output backendIdentityName string = backend.outputs.identityName
output backendIdentityClientId string = backend.outputs.identityClientId
