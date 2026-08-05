import sql from "mssql";

const mode = process.env.DATABASE_IDENTITY_MODE;
const name = process.env.DATABASE_IDENTITY_NAME;
const clientId = process.env.DATABASE_IDENTITY_CLIENT_ID;
if (!['backend', 'worker', 'deployer'].includes(mode)) throw new Error('DATABASE_IDENTITY_MODE must be backend, worker, or deployer.');
if (!name || !/^[a-zA-Z0-9-]{3,128}$/.test(name)) throw new Error('Valid DATABASE_IDENTITY_NAME is required.');
if (!clientId || !/^[0-9a-fA-F-]{36}$/.test(clientId)) throw new Error('Valid DATABASE_IDENTITY_CLIENT_ID is required.');

const roles = mode === 'deployer' ? ['db_ddladmin', 'db_datareader', 'db_datawriter'] : ['db_datareader', 'db_datawriter'];
const escaped = name.replace(/]/g, ']]');
const membership = roles.map((role) => `IF NOT EXISTS (SELECT 1 FROM sys.database_role_members rm JOIN sys.database_principals r ON r.principal_id=rm.role_principal_id JOIN sys.database_principals m ON m.principal_id=rm.member_principal_id WHERE r.name=N'${role}' AND m.name=N'${name}') ALTER ROLE [${role}] ADD MEMBER [${escaped}];`).join('\n');
const grants = mode === 'backend' ? `GRANT EXECUTE TO [${escaped}];` : mode === 'deployer' ? `GRANT ALTER ANY USER TO [${escaped}]; GRANT ALTER ANY ROLE TO [${escaped}];` : '';
const query = `
DECLARE @expectedSid varbinary(16)=CONVERT(varbinary(16), CONVERT(uniqueidentifier, N'${clientId}'));
DECLARE @sidHex varchar(34)=sys.fn_varbintohexstr(@expectedSid);
IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name=N'${name}' AND sid<>@expectedSid) DROP USER [${escaped}];
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name=N'${name}') EXEC(N'CREATE USER [${escaped}] WITH SID='+@sidHex+', TYPE=E');
${membership}
${grants}`;

const db = await sql.connect({ server: process.env.AZURE_SQL_SERVER, database: process.env.AZURE_SQL_DATABASE, authentication: { type: 'azure-active-directory-default' }, options: { encrypt: true, trustServerCertificate: false } });
try { await db.request().query(query); } finally { await db.close(); }
