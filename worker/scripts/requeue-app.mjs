import sql from "mssql";

const id = process.env.APP_ID || "DA2D7333-B292-F111-9B33-6045BD323A43";
const pool = await sql.connect({
  server: process.env.AZURE_SQL_SERVER || "simplyapply.database.windows.net",
  database: process.env.AZURE_SQL_DATABASE || "applypilot_nonprod",
  authentication: { type: "azure-active-directory-default" },
  options: { encrypt: true, trustServerCertificate: false },
});

const before = await pool.request().input("id", sql.UniqueIdentifier, id).query(`
  SELECT Id, Title, Company, Status, LastSubmissionError, UpdatedAt, SubmissionQueuedAt, SourceUrl
  FROM dbo.Applications WHERE Id=@id;
`);
console.log("before:", JSON.stringify(before.recordset[0], null, 2));

const upd = await pool.request().input("id", sql.UniqueIdentifier, id).query(`
  UPDATE dbo.Applications
  SET Status='queued',
      SubmissionQueuedAt=SYSUTCDATETIME(),
      LastSubmissionError=NULL,
      UpdatedAt=SYSUTCDATETIME()
  OUTPUT inserted.Id, inserted.Title, inserted.Status, inserted.SubmissionQueuedAt
  WHERE Id=@id AND Status IN ('needs_action','failed','review','queued','processing');
`);
console.log("requeued:", JSON.stringify(upd.recordset, null, 2));

const stuck = await pool.request().query(`
  SELECT Id, Title, Status, UpdatedAt FROM dbo.Applications
  WHERE Status IN ('queued','processing') ORDER BY UpdatedAt DESC;
`);
console.log("queue:", JSON.stringify(stuck.recordset, null, 2));
await pool.close();
