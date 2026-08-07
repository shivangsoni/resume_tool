import test from "node:test";
import assert from "node:assert/strict";
import { normalizeGreenhouseJob, normalizeJob, resolveCompanyLogoUrl } from "../src/normalize.js";

test("normalizes an upstream job without leaking HTML", () => {
  const result = normalizeJob({ id: 7, title: "React Developer", company_name: "Acme", description: "<p>Build with React &amp; TypeScript</p>", category: "Software Development", job_type: "full_time", candidate_required_location: "USA", publication_date: new Date().toISOString(), url: "https://example.com/job" });
  assert.equal(result.id, 7);
  assert.equal(result.remote, true);
  assert.match(result.summary, /React & TypeScript/);
  assert.doesNotMatch(result.summary, /<p>/);
  assert.equal(result.sourceUrl, "https://example.com/job");
  assert.ok(result.logoUrl);
});

test("normalizes a current Greenhouse job with provenance", () => {
  const result = normalizeGreenhouseJob({ id: 42, title: "Senior Product Manager", content: "&lt;h2&gt;About us&lt;/h2&gt;&lt;p&gt;Build products with SQL &amp;amp; Azure&lt;/p&gt;", location: { name: "Remote - US" }, updated_at: "2026-08-04T20:00:00Z", absolute_url: "https://boards.greenhouse.io/acme/jobs/42" }, { token: "acme", company: "Acme" });
  assert.equal(result.source, "Greenhouse");
  assert.equal(result.company, "Acme");
  assert.equal(result.remote, true);
  assert.equal(result.sourceUrl, "https://boards.greenhouse.io/acme/jobs/42");
  assert.match(result.summary, /About us Build products with SQL & Azure/);
  assert.doesNotMatch(result.summary, /&lt;|<h2>/);
  assert.match(String(result.logoUrl), /acme\.com/);
});

test("resolveCompanyLogoUrl maps known boards", () => {
  assert.match(String(resolveCompanyLogoUrl({ company: "Stripe", sourceBoard: "stripe" })), /stripe\.com/);
  assert.equal(resolveCompanyLogoUrl({ logoUrl: "https://cdn.example/a.png" }), "https://cdn.example/a.png");
});
