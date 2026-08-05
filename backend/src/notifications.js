import { EmailClient } from "@azure/communication-email";
import { DefaultAzureCredential } from "@azure/identity";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function applicationQueuedContent(application, environment = process.env.DEPLOYMENT_ENVIRONMENT || "production") {
  const isNonProduction = environment.toLowerCase() !== "production";
  const marker = isNonProduction ? "[TEST] " : "";
  return {
    subject: `${marker}Application queued: ${application.title} at ${application.company}`,
    plainText: [
      ...(isNonProduction ? ["TEST — This message was sent from the ApplyPilot non-production environment."] : []),
      `Your ApplyPilot application for ${application.title} at ${application.company} is queued.`,
      "It has not been represented as submitted because an employer receipt has not been received.",
      `Location: ${application.location || "Not specified"}`,
      "Sign in to ApplyPilot to review its status.",
    ].join("\n\n"),
  };
}

export async function sendApplicationQueuedEmail(principal, application) {
  const endpoint = process.env.EMAIL_COMMUNICATION_ENDPOINT;
  const senderAddress = process.env.EMAIL_SENDER_ADDRESS;
  const recipient = principal.email;
  if (!endpoint || !senderAddress || !recipient || !emailPattern.test(recipient)) {
    return { sent: false, reason: "Email notification is not configured for this account." };
  }
  const client = new EmailClient(endpoint, new DefaultAzureCredential());
  const content = applicationQueuedContent(application);
  const poller = await client.beginSend({
    senderAddress,
    recipients: { to: [{ address: recipient }] },
    content,
  });
  const result = await poller.pollUntilDone();
  return { sent: result.status === "Succeeded", id: result.id, status: result.status };
}
