using './main.bicep'

param appName = 'applypilot'
param location = 'westus2'
param staticWebAppSku = 'Free'
param tags = {
  application: 'ApplyPilot'
  environment: 'dev'
  managedBy: 'Bicep'
}
