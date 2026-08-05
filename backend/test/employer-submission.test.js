import test from "node:test";
import assert from "node:assert/strict";
import { submitToEmployer } from "../src/employer-submission.js";

const application = { id: "app-1", source: "Greenhouse", jobExternalId: "job-1", answers: {} };

test("keeps unsupported providers in needs_action", async () => {
  delete process.env.EMPLOYER_SUBMISSION_ENDPOINT;
  delete process.env.EMPLOYER_SUBMISSION_SOURCES;
  const result = await submitToEmployer(application);
  assert.equal(result.outcome, "needs_action");
  assert.match(result.detail, /No authorized submission provider/);
});

test("requires a verifiable receipt before submitted", async (context) => {
  process.env.EMPLOYER_SUBMISSION_ENDPOINT = "https://provider.example/submit";
  process.env.EMPLOYER_SUBMISSION_SOURCES = "greenhouse";
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
    delete process.env.EMPLOYER_SUBMISSION_ENDPOINT;
    delete process.env.EMPLOYER_SUBMISSION_SOURCES;
  });
  globalThis.fetch = async () => new Response(JSON.stringify({ accepted: true }), { status: 200 });
  assert.equal((await submitToEmployer(application)).outcome, "needs_action");

  globalThis.fetch = async () => new Response(JSON.stringify({ receiptId: "receipt-123", provider: "partner" }), { status: 200 });
  const result = await submitToEmployer(application);
  assert.deepEqual(result, { outcome: "submitted", receiptId: "receipt-123", provider: "partner" });
});

test("throws transient provider failures for Service Bus retry", async (context) => {
  process.env.EMPLOYER_SUBMISSION_ENDPOINT = "https://provider.example/submit";
  process.env.EMPLOYER_SUBMISSION_SOURCES = "greenhouse";
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
    delete process.env.EMPLOYER_SUBMISSION_ENDPOINT;
    delete process.env.EMPLOYER_SUBMISSION_SOURCES;
  });
  globalThis.fetch = async () => new Response("unavailable", { status: 503 });
  await assert.rejects(() => submitToEmployer(application), /temporarily failed/);
});
