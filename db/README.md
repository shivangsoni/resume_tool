# ApplyPilot database

Versioned, forward-only Azure SQL migrations live in `migrations/`. Run them in filename order with `sqlcmd` after the Bicep deployment creates the database.

The Function App uses Microsoft Entra managed identity. A SQL administrator must run `bootstrap/001_function_identity.sql` after replacing the Function App name. GitHub Actions uses the separately scoped principal in the idempotent `bootstrap/002_github_identity.sql`; run that bootstrap once before enabling automated migrations. No SQL password is stored in application settings.

The deployment workflow runs all pending migrations with:

```powershell
$env:AZURE_SQL_SERVER='<server>.database.windows.net'
$env:AZURE_SQL_DATABASE='applypilot'
npm run migrate --prefix backend
```

```powershell
sqlcmd -S <server>.database.windows.net -d applypilot -G -i db/migrations/001_initial.sql
sqlcmd -S <server>.database.windows.net -d applypilot -G -i db/migrations/002_job_search.sql
sqlcmd -S <server>.database.windows.net -d applypilot -G -i db/migrations/003_job_sync_procedure.sql
sqlcmd -S <server>.database.windows.net -d applypilot -G -i db/migrations/004_application_workflow.sql
sqlcmd -S <server>.database.windows.net -d applypilot -G -i db/migrations/005_resume_documents.sql
sqlcmd -S <server>.database.windows.net -d applypilot -G -i db/migrations/006_resume_extraction.sql
sqlcmd -S <server>.database.windows.net -d applypilot -G -i db/migrations/007_inbound_mailbox.sql
sqlcmd -S <server>.database.windows.net -d applypilot -G -i db/migrations/008_submission_queue.sql
```

Migration 004 persists each job snapshot and its review/submission state. Migration 005 records metadata for resumes stored in the private Azure Blob container; resume file contents are not stored in SQL.
Migration 006 records Document Intelligence extraction status and structured output. Profile suggestions fill blank fields only.
Migration 007 creates one deterministic alias per authenticated user and stores deduplicated, text-only Postmark inbound messages.
Migration 008 adds queued/needs-action states, provider receipt metadata, and an immutable submission-attempt audit table.
