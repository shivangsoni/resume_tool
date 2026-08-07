import test from "node:test";
import assert from "node:assert/strict";
import {
  knownAnswer,
  questionKey,
  groupQuestionKey,
  compactLabel,
  humanizeFieldName,
  resolveApplicationUrl,
  parseMultiselectAnswer,
  optionMatchesTokens,
  resolveMultiselectSelections,
  matchOptionLabel,
} from "../src/automation.js";

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

test("groupQuestionKey is stable for shared checkbox names", () => {
  assert.equal(groupQuestionKey("job_application[answers][countries][]", "Select countries", 12), groupQuestionKey("job_application[answers][countries][]", "Select countries", 12));
  assert.match(groupQuestionKey("countries", "Locations", 3), /__g3$/);
});

test("compactLabel trims oversized label text", () => {
  const long = `Country ${"option ".repeat(40)}`;
  assert.ok(compactLabel(long).length <= 120);
  assert.equal(compactLabel("Country"), "Country");
});

test("knownAnswer still matches when label text is noisy", () => {
  const profile = { country: "United States", workAuthorization: "Citizen", sponsorship: "No", skills: "React, TypeScript", educationLevel: "Bachelor's" };
  assert.equal(knownAnswer("Country United States Canada Mexico", profile, {}), "United States");
  assert.equal(knownAnswer("Are you authorized to work in the US?", profile, {}), "Citizen");
  assert.equal(knownAnswer("Relevant skills", profile, {}), "React, TypeScript");
  assert.equal(knownAnswer("Highest education", profile, {}), "Bachelor's");
});

test("knownAnswer prefers authorization over incidental location wording", () => {
  const profile = {
    location: "Redmond, WA, United States",
    city: "Redmond",
    state: "WA",
    country: "United States",
    workAuthorization: "Authorized to work",
    sponsorship: "No",
  };
  assert.equal(
    knownAnswer("Are you authorized to work in the location(s) you selected in your previous response?", profile, {}),
    "Authorized to work",
  );
  assert.equal(
    knownAnswer("Will you require Stripe to sponsor you for a work permit now or in the future for the location(s) you selected?", profile, {}),
    "No",
  );
  assert.equal(knownAnswer("Where do you plan to work from?", profile, {}), "Redmond, WA, United States");
});

test("multiselect helpers pick country options from profile and answers", () => {
  const options = ["Australia", "Brazil", "Canada", "United States", "Germany"];
  assert.deepEqual(parseMultiselectAnswer("United States, Canada"), ["United States", "Canada"]);
  assert.deepEqual(parseMultiselectAnswer('["United States","Canada"]'), ["United States", "Canada"]);
  assert.ok(optionMatchesTokens("United States", ["US"]));
  assert.deepEqual(
    resolveMultiselectSelections(options, "", { country: "United States", preferredLocations: "Canada" }),
    ["Canada", "United States"],
  );
  assert.deepEqual(
    resolveMultiselectSelections(options, "Germany", { country: "United States" }),
    ["Germany"],
  );
});

test("matchOptionLabel fuzzy-matches radio answers", () => {
  const options = ["Yes", "No", "Not sure"];
  assert.equal(matchOptionLabel(options, "No"), "No");
  assert.equal(matchOptionLabel(options, "not sure"), "Not sure");
  assert.equal(matchOptionLabel(["Authorized to work", "Need sponsorship"], "Authorized to work"), "Authorized to work");
});

test("humanizeFieldName turns Greenhouse-style names into labels", () => {
  assert.equal(humanizeFieldName("job_application[first_name]"), "First Name");
  assert.equal(humanizeFieldName("candidate.email"), "Email");
  assert.equal(humanizeFieldName(""), "");
});

test("resolveApplicationUrl rewrites Stripe search deep-links to Greenhouse embeds", () => {
  const url = resolveApplicationUrl({
    company: "Stripe",
    source: "Greenhouse",
    sourceUrl: "https://stripe.com/jobs/search?gh_jid=7277110",
  });
  assert.equal(url, "https://boards.greenhouse.io/embed/job_app?for=stripe&token=7277110");
});

test("resolveApplicationUrl leaves unrelated listings unchanged", () => {
  const sourceUrl = "https://example.com/jobs/123";
  assert.equal(resolveApplicationUrl({ company: "Acme", sourceUrl }), sourceUrl);
});

test("pageHasBlockingCaptcha is exported for worker use", async () => {
  const { pageHasBlockingCaptcha } = await import("../src/automation.js");
  assert.equal(typeof pageHasBlockingCaptcha, "function");
});
