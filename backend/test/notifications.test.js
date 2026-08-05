import test from "node:test";
import assert from "node:assert/strict";
import { applicationQueuedContent, sendApplicationQueuedEmail } from "../src/notifications.js";

test("marks every non-production notification as TEST", () => {
  const content = applicationQueuedContent({ title: "Engineer", company: "Acme", location: "Seattle" }, "nonproduction");
  assert.match(content.subject, /^\[TEST\]/);
  assert.match(content.plainText, /^TEST/);
});

test("does not mark production notifications as TEST", () => {
  const content = applicationQueuedContent({ title: "Engineer", company: "Acme" }, "production");
  assert.doesNotMatch(content.subject, /TEST/);
});

test("does not attempt delivery without a configured endpoint or valid identity email", async () => {
  const endpoint = process.env.EMAIL_COMMUNICATION_ENDPOINT;
  const sender = process.env.EMAIL_SENDER_ADDRESS;
  delete process.env.EMAIL_COMMUNICATION_ENDPOINT;
  delete process.env.EMAIL_SENDER_ADDRESS;
  try {
    const result = await sendApplicationQueuedEmail({ email: "invalid" }, { title: "Engineer", company: "Acme" });
    assert.equal(result.sent, false);
  } finally {
    if (endpoint) process.env.EMAIL_COMMUNICATION_ENDPOINT = endpoint;
    if (sender) process.env.EMAIL_SENDER_ADDRESS = sender;
  }
});
