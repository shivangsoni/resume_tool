# ApplyPilot database

Versioned, forward-only Azure SQL migrations live in `migrations/`. Run them in filename order with `sqlcmd` after the Bicep deployment creates the database.

The Function App uses Microsoft Entra managed identity. A SQL administrator must run `bootstrap/001_function_identity.sql` after replacing the Function App name. No SQL password is stored in application settings.

```powershell
sqlcmd -S <server>.database.windows.net -d applypilot -G -i db/migrations/001_initial.sql
sqlcmd -S <server>.database.windows.net -d applypilot -G -i db/migrations/002_job_search.sql
sqlcmd -S <server>.database.windows.net -d applypilot -G -i db/migrations/003_job_sync_procedure.sql
```
