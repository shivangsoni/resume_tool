import { app } from "@azure/functions";
import { checkDatabase } from "../database.js";

app.http("health", {
  methods: ["GET"], authLevel: "anonymous", route: "health",
  handler: async () => {
    const database = await checkDatabase();
    const submissionQueue = { configured: Boolean(process.env.SERVICE_BUS_NAMESPACE), name: process.env.APPLICATION_SUBMISSION_QUEUE || null };
    return { status: database.configured && !database.connected ? 503 : 200, jsonBody: { status: database.configured && !database.connected ? "degraded" : "ok", database, submissionQueue, timestamp: new Date().toISOString() }, headers: { "Cache-Control": "no-store" } };
  },
});
