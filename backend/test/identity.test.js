import test from "node:test";
import assert from "node:assert/strict";
import { getPrincipal } from "../src/identity.js";

test("reads a trusted Static Web Apps principal", () => {
  const encoded = Buffer.from(JSON.stringify({ userId: "abc-123", userDetails: "person@example.com", userRoles: ["authenticated"] })).toString("base64");
  const request = { headers: new Headers({ "x-ms-client-principal": encoded }) };
  assert.deepEqual(getPrincipal(request), { subject: "abc-123", email: "person@example.com", roles: ["authenticated"] });
});

test("rejects malformed identity headers", () => {
  assert.equal(getPrincipal({ headers: new Headers({ "x-ms-client-principal": "not-json" }) }), null);
});
