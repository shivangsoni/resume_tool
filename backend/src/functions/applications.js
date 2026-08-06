import { app } from "@azure/functions";
import { getPrincipal, unauthorized } from "../identity.js";
import { createApplication, listApplications, queueApplicationSubmission, saveApplicationAnswers, updateApplication } from "../database.js";
import { notifyApplicationStatus, resolveApplyEmail, sendApplicationQueuedEmail, sendOpsAlertEmail } from "../notifications.js";
import { enqueueApplicationSubmission } from "../submission-queue.js";

app.http("applications", {
  methods: ["GET", "POST"], authLevel: "anonymous", route: "applications",
  handler: async (request, context) => {
    const principal = getPrincipal(request); if (!principal) return unauthorized();
    try {
      if (request.method === "GET") return { jsonBody: { applications: await listApplications(principal) }, headers: { "Cache-Control": "no-store" } };
      const body = await request.json();
      if (!body?.job?.id || !body.job.sourceUrl) return { status: 400, jsonBody: { error: "A valid job is required." } };
      const applyEmail = await resolveApplyEmail(principal);
      const answers = { ...(body.answers || {}) };
      if (applyEmail && !answers.email) answers.email = applyEmail;
      const application = await createApplication(principal, body.job, answers);
      let notification = { sent: false };
      try { notification = await sendApplicationQueuedEmail(principal, application); }
      catch (emailError) {
        context.warn("Application email notification failed", emailError);
        try { await sendOpsAlertEmail({ title: "Application queued email failed", detail: emailError instanceof Error ? emailError.message : String(emailError), context: { applicationId: application.id } }); } catch { /* ignore */ }
      }
      return { status: 201, jsonBody: { application, notification } };
    } catch (error) {
      context.error("Applications request failed", error);
      try { await sendOpsAlertEmail({ title: "Applications API failure", detail: error instanceof Error ? error.message : String(error) }); } catch { /* ignore */ }
      return { status: 500, jsonBody: { error: "Applications request failed." } };
    }
  },
});

app.http("submitApplication", {
  methods: ["POST"], authLevel: "anonymous", route: "applications/{id}/submit",
  handler: async (request, context) => {
    const principal = getPrincipal(request); if (!principal) return unauthorized();
    try {
      const application = await queueApplicationSubmission(principal, request.params.id);
      if (!application) return { status: 404, jsonBody: { error: "Application not found or cannot be queued." } };
      await enqueueApplicationSubmission(application);
      return { status: 202, jsonBody: { application, queue: { accepted: true } } };
    } catch (error) {
      context.error("Application enqueue failed", error);
      try { await sendOpsAlertEmail({ title: "Application enqueue failure", detail: error instanceof Error ? error.message : String(error), context: { applicationId: request.params.id } }); } catch { /* ignore */ }
      return { status: 503, jsonBody: { error: "Application could not be queued. Retry safely; submissions are idempotent." } };
    }
  },
});

app.http("application", {
  methods: ["PATCH"], authLevel: "anonymous", route: "applications/{id}",
  handler: async (request, context) => {
    const principal = getPrincipal(request); if (!principal) return unauthorized();
    try {
      const application = await updateApplication(principal, request.params.id, await request.json());
      if (application) {
        try { await notifyApplicationStatus(principal, application, application.status, application.lastSubmissionError || ""); } catch { /* ignore */ }
      }
      return application ? { jsonBody: { application } } : { status: 404, jsonBody: { error: "Application not found." } };
    } catch (error) { context.error("Application update failed", error); return { status: 400, jsonBody: { error: error instanceof Error ? error.message : "Update failed." } }; }
  },
});

app.http("applicationAnswers", {
  methods: ["POST"], authLevel: "anonymous", route: "applications/{id}/answers",
  handler: async (request, context) => {
    const principal = getPrincipal(request); if (!principal) return unauthorized();
    try {
      const body = await request.json();
      const answers = body?.answers && typeof body.answers === "object" ? body.answers : {};
      if (Object.values(answers).some((value) => typeof value !== "string" || value.length > 4000)) return { status: 400, jsonBody: { error: "Invalid screening answers." } };
      const saved = await saveApplicationAnswers(principal, request.params.id, answers);
      if (!saved) return { status: 404, jsonBody: { error: "Application not found." } };
      const application = await queueApplicationSubmission(principal, saved.id);
      await enqueueApplicationSubmission(application);
      try { await notifyApplicationStatus(principal, application, "re-queued after answers", "Your answers were saved and the application was queued again."); } catch { /* ignore */ }
      return { status: 202, jsonBody: { application } };
    } catch (error) { context.error("Application answers failed", error); return { status: 500, jsonBody: { error: "Answers could not be saved and queued." } }; }
  },
});
