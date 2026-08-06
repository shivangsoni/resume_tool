import { EmailClient } from "@azure/communication-email";
import { DefaultAzureCredential } from "@azure/identity";
import { appendMailboxMessage, ensureMailbox } from "./database.js";
import { addressForAlias } from "./mailbox-address.js";

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

export function applicationQueuedContent(application, environment = process.env.DEPLOYMENT_ENVIRONMENT || "production") {
  const { subjectPrefix, bodyPrefix } = environmentMarker(environment);
  return {
    subject: `${subjectPrefix}Application queued: ${application.title} at ${application.company}`,
    plainText: [
      ...bodyPrefix,
      `Your ApplyPilot application for ${application.title} at ${application.company} is queued.`,
      "A browser worker will submit it when capacity is available (usually within a minute after cold start).",
      `Location: ${application.location || "Not specified"}`,
      "Sign in to ApplyPilot to review its status in Applications and Email Inbox.",
    ].join("\n\n"),
  };
}

export function applicationStatusContent(application, statusLabel, detail, environment = process.env.DEPLOYMENT_ENVIRONMENT || "production") {
  const { subjectPrefix, bodyPrefix } = environmentMarker(environment);
  return {
    subject: `${subjectPrefix}Application ${statusLabel}: ${application.title} at ${application.company}`,
    plainText: [
      ...bodyPrefix,
      `Your ApplyPilot application for ${application.title} at ${application.company} is now ${statusLabel}.`,
      detail || "",
      "Open ApplyPilot → Email Inbox or Applications for the latest details.",
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

async function mirrorToInbox(principal, { subject, plainText, providerMessageId, senderName, senderEmail }) {
  try {
    const mailbox = await ensureMailbox(principal);
    await appendMailboxMessage({
      mailboxId: mailbox.Id,
      providerMessageId,
      senderName: senderName || "ApplyPilot",
      senderEmail: senderEmail || process.env.EMAIL_SENDER_ADDRESS || "noreply@applypilot.local",
      subject,
      textBody: plainText,
      receivedAt: new Date(),
    });
  } catch {
    // Inbox mirror must not fail the primary notification path.
  }
}

export async function sendApplicationQueuedEmail(principal, application) {
  const content = applicationQueuedContent(application);
  const result = await sendEmail({ to: principal.email, ...content });
  await mirrorToInbox(principal, {
    ...content,
    providerMessageId: `outbound:queued:${application.id}:${Date.now()}`,
    senderName: "ApplyPilot",
  });
  return result;
}

export async function notifyApplicationStatus(principal, application, statusLabel, detail) {
  const content = applicationStatusContent(application, statusLabel, detail);
  const result = await sendEmail({ to: principal.email, ...content });
  await mirrorToInbox(principal, {
    ...content,
    providerMessageId: `outbound:${statusLabel}:${application.id}:${Date.now()}`,
    senderName: "ApplyPilot",
  });
  return result;
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
  const mailbox = await ensureMailbox(principal);
  return addressForAlias(mailbox.Alias) || principal.email || null;
}
