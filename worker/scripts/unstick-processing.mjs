import sql from "mssql";

const pool = await sql.connect({
  server: process.env.AZURE_SQL_SERVER || "simplyapply.database.windows.net",
  database: process.env.AZURE_SQL_DATABASE || "applypilot_nonprod",
  authentication: { type: "azure-active-directory-default" },
  options: { encrypt: true, trustServerCertificate: false },
});

const note =
  "Worker left this application in processing without write-back. Marked needs_action so Retry is available. (If Greenhouse already confirmed, change status to submitted.)";

// Unstick every processing row — worker hung under lock.
const result = await pool.request()
  .input("notes", sql.NVarChar(2000), note)
  .input("detail", sql.NVarChar(2000), "Browser worker stalled while submitting. Retry queue or open the employer page.")
  .query(`
    UPDATE dbo.Applications
    SET Status = 'needs_action',
        LastSubmissionError = @detail,
        Notes = CASE
          WHEN Notes IS NULL OR Notes = '' THEN @notes
          ELSE Notes + CHAR(10) + @notes
        END,
        UpdatedAt = SYSUTCDATETIME()
    OUTPUT inserted.Id, inserted.Title, inserted.Company, inserted.Status, inserted.LastSubmissionError
    WHERE Status = 'processing';
  `);

console.log("Unstuck:", JSON.stringify(result.recordset, null, 2));
await pool.close();
process.exit(result.recordset.length ? 0 : 2);
