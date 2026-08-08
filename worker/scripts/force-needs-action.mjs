import sql from "mssql";

const id = "DA2D7333-B292-F111-9B33-6045BD323A43";
const pool = await sql.connect({
  server: "simplyapply.database.windows.net",
  database: process.env.AZURE_SQL_DATABASE || "applypilot_nonprod",
  authentication: { type: "azure-active-directory-default" },
  options: { encrypt: true, trustServerCertificate: false },
});

const r = await pool.request()
  .input("id", sql.UniqueIdentifier, id)
  .input("detail", sql.NVarChar(2000), "Worker deploy had a bad container command and stalled. Retry after the worker is healthy.")
  .query(`
    UPDATE dbo.Applications
    SET Status='needs_action', LastSubmissionError=@detail, UpdatedAt=SYSUTCDATETIME()
    OUTPUT inserted.Status, inserted.LastSubmissionError, inserted.UpdatedAt
    WHERE Id=@id AND Status IN ('processing','queued');
  `);
console.log("unstuck:", JSON.stringify(r.recordset, null, 2));
await pool.close();
