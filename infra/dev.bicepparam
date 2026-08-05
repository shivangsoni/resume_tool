using './main.bicep'

param appName = 'applypilotcentral'
param location = 'centralus'
param staticWebAppSku = 'Standard'
param azureClientId = ''
param documentIntelligenceSku = 'F0'
// Replace with the exact name of the SQL logical server already created in resource group `apply`.
param sqlServerName = 'simplyapply'
param sqlDatabaseName = 'applypilot'
param postmarkInboundAddress = 'c4e1c6ba7398a087b9d10354733b79fd@inbound.postmarkapp.com'
// Enable only after Postmark inbound-domain forwarding and the MX record are verified.
param mailboxDomain = ''
param tags = {
  application: 'ApplyPilot'
  environment: 'dev'
  managedBy: 'Bicep'
}
