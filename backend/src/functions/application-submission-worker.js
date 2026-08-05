import { app } from "@azure/functions";
import { claimApplicationForSubmission, recordSubmissionOutcome } from "../database.js";
import { submitToEmployer } from "../employer-submission.js";

app.serviceBusQueue("applicationSubmissionWorker", {
  connection: "SERVICE_BUS",
  queueName: process.env.APPLICATION_SUBMISSION_QUEUE || "application-submissions",
  handler: async (message, context) => {
    const applicationId = String(message?.applicationId || "");
    if (!applicationId) {
      context.warn("Discarding submission message without an application ID.");
      return;
    }
    const application = await claimApplicationForSubmission(applicationId);
    if (!application) return;
    try {
      const outcome = await submitToEmployer(application);
      await recordSubmissionOutcome(application.id, outcome);
      context.log("Application submission processed", { applicationId, outcome: outcome.outcome, provider: outcome.provider });
    } catch (error) {
      await recordSubmissionOutcome(application.id, { outcome: "retrying", detail: error instanceof Error ? error.message : "Provider request failed." });
      throw error;
    }
  },
});
