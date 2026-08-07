import test from "node:test";
import assert from "node:assert/strict";
import {
  knownAnswer,
  questionKey,
  groupQuestionKey,
  compactLabel,
  humanizeFieldName,
  isUselessLabel,
  lookupAnswer,
  answerKeyBase,
  resolveApplicationUrl,
  parseMultiselectAnswer,
  optionMatchesTokens,
  preferredLocationTokens,
  multiselectTokensFromProfile,
  resolveMultiselectSelections,
  matchOptionLabel,
  choiceOptionLabels,
  isBooleanChoiceLabel,
  isCheckboxGroupName,
  formatLocationQuery,
  expandLocationStates,
  findBestLocationOption,
  looksLikePlaceString,
  dedupeMissingQuestions,
  isLocationAutocompleteLabel,
  isPhoneFieldLabel,
  pageHasBlockingCaptcha,
} from "../src/automation.js";

test("maps standard employer fields from the saved profile", () => {
  const profile = { firstName: "Shivang", lastName: "Soni", email: "candidate@example.com", linkedin: "https://linkedin.example/me" };
  assert.equal(knownAnswer("First name", profile, {}), "Shivang");
  assert.equal(knownAnswer("Email address", profile, {}), "candidate@example.com");
  assert.equal(knownAnswer("LinkedIn Profile", profile, {}), "https://linkedin.example/me");
});

test("isUselessLabel rejects select placeholders and greenhouse generic leaves", () => {
  assert.equal(isUselessLabel("Select..."), true);
  assert.equal(isUselessLabel("Select"), true);
  assert.equal(isUselessLabel("Please select"), true);
  assert.equal(isUselessLabel("Choose one"), true);
  assert.equal(isUselessLabel("Questionnaire Field"), true);
  assert.equal(isUselessLabel("Boolean Value"), true);
  assert.equal(isUselessLabel("Text"), true);
  assert.equal(isUselessLabel("Answers"), true);
  assert.equal(isUselessLabel("Country"), false);
  assert.equal(isUselessLabel("Do you plan to work remotely?"), false);
});

test("humanizeFieldName does not surface questionnaire_field as a label", () => {
  assert.equal(humanizeFieldName("job_application[answers][questionnaire_field]"), "");
  assert.equal(humanizeFieldName("job_application[answers][123][boolean_value]"), "");
  assert.equal(humanizeFieldName("job_application[first_name]"), "First Name");
});

test("lookupAnswer recovers answers when DOM index suffix shifts", () => {
  const answers = {
    "job_application[answers][99][text]__10": "Master's",
    "job_application[first_name]__3": "Shivang",
  };
  assert.equal(
    lookupAnswer(answers, {
      key: "job_application[answers][99][text]__12",
      name: "job_application[answers][99][text]",
      label: "Degree",
    }, {}),
    "Master's",
  );
  assert.equal(
    lookupAnswer(answers, {
      key: "job_application[first_name]__9",
      name: "job_application[first_name]",
      label: "First name",
    }, {}),
    "Shivang",
  );
  assert.equal(
    lookupAnswer({ phone: "5302048592", city: "Redmond" }, {
      key: "job_application[phone]__4",
      name: "job_application[phone]",
      label: "Phone",
    }, {}),
    "5302048592",
  );
  assert.equal(
    lookupAnswer({ phone: "5302048592", city: "Redmond" }, {
      key: "job_application[location]__5",
      name: "job_application[location]",
      label: "Location (City)",
    }, {}),
    "Redmond",
  );
  assert.equal(answerKeyBase("foo__g3"), "foo");
  assert.equal(answerKeyBase("foo__10_2"), "foo");
});

test("matchOptionLabel maps country aliases onto select options", () => {
  assert.equal(matchOptionLabel(["US", "CA", "MX"], "United States"), "US");
  assert.equal(matchOptionLabel(["United States", "Canada"], "USA"), "United States");
  assert.equal(matchOptionLabel(["United States of America", "Canada"], "US"), "United States of America");
  assert.equal(
    matchOptionLabel(["🇺🇸 United States +1", "🇦🇫 Afghanistan +93"], "United States"),
    "🇺🇸 United States +1",
  );
});

test("formatLocationQuery builds Greenhouse-shaped city strings", () => {
  assert.equal(
    formatLocationQuery("redmond", { city: "redmond", state: "Washington", country: "United States" }),
    "redmond, Washington, United States",
  );
  assert.equal(
    formatLocationQuery("Redmond, Washington, United States", { city: "Redmond", state: "WA", country: "US" }),
    "Redmond, Washington, United States",
  );
  assert.equal(
    formatLocationQuery("Redmond, WA, United States", { city: "Redmond", state: "WA", country: "United States" }),
    "Redmond, Washington, United States",
  );
  assert.equal(
    formatLocationQuery("", { location: "Seattle, Washington, United States", city: "Seattle" }),
    "Seattle, Washington, United States",
  );
  assert.equal(
    formatLocationQuery("", {
      location: "DEEPLEARNING.AI, ANDREW NG Advancements in AI",
      city: "Redmond",
      state: "Washington",
      country: "United States",
    }),
    "Redmond, Washington, United States",
  );
  assert.equal(
    looksLikePlaceString("DEEPLEARNING.AI, ANDREW NG Advancements in AI"),
    false,
  );
  assert.equal(looksLikePlaceString("Redmond, Washington, United States"), true);
  assert.equal(
    findBestLocationOption([
      "Redmond, Oregon, United States",
      "Redmond, Washington, United States",
      "Redmond, Utah, United States",
    ], "Redmond, WA, United States"),
    "Redmond, Washington, United States",
  );
  assert.equal(expandLocationStates("Redmond, WA, United States"), "Redmond, Washington, United States");
});

