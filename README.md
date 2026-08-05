# ApplyPilot

ApplyPilot is a production-oriented React job search and application tracker. It retrieves current listings, stores a signed-in user's profile and application history in Azure SQL, uploads resumes to private Blob Storage, opens the employer's real application form, and requires the user to confirm the final submission.

The product deliberately uses a review-first workflow. It does not claim an application was submitted merely because an employer page was opened, and it does not bypass employer consent, CAPTCHA, screening questions, or terms of service.

## Repository structure

```text
frontend/   React, TypeScript, Vite, frontend tests and Static Web Apps config
backend/    Azure Functions Node.js API, normalization logic and backend tests
infra/      Bicep templates for independently deployable Azure resources
db/         Forward-only Azure SQL schema migrations and identity bootstrap
ARCHITECTURE.md  End-to-end design, trust boundaries, data flows, and limitations
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for the system design.
Architecture and lifecycle diagrams use Mermaid so they render in GitHub and compatible IDE previews.

Current job sources do not provide applicant-authorized one-click submission: Greenhouse requires a private API key from each hiring company, and Remotive provides discovery/link-back only. The UI therefore must not record a submission until an employer confirms receipt. See the submission integration boundary in the architecture document.

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
| Infrastructure deployment | `applypilot-email-rbac-20260805-094348` |
| Frontend | https://blue-water-0d76ed710.7.azurestaticapps.net |
| Static Web App | `applypilotcentral-web-khaah5ti4wzag` (Standard) |
| Backend route | `https://blue-water-0d76ed710.7.azurestaticapps.net/api` (linked Function backend) |
| Function App | `applypilotcentral-api-khaah5ti4wzag` (Node.js 22, Linux Consumption) |
| SQL logical server | `simplyapply.database.windows.net` |
| SQL database | `applypilot` (Basic) |
| Key Vault | `applypilotcentralvaultkh` |
| Document Intelligence | `applypilotcentral-docs-khaah5ti4wzag` (`FormRecognizer`, F0) |
| Email | `applypilotcentral-comm-khaah5ti4wzag`, sender `donotreply@fc8c25a7-717b-40f1-ae05-abbf0a72def2.azurecomm.net` |

Verified production checks:

- Frontend returns HTTP 200 and includes the Static Web Apps security configuration.
- Frontend CORS and the compiled API URL target the Function App above.
- `/api/health` returns `status: ok` with Azure SQL connected.
- `/api/jobs` returns current Greenhouse and Remotive listings.
- The frontend follows paginated job responses (100 per request) until the complete feed is loaded; API responses include `offset`, `limit`, `total`, and `nextOffset`.
- After combined filtering, the dashboard displays exactly 10 jobs per UI page with Previous/Next navigation and an accurate result count.
- Job search covers title, company, location, description, skills, and source. Status, source, and workplace filters can be combined.
- Upstream HTML and encoded Greenhouse markup are normalized into readable plain-text job summaries before rendering.
- Location text filtering is case-insensitive and combines with every other job filter.
- Signed-out users see Microsoft sign-in actions in both the persistent header and desktop account card.
- The account screen creates an ApplyPilot user automatically on first successful Microsoft sign-in. Google and Facebook are displayed as unavailable until their required external OAuth registrations are configured.
- The screenshot-aligned frontend provides Dashboard, Email Inbox, Job Search, Profile, Applications/usage, and Settings surfaces. Inbox integration is shown as unconfigured until a real mailbox provider is connected; the UI does not generate sample messages or credits.
- Anonymous requests to profile, applications, and resume APIs return HTTP 401.
- Database migrations `001_initial` through `006_resume_extraction` are applied.
- The Function App is linked to Static Web Apps; its direct public endpoint is protected.
- Resumes are held in a private Blob container and accessed by the Function managed identity.
- Resume extraction uses Document Intelligence through managed identity; detected values fill blank profile fields only.
- Queuing an application sends a real confirmation to the authenticated identity email through Azure Communication Services when that identity exposes a valid email address.

### Application lifecycle

