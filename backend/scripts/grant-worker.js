import sql from "mssql";
const name = process.env.WORKER_IDENTITY_NAME;
if (!name || !/^[a-zA-Z0-9-]{3,128}$/.test(name)) throw new Error("Valid WORKER_IDENTITY_NAME is required.");
const clientId = process.env.WORKER_CLIENT_ID;
if (!clientId || !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(clientId)) {
  throw new Error("Valid WORKER_CLIENT_ID is required.");
}
const db = await sql.connect({ server: process.env.AZURE_SQL_SERVER, database: process.env.AZURE_SQL_DATABASE, authentication: { type: "azure-active-directory-default" }, options: { encrypt: true, trustServerCertificate: false } });
try {
  const escaped = name.replace(/]/g, "]]" );
  const query = `DECLARE @expectedSid varbinary(16)=CONVERT(varbinary(16), CONVERT(uniqueidentifier, N'${clientId}')); DECLARE @sidHex varchar(34)=sys.fn_varbintohexstr(@expectedSid); IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name=N'${name}' AND sid<>@expectedSid) DROP USER [${escaped}]; IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name=N'${name}') EXEC(N'CREATE USER [${escaped}] WITH SID='+@sidHex+', TYPE=E'); GRANT SELECT, INSERT, UPDATE, DELETE TO [${escaped}];`;
  for (let attempt = 1; ; attempt += 1) {
    try { await db.request().query(query); break; }
    catch (error) { if (attempt >= 6) throw error; await new Promise((resolve) => setTimeout(resolve, 10000)); }
  }
} finally { await db.close(); }