test("detects Greenhouse location autocomplete and phone field labels", () => {
  assert.equal(isLocationAutocompleteLabel("Location (City)", "job_application[location]"), true);
  assert.equal(isLocationAutocompleteLabel("Phone", "job_application[phone]"), false);
  assert.equal(isLocationAutocompleteLabel("Are you authorized to work in the location(s) you selected?", ""), false);
  assert.equal(isPhoneFieldLabel("Phone", "job_application[phone]"), true);
  assert.equal(isPhoneFieldLabel("Location (City)", "job_application[location]"), false);
  assert.equal(isPhoneFieldLabel("WhatsApp number", "custom_question"), false);
  assert.equal(isPhoneFieldLabel("Phone screen availability", ""), false);
});

test("dedupeMissingQuestions keeps a single Phone row", () => {
  assert.deepEqual(
    dedupeMissingQuestions([
      { key: "phone__1", label: "Phone", type: "phone" },
      { key: "phone__2", label: "Phone", type: "phone" },
      { key: "loc__1", label: "Location (City)", type: "autocomplete" },
      { key: "loc__2", label: "Location (City)", type: "autocomplete" },
    ]),
    [
      { key: "phone__1", label: "Phone", type: "phone" },
      { key: "loc__1", label: "Location (City)", type: "autocomplete" },
    ],
  );
});

test("matchOptionLabel coerces Yes/No onto clear options", () => {
  assert.equal(matchOptionLabel(["Yes", "No"], "yes"), "Yes");
  assert.equal(matchOptionLabel(["No", "Yes"], "true"), "Yes");
  assert.equal(matchOptionLabel(["Yes", "No"], "0"), "No");
  assert.equal(
    matchOptionLabel(["I prefer remote", "I prefer onsite"], "Yes"),
    "",
  );
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
  assert.equal(knownAnswer("Where do you plan to work from?", profile, {}), "Redmond, Washington, United States");
});

test("knownAnswer does not map remote-intent questions to city/location", () => {
  const profile = {
    location: "Redmond, WA, United States",
    city: "Redmond",
    state: "WA",
    country: "United States",
  };
  assert.equal(knownAnswer("Do you plan to work remotely for this role?", profile, {}), "");
  assert.equal(knownAnswer("Is remote work an option for you?", profile, {}), "");
  assert.equal(knownAnswer("Would you consider a hybrid role?", profile, {}), "");
});

test("knownAnswer maps school employer and job title from profile", () => {
  const profile = {
    school: "University of Washington",
    currentEmployer: "Contoso",
    currentJobTitle: "Senior Software Engineer",
  };
  assert.equal(knownAnswer("School / University", profile, {}), "University of Washington");
  assert.equal(knownAnswer("Current employer", profile, {}), "Contoso");
  assert.equal(knownAnswer("Previous job title", profile, {}), "Senior Software Engineer");
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

test("preferredLocations JSON expands into location and remote tokens", () => {
  const preferredLocations = JSON.stringify([
    { workplaceTypes: ["Remote", "Hybrid"], country: "Canada", city: "Toronto" },
    { workplaceTypes: ["On-site"], country: "Germany", city: "Berlin" },
  ]);
  assert.deepEqual(
    preferredLocationTokens(preferredLocations).sort(),
    ["Berlin", "Canada", "Germany", "Hybrid", "On-site", "Remote", "Toronto"].sort(),
  );
  const tokens = multiselectTokensFromProfile({
    country: "United States",
    preferredLocations,
  });
  assert.ok(tokens.includes("Canada"));
  assert.ok(tokens.includes("Remote"));
  assert.ok(!tokens.some((token) => token.includes("workplaceTypes")));
  assert.equal(
    knownAnswer("Do you plan to work remotely for this role?", { preferredLocations }, {}),
    "Yes",
  );
  assert.deepEqual(
    resolveMultiselectSelections(
      ["Australia", "Canada", "Germany", "United States"],
      "",
      { preferredLocations },
    ),
    ["Canada", "Germany"],
  );
});

test("choiceOptionLabels ignores shared country prompt text", () => {
  const prompt = "Please select the country or countries you anticipate working in for the role in which you are applying.";
  const group = [
    { info: { optionLabel: "United States", label: prompt, groupLabel: prompt } },
    { info: { optionLabel: "Canada", label: prompt, groupLabel: prompt } },
    { info: { optionLabel: "", label: prompt, groupLabel: prompt } },
  ];
  assert.deepEqual(choiceOptionLabels(group, prompt), ["United States", "Canada"]);
});

test("country prompts are not treated as boolean checkbox questions", () => {
  assert.equal(isBooleanChoiceLabel("Please select the country where you currently reside."), false);
  assert.equal(isBooleanChoiceLabel("Are you legally authorized to work in the United States?"), true);
  assert.equal(isCheckboxGroupName("question_68165587[]"), true);
  assert.equal(isCheckboxGroupName("agree_terms"), false);
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
