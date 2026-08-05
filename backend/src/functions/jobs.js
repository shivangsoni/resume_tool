import { app } from "@azure/functions";
import { fetchLatestJobs } from "../sources/index.js";
import { persistJobs } from "../database.js";

let cache = { expiresAt: 0, jobs: [] };

app.http("jobs", {
  methods: ["GET", "OPTIONS"], authLevel: "anonymous", route: "jobs",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") return { status: 204 };
    const limit = Math.min(Math.max(Number(request.query.get("limit")) || 50, 1), 100);
    const search = (request.query.get("search") || "").trim().slice(0, 100).toLowerCase();
    try {
      if (Date.now() >= cache.expiresAt || !cache.jobs.length) {
        cache = { jobs: await fetchLatestJobs(), expiresAt: Date.now() + 60 * 60 * 1000 };
        try { await persistJobs(cache.jobs); } catch (error) { context.warn("Job persistence unavailable", error instanceof Error ? error.message : "Unknown error"); }
      }
      const filtered = search ? cache.jobs.filter((job) => `${job.title} ${job.company} ${job.location} ${job.skills.join(" ")}`.toLowerCase().includes(search)) : cache.jobs;
      return { jsonBody: { jobs: filtered.slice(0, limit), total: filtered.length, sources: [...new Set(filtered.map((job) => job.source))], fetchedAt: new Date().toISOString() }, headers: { "Cache-Control": "public, max-age=900", "X-Content-Type-Options": "nosniff" } };
    } catch (error) {
      context.error("Job feeds unavailable", error instanceof Error ? error.message : "Unknown error");
      return { status: 502, jsonBody: { error: "The job feeds are temporarily unavailable." } };
    }
  },
});