1. Sign in with Microsoft through Static Web Apps authentication.
2. Upload a PDF or DOCX resume (maximum 4 MB on the F0 tier). ApplyPilot extracts reusable details into blank profile fields for review.
3. Choose **Simple Apply** on a live job. ApplyPilot saves a `review` queue record with the complete saved profile snapshot and stays inside the portal.
4. The application remains visibly queued until an authorized provider integration returns an employer receipt. A queue record is never represented as a submission.
5. Track employer-confirmed `submitted`, `interview`, `offer`, or `rejected` states in SQL when a supported channel supplies those events.

### Authentication providers

Microsoft and Google delegated sign-in are configured at `/.auth/login/aad` and `/.auth/login/google`. Both use custom provider registrations because Static Web Apps disables every preconfigured provider as soon as one custom registration is configured. The first authenticated profile/API request maps the provider subject to a new SQL user, so sign-up and sign-in use the same secure flow.

Public authentication routes are handled by the React SPA: `/` is the signed-out landing page, `/login` is the provider chooser, `/dashboard` is the post-login target, and `/logged-out` is the post-logout confirmation. Logout links use `/.auth/logout?post_logout_redirect_uri=/logged-out`; authentication callback paths are owned by Azure and must never be used as landing or logout destinations. The custom Entra provider uses the tenant-specific v2 issuer so Static Web Apps can validate the callback token issuer.

Google and Facebook require credentials from their own developer consoles; Azure subscription ownership cannot create those registrations. Do not enable their UI buttons until both providers are configured and tested. Register these callbacks with the providers:

```text
https://blue-water-0d76ed710.7.azurestaticapps.net/.auth/login/google/callback
https://blue-water-0d76ed710.7.azurestaticapps.net/.auth/login/facebook/callback
```

Client IDs and secrets are stored in Static Web Apps application settings—never in this repository or the frontend bundle. Microsoft uses `AZURE_CLIENT_ID` and `AZURE_CLIENT_SECRET`; Google will use `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` after activation. Static Web Apps custom authentication is Standard-tier only. Verify both redirect chains after every authentication change. A Google `redirect_uri_mismatch` means the OAuth Web Application is missing the exact callback URI shown above.

Required external inputs:

- Google OAuth web client ID and client secret, with the Google callback allowlisted.
- Meta/Facebook application ID and secret, with the Facebook callback allowlisted and the app published for non-admin users.
- Microsoft Entra application client ID/secret if switching from the current preconfigured Microsoft provider to a multi-provider custom configuration.

### Email and mailbox behavior

Postmark test mode permits inbound processing from any domain, but limits the account to 100 processed messages. Apply for Postmark approval before production volume requires more than that. ApplyPilot continues using Azure Communication Services rather than Postmark for outbound queue confirmations.

Azure Communication Services Email provides outbound delivery only. The deployed Azure-managed domain sends queue confirmations from its fixed `donotreply@...azurecomm.net` address; Azure-managed sender usernames cannot be personalized. The Function uses managed identity with the Communication and Email Service Owner role, so no email connection string is stored in the app.

Inbound mail uses a Postmark inbound stream. Until the custom MX domain is verified, each user receives a plus-addressed alias under the server address configured by `POSTMARK_INBOUND_ADDRESS`. After Postmark verifies `applypilotmail.accesscam.org`, set `mailboxDomain` in `infra/dev.bicepparam` to expose the shorter `alias@applypilotmail.accesscam.org` form. The webhook is an Azure Function with `function` authorization; never commit or publish its function key.

After deploying the backend, retrieve the webhook key locally and paste the resulting URL into Postmark **Inbound stream → Webhook URL**:

```powershell
$webhookKey = az functionapp function keys list --resource-group apply --name $backendName --function-name postmarkInbound --query default -o tsv
$postmarkWebhook = "$frontendUrl/api/webhooks/postmark/inbound?code=$webhookKey"
$postmarkWebhook | Set-Clipboard
```

Postmark must receive HTTP 200 from its webhook check. Apply migration `007_inbound_mailbox.sql` before sending the check payload. Messages are deduplicated by provider message ID; only bounded plain text and attachment counts are stored, and attachment downloads remain disabled pending malware scanning.

`apply.com` is not owned by this subscription and cannot be used or verified here. Unique receiving aliases such as `username@your-domain.example` require:

