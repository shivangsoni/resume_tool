# Applymate delivery plan

## Product boundary

Applymate keeps a reusable candidate profile, tracks applications, and helps users review and copy mapped answers into job forms. It does not store job-site passwords or automatically submit applications. Each outbound answer remains user-reviewed.

## Architecture

- **Web client:** React, TypeScript, and Vite, hosted on Azure Static Web Apps.
- **Local MVP storage:** browser local storage for profile and application metadata. Before real personal data is used across devices, replace this with authenticated, encrypted server storage.
- **API:** Azure Functions (Node/TypeScript), exposed only through the Static Web Apps `/api` route.
- **Identity:** Static Web Apps authentication initially; Microsoft Entra External ID if multiple users or richer policies are needed.
- **Secrets:** Azure Key Vault with managed identity. Provider tokens must never use `VITE_` environment variables.
- **Email aliases:** a reputable alias provider API should create one alias per application and forward to a verified destination. Do not use an anonymous disposable-mail service for important recruiting communication.
- **Observability:** Application Insights with PII redaction and no résumé contents in logs.

## Phases

### 1. Local-first MVP (implemented in this repository)

1. Responsive application shell and dashboard.
2. Reusable candidate profile with explicit save.
3. Application pipeline and draft creation.
4. Email forwarding setup screen with safe, disabled external actions.
5. Review-before-copy and automatic-submission-off defaults.

### 2. Résumé import and browser assistance

1. Parse PDF/DOCX in an Azure Function; validate file type and size and delete uploads after extraction.
2. Normalize contact, experience, education, skills, and common screening answers.
3. Build a Manifest V3 browser extension that maps common form labels to profile fields.
4. Show a confirmation panel before filling; never fill passwords, demographic answers, signatures, or voluntary self-identification fields.
5. Add mapping tests against fixtures for common ATS platforms, respecting their terms and rate limits.

### 3. Secure cloud and email aliases

1. Create a dedicated Azure resource group with a monthly budget alert at $100 and $140.
2. Deploy Static Web Apps Free/Standard and Consumption/Flex Functions; verify current regional pricing before provisioning.
3. Add authentication and per-user authorization.
4. Encrypt profile records with customer-managed secrets in Key Vault and minimize retained data.
5. Integrate an alias provider, verify the forwarding destination, and keep provider credentials only in Key Vault.
6. Add alias disable/delete controls and a recovery mailbox workflow.

### 4. Quality and rollout

1. Unit tests for profile normalization, mappings, storage migrations, and API validation.
2. End-to-end tests for profile → mapping → user confirmation.
3. Accessibility checks, responsive verification, and threat modeling.
4. Staging deployment, synthetic tests, cost alerts, and production release.

## Acceptance criteria

- A user can save and edit common application data and track roles.
- No secrets or passwords are persisted by the client.
- No application is submitted without an explicit user action on the target site.
- Email forwarding activates only after destination verification.
- Logs exclude résumé contents and other personal fields.
- Azure spend has alerts and stays within the user-approved budget.
