param(
  [string]$BaseUrl = 'https://blue-water-0d76ed710.7.azurestaticapps.net'
)

$ErrorActionPreference = 'Stop'
$base = $BaseUrl.TrimEnd('/')

$frontend = Invoke-WebRequest $base -UseBasicParsing
if ($frontend.StatusCode -ne 200) { throw "Frontend returned HTTP $($frontend.StatusCode)." }

$health = Invoke-RestMethod "$base/api/health"
if ($health.status -ne 'ok') { throw "API health is '$($health.status)'." }

$jobsResponse = Invoke-WebRequest "$base/api/jobs?limit=10&offset=0" -UseBasicParsing
if ($jobsResponse.StatusCode -ne 200) { throw "Jobs API returned HTTP $($jobsResponse.StatusCode)." }
$jobs = $jobsResponse.Content | ConvertFrom-Json
if (@($jobs.jobs).Count -lt 1) { throw 'Jobs API returned no records.' }

$me = Invoke-RestMethod "$base/.auth/me"

[PSCustomObject]@{
  Frontend = $frontend.StatusCode
  Health = $health.status
  Jobs = @($jobs.jobs).Count
  TotalJobs = $jobs.total
  SignedIn = [bool]$me.clientPrincipal
}
