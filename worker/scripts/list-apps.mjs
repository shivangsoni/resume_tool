import sql from "mssql";

const pool = await sql.connect({
  server: process.env.AZURE_SQL_SERVER || "simplyapply.database.windows.net",
  database: process.env.AZURE_SQL_DATABASE || "applypilot_nonprod",
  authentication: { type: "azure-active-directory-default" },
  options: { encrypt: true, trustServerCertificate: false },
});

const recent = await pool.request().query(`
  SELECT TOP 40 Id, Title, Company, Status, UpdatedAt, SourceUrl
  FROM dbo.Applications
  ORDER BY UpdatedAt DESC;
`);
console.log("Recent:", JSON.stringify(recent.recordset, null, 2));

const stuck = await pool.request().query(`
  SELECT Id, Title, Company, Status, UpdatedAt
  FROM dbo.Applications
  WHERE Status IN ('processing', 'queued');
`);
console.log("Stuck:", JSON.stringify(stuck.recordset, null, 2));

const stripe = await pool.request().query(`
  SELECT Id, Title, Company, Status, UpdatedAt
  FROM dbo.Applications
  WHERE Company LIKE '%Stripe%' OR Title LIKE '%Stripe%' OR SourceUrl LIKE '%stripe%';
`);
console.log("Stripe:", JSON.stringify(stripe.recordset, null, 2));

await pool.close();
