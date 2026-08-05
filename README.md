# ApplyPilot

ApplyPilot is a React job-matching dashboard backed by an Azure Functions service that retrieves current remote job listings.

## Repository structure

```text
frontend/   React, TypeScript, Vite, frontend tests and Static Web Apps config
backend/    Azure Functions Node.js API, normalization logic and backend tests
infra/      Bicep templates for independently deployable Azure resources
db/         Forward-only Azure SQL schema migrations and identity bootstrap
```

## Local development

```powershell
npm install --prefix backend --workspaces=false
npm install --prefix frontend --workspaces=false
npm run dev --prefix backend
npm run dev --prefix frontend
```

Copy `backend/local.settings.example.json` to `backend/local.settings.json` for local Functions development.
The Vite development server proxies `/api` to the Azure Functions host at `http://127.0.0.1:7071`, so the default frontend environment works without CORS configuration.

## Validation

```powershell
npm run lint --prefix frontend
npm test --prefix frontend
npm test --prefix backend
npm run build --prefix frontend
```

## Complete Azure deployment

Run these commands from the repository root in PowerShell. Bicep provisions Azure resources; the backend and frontend deployment steps upload application code separately.

### Current development deployment

Last verified: August 5, 2026

| Resource | Value |
| --- | --- |
| Subscription | Visual Studio Enterprise Subscription (`b5f1fa5f-c39f-4d7d-866c-57836fe7382f`) |
| Resource group | `apply` |
| Application region | `centralus` |
| Infrastructure deployment | `applypilot-20260805-005152` |
| Frontend | https://blue-water-0d76ed710.7.azurestaticapps.net |
| Static Web App | `applypilotcentral-web-khaah5ti4wzag` (Free) |
| Backend | https://applypilotcentral-api-khaah5ti4wzag.azurewebsites.net |
| Function App | `applypilotcentral-api-khaah5ti4wzag` (Node.js 22, Linux Consumption) |
| SQL logical server | `simplyapply.database.windows.net` |
| SQL database | `applypilot` (Basic) |
| Key Vault | `applypilotcentralvaultkh` |

Verified production checks:

- Frontend returns HTTP 200 and includes the Static Web Apps security configuration.
- Frontend CORS and the compiled API URL target the Function App above.
- `/api/health` returns `status: ok` with Azure SQL connected.
- `/api/jobs` returns current Greenhouse and Remotive listings.
- Database migrations `001_initial`, `002_job_search`, and `003_job_sync_procedure` are applied.

### Deployment documentation policy

Any change to Bicep, Azure resource names, regions, application settings, database migrations, build output, deployment packaging, runtime versions, URLs, CORS, or release commands must update this README in the same commit. Deployment instructions are considered incomplete until they have been executed or clearly marked unverified.

### 1. Prerequisites

Install these tools and confirm they work:

```powershell
az --version
node --version
npm --version
winget install --id Microsoft.Sqlcmd --exact --silent --accept-package-agreements --accept-source-agreements
```

Azure CLI installation instructions: https://learn.microsoft.com/cli/azure/install-azure-cli-windows

### 2. Sign in and choose the subscription

Use browser login, or replace the first command with `az login --use-device-code` when a browser window cannot open:

```powershell
az login
az account list --refresh --output table

$subscriptionId = 'b5f1fa5f-c39f-4d7d-866c-57836fe7382f'
az account set --subscription $subscriptionId
az account show --query '{name:name,id:id,tenantId:tenantId,user:user.name}' --output table
```

Do not continue unless `az account show` prints the intended Visual Studio Enterprise subscription ID.

### 3. Confirm deployment parameters

Review `infra/dev.bicepparam`. In particular, `sqlServerName` must be the logical Azure SQL server name without `.database.windows.net`, and the SQL server must be in resource group `apply`.

```powershell
Get-Content infra/dev.bicepparam
az sql server show --resource-group apply --name simplyapply --output table
```

If the existing SQL server has another name, update both `infra/dev.bicepparam` and the verification command.

### 4. Validate and provision resources

```powershell
$resourceGroup = 'apply'
$location = 'centralus'
$deploymentName = "applypilot-$(Get-Date -Format 'yyyyMMdd-HHmmss')"

az group create --name $resourceGroup --location $location --output table
az bicep build --file infra/main.bicep
az deployment group validate `
  --resource-group $resourceGroup `
  --parameters infra/dev.bicepparam `
  --output table
az deployment group what-if `
  --resource-group $resourceGroup `
  --parameters infra/dev.bicepparam

$deployment = az deployment group create `
  --name $deploymentName `
  --resource-group $resourceGroup `
  --parameters infra/dev.bicepparam `
  --output json | ConvertFrom-Json

$frontendName = $deployment.properties.outputs.frontendName.value
$frontendUrl = $deployment.properties.outputs.frontendUrl.value
$backendName = $deployment.properties.outputs.backendName.value
$backendUrl = $deployment.properties.outputs.backendUrl.value
$sqlDatabase = $deployment.properties.outputs.sqlDatabase.value

[PSCustomObject]@{
  FrontendName = $frontendName
  FrontendUrl = $frontendUrl
  BackendName = $backendName
  BackendUrl = $backendUrl
  SqlDatabase = $sqlDatabase
} | Format-List
```

Keep that PowerShell window open—the captured names are used below. If reopening a terminal, recover outputs with:

```powershell
$deployment = az deployment group show --resource-group apply --name <deployment-name> --output json | ConvertFrom-Json
```

### 5. Configure Azure SQL

The SQL logical server needs a Microsoft Entra administrator before managed identities can be created as database users. Configure one in Azure Portal under **SQL server → Microsoft Entra ID → Set admin**, or use Azure CLI with the administrator's object ID.

Run the migrations in order using `sqlcmd` authenticated through Microsoft Entra:

```powershell
$sqlServerFqdn = 'simplyapply.database.windows.net'

