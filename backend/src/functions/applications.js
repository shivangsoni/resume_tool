import { app } from "@azure/functions";
import { getPrincipal, unauthorized } from "../identity.js";
import { createApplication, deleteApplication, listApplications, queueApplicationSubmission, revertApplicationQueue, saveApplicationAnswers, updateApplication } from "../database.js";
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
      // Employer forms use the signed-in user email (not a Postmark inbound alias).
      if (applyEmail) answers.email = applyEmail;
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
      try {
        await enqueueApplicationSubmission(application);
      } catch (enqueueError) {
        await revertApplicationQueue(principal, request.params.id, enqueueError instanceof Error ? enqueueError.message : "Submission queue unavailable.");
        throw enqueueError;
      }
      return { status: 202, jsonBody: { application, queue: { accepted: true } } };
    } catch (error) {
      context.error("Application enqueue failed", error);
      try { await sendOpsAlertEmail({ title: "Application enqueue failure", detail: error instanceof Error ? error.message : String(error), context: { applicationId: request.params.id } }); } catch { /* ignore */ }
      return { status: 503, jsonBody: { error: "Application could not be queued. Retry safely; submissions are idempotent." } };
    }
  },
});

app.http("application", {
  methods: ["PATCH", "DELETE"], authLevel: "anonymous", route: "applications/{id}",
  handler: async (request, context) => {
    const principal = getPrincipal(request); if (!principal) return unauthorized();
    try {
      if (request.method === "DELETE") {
        const removed = await deleteApplication(principal, request.params.id);
        if (!removed) return { status: 404, jsonBody: { error: "Application not found." } };
        return { status: 200, jsonBody: { deleted: true, id: removed.id } };
      }
      const application = await updateApplication(principal, request.params.id, await request.json());
      if (application) {
        try { await notifyApplicationStatus(principal, application, application.status, application.lastSubmissionError || ""); } catch { /* ignore */ }
      }
      return application ? { jsonBody: { application } } : { status: 404, jsonBody: { error: "Application not found." } };
    } catch (error) {
      context.error("Application update failed", error);
      const status = error?.status === 409 ? 409 : 400;
      return { status, jsonBody: { error: error instanceof Error ? error.message : "Update failed." } };
    }
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
      if (!saved?.application) return { status: 404, jsonBody: { error: "Application not found." } };
      if (saved.awaitingVerification) {
        return {
          status: 200,
          jsonBody: {
            application: saved.application,
            queued: false,
            awaitingVerification: true,
            message: "Verification code saved. The open browser session will use it shortly.",
          },
        };
      }
      const application = await queueApplicationSubmission(principal, saved.application.id);
      if (!application) return { status: 409, jsonBody: { error: "Application could not be re-queued yet. Try again shortly." } };
      try {
        await enqueueApplicationSubmission(application);
      } catch (enqueueError) {
        await revertApplicationQueue(principal, saved.application.id, enqueueError instanceof Error ? enqueueError.message : "Submission queue unavailable.");
        throw enqueueError;
      }
      try { await notifyApplicationStatus(principal, application, "re-queued after answers", "Your answers were saved and the application was queued again."); } catch { /* ignore */ }
      return { status: 202, jsonBody: { application, queued: true } };
    } catch (error) { context.error("Application answers failed", error); return { status: 500, jsonBody: { error: "Answers could not be saved and queued." } }; }
  },
});
