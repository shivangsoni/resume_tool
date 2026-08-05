# Applymate

A local-first React workspace for maintaining reusable job-application data and tracking roles.

## Run locally

```powershell
npm install
npm run dev
```

Use `npm run build`, `npm run lint`, and `npm test` before deployment.

## Privacy and security

The current MVP stores profile data in this browser's local storage. Do not enter passwords, Social Security numbers, government IDs, or payment details. The email connection is intentionally disabled until a server-side provider integration and destination verification are configured.

## Azure deployment

Create an Azure Static Web App connected to the repository with app location `/`, output location `dist`, and build command `npm run build`. Set `VITE_API_BASE_URL=/api`. Follow [PLAN.md](./PLAN.md) before adding cloud storage or forwarding: use managed identity, Key Vault, authentication, PII-safe logs, and budget alerts.
