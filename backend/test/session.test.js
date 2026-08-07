import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, issueSessionToken, verifyPassword, verifySessionToken } from "../src/session.js";
import { getPrincipal } from "../src/identity.js";

test("reads a trusted Static Web Apps principal", () => {
  const encoded = Buffer.from(JSON.stringify({ userId: "abc-123", userDetails: "person@example.com", userRoles: ["authenticated"] })).toString("base64");
  const request = { headers: new Headers({ "x-ms-client-principal": encoded }) };
  assert.deepEqual(getPrincipal(request), { subject: "abc-123", email: "person@example.com", roles: ["authenticated"] });
});

test("rejects malformed identity headers", () => {
  assert.equal(getPrincipal({ headers: new Headers({ "x-ms-client-principal": "not-json" }) }), null);
});

test("password hashing round-trips", () => {
  const stored = hashPassword("correct horse battery");
  assert.equal(verifyPassword("correct horse battery", stored), true);
  assert.equal(verifyPassword("wrong-password", stored), false);
});

test("session tokens verify and expire fields", () => {
  process.env.AUTH_SESSION_SECRET = "test-secret";
  const token = issueSessionToken({ subject: "password:alice", email: "a@example.com", username: "alice" });
  const session = verifySessionToken(token);
  assert.equal(session?.subject, "password:alice");
  assert.equal(session?.email, "a@example.com");
  assert.ok(getPrincipal({ headers: new Headers({ Authorization: `Bearer ${token}` }) }));
});
