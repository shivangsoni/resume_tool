/**
 * SQL-backed shared option catalogs (school lists, etc.).
 */
import sql from "mssql";

let poolPromise;

async function pool() {
  if (!poolPromise) {
    const server = process.env.AZURE_SQL_SERVER;
    const database = process.env.AZURE_SQL_DATABASE;
    if (!server || !database) return null;
    poolPromise = sql.connect({
      server,
      database,
      authentication: { type: "azure-active-directory-default" },
      options: { encrypt: true, trustServerCertificate: false },
    }).catch((error) => {
      poolPromise = null;
      throw error;
    });
  }
  return poolPromise;
}

export async function loadOptionCatalog(board, fieldKind) {
  try {
    const db = await pool();
    if (!db) return [];
    const result = await db.request()
      .input("board", sql.NVarChar(100), String(board || "").slice(0, 100))
      .input("kind", sql.NVarChar(100), String(fieldKind || "").slice(0, 100))
      .query(`
        SELECT OptionsJson FROM dbo.EmployerOptionCatalogs
        WHERE Board=@board AND FieldKind=@kind;
      `);
    const raw = result.recordset[0]?.OptionsJson;
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((item) => String(item || "").trim()).filter(Boolean) : [];
  } catch (error) {
    console.warn("loadOptionCatalog failed", error?.message || error);
    return [];
  }
}

export async function saveOptionCatalog(board, fieldKind, options) {
  const list = [...new Set((options || []).map((item) => String(item || "").trim()).filter(Boolean))];
  if (!list.length) return false;
  try {
    const db = await pool();
    if (!db) return false;
    await db.request()
      .input("board", sql.NVarChar(100), String(board || "").slice(0, 100))
      .input("kind", sql.NVarChar(100), String(fieldKind || "").slice(0, 100))
      .input("json", sql.NVarChar(sql.MAX), JSON.stringify(list))
      .query(`
        MERGE dbo.EmployerOptionCatalogs AS target
        USING (SELECT @board AS Board, @kind AS FieldKind) AS src
        ON target.Board = src.Board AND target.FieldKind = src.FieldKind
        WHEN MATCHED THEN UPDATE SET OptionsJson=@json, UpdatedAt=SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (Board, FieldKind, OptionsJson) VALUES (@board, @kind, @json);
      `);
    return true;
  } catch (error) {
    console.warn("saveOptionCatalog failed", error?.message || error);
    return false;
  }
}
