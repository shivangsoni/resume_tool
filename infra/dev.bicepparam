using './main.bicep'

param appName = 'applypilotcentral'
param location = 'centralus'
param staticWebAppSku = 'Standard'
// Static Web App Microsoft auth app client ID. This is separate from the GitHub deploy app ID used by CI.
param azureClientId = '35bf98bd-ec76-42b8-8fd5-db32455d2b00'
param documentIntelligenceSku = 'F0'
param azureOpenAiSku = 'S0'
param azureOpenAiDeploymentName = 'gpt-5-mini'
param azureOpenAiModelName = 'gpt-5-mini'
param azureOpenAiModelVersion = '2025-08-07'
param provisionAzureOpenAi = true
// Replace with the exact name of the SQL logical server already created in resource group `apply`.
param sqlServerName = 'simplyapply'
param sqlDatabaseName = 'applypilot'
param postmarkInboundAddress = 'c4e1c6ba7398a087b9d10354733b79fd@inbound.postmarkapp.com'
// Enable only after Postmark inbound-domain forwarding and the MX record are verified.
param mailboxDomain = ''
param deploymentEnvironment = 'production'
// Keep Google/GitHub SWA settings as Key Vault references. staticwebapp.config.json
// declares those providers; missing settings make all /.auth/* routes return 404.
param persistSocialAuthInKeyVault = true
param tags = {
  application: 'ApplyPilot'
  environment: 'dev'
  managedBy: 'Bicep'
}
