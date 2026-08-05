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

## Deployment

### Azure login and subscription

```powershell
az login
az account set --subscription <subscription-id-or-name>
```

If you have multiple Azure subscriptions, use `az account list -o table` to choose the correct one first.

### Provision infrastructure

```powershell
az group create --name apply --location centralus
az deployment group what-if --resource-group apply --parameters infra/dev.bicepparam
az deployment group create --resource-group apply --parameters infra/dev.bicepparam
```

Review the `what-if` output before you create resources.

### Database setup

After infra deployment, run the SQL migration scripts in `db/migrations/` as a Microsoft Entra SQL administrator.

Then update `db/bootstrap/001_function_identity.sql`:

- Replace the placeholder in the script with the `backendName` output from the deployment.
- Execute the script to grant the Function App managed identity access to the database.

### Deploy backend

```powershell
npm install --prefix backend --workspaces=false
Remove-Item backend.zip -ErrorAction SilentlyContinue
Compress-Archive -Path (Get-ChildItem backend -Recurse -File | Where-Object { $_.FullName -notmatch '\\node_modules\\' } | Select-Object -ExpandProperty FullName) -DestinationPath backend.zip -Force
az functionapp deployment source config-zip --resource-group apply --name <backendName-output> --src backend.zip
```

### Deploy frontend

Build the frontend with the backend URL, then deploy via Static Web Apps CLI.

```powershell
$env:VITE_API_BASE_URL = 'https://<backendName-output>.azurewebsites.net/api'
npm install --prefix frontend --workspaces=false
npm run build --prefix frontend
$token = (az staticwebapp secrets list --name <staticWebAppName> --resource-group apply --query 'properties.apiKey' -o tsv)
npx @azure/static-web-apps-cli deploy frontend/dist --deployment-token $token
```

### Notes

- The frontend and backend can be deployed independently.
- Use the exact SQL server name in `infra/dev.bicepparam` before deployment.
- See [docs/JOB_SOURCES.md](docs/JOB_SOURCES.md) for source evaluation and provider rules.

## Privacy

The current profile feature uses browser local storage. Never enter passwords, Social Security numbers, government IDs, or payment information.
