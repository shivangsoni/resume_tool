import test from "node:test";
import assert from "node:assert/strict";
import { normalizeJob } from "../src/normalize.js";

test("normalizes an upstream job without leaking HTML", () => {
  const result = normalizeJob({ id: 7, title: "React Developer", company_name: "Acme", description: "<p>Build with React &amp; TypeScript</p>", category: "Software Development", job_type: "full_time", candidate_required_location: "USA", publication_date: new Date().toISOString(), url: "https://example.com/job" });
  assert.equal(result.id, 7);
  assert.equal(result.remote, true);
  assert.match(result.summary, /React & TypeScript/);
  assert.doesNotMatch(result.summary, /<p>/);
  assert.equal(result.sourceUrl, "https://example.com/job");
});
