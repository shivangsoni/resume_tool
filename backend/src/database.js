import sql from "mssql";

let poolPromise;

function pool() {
  const connectionString = process.env.SQL_CONNECTION_STRING;
  const server = process.env.AZURE_SQL_SERVER;
  const database = process.env.AZURE_SQL_DATABASE;
  if (!connectionString && (!server || !database)) return null;
  const config = connectionString || {
    server,
    database,
    port: 1433,
    authentication: { type: "azure-active-directory-default" },
    options: { encrypt: true, trustServerCertificate: false },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  };
  poolPromise ||= sql.connect(config);
  return poolPromise;
}

export async function persistJobs(jobs) {
  const connection = pool();
  if (!connection || !jobs.length) return false;
  const payload = jobs.map((job) => ({ source: job.source, externalId: job.externalId || String(job.id), company: job.company, title: job.title, location: job.location, description: job.summary, salary: job.salary, sourceUrl: job.sourceUrl, postedAt: job.postedAt }));
  const db = await connection;
  await db.request().input("JobsJson", sql.NVarChar(sql.MAX), JSON.stringify(payload)).execute("dbo.SyncJobs");
  return true;
}

export async function checkDatabase() {
  const connection = pool();
  if (!connection) return { configured: false, connected: false };
  try {
    const db = await connection;
    await db.request().query("SELECT 1 AS healthy");
    return { configured: true, connected: true };
  } catch {
    poolPromise = undefined;
    return { configured: true, connected: false };
  }
}
