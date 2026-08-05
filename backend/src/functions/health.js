import { app } from "@azure/functions";
import { checkDatabase } from "../database.js";

app.http("health", {
  methods: ["GET"], authLevel: "anonymous", route: "health",
  handler: async () => {
    const database = await checkDatabase();
    return { status: database.configured && !database.connected ? 503 : 200, jsonBody: { status: database.configured && !database.connected ? "degraded" : "ok", database, timestamp: new Date().toISOString() }, headers: { "Cache-Control": "no-store" } };
  },
});
