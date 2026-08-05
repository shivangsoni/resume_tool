import test from "node:test";
import assert from "node:assert/strict";
import { sendApplicationQueuedEmail } from "../src/notifications.js";

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
