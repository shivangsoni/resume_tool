import { DefaultAzureCredential } from "@azure/identity";
import { ServiceBusClient } from "@azure/service-bus";

let client;

function settings() {
  const namespace = process.env.SERVICE_BUS_NAMESPACE;
  const queueName = process.env.APPLICATION_SUBMISSION_QUEUE || "application-submissions";
  if (!namespace) throw new Error("Application submission queue is not configured.");
  return { namespace, queueName };
}

export async function enqueueApplicationSubmission(application) {
  const { namespace, queueName } = settings();
  client ||= new ServiceBusClient(namespace, new DefaultAzureCredential());
  const sender = client.createSender(queueName);
  try {
    await sender.sendMessages({
      messageId: application.id,
      subject: "application.submit",
      contentType: "application/json",
      body: { applicationId: application.id },
      applicationProperties: { source: application.source || "unknown" },
    });
  } finally {
    await sender.close();
  }
}
