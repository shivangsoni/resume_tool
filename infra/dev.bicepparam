using './main.bicep'

param appName = 'applypilot'
param location = 'westus2'
param staticWebAppSku = 'Free'
// Replace with the exact name of the SQL logical server already created in resource group `apply`.
param sqlServerName = 'REPLACE_WITH_SQL_SERVER_NAME'
param sqlDatabaseName = 'applypilot'
param tags = {
  application: 'ApplyPilot'
  environment: 'dev'
  managedBy: 'Bicep'
}
