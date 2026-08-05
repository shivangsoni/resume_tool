import { app } from "@azure/functions";
import { normalizeJob } from "../normalize.js";

const UPSTREAM = "https://remotive.com/api/remote-jobs";
let cache = { expiresAt: 0, jobs: [] };

app.http("jobs", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "jobs",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") return { status: 204 };
    const limit = Math.min(Math.max(Number(request.query.get("limit")) || 50, 1), 100);
    const search = (request.query.get("search") || "").trim().slice(0, 100);
    try {
      if (Date.now() >= cache.expiresAt || !cache.jobs.length) {
        const response = await fetch(`${UPSTREAM}?limit=100`, { headers: { Accept: "application/json", "User-Agent": "ApplyPilot/1.0" }, signal: AbortSignal.timeout(12000) });
        if (!response.ok) throw new Error(`Upstream returned ${response.status}`);
        const payload = await response.json();
        cache = { jobs: (payload.jobs || []).map(normalizeJob), expiresAt: Date.now() + 6 * 60 * 60 * 1000 };
      }
      const filtered = search ? cache.jobs.filter((job) => `${job.title} ${job.company} ${job.skills.join(" ")}`.toLowerCase().includes(search.toLowerCase())) : cache.jobs;
      return { jsonBody: { jobs: filtered.slice(0, limit), source: "Remotive", fetchedAt: new Date().toISOString() }, headers: { "Cache-Control": "public, max-age=900", "X-Content-Type-Options": "nosniff" } };
    } catch (error) {
      context.error("Job feed unavailable", error instanceof Error ? error.message : "Unknown error");
      return { status: 502, jsonBody: { error: "The job feed is temporarily unavailable." } };
    }
  },
});