1. A domain you own and can verify through DNS.
2. An inbound email provider that supports catch-all or per-alias routing and signed webhooks.
3. MX, SPF, DKIM, and DMARC records for that domain.
4. A webhook endpoint that validates the provider signature, resolves the alias to an internal user ID, stores sanitized message metadata, and forwards according to user consent.

Until those inputs exist, the Inbox page explicitly shows inbound mail as unconfigured and does not issue nonfunctional aliases.

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
$documentIntelligenceName = $deployment.properties.outputs.documentIntelligenceName.value

[PSCustomObject]@{
  FrontendName = $frontendName
  FrontendUrl = $frontendUrl
  BackendName = $backendName
  BackendUrl = $backendUrl
  SqlDatabase = $sqlDatabase
  DocumentIntelligence = $documentIntelligenceName
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
sqlcmd -S $sqlServerFqdn -d $sqlDatabase -G -i db/migrations/004_application_workflow.sql
sqlcmd -S $sqlServerFqdn -d $sqlDatabase -G -i db/migrations/005_resume_documents.sql
sqlcmd -S $sqlServerFqdn -d $sqlDatabase -G -i db/migrations/006_resume_extraction.sql
sqlcmd -S $sqlServerFqdn -d $sqlDatabase -G -i db/migrations/007_inbound_mailbox.sql
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

Always repeat this backend package deployment after any Bicep run that creates or updates the Static Web Apps linked backend. The infrastructure release can recreate the link metadata; publishing and restarting the Function afterward ensures `/api/*` routes are registered at the edge.

If `config-zip` times out and Application Insights reports `0 functions loaded`, compare the local ZIP length with the blob referenced by `WEBSITE_RUN_FROM_PACKAGE`; an interrupted upload can leave a truncated package. Upload the validated ZIP to the private `function-releases` container and use managed-identity package loading instead of a SAS URL:

```powershell
$packageBlob = 'releases/backend.zip'
$storageKey = az storage account keys list --resource-group $resourceGroup --account-name $storageAccountName --query '[0].value' -o tsv
az storage blob upload --account-name $storageAccountName --account-key $storageKey --container-name function-releases --name $packageBlob --file backend.zip --overwrite true
$packageUrl = "https://$storageAccountName.blob.core.windows.net/function-releases/$packageBlob"
az functionapp config appsettings set --resource-group $resourceGroup --name $backendName --settings WEBSITE_RUN_FROM_PACKAGE=$packageUrl WEBSITE_RUN_FROM_PACKAGE_BLOB_MI_RESOURCE_ID=SystemAssigned --output none
az functionapp restart --resource-group $resourceGroup --name $backendName
```

The Function's existing Storage Blob Data Contributor role permits this private read; do not make the package container public.

After the backend is linked to Static Web Apps, verify public endpoints through the frontend hostname:

```powershell
Invoke-RestMethod "$frontendUrl/api/health" | ConvertTo-Json
$jobs = Invoke-RestMethod "$frontendUrl/api/jobs?limit=3"
$jobs.jobs | Select-Object title,company,source,postedAt | Format-Table
```

Do not continue until `/api/health` returns `status: ok` or `status: degraded` and `/api/jobs` returns job records. A degraded health response means the API is running but SQL identity/migrations still need attention.

### 7. Build and deploy the frontend code

The deployed frontend must use the same-origin `/api` route. Static Web Apps forwards it to the linked Function backend and supplies the trusted signed-in identity.

```powershell
$env:VITE_API_BASE_URL = '/api'
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

Run the release gate after every backend or frontend deployment. Do not consider the release successful if it reports a 404:

```powershell
.\scripts\verify-deployment.ps1 -BaseUrl $frontendUrl
```

### 8. Verify Azure state

```powershell
az staticwebapp show --resource-group $resourceGroup --name $frontendName `
  --query '{name:name,hostname:defaultHostname,sku:sku.name,repositoryUrl:repositoryUrl}' --output table

az functionapp show --resource-group $resourceGroup --name $backendName `
  --query '{name:name,state:state,host:defaultHostName,runtime:siteConfig.linuxFxVersion}' --output table

az functionapp config appsettings list --resource-group $resourceGroup --name $backendName `
  --query "[?name=='AZURE_SQL_SERVER' || name=='AZURE_SQL_DATABASE' || name=='GREENHOUSE_BOARDS' || name=='AZURE_STORAGE_ACCOUNT' || name=='RESUME_CONTAINER' || name=='DOCUMENT_INTELLIGENCE_ENDPOINT' || name=='EMAIL_COMMUNICATION_ENDPOINT' || name=='EMAIL_SENDER_ADDRESS'].{name:name,value:value}" `
  --output table

az cognitiveservices account show --resource-group $resourceGroup --name $documentIntelligenceName `
  --query '{name:name,kind:kind,sku:sku.name,endpoint:properties.endpoint,localAuthDisabled:properties.disableLocalAuth}' --output table

Invoke-RestMethod "$frontendUrl/api/health"
Invoke-RestMethod "$frontendUrl/api/jobs?limit=3"

$firstPage = Invoke-RestMethod "$frontendUrl/api/jobs?limit=100&offset=0"
$firstPage | Select-Object total,offset,limit,nextOffset

try { Invoke-WebRequest "$frontendUrl/api/profile" -UseBasicParsing } catch { $_.Exception.Response.StatusCode.value__ }
# Expected while signed out: 401
```

## Deployed application not loading

Provisioning resources in Azure Portal is not enough; you must complete both code-deployment steps above.

- **Static site shows a default/empty page or 404:** redeploy `frontend/dist`. Confirm both `index.html` and `staticwebapp.config.json` exist inside `frontend/dist` before deployment.
- **Frontend loads but reports API unavailable:** open `$frontendUrl/api/health` and `$frontendUrl/api/jobs?limit=3`. Confirm the Standard Static Web App has the Function backend linked, then rebuild with `VITE_API_BASE_URL='/api'`.
- **Function returns 404:** inspect ZIP contents and confirm `host.json`, `package.json`, and `src/functions/jobs.js` are at the ZIP root structure shown above.
- **Static Web Apps `/api/jobs` returns 404 while the linked backend says Succeeded:** redeploy/restart the Function after the final Bicep deployment, then run `scripts/verify-deployment.ps1`. The linked-backend resource can be recreated by infrastructure even though its displayed state remains Succeeded.
- **Function returns 500/503:** stream logs with `az webapp log tail --resource-group $resourceGroup --name $backendName`. Verify SQL migrations and the managed-identity database user.
- **Profile/application API returns 401:** sign in from the app first. This is expected for anonymous requests. Do not add a client-generated identity header.
- **Resume upload fails:** confirm the private `resumes` container exists and the Function identity has Storage Blob Data Contributor; allow several minutes for a new role assignment to propagate.
- **Resume uploads but extraction fails:** confirm `DOCUMENT_INTELLIGENCE_ENDPOINT`, the Cognitive Services User role assignment, and service quota. The Blob upload is retained.
- **Queue email is not delivered:** confirm the authenticated identity exposes a valid email, inspect `EMAIL_COMMUNICATION_ENDPOINT` and `EMAIL_SENDER_ADDRESS`, and verify the Function identity has Communication and Email Service Owner. Email failure does not roll back the application queue record.
- **Portal resource blade itself fails:** confirm the selected subscription with `az account show`, then inspect resources through CLI using `az resource list --resource-group apply --output table`. Portal UI failure does not necessarily mean the deployed endpoints are down.
- **Deployment status:** inspect it with `az deployment group show --resource-group $resourceGroup --name $deploymentName --output table` and `az deployment operation group list --resource-group $resourceGroup --name $deploymentName --output table`.

The frontend and backend can be redeployed independently. See [docs/JOB_SOURCES.md](docs/JOB_SOURCES.md) for job-provider rules.

## Privacy and security

Profile and application data are scoped to the Microsoft-authenticated user and stored in Azure SQL. Resume files are stored in a private Blob container; extracted fields and status are stored in SQL. Existing profile fields are never overwritten by extraction. The browser keeps only non-sensitive display preferences as a fallback. Never enter passwords, Social Security numbers, government IDs, or payment information, and never upload those values as screening answers.
