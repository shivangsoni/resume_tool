# ApplyPilot

ApplyPilot is a React job-matching dashboard backed by an Azure Functions service that retrieves current remote job listings.

## Repository structure

```text
frontend/   React, TypeScript, Vite, frontend tests and Static Web Apps config
backend/    Azure Functions Node.js API, normalization logic and backend tests
infra/      Bicep templates for independently deployable Azure resources
```

## Local development

```powershell
npm run install:all
npm run dev:backend
npm run dev:frontend
```

Copy `backend/local.settings.example.json` to `backend/local.settings.json` for local Functions development. Point `frontend/.env` at `http://localhost:7071/api`.

## Validation

```powershell
npm run lint
npm test
npm run build
```

## Deployment

Provision Azure resources with [infra/README.md](infra/README.md). The frontend and backend have separate build and deployment commands, allowing either service to be released without redeploying the other.

The backend uses Remotive's public job feed, caches results for six hours, and links every listing back to its original source. Do not remove the source attribution.

## Privacy

The current profile feature uses browser local storage. Never enter passwords, Social Security numbers, government IDs, or payment information.
