import { app } from "@azure/functions";
import { getPrincipal, unauthorized } from "../identity.js";
import { getProfile, saveProfile } from "../database.js";

app.http("profile", {
  methods: ["GET", "PUT"], authLevel: "anonymous", route: "profile",
  handler: async (request, context) => {
    const principal = getPrincipal(request); if (!principal) return unauthorized();
    try {
      if (request.method === "GET") return { jsonBody: await getProfile(principal), headers: { "Cache-Control": "no-store" } };
      const body = await request.json();
      if (!body || typeof body !== "object") return { status: 400, jsonBody: { error: "Profile is required." } };
      return { jsonBody: await saveProfile(principal, body), headers: { "Cache-Control": "no-store" } };
    } catch (error) { context.error("Profile request failed", error); return { status: 500, jsonBody: { error: "Profile request failed." } }; }
  },
});
