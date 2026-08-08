using './main.bicep'

param appName = 'applypilotstage'
param location = 'centralus'
param browserWorkerLocation = 'westus2'
param staticWebAppSku = 'Standard'
param azureClientId = '35bf98bd-ec76-42b8-8fd5-db32455d2b00'
param documentIntelligenceSku = 'S0'
param azureOpenAiSku = 'S0'
param azureOpenAiDeploymentName = 'gpt-5-mini'
param azureOpenAiModelName = 'gpt-5-mini'
param azureOpenAiModelVersion = '2025-08-07'
param provisionAzureOpenAi = true
param sqlServerName = 'simplyapply'
param sqlServerResourceGroupName = 'apply'
param sqlDatabaseName = 'applypilot_nonprod'
param postmarkInboundAddress = 'c4e1c6ba7398a087b9d10354733b79fd@inbound.postmarkapp.com'
param mailboxDomain = ''
param deploymentEnvironment = 'nonproduction'
param persistSocialAuthInKeyVault = true
param tags = {
  application: 'ApplyPilot'
  environment: 'nonproduction'
  managedBy: 'Bicep'
}