sqlcmd -S $sqlServerFqdn -d $sqlDatabase -G -i db/migrations/001_initial.sql
sqlcmd -S $sqlServerFqdn -d $sqlDatabase -G -i db/migrations/002_job_search.sql
sqlcmd -S $sqlServerFqdn -d $sqlDatabase -G -i db/migrations/003_job_sync_procedure.sql
```

Next, open `db/bootstrap/001_function_identity.sql`, replace `APPLY_FUNCTION_APP_NAME` with the value of `$backendName`, and execute it:

```powershell
sqlcmd -S $sqlServerFqdn -d $sqlDatabase -G -i db/bootstrap/001_function_identity.sql
```

If `sqlcmd` is unavailable, run the same scripts in the Azure Portal SQL Query Editor while signed in as the Entra administrator.

### 6. Deploy the backend code

The ZIP must contain `host.json` at its root and must not contain `local.settings.json`.

```powershell
npm ci --prefix backend --omit=dev --workspaces=false

Push-Location backend
tar.exe -a -c -f ..\backend.zip host.json package.json package-lock.json src node_modules
Pop-Location

az functionapp deployment source config-zip `
  --resource-group $resourceGroup `
  --name $backendName `
  --src backend.zip

az functionapp restart --resource-group $resourceGroup --name $backendName
```

Verify the backend before deploying the frontend:

```powershell
Invoke-RestMethod "$backendUrl/api/health" | ConvertTo-Json
$jobs = Invoke-RestMethod "$backendUrl/api/jobs?limit=3"
$jobs.jobs | Select-Object title,company,source,postedAt | Format-Table
```

Do not continue until `/api/health` returns `status: ok` or `status: degraded` and `/api/jobs` returns job records. A degraded health response means the API is running but SQL identity/migrations still need attention.

### 7. Build and deploy the frontend code

`VITE_API_BASE_URL` is compiled into the frontend bundle, so it must reference the deployed Function App before building.

```powershell
$env:VITE_API_BASE_URL = "$backendUrl/api"
npm ci --prefix frontend --workspaces=false
npm run lint --prefix frontend
npm test --prefix frontend
npm run build --prefix frontend

Test-Path frontend/dist/index.html
Test-Path frontend/dist/staticwebapp.config.json

$deploymentToken = az staticwebapp secrets list `
  --name $frontendName `
  --resource-group $resourceGroup `
  --query properties.apiKey `
  --output tsv

if ([string]::IsNullOrWhiteSpace($deploymentToken)) {
  throw 'Static Web App deployment token was not returned.'
}

npx --yes @azure/static-web-apps-cli deploy frontend/dist `
  --deployment-token $deploymentToken `
  --env production
```

Open the deployed application:

```powershell
$frontendUrl
Start-Process $frontendUrl
```

### 8. Verify Azure state

```powershell
az staticwebapp show --resource-group $resourceGroup --name $frontendName `
  --query '{name:name,hostname:defaultHostname,repositoryUrl:repositoryUrl}' --output table

az functionapp show --resource-group $resourceGroup --name $backendName `
  --query '{name:name,state:state,host:defaultHostName,runtime:siteConfig.linuxFxVersion}' --output table

az functionapp config appsettings list --resource-group $resourceGroup --name $backendName `
  --query "[?name=='AZURE_SQL_SERVER' || name=='AZURE_SQL_DATABASE' || name=='GREENHOUSE_BOARDS'].{name:name,value:value}" `
  --output table
```

## Deployed application not loading

Provisioning resources in Azure Portal is not enough; you must complete both code-deployment steps above.

- **Static site shows a default/empty page or 404:** redeploy `frontend/dist`. Confirm both `index.html` and `staticwebapp.config.json` exist inside `frontend/dist` before deployment.
- **Frontend loads but reports API unavailable:** open `$backendUrl/api/health` and `$backendUrl/api/jobs?limit=3` directly. Rebuild the frontend with `VITE_API_BASE_URL="$backendUrl/api"` after the backend URL changes.
- **Function returns 404:** inspect ZIP contents and confirm `host.json`, `package.json`, and `src/functions/jobs.js` are at the ZIP root structure shown above.
- **Function returns 500/503:** stream logs with `az webapp log tail --resource-group $resourceGroup --name $backendName`. Verify SQL migrations and the managed-identity database user.
- **Browser reports CORS:** rerun the Bicep deployment so the Function App allowed origin matches the current Static Web App hostname.
- **Portal resource blade itself fails:** confirm the selected subscription with `az account show`, then inspect resources through CLI using `az resource list --resource-group apply --output table`. Portal UI failure does not necessarily mean the deployed endpoints are down.
- **Deployment status:** inspect it with `az deployment group show --resource-group $resourceGroup --name $deploymentName --output table` and `az deployment operation group list --resource-group $resourceGroup --name $deploymentName --output table`.

The frontend and backend can be redeployed independently. See [docs/JOB_SOURCES.md](docs/JOB_SOURCES.md) for job-provider rules.

## Privacy

The current profile feature uses browser local storage. Never enter passwords, Social Security numbers, government IDs, or payment information.
