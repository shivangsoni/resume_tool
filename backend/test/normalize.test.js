import test from "node:test";
import assert from "node:assert/strict";
import { normalizeGreenhouseJob, normalizeJob } from "../src/normalize.js";

test("normalizes an upstream job without leaking HTML", () => {
  const result = normalizeJob({ id: 7, title: "React Developer", company_name: "Acme", description: "<p>Build with React &amp; TypeScript</p>", category: "Software Development", job_type: "full_time", candidate_required_location: "USA", publication_date: new Date().toISOString(), url: "https://example.com/job" });
  assert.equal(result.id, 7);
  assert.equal(result.remote, true);
  assert.match(result.summary, /React & TypeScript/);
  assert.doesNotMatch(result.summary, /<p>/);
  assert.equal(result.sourceUrl, "https://example.com/job");
});

test("normalizes a current Greenhouse job with provenance", () => {
  const result = normalizeGreenhouseJob({ id: 42, title: "Senior Product Manager", content: "<p>Build products with SQL</p>", location: { name: "Remote - US" }, updated_at: "2026-08-04T20:00:00Z", absolute_url: "https://boards.greenhouse.io/acme/jobs/42" }, { token: "acme", company: "Acme" });
  assert.equal(result.source, "Greenhouse");
  assert.equal(result.company, "Acme");
  assert.equal(result.remote, true);
  assert.equal(result.sourceUrl, "https://boards.greenhouse.io/acme/jobs/42");
});
