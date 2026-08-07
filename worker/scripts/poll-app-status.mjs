import sql from "mssql";

const id = "DA2D7333-B292-F111-9B33-6045BD323A43";
const pool = await sql.connect({
  server: "simplyapply.database.windows.net",
  database: "applypilot_nonprod",
  authentication: { type: "azure-active-directory-default" },
  options: { encrypt: true, trustServerCertificate: false },
});

const deadline = Date.now() + 10 * 60 * 1000;
while (Date.now() < deadline) {
  const r = await pool.request().input("id", sql.UniqueIdentifier, id).query(`
    SELECT Status, LastSubmissionError, UpdatedAt FROM dbo.Applications WHERE Id=@id;
  `);
  const row = r.recordset[0];
  console.log(new Date().toISOString(), JSON.stringify(row));
  if (row && row.Status !== "processing" && row.Status !== "queued") {
    await pool.close();
    process.exit(row.Status === "submitted" ? 0 : 1);
  }
  await new Promise((resolve) => setTimeout(resolve, 20000));
}
await pool.close();
process.exit(2);
