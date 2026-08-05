import sql from "mssql";

let poolPromise;

export function pool() {
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

export async function ensureUser(principal) {
  const connection = pool();
  if (!connection) throw new Error("Database is not configured.");
  const db = await connection;
  const result = await db.request()
    .input("subject", sql.NVarChar(200), principal.subject)
    .input("email", sql.NVarChar(320), principal.email)
    .query(`
      MERGE dbo.Users WITH (HOLDLOCK) AS target
      USING (SELECT @subject AS ExternalSubject, @email AS Email) AS incoming
      ON target.ExternalSubject = incoming.ExternalSubject
      WHEN MATCHED THEN UPDATE SET Email = COALESCE(incoming.Email, target.Email), UpdatedAt = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT (ExternalSubject, Email) VALUES (incoming.ExternalSubject, incoming.Email)
      OUTPUT inserted.Id;
    `);
  return result.recordset[0].Id;
}

export async function getProfile(principal) {
  const userId = await ensureUser(principal);
  const db = await pool();
  const result = await db.request().input("userId", sql.UniqueIdentifier, userId)
    .query("SELECT ProfileJson, UpdatedAt FROM dbo.CandidateProfiles WHERE UserId=@userId");
  if (!result.recordset.length) return { profile: null, updatedAt: null };
  return { profile: JSON.parse(result.recordset[0].ProfileJson), updatedAt: result.recordset[0].UpdatedAt };
}

export async function saveProfile(principal, profile) {
  const userId = await ensureUser(principal);
  const db = await pool();
  await db.request().input("userId", sql.UniqueIdentifier, userId).input("json", sql.NVarChar(sql.MAX), JSON.stringify(profile)).query(`
    MERGE dbo.CandidateProfiles WITH (HOLDLOCK) AS target
    USING (SELECT @userId AS UserId, @json AS ProfileJson) incoming ON target.UserId=incoming.UserId
    WHEN MATCHED THEN UPDATE SET ProfileJson=incoming.ProfileJson, UpdatedAt=SYSUTCDATETIME()
    WHEN NOT MATCHED THEN INSERT (UserId, ProfileJson) VALUES (incoming.UserId, incoming.ProfileJson);
  `);
  return getProfile(principal);
}

export async function mergeProfileSuggestions(principal, suggestions) {
  const current = await getProfile(principal);
  const profile = { ...(current.profile || {}) };
  for (const [key, value] of Object.entries(suggestions)) {
    if (typeof value === "string" && value.trim() && !String(profile[key] || "").trim()) profile[key] = value.trim();
  }
  return saveProfile(principal, profile);
}

const mapApplication = (row) => ({ id: row.Id, jobId: row.JobId, jobExternalId: row.JobExternalId, company: row.Company, title: row.Title, location: row.Location, source: row.Source, sourceUrl: row.SourceUrl, status: row.Status, answers: row.AnswersJson ? JSON.parse(row.AnswersJson) : {}, notes: row.Notes, appliedAt: row.AppliedAt, submittedConfirmedAt: row.SubmittedConfirmedAt, createdAt: row.CreatedAt, updatedAt: row.UpdatedAt });

export async function listApplications(principal) {
  const userId = await ensureUser(principal);
  const db = await pool();
  const result = await db.request().input("userId", sql.UniqueIdentifier, userId).query("SELECT * FROM dbo.Applications WHERE UserId=@userId ORDER BY UpdatedAt DESC");
  return result.recordset.map(mapApplication);
}

export async function createApplication(principal, job, answers = {}) {
  const userId = await ensureUser(principal);
  const db = await pool();
  const result = await db.request()
    .input("userId", sql.UniqueIdentifier, userId).input("jobId", sql.BigInt, job.id)
    .input("externalId", sql.NVarChar(200), job.externalId || String(job.id)).input("company", sql.NVarChar(250), job.company)
    .input("title", sql.NVarChar(300), job.title).input("location", sql.NVarChar(300), job.location)
    .input("source", sql.NVarChar(80), job.source).input("sourceUrl", sql.NVarChar(2000), job.sourceUrl)
    .input("answers", sql.NVarChar(sql.MAX), JSON.stringify(answers)).query(`
      MERGE dbo.Applications WITH (HOLDLOCK) AS target
      USING (SELECT @userId AS UserId, @jobId AS JobId) incoming ON target.UserId=incoming.UserId AND target.JobId=incoming.JobId
      WHEN MATCHED THEN UPDATE SET AnswersJson=@answers, Status=CASE WHEN target.Status='draft' THEN 'review' ELSE target.Status END, UpdatedAt=SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT (UserId,JobId,JobExternalId,Company,Title,Location,Source,SourceUrl,Status,AnswersJson)
        VALUES (@userId,@jobId,@externalId,@company,@title,@location,@source,@sourceUrl,'review',@answers)
      OUTPUT inserted.*;
    `);
  return mapApplication(result.recordset[0]);
}

export async function updateApplication(principal, id, update) {
  const userId = await ensureUser(principal);
  const allowed = ["review", "submitted", "interview", "offer", "rejected", "failed"];
  if (!allowed.includes(update.status)) throw new Error("Invalid application status.");
  const db = await pool();
  const result = await db.request().input("userId", sql.UniqueIdentifier, userId).input("id", sql.UniqueIdentifier, id)
    .input("status", sql.VarChar(30), update.status).input("notes", sql.NVarChar(2000), update.notes || null).query(`
      UPDATE dbo.Applications SET Status=@status, Notes=COALESCE(@notes,Notes),
        AppliedAt=CASE WHEN @status='submitted' THEN COALESCE(AppliedAt,SYSUTCDATETIME()) ELSE AppliedAt END,
        SubmittedConfirmedAt=CASE WHEN @status='submitted' THEN SYSUTCDATETIME() ELSE SubmittedConfirmedAt END,
        UpdatedAt=SYSUTCDATETIME()
      OUTPUT inserted.* WHERE Id=@id AND UserId=@userId;
    `);
  return result.recordset.length ? mapApplication(result.recordset[0]) : null;
}

export async function saveDocument(principal, document) {
  const userId = await ensureUser(principal);
  const db = await pool();
  const transaction = new sql.Transaction(db);
  await transaction.begin();
  try {
    await new sql.Request(transaction).input("userId", sql.UniqueIdentifier, userId).query("UPDATE dbo.Documents SET IsPrimary=0 WHERE UserId=@userId AND DocumentType='resume'");
    const result = await new sql.Request(transaction).input("userId", sql.UniqueIdentifier, userId)
      .input("fileName", sql.NVarChar(260), document.fileName).input("contentType", sql.NVarChar(100), document.contentType)
      .input("blobName", sql.NVarChar(500), document.blobName).input("size", sql.BigInt, document.size)
      .input("extractionStatus", sql.VarChar(30), document.extractionStatus)
      .input("extractionJson", sql.NVarChar(sql.MAX), document.extraction ? JSON.stringify(document.extraction) : null).query(`
        INSERT dbo.Documents (UserId,DocumentType,FileName,ContentType,BlobName,SizeBytes,IsPrimary,ExtractionStatus,ExtractionJson,ExtractedAt)
        OUTPUT inserted.Id,inserted.FileName,inserted.ContentType,inserted.SizeBytes,inserted.ExtractionStatus,inserted.ExtractedAt,inserted.CreatedAt
        VALUES (@userId,'resume',@fileName,@contentType,@blobName,@size,1,@extractionStatus,@extractionJson,CASE WHEN @extractionStatus='succeeded' THEN SYSUTCDATETIME() ELSE NULL END);
      `);
    await transaction.commit();
    return result.recordset[0];
  } catch (error) { await transaction.rollback(); throw error; }
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
