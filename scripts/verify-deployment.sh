#!/usr/bin/env bash
set -euo pipefail

base_url="${1:-https://blue-water-0d76ed710.7.azurestaticapps.net}"
base_url="${base_url%/}"

for attempt in {1..12}; do
  health="$(curl --fail --silent --show-error "$base_url/api/health" || true)"
  if jq -e '.status == "ok" or .status == "degraded"' <<<"$health" >/dev/null 2>&1; then
    break
  fi
  sleep 10
done

jq -e '.status == "ok" and .database.connected == true' <<<"$health" >/dev/null
jobs="$(curl --fail --silent --show-error "$base_url/api/jobs?limit=10&offset=0")"
jq -e '.jobs | length == 10' <<<"$jobs" >/dev/null
curl --fail --silent --show-error "$base_url/" >/dev/null
curl --fail --silent --show-error "$base_url/login" >/dev/null
curl --fail --silent --show-error "$base_url/logged-out" >/dev/null
aad_status="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' "$base_url/.auth/login/aad?post_login_redirect_uri=/dashboard")"
case "$aad_status" in
  301|302|303|307|308) ;;
  *) echo "Microsoft login route returned HTTP $aad_status" >&2; exit 1 ;;
esac
echo "Production verification passed."
