import sql from "mssql";

const id = "DA2D7333-B292-F111-9B33-6045BD323A43";
const pool = await sql.connect({
  server: "simplyapply.database.windows.net",
  database: process.env.AZURE_SQL_DATABASE || "applypilot_nonprod",
  authentication: { type: "azure-active-directory-default" },
  options: { encrypt: true, trustServerCertificate: false },
});

const row = await pool.request().input("id", sql.UniqueIdentifier, id).query(`
  SELECT Status, LastSubmissionError, UpdatedAt, DATEDIFF(minute, UpdatedAt, SYSUTCDATETIME()) AS AgeMin
  FROM dbo.Applications WHERE Id=@id;
`);
console.log(JSON.stringify(row.recordset[0], null, 2));

const age = row.recordset[0]?.AgeMin ?? 0;
const status = row.recordset[0]?.Status;
if (status === "processing" && age >= 8) {
  const upd = await pool.request()
    .input("id", sql.UniqueIdentifier, id)
    .input("detail", sql.NVarChar(2000), "Browser submission timed out / worker stalled. Retry when the new worker revision is healthy.")
    .query(`
      UPDATE dbo.Applications
      SET Status='needs_action', LastSubmissionError=@detail, UpdatedAt=SYSUTCDATETIME()
      OUTPUT inserted.Status, inserted.LastSubmissionError, inserted.UpdatedAt
      WHERE Id=@id AND Status='processing';
    `);
  console.log("force_unstuck:", JSON.stringify(upd.recordset, null, 2));
}
await pool.close();
