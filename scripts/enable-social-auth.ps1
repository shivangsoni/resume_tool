# Enables Google / GitHub on Static Web Apps after you create those OAuth apps.
# Usage:
#   pwsh scripts/enable-social-auth.ps1 -ResourceGroup apply -StaticWebApp applypilotcentral-web-khaah5ti4wzag `
#     -GoogleClientId '...' -GoogleClientSecret '...' `
#     -GitHubClientId '...' -GitHubClientSecret '...'
#
# Callbacks to register with each provider:
#   https://<host>/.auth/login/google/callback
#   https://<host>/.auth/login/github/callback

param(
  [Parameter(Mandatory = $true)][string]$ResourceGroup,
  [Parameter(Mandatory = $true)][string]$StaticWebApp,
  [Parameter(Mandatory = $true)][string]$FunctionApp,
  [string]$GoogleClientId = "",
  [string]$GoogleClientSecret = "",
  [string]$GitHubClientId = "",
  [string]$GitHubClientSecret = "",
  [string]$ConfigPath = "frontend/public/staticwebapp.config.json"
)

$ErrorActionPreference = "Stop"
$config = Get-Content $ConfigPath -Raw | ConvertFrom-Json
$providers = $config.auth.identityProviders
if ($providers.PSObject.Properties.Name -contains "facebook") {
  $providers.PSObject.Properties.Remove("facebook")
}
$settings = @{}
$enabled = @("aad")

if ($GoogleClientId -and $GoogleClientSecret) {
  $providers | Add-Member -NotePropertyName google -NotePropertyValue (@{
      registration = @{
        clientIdSettingName     = "GOOGLE_CLIENT_ID"
        clientSecretSettingName = "GOOGLE_CLIENT_SECRET"
      }
    }) -Force
  $settings["GOOGLE_CLIENT_ID"] = $GoogleClientId
  $settings["GOOGLE_CLIENT_SECRET"] = $GoogleClientSecret
  $enabled += "google"
}

if ($GitHubClientId -and $GitHubClientSecret) {
  $providers | Add-Member -NotePropertyName github -NotePropertyValue (@{
      registration = @{
        clientIdSettingName     = "GITHUB_CLIENT_ID"
        clientSecretSettingName = "GITHUB_CLIENT_SECRET"
      }
    }) -Force
  $settings["GITHUB_CLIENT_ID"] = $GitHubClientId
  $settings["GITHUB_CLIENT_SECRET"] = $GitHubClientSecret
  $enabled += "github"
}

if ($settings.Count -eq 0) {
  throw "Provide at least one complete provider credential pair."
}

$config.auth.identityProviders = $providers
$utf8 = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText((Resolve-Path $ConfigPath), ($config | ConvertTo-Json -Depth 20), $utf8)
az staticwebapp appsettings set --name $StaticWebApp --resource-group $ResourceGroup --setting-names ($settings.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" })
az functionapp config appsettings set --name $FunctionApp --resource-group $ResourceGroup --settings "AUTH_PROVIDERS=$($enabled -join ',')"
Write-Host "Social auth settings applied. Redeploy the frontend so staticwebapp.config.json is published, then verify each /.auth/login/<provider> redirect."
