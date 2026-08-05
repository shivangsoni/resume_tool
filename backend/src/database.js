import sql from "mssql";
import { createHash } from "node:crypto";

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

export async function refreshQueuedApplications(principal, profile) {
  if (!profile || !Object.keys(profile).length) return 0;
  const userId = await ensureUser(principal);
  const db = await pool();
  const result = await db.request().input("userId", sql.UniqueIdentifier, userId)
    .query("SELECT Id, AnswersJson FROM dbo.Applications WHERE UserId=@userId AND Status='review'");

  let refreshed = 0;
  for (const row of result.recordset) {
    const answers = row.AnswersJson ? JSON.parse(row.AnswersJson) : {};
    const merged = { ...answers };
    let changed = false;
    for (const [key, value] of Object.entries(profile)) {
      if (typeof value !== "string") continue;
      const current = String(answers[key] || "").trim();
      const next = value.trim();
      if (next && !current) {
        merged[key] = next;
        changed = true;
      }
    }
    if (!changed) continue;
    await db.request()
      .input("id", sql.UniqueIdentifier, row.Id)
      .input("answers", sql.NVarChar(sql.MAX), JSON.stringify(merged))
      .query("UPDATE dbo.Applications SET AnswersJson=@answers, UpdatedAt=SYSUTCDATETIME() WHERE Id=@id");
    refreshed += 1;
  }
  return refreshed;
}

const mapApplication = (row) => ({ id: row.Id, jobId: Number(row.JobId), jobExternalId: row.JobExternalId, company: row.Company, title: row.Title, location: row.Location, source: row.Source, sourceUrl: row.SourceUrl, status: row.Status, answers: row.AnswersJson ? JSON.parse(row.AnswersJson) : {}, notes: row.Notes, appliedAt: row.AppliedAt, submittedConfirmedAt: row.SubmittedConfirmedAt, submissionProvider: row.SubmissionProvider, providerReceiptId: row.ProviderReceiptId, lastSubmissionError: row.LastSubmissionError, submissionQueuedAt: row.SubmissionQueuedAt, createdAt: row.CreatedAt, updatedAt: row.UpdatedAt });

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
  const allowed = ["review", "queued", "needs_action", "submitted", "interview", "offer", "rejected", "failed"];
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

export async function queueApplicationSubmission(principal, id) {
  const userId = await ensureUser(principal);
  const db = await pool();
  const result = await db.request().input("userId", sql.UniqueIdentifier, userId).input("id", sql.UniqueIdentifier, id).query(`
    UPDATE dbo.Applications SET Status='queued', SubmissionQueuedAt=SYSUTCDATETIME(), LastSubmissionError=NULL, UpdatedAt=SYSUTCDATETIME()
    OUTPUT inserted.*
    WHERE Id=@id AND UserId=@userId AND Status IN ('review','needs_action','failed','queued');
  `);
  return result.recordset.length ? mapApplication(result.recordset[0]) : null;
}

export async function claimApplicationForSubmission(id) {
  const db = await pool();
  const result = await db.request().input("id", sql.UniqueIdentifier, id)
    .query(`
      UPDATE dbo.Applications SET Status='processing', UpdatedAt=SYSUTCDATETIME()
      OUTPUT inserted.* WHERE Id=@id AND Status='queued';
    `);
  return result.recordset.length ? mapApplication(result.recordset[0]) : null;
}

