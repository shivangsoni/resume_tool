# Azure infrastructure

This Bicep deployment creates two independently deployable workloads:

- Azure Static Web Apps Free for `frontend/`.
- Azure Functions on Linux Consumption for `backend/`, plus its storage account and Application Insights.

## Provision

```powershell
az login
az account set --subscription b5f1fa5f-c39f-4d7d-866c-57836fe7382f
az group create --name apply --location westus2
az deployment group what-if --resource-group apply --parameters infra/dev.bicepparam
az deployment group create --resource-group apply --parameters infra/dev.bicepparam
```

Review `what-if` before creating resources. If `apply` is not the intended resource group, substitute its actual resource-group name.

## Deploy backend independently

```powershell
npm install --prefix backend
Compress-Archive -Path backend/* -DestinationPath backend.zip
az functionapp deployment source config-zip --resource-group apply --name <backendName-output> --src backend.zip
```

## Deploy frontend independently

Build with the Function App URL from the Bicep output:

```powershell
$env:VITE_API_BASE_URL='https://<backendName-output>.azurewebsites.net/api'
npm run build --prefix frontend
npx @azure/static-web-apps-cli deploy frontend/dist --deployment-token <static-web-app-token>
```
