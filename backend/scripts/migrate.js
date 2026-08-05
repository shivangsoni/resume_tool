import fs from "node:fs/promises";
import path from "node:path";
import sql from "mssql";

const directory = path.resolve(process.cwd(), "../db/migrations");
const server = process.env.AZURE_SQL_SERVER;
const database = process.env.AZURE_SQL_DATABASE;
if (!server || !database) throw new Error("AZURE_SQL_SERVER and AZURE_SQL_DATABASE are required.");

const connection = await sql.connect({
  server,
  database,
  port: 1433,
  authentication: { type: "azure-active-directory-default" },
  options: { encrypt: true, trustServerCertificate: false },
});

try {
  const files = (await fs.readdir(directory)).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
  const tableResult = await connection.request().query("SELECT OBJECT_ID('dbo.SchemaMigrations','U') AS Id");
  const tableExists = Boolean(tableResult.recordset[0].Id);
  const applied = new Set();
  if (tableExists) {
    const result = await connection.request().query("SELECT Version FROM dbo.SchemaMigrations");
    result.recordset.forEach((row) => applied.add(row.Version));
  }

  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    if (applied.has(version)) {
      console.log(`Skipping ${version}`);
      continue;
    }
    const script = await fs.readFile(path.join(directory, file), "utf8");
    const batches = script.split(/^\s*GO\s*$/gim).map((batch) => batch.trim()).filter(Boolean);
    console.log(`Applying ${version}`);
    for (const batch of batches) await connection.request().batch(batch);
  }
} finally {
  await connection.close();
}
