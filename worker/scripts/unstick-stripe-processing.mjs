/**
 * One-shot: mark stuck Stripe Forward Deployed Engineer apps as submitted.
 * Uses the same Azure AD SQL path as the browser worker.
 */
import sql from "mssql";

const server = process.env.AZURE_SQL_SERVER || "simplyapply.database.windows.net";
const database = process.env.AZURE_SQL_DATABASE || "applypilot_nonprod";

const pool = await sql.connect({
  server,
  database,
  authentication: { type: "azure-active-directory-default" },
  options: { encrypt: true, trustServerCertificate: false },
});

const note = "Confirmed submitted via live Greenhouse confirmation (token 8075570). Status repaired after worker hung in processing.";

const listed = await pool.request().query(`
  SELECT Id, Title, Company, Status, UpdatedAt
  FROM dbo.Applications
  WHERE Company LIKE '%Stripe%'
    AND Title LIKE '%Forward Deployed%'
  ORDER BY UpdatedAt DESC;
`);
console.log("Matching apps:", listed.recordset);

const result = await pool.request()
  .input("notes", sql.NVarChar(2000), note)
  .query(`
    UPDATE dbo.Applications
    SET Status = 'submitted',
        LastSubmissionError = NULL,
        Notes = COALESCE(Notes + CHAR(10), '') + @notes,
        AppliedAt = COALESCE(AppliedAt, SYSUTCDATETIME()),
        SubmittedConfirmedAt = SYSUTCDATETIME(),
        SubmissionProvider = COALESCE(SubmissionProvider, 'ApplyPilot Playwright'),
        UpdatedAt = SYSUTCDATETIME()
    OUTPUT inserted.Id, inserted.Title, inserted.Company, inserted.Status, inserted.SubmittedConfirmedAt
    WHERE Status = 'processing'
      AND Company LIKE '%Stripe%'
      AND Title LIKE '%Forward Deployed%';
  `);

console.log("Updated:", result.recordset);
await pool.close();
process.exit(result.recordset.length ? 0 : 2);
