import test from "node:test";
import assert from "node:assert/strict";
import { knownAnswer, questionKey, compactLabel, humanizeFieldName } from "../src/automation.js";

test("maps standard employer fields from the saved profile", () => {
  const profile = { firstName: "Shivang", lastName: "Soni", email: "candidate@example.com", linkedin: "https://linkedin.example/me" };
  assert.equal(knownAnswer("First name", profile, {}), "Shivang");
  assert.equal(knownAnswer("Email address", profile, {}), "candidate@example.com");
  assert.equal(knownAnswer("LinkedIn Profile", profile, {}), "https://linkedin.example/me");
});

test("questionKey stays unique when HTML names collide", () => {
  assert.equal(questionKey("country", "Country", 0), "country__0");
  assert.equal(questionKey("country", "State", 1), "country__1");
  assert.notEqual(questionKey("country", "Country", 0), questionKey("country", "Country", 1));
});

test("compactLabel trims oversized label text", () => {
  const long = `Country ${"option ".repeat(40)}`;
  assert.ok(compactLabel(long).length <= 120);
  assert.equal(compactLabel("Country"), "Country");
});

test("knownAnswer still matches when label text is noisy", () => {
  const profile = { country: "United States", workAuthorization: "Citizen", sponsorship: "No" };
  assert.equal(knownAnswer("Country United States Canada Mexico", profile, {}), "United States");
  assert.equal(knownAnswer("Are you authorized to work in the US?", profile, {}), "Citizen");
});

test("humanizeFieldName turns Greenhouse-style names into labels", () => {
  assert.equal(humanizeFieldName("job_application[first_name]"), "First Name");
  assert.equal(humanizeFieldName("candidate.email"), "Email");
  assert.equal(humanizeFieldName(""), "");
});
