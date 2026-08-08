import { EmailClient } from "@azure/communication-email";
import { DefaultAzureCredential } from "@azure/identity";
import { appendMailboxMessage, ensureMailbox } from "./database.js";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OPS_ALERT_EMAIL = process.env.OPS_ALERT_EMAIL || "shivangsoni22@gmail.com";

function environmentMarker(environment = process.env.DEPLOYMENT_ENVIRONMENT || "production") {
  const isNonProduction = environment.toLowerCase() !== "production";
  return {
    isNonProduction,
    subjectPrefix: isNonProduction ? "[TEST] " : "",
    bodyPrefix: isNonProduction ? ["TEST — This message was sent from the ApplyPilot non-production environment."] : [],
  };
}

function applicationUrl(application, baseUrl = process.env.APPLICATION_BASE_URL || "") {
  if (!application.id || !baseUrl) return "";
  return `${baseUrl.replace(/\/$/, "")}/dashboard?application=${encodeURIComponent(application.id)}`;
}

export function applicationQueuedContent(application, environment = process.env.DEPLOYMENT_ENVIRONMENT || "production", baseUrl) {
  const { subjectPrefix, bodyPrefix } = environmentMarker(environment);
  const url = applicationUrl(application, baseUrl);
  return {
    subject: `${subjectPrefix}Application queued: ${application.title} at ${application.company}`,
    plainText: [
      ...bodyPrefix,
      `Your ApplyPilot application for ${application.title} at ${application.company} is queued.`,
      "A browser worker will submit it when capacity is available (usually within a minute after cold start).",
      `Location: ${application.location || "Not specified"}`,
      "Sign in to ApplyPilot to review its status in Applications and Email Inbox.",
      url,
    ].filter(Boolean).join("\n\n"),
  };
}

export function applicationStatusContent(application, statusLabel, detail, environment = process.env.DEPLOYMENT_ENVIRONMENT || "production", baseUrl) {
  const { subjectPrefix, bodyPrefix } = environmentMarker(environment);
  const url = applicationUrl(application, baseUrl);
  return {
    subject: `${subjectPrefix}Application ${statusLabel}: ${application.title} at ${application.company}`,
    plainText: [
      ...bodyPrefix,
      `Your ApplyPilot application for ${application.title} at ${application.company} is now ${statusLabel}.`,
      detail || "",
      "Open ApplyPilot → Email Inbox or Applications for the latest details.",
      url,
    ].filter(Boolean).join("\n\n"),
  };
}

async function sendEmail({ to, subject, plainText }) {
  const endpoint = process.env.EMAIL_COMMUNICATION_ENDPOINT;
  const senderAddress = process.env.EMAIL_SENDER_ADDRESS;
  if (!endpoint || !senderAddress || !to || !emailPattern.test(to)) {
    return { sent: false, reason: "Email notification is not configured for this account." };
  }
  const client = new EmailClient(endpoint, new DefaultAzureCredential());
  const poller = await client.beginSend({
    senderAddress,
    recipients: { to: [{ address: to }] },
    content: { subject, plainText },
  });
  const result = await poller.pollUntilDone();
  return { sent: result.status === "Succeeded", id: result.id, status: result.status };
}

async function mirrorToInbox(principal, { subject, plainText, providerMessageId, senderName, senderEmail, applicationId }) {
  const mailbox = await ensureMailbox(principal);
  await appendMailboxMessage({
    mailboxId: mailbox.Id,
    providerMessageId,
    senderName: senderName || "ApplyPilot",
    senderEmail: senderEmail || process.env.EMAIL_SENDER_ADDRESS || "noreply@applypilot.local",
    subject,
    textBody: plainText,
    applicationId,
    receivedAt: new Date(),
  });
}

async function deliverAndMirror(principal, content, providerMessageId, applicationId) {
  let mirrored = false;
  try {
    await mirrorToInbox(principal, {
      ...content,
      providerMessageId,
      senderName: "ApplyPilot",
      senderEmail: process.env.EMAIL_SENDER_ADDRESS || "donotreply@applypilot.local",
      applicationId,
    });
    mirrored = true;
  } catch (error) {
    console.error("Inbox mirror failed", error);
  }
  try {
    const result = await sendEmail({ to: principal.email, ...content });
    return { ...result, mirrored };
  } catch (error) {
    if (mirrored) return { sent: false, reason: error instanceof Error ? error.message : String(error), mirrored: true };
    throw error;
  }
}

export async function sendApplicationQueuedEmail(principal, application) {
  return deliverAndMirror(
    principal,
    applicationQueuedContent(application),
    `outbound:queued:${application.id}:${Date.now()}`,
    application.id,
  );
}

export async function notifyApplicationStatus(principal, application, statusLabel, detail) {
  return deliverAndMirror(
    principal,
    applicationStatusContent(application, statusLabel, detail),
    `outbound:${statusLabel}:${application.id}:${Date.now()}`,
    application.id,
  );
}

export async function sendOpsAlertEmail({ title, detail, context = {} }) {
  const { subjectPrefix, bodyPrefix } = environmentMarker();
  const content = {
    subject: `${subjectPrefix}ApplyPilot alert: ${title}`,
    plainText: [
      ...bodyPrefix,
      title,
      detail || "",
      Object.keys(context).length ? `Context:\n${JSON.stringify(context, null, 2)}` : "",
      `Time (UTC): ${new Date().toISOString()}`,
    ].filter(Boolean).join("\n\n"),
  };
  return sendEmail({ to: OPS_ALERT_EMAIL, ...content });
}

export async function resolveApplyEmail(principal) {
  return principal?.email || null;
}
