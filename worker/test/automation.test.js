import test from "node:test";
import assert from "node:assert/strict";
import { knownAnswer } from "../src/automation.js";

test("maps standard employer fields from the saved profile", () => {
  const profile = { firstName: "Shivang", lastName: "Soni", email: "candidate@example.com", linkedin: "https://linkedin.example/me" };
  assert.equal(knownAnswer("First name", profile, {}), "Shivang");
  assert.equal(knownAnswer("Email address", profile, {}), "candidate@example.com");
  assert.equal(knownAnswer("LinkedIn Profile", profile, {}), "https://linkedin.example/me");
});
