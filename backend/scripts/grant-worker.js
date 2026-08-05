import sql from "mssql";
const name = process.env.WORKER_IDENTITY_NAME;
if (!name || !/^[a-zA-Z0-9-]{3,128}$/.test(name)) throw new Error("Valid WORKER_IDENTITY_NAME is required.");
const db = await sql.connect({ server: process.env.AZURE_SQL_SERVER, database: process.env.AZURE_SQL_DATABASE, authentication: { type: "azure-active-directory-default" }, options: { encrypt: true, trustServerCertificate: false } });
try {
  const escaped = name.replace(/]/g, "]]" );
  const query = `IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name=N'${name}') EXEC(N'CREATE USER [${escaped}] FROM EXTERNAL PROVIDER'); IF NOT EXISTS (SELECT 1 FROM sys.database_role_members rm JOIN sys.database_principals r ON r.principal_id=rm.role_principal_id JOIN sys.database_principals m ON m.principal_id=rm.member_principal_id WHERE r.name='db_datareader' AND m.name=N'${name}') ALTER ROLE db_datareader ADD MEMBER [${escaped}]; IF NOT EXISTS (SELECT 1 FROM sys.database_role_members rm JOIN sys.database_principals r ON r.principal_id=rm.role_principal_id JOIN sys.database_principals m ON m.principal_id=rm.member_principal_id WHERE r.name='db_datawriter' AND m.name=N'${name}') ALTER ROLE db_datawriter ADD MEMBER [${escaped}];`;
  for (let attempt = 1; ; attempt += 1) {
    try { await db.request().query(query); break; }
    catch (error) { if (attempt >= 6) throw error; await new Promise((resolve) => setTimeout(resolve, 10000)); }
  }
} finally { await db.close(); }
