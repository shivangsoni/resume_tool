import { createServer } from "node:http";
import { fetchLatestJobs } from "./sources/index.js";

const port = Number(process.env.PORT || 7071);
let cache = { expiresAt: 0, jobs: [] };

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("X-Content-Type-Options", "nosniff");

  if (request.method === "GET" && url.pathname === "/api/health") {
    response.end(JSON.stringify({ status: "ok", runtime: "local", timestamp: new Date().toISOString() }));
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/jobs") {
    try {
      if (Date.now() >= cache.expiresAt || !cache.jobs.length) {
        cache = { jobs: await fetchLatestJobs(), expiresAt: Date.now() + 60 * 60 * 1000 };
      }
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 100, 1), 100);
      const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);
      const search = (url.searchParams.get("search") || "").trim().slice(0, 100).toLowerCase();
      const filtered = search ? cache.jobs.filter((job) => `${job.title} ${job.company} ${job.location} ${job.skills.join(" ")}`.toLowerCase().includes(search)) : cache.jobs;
      response.setHeader("Cache-Control", "public, max-age=900");
      const jobs = filtered.slice(offset, offset + limit);
      response.end(JSON.stringify({ jobs, total: filtered.length, offset, limit, nextOffset: offset + jobs.length < filtered.length ? offset + jobs.length : null, sources: [...new Set(filtered.map((job) => job.source))], fetchedAt: new Date().toISOString() }));
    } catch (error) {
      response.statusCode = 502;
      response.end(JSON.stringify({ error: "The job feeds are temporarily unavailable.", detail: error instanceof Error ? error.message : "Unknown error" }));
    }
    return;
  }
  response.statusCode = 404;
  response.end(JSON.stringify({ error: "Not found" }));
});

server.listen(port, "127.0.0.1", () => console.log(`ApplyPilot API listening on http://127.0.0.1:${port}`));
