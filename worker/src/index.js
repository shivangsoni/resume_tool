import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sql from "mssql";
import { DefaultAzureCredential } from "@azure/identity";
import { ServiceBusClient } from "@azure/service-bus";
import { BlobServiceClient } from "@azure/storage-blob";
import { runApplication } from "./automation.js";

const pool = await sql.connect({ server: process.env.AZURE_SQL_SERVER, database: process.env.AZURE_SQL_DATABASE, authentication: { type: "azure-active-directory-default" }, options: { encrypt: true, trustServerCertificate: false } });
const credential = new DefaultAzureCredential();
const bus = new ServiceBusClient(process.env.SERVICE_BUS_NAMESPACE, credential);
const receiver = bus.createReceiver(process.env.APPLICATION_SUBMISSION_QUEUE || "application-submissions", { receiveMode: "peekLock" });
const blobs = new BlobServiceClient(`https://${process.env.AZURE_STORAGE_ACCOUNT}.blob.core.windows.net`, credential).getContainerClient(process.env.RESUME_CONTAINER || "resumes");

async function load(id) {
  const result = await pool.request().input("id", sql.UniqueIdentifier, id).query(`
    UPDATE dbo.Applications SET Status='processing',UpdatedAt=SYSUTCDATETIME() OUTPUT inserted.* WHERE Id=@id AND Status='queued';
    SELECT a.Id,u.Email,p.ProfileJson,d.BlobName,d.FileName,m.Alias AS MailboxAlias
    FROM dbo.Applications a
    JOIN dbo.Users u ON u.Id=a.UserId
    LEFT JOIN dbo.CandidateProfiles p ON p.UserId=a.UserId
    LEFT JOIN dbo.Mailboxes m ON m.UserId=a.UserId
    OUTER APPLY (SELECT TOP 1 BlobName,FileName FROM dbo.Documents WHERE UserId=a.UserId AND DocumentType='resume' ORDER BY IsPrimary DESC,CreatedAt DESC) d
    WHERE a.Id=@id;
  `);
  if (!result.recordsets[0].length) return null;
  const app = result.recordsets[0][0]; const context = result.recordsets[1][0];
  const answers = app.AnswersJson ? JSON.parse(app.AnswersJson) : {};
  const profile = { ...(context.ProfileJson ? JSON.parse(context.ProfileJson) : {}) };
  const mailboxEmail = addressForAlias(context.MailboxAlias);
  const applyEmail = answers.email || mailboxEmail || profile.email || context.Email;
  return {
    application: { id: app.Id, jobExternalId: app.JobExternalId, company: app.Company, title: app.Title, source: app.Source, sourceUrl: app.SourceUrl, answers: { ...answers, email: applyEmail } },
    profile: { ...profile, email: applyEmail },
    document: context.BlobName ? { blobName: context.BlobName, fileName: context.FileName } : null,
  };
}

function addressForAlias(alias) {
  if (!alias) return null;
  const domain = process.env.MAILBOX_DOMAIN;
  if (domain) return `${alias}@${domain}`;
  const inbound = process.env.POSTMARK_INBOUND_ADDRESS || "";
  const [local, host] = inbound.split("@");
  return local && host ? `${local}+${alias}@${host}` : null;
}

