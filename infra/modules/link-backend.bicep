param staticWebAppName string
param backendResourceId string
param backendRegion string

resource staticWebApp 'Microsoft.Web/staticSites@2023-12-01' existing = {
  name: staticWebAppName
}

resource linkedBackend 'Microsoft.Web/staticSites/linkedBackends@2023-12-01' = {
  parent: staticWebApp
  name: 'applypilot-api'
  properties: {
    backendResourceId: backendResourceId
    region: backendRegion
  }
}