export async function recordSubmissionOutcome(id, outcome) {
  const db = await pool();
  const transaction = new sql.Transaction(db);
  await transaction.begin();
  try {
    await new sql.Request(transaction).input("id", sql.UniqueIdentifier, id)
      .input("outcome", sql.VarChar(30), outcome.outcome)
      .input("provider", sql.NVarChar(100), outcome.provider || null)
      .input("receipt", sql.NVarChar(300), outcome.receiptId || null)
      .input("detail", sql.NVarChar(2000), outcome.detail || null).query(`
        INSERT dbo.ApplicationSubmissionAttempts (ApplicationId,Outcome,Provider,ProviderReceiptId,Detail)
        VALUES (@id,@outcome,@provider,@receipt,@detail);

        UPDATE dbo.Applications SET
          Status=CASE WHEN @outcome='submitted' THEN 'submitted' WHEN @outcome='retrying' THEN 'queued' ELSE 'needs_action' END,
          SubmissionProvider=COALESCE(@provider,SubmissionProvider),
          ProviderReceiptId=COALESCE(@receipt,ProviderReceiptId),
          LastSubmissionError=CASE WHEN @outcome='submitted' THEN NULL ELSE @detail END,
          AppliedAt=CASE WHEN @outcome='submitted' THEN COALESCE(AppliedAt,SYSUTCDATETIME()) ELSE AppliedAt END,
          SubmittedConfirmedAt=CASE WHEN @outcome='submitted' THEN SYSUTCDATETIME() ELSE SubmittedConfirmedAt END,
          UpdatedAt=SYSUTCDATETIME()
        WHERE Id=@id;
      `);
    await transaction.commit();
  } catch (error) { await transaction.rollback(); throw error; }
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

const mapDocument = (row) => ({
  id: row.Id,
  fileName: row.FileName,
  contentType: row.ContentType,
  sizeBytes: Number(row.SizeBytes),
  isPrimary: Boolean(row.IsPrimary),
  extractionStatus: row.ExtractionStatus,
  createdAt: row.CreatedAt,
});

export async function listResumeDocuments(principal) {
  const userId = await ensureUser(principal);
  const db = await pool();
  const result = await db.request().input("userId", sql.UniqueIdentifier, userId).query(`
    SELECT Id,FileName,ContentType,SizeBytes,IsPrimary,ExtractionStatus,CreatedAt
    FROM dbo.Documents WHERE UserId=@userId AND DocumentType='resume'
    ORDER BY IsPrimary DESC, CreatedAt DESC;
  `);
  return result.recordset.map(mapDocument);
}

export async function getResumeDocument(principal, id) {
  const userId = await ensureUser(principal);
  const db = await pool();
  const result = await db.request().input("userId", sql.UniqueIdentifier, userId).input("id", sql.UniqueIdentifier, id).query(`
    SELECT Id,FileName,ContentType,BlobName,SizeBytes,IsPrimary,ExtractionStatus,CreatedAt
    FROM dbo.Documents WHERE Id=@id AND UserId=@userId AND DocumentType='resume';
  `);
  return result.recordset[0] || null;
}

export async function deleteResumeDocument(principal, id) {
  const userId = await ensureUser(principal);
  const db = await pool();
  const transaction = new sql.Transaction(db);
  await transaction.begin();
  try {
    const found = await new sql.Request(transaction).input("userId", sql.UniqueIdentifier, userId).input("id", sql.UniqueIdentifier, id).query(`
      DELETE FROM dbo.Documents OUTPUT deleted.BlobName,deleted.IsPrimary
      WHERE Id=@id AND UserId=@userId AND DocumentType='resume';
    `);
    if (!found.recordset.length) { await transaction.rollback(); return null; }
    if (found.recordset[0].IsPrimary) {
      await new sql.Request(transaction).input("userId", sql.UniqueIdentifier, userId).query(`
        UPDATE dbo.Documents SET IsPrimary=1 WHERE Id=(
          SELECT TOP 1 Id FROM dbo.Documents WHERE UserId=@userId AND DocumentType='resume' ORDER BY CreatedAt DESC
        );
      `);
    }
    await transaction.commit();
    return found.recordset[0].BlobName;
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

const mailboxAlias = (subject) => `u${createHash("sha256").update(subject).digest("hex").slice(0, 20)}`;
const mapMessage = (row) => ({ id: row.Id, from: { name: row.SenderName, email: row.SenderEmail }, subject: row.Subject, textBody: row.TextBody || "", receivedAt: row.ReceivedAt, isRead: Boolean(row.IsRead), attachmentCount: row.AttachmentCount });

export async function ensureMailbox(principal) {
  const userId = await ensureUser(principal);
  const db = await pool();
  const result = await db.request().input("userId", sql.UniqueIdentifier, userId).input("alias", sql.VarChar(64), mailboxAlias(principal.subject)).query(`
    MERGE dbo.Mailboxes WITH (HOLDLOCK) AS target
    USING (SELECT @userId UserId, @alias Alias) incoming ON target.UserId=incoming.UserId
    WHEN MATCHED THEN UPDATE SET Alias=target.Alias
    WHEN NOT MATCHED THEN INSERT (UserId, Alias) VALUES (incoming.UserId, incoming.Alias)
    OUTPUT inserted.Id, inserted.Alias;
  `);
  return result.recordset[0];
}

export async function listInboundMessages(principal, limit = 25, offset = 0) {
  const mailbox = await ensureMailbox(principal);
  const db = await pool();
  const result = await db.request().input("mailboxId", sql.UniqueIdentifier, mailbox.Id).input("limit", sql.Int, limit).input("offset", sql.Int, offset).query(`
    SELECT *, COUNT(*) OVER() TotalCount FROM dbo.InboundMessages WHERE MailboxId=@mailboxId
    ORDER BY ReceivedAt DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
  `);
  return { mailbox, messages: result.recordset.map(mapMessage), total: result.recordset[0]?.TotalCount || 0 };
}

export async function markInboundMessageRead(principal, id) {
  const mailbox = await ensureMailbox(principal);
  const db = await pool();
  const result = await db.request().input("mailboxId", sql.UniqueIdentifier, mailbox.Id).input("id", sql.UniqueIdentifier, id).query(`
    UPDATE dbo.InboundMessages SET IsRead=1 OUTPUT inserted.* WHERE Id=@id AND MailboxId=@mailboxId;
  `);
  return result.recordset.length ? mapMessage(result.recordset[0]) : null;
}

export async function saveInboundMessage(payload) {
  const alias = String(payload.MailboxHash || "").toLowerCase() || String(payload.ToFull?.[0]?.Email || payload.To || "").split("@")[0].split("+").pop().toLowerCase();
  if (!alias) return null;
  const db = await pool();
  const result = await db.request().input("alias", sql.VarChar(64), alias)
    .input("providerId", sql.NVarChar(255), String(payload.MessageID || "").slice(0, 255))
    .input("senderName", sql.NVarChar(200), String(payload.FromName || payload.FromFull?.Name || "").slice(0, 200) || null)
    .input("senderEmail", sql.NVarChar(320), String(payload.FromFull?.Email || payload.From || "").slice(0, 320))
    .input("subject", sql.NVarChar(500), String(payload.Subject || "(no subject)").slice(0, 500))
    .input("body", sql.NVarChar(sql.MAX), String(payload.TextBody || payload.StrippedTextReply || "").slice(0, 250000))
    .input("receivedAt", sql.DateTime2, new Date(payload.Date || Date.now()))
    .input("attachments", sql.Int, Math.min(Number(payload.Attachments?.length || 0), 100)).query(`
      INSERT dbo.InboundMessages (MailboxId,ProviderMessageId,SenderName,SenderEmail,Subject,TextBody,ReceivedAt,AttachmentCount)
      OUTPUT inserted.*
      SELECT Id,@providerId,@senderName,@senderEmail,@subject,@body,@receivedAt,@attachments FROM dbo.Mailboxes WHERE Alias=@alias
      AND NOT EXISTS (SELECT 1 FROM dbo.InboundMessages WHERE ProviderMessageId=@providerId);
    `);
  return result.recordset.length ? mapMessage(result.recordset[0]) : null;
}