async function record(id, outcome) {
  await pool.request().input("id", sql.UniqueIdentifier, id).input("outcome", sql.VarChar(30), outcome.outcome).input("provider", sql.NVarChar(100), outcome.provider || null).input("receipt", sql.NVarChar(300), outcome.receiptId || null).input("detail", sql.NVarChar(2000), outcome.detail || null).input("questions", sql.NVarChar(sql.MAX), JSON.stringify(outcome.questions || [])).query(`
    INSERT dbo.ApplicationSubmissionAttempts(ApplicationId,Outcome,Provider,ProviderReceiptId,Detail) VALUES(@id,@outcome,@provider,@receipt,@detail);
    UPDATE dbo.Applications SET Status=CASE WHEN @outcome='submitted' THEN 'submitted' ELSE 'needs_action' END,SubmissionProvider=@provider,ProviderReceiptId=@receipt,LastSubmissionError=CASE WHEN @outcome='submitted' THEN NULL ELSE @detail END,RequiredQuestionsJson=@questions,AppliedAt=CASE WHEN @outcome='submitted' THEN SYSUTCDATETIME() ELSE AppliedAt END,SubmittedConfirmedAt=CASE WHEN @outcome='submitted' THEN SYSUTCDATETIME() ELSE SubmittedConfirmedAt END,UpdatedAt=SYSUTCDATETIME() WHERE Id=@id;
  `);
  try {
    await mirrorStatusToInbox(id, outcome);
  } catch (error) {
    console.error("Failed to mirror submission status to mailbox", error);
  }
}

async function mirrorStatusToInbox(applicationId, outcome) {
  const result = await pool.request().input("id", sql.UniqueIdentifier, applicationId).query(`
    SELECT a.Title,a.Company,a.UserId,m.Id AS MailboxId
    FROM dbo.Applications a
    LEFT JOIN dbo.Mailboxes m ON m.UserId=a.UserId
    WHERE a.Id=@id;
  `);
  const row = result.recordset[0];
  if (!row?.MailboxId) return;
  const statusLabel = outcome.outcome === "submitted" ? "submitted" : "needs action";
  const subject = `Application ${statusLabel}: ${row.Title} at ${row.Company}`;
  const body = outcome.outcome === "submitted"
    ? `Your application for ${row.Title} at ${row.Company} was submitted successfully.`
    : `Your application for ${row.Title} at ${row.Company} needs attention.\n\n${outcome.detail || "Open ApplyPilot Applications to resolve."}`;
  await pool.request()
    .input("mailboxId", sql.UniqueIdentifier, row.MailboxId)
    .input("providerId", sql.NVarChar(255), `worker:${outcome.outcome}:${applicationId}:${Date.now()}`.slice(0, 255))
    .input("senderName", sql.NVarChar(200), "ApplyPilot Worker")
    .input("senderEmail", sql.NVarChar(320), process.env.EMAIL_SENDER_ADDRESS || "worker@applypilot.local")
    .input("subject", sql.NVarChar(500), subject.slice(0, 500))
    .input("body", sql.NVarChar(sql.MAX), body.slice(0, 250000))
    .query(`
      INSERT dbo.InboundMessages (MailboxId,ProviderMessageId,SenderName,SenderEmail,Subject,TextBody,ReceivedAt,AttachmentCount)
      SELECT @mailboxId,@providerId,@senderName,@senderEmail,@subject,@body,SYSUTCDATETIME(),0
      WHERE NOT EXISTS (SELECT 1 FROM dbo.InboundMessages WHERE ProviderMessageId=@providerId);
    `);
}

receiver.subscribe({ processMessage: async (message) => {
  const id = String(message.body?.applicationId || ""); const data = await load(id); if (!data) return;
  let resumePath;
  try {
    if (data.document) { resumePath = path.join(os.tmpdir(), `${id}-${data.document.fileName.replace(/[^a-z0-9._-]/gi, "_")}`); await blobs.getBlobClient(data.document.blobName).downloadToFile(resumePath); }
    await record(id, await runApplication({ ...data, resumePath }));
  } catch (error) { await record(id, { outcome: "needs_action", detail: error instanceof Error ? error.message : "Browser automation failed.", questions: [] }); }
  finally { if (resumePath) await fs.unlink(resumePath).catch(() => {}); }
}, processError: async (args) => console.error("Service Bus worker error", args.error) }, { autoCompleteMessages: true, maxConcurrentCalls: 1, maxAutoLockRenewalDurationInMs: 10 * 60 * 1000 });
