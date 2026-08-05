using './main.bicep'

param appName = 'applypilotcentral'
param location = 'centralus'
param staticWebAppSku = 'Standard'
param documentIntelligenceSku = 'F0'
// Replace with the exact name of the SQL logical server already created in resource group `apply`.
param sqlServerName = 'simplyapply'
param sqlDatabaseName = 'applypilot'
param tags = {
  application: 'ApplyPilot'
  environment: 'dev'
  managedBy: 'Bicep'
}
