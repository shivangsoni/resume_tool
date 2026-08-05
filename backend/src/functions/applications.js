import { app } from "@azure/functions";
import { getPrincipal, unauthorized } from "../identity.js";
import { createApplication, listApplications, updateApplication } from "../database.js";
import { sendApplicationQueuedEmail } from "../notifications.js";

app.http("applications", {
  methods: ["GET", "POST"], authLevel: "anonymous", route: "applications",
  handler: async (request, context) => {
    const principal = getPrincipal(request); if (!principal) return unauthorized();
    try {
      if (request.method === "GET") return { jsonBody: { applications: await listApplications(principal) }, headers: { "Cache-Control": "no-store" } };
      const body = await request.json();
      if (!body?.job?.id || !body.job.sourceUrl) return { status: 400, jsonBody: { error: "A valid job is required." } };
      const application = await createApplication(principal, body.job, body.answers || {});
      let notification = { sent: false };
      try { notification = await sendApplicationQueuedEmail(principal, application); }
      catch (emailError) { context.warn("Application email notification failed", emailError); }
      return { status: 201, jsonBody: { application, notification } };
    } catch (error) { context.error("Applications request failed", error); return { status: 500, jsonBody: { error: "Applications request failed." } }; }
  },
});

app.http("application", {
  methods: ["PATCH"], authLevel: "anonymous", route: "applications/{id}",
  handler: async (request, context) => {
    const principal = getPrincipal(request); if (!principal) return unauthorized();
    try {
      const application = await updateApplication(principal, request.params.id, await request.json());
      return application ? { jsonBody: { application } } : { status: 404, jsonBody: { error: "Application not found." } };
    } catch (error) { context.error("Application update failed", error); return { status: 400, jsonBody: { error: error instanceof Error ? error.message : "Update failed." } }; }
  },
});
