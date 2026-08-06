import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sql from "mssql";
import { DefaultAzureCredential } from "@azure/identity";
import { EmailClient } from "@azure/communication-email";
import { ServiceBusClient } from "@azure/service-bus";
import { BlobServiceClient } from "@azure/storage-blob";
import { runApplication } from "./automation.js";

const pool = await sql.connect({ server: process.env.AZURE_SQL_SERVER, database: process.env.AZURE_SQL_DATABASE, authentication: { type: "azure-active-directory-default" }, options: { encrypt: true, trustServerCertificate: false } });
const credential = new DefaultAzureCredential();
const bus = new ServiceBusClient(process.env.SERVICE_BUS_NAMESPACE, credential);
const receiver = bus.createReceiver(process.env.APPLICATION_SUBMISSION_QUEUE || "application-submissions", { receiveMode: "peekLock" });
const blobs = new BlobServiceClient(`https://${process.env.AZURE_STORAGE_ACCOUNT}.blob.core.windows.net`, credential).getContainerClient(process.env.RESUME_CONTAINER || "resumes");
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function load(id) {
  const result = await pool.request().input("id", sql.UniqueIdentifier, id).query(`
    UPDATE dbo.Applications SET Status='processing',UpdatedAt=SYSUTCDATETIME() OUTPUT inserted.* WHERE Id=@id AND Status='queued';
    SELECT a.Id,a.UserId,u.Email,p.ProfileJson,d.BlobName,d.FileName,m.Alias AS MailboxAlias,m.Id AS MailboxId
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
  // Prefer private inbound alias so recruiter replies land in ApplyPilot Inbox.
  const applyEmail = mailboxEmail || answers.email || profile.email || context.Email;
  return {
    application: { id: app.Id, jobExternalId: app.JobExternalId, company: app.Company, title: app.Title, source: app.Source, sourceUrl: app.SourceUrl, answers: { ...answers, email: applyEmail } },
    profile: { ...profile, email: applyEmail },
    document: context.BlobName ? { blobName: context.BlobName, fileName: context.FileName } : null,
    notify: { userId: context.UserId || app.UserId, email: context.Email, mailboxId: context.MailboxId, mailboxAlias: context.MailboxAlias, title: app.Title, company: app.Company },
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

function environmentMarker() {
  const isNonProduction = String(process.env.DEPLOYMENT_ENVIRONMENT || "production").toLowerCase() !== "production";
  return {
    subjectPrefix: isNonProduction ? "[TEST] " : "",
    bodyPrefix: isNonProduction ? ["TEST — This message was sent from the ApplyPilot non-production environment."] : [],
  };
}

async function sendStatusEmail({ to, subject, plainText }) {
  const endpoint = process.env.EMAIL_COMMUNICATION_ENDPOINT;
  const senderAddress = process.env.EMAIL_SENDER_ADDRESS;
  if (!endpoint || !senderAddress || !to || !emailPattern.test(to)) return { sent: false };
  const client = new EmailClient(endpoint, credential);
  const poller = await client.beginSend({
    senderAddress,
    recipients: { to: [{ address: to }] },
    content: { subject, plainText },
  });
  const result = await poller.pollUntilDone();
  return { sent: result.status === "Succeeded", id: result.id, status: result.status };
}

async function ensureMailboxId(userId, alias) {
  if (!userId) return null;
  const mailboxAlias = alias || `u${String(userId).replace(/-/g, "").slice(0, 20)}`;
  const result = await pool.request()
    .input("userId", sql.UniqueIdentifier, userId)
    .input("alias", sql.VarChar(64), mailboxAlias)
    .query(`
      MERGE dbo.Mailboxes WITH (HOLDLOCK) AS target
      USING (SELECT @userId UserId, @alias Alias) incoming ON target.UserId=incoming.UserId
      WHEN MATCHED THEN UPDATE SET Alias=target.Alias
      WHEN NOT MATCHED THEN INSERT (UserId, Alias) VALUES (incoming.UserId, incoming.Alias)
      OUTPUT inserted.Id;
    `);
  return result.recordset[0]?.Id || null;
}

async function record(id, outcome, notify = {}) {
  await pool.request().input("id", sql.UniqueIdentifier, id).input("outcome", sql.VarChar(30), outcome.outcome).input("provider", sql.NVarChar(100), outcome.provider || null).input("receipt", sql.NVarChar(300), outcome.receiptId || null).input("detail", sql.NVarChar(2000), outcome.detail || null).input("questions", sql.NVarChar(sql.MAX), JSON.stringify(outcome.questions || [])).query(`
    INSERT dbo.ApplicationSubmissionAttempts(ApplicationId,Outcome,Provider,ProviderReceiptId,Detail) VALUES(@id,@outcome,@provider,@receipt,@detail);
    UPDATE dbo.Applications SET Status=CASE WHEN @outcome='submitted' THEN 'submitted' ELSE 'needs_action' END,SubmissionProvider=@provider,ProviderReceiptId=@receipt,LastSubmissionError=CASE WHEN @outcome='submitted' THEN NULL ELSE @detail END,RequiredQuestionsJson=@questions,AppliedAt=CASE WHEN @outcome='submitted' THEN SYSUTCDATETIME() ELSE AppliedAt END,SubmittedConfirmedAt=CASE WHEN @outcome='submitted' THEN SYSUTCDATETIME() ELSE SubmittedConfirmedAt END,UpdatedAt=SYSUTCDATETIME() WHERE Id=@id;
  `);
  try {
    await notifySubmissionOutcome(id, outcome, notify);
  } catch (error) {
    console.error("Failed to notify submission status", error);
  }
}

async function notifySubmissionOutcome(applicationId, outcome, notify) {
  const appResult = await pool.request().input("id", sql.UniqueIdentifier, applicationId).query(`
    SELECT a.Title,a.Company,a.UserId,u.Email,m.Id AS MailboxId,m.Alias AS MailboxAlias
    FROM dbo.Applications a
    JOIN dbo.Users u ON u.Id=a.UserId
    LEFT JOIN dbo.Mailboxes m ON m.UserId=a.UserId
    WHERE a.Id=@id;
  `);
  const row = appResult.recordset[0];
  if (!row) return;

  const title = row.Title || notify.title;
  const company = row.Company || notify.company;
  const submitted = outcome.outcome === "submitted";
  const statusLabel = submitted ? "submitted" : "failed";
  const { subjectPrefix, bodyPrefix } = environmentMarker();
  const subject = `${subjectPrefix}Application ${statusLabel}: ${title} at ${company}`;
  const plainText = [
    ...bodyPrefix,
    submitted
      ? `Your ApplyPilot application for ${title} at ${company} was submitted successfully.`
      : `Your ApplyPilot application for ${title} at ${company} needs attention.`,
    outcome.detail || "",
    "Open ApplyPilot → Email Inbox or Applications for the latest details.",
  ].filter(Boolean).join("\n\n");

  let mailboxId = row.MailboxId || notify.mailboxId;
  if (!mailboxId) mailboxId = await ensureMailboxId(row.UserId, row.MailboxAlias || notify.mailboxAlias);

  if (mailboxId) {
    await pool.request()
      .input("mailboxId", sql.UniqueIdentifier, mailboxId)
      .input("providerId", sql.NVarChar(255), `worker:${outcome.outcome}:${applicationId}:${Date.now()}`.slice(0, 255))
      .input("senderName", sql.NVarChar(200), "ApplyPilot")
      .input("senderEmail", sql.NVarChar(320), process.env.EMAIL_SENDER_ADDRESS || "donotreply@applypilot.local")
      .input("subject", sql.NVarChar(500), subject.slice(0, 500))
      .input("body", sql.NVarChar(sql.MAX), plainText.slice(0, 250000))
      .query(`
        INSERT dbo.InboundMessages (MailboxId,ProviderMessageId,SenderName,SenderEmail,Subject,TextBody,ReceivedAt,AttachmentCount)
        SELECT @mailboxId,@providerId,@senderName,@senderEmail,@subject,@body,SYSUTCDATETIME(),0
        WHERE NOT EXISTS (SELECT 1 FROM dbo.InboundMessages WHERE ProviderMessageId=@providerId);
      `);
  }

  await sendStatusEmail({ to: row.Email || notify.email, subject, plainText });
}

receiver.subscribe({ processMessage: async (message) => {
  const id = String(message.body?.applicationId || ""); const data = await load(id); if (!data) return;
  let resumePath;
  try {
    if (data.document) { resumePath = path.join(os.tmpdir(), `${id}-${data.document.fileName.replace(/[^a-z0-9._-]/gi, "_")}`); await blobs.getBlobClient(data.document.blobName).downloadToFile(resumePath); }
    await record(id, await runApplication({ ...data, resumePath }), data.notify);
  } catch (error) { await record(id, { outcome: "needs_action", detail: error instanceof Error ? error.message : "Browser automation failed.", questions: [] }, data?.notify); }
  finally { if (resumePath) await fs.unlink(resumePath).catch(() => {}); }
}, processError: async (args) => console.error("Service Bus worker error", args.error) }, { autoCompleteMessages: true, maxConcurrentCalls: 1, maxAutoLockRenewalDurationInMs: 10 * 60 * 1000 });
