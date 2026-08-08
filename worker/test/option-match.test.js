import test from "node:test";
import assert from "node:assert/strict";
import { matchWithConfidence, resolveCatalogAnswers } from "../src/option-match.js";
import { matchOptionLabel, knownAnswer, lookupAnswer } from "../src/automation.js";
import { catalogAnswersForFill } from "../src/option-harvest.js";
import { allowlistGptAnswers, rankOptionsForPrompt, matchOptionsWithGpt } from "../src/openai-match.js";

test("matchWithConfidence prefers exact and alias hits", () => {
  assert.deepEqual(
    matchWithConfidence(["Australia", "US", "UK"], "US", matchOptionLabel),
    { choice: "US", confidence: "high" },
  );
  assert.equal(
    matchWithConfidence(
      ["University of California - Davis", "Davis College"],
      "Davis",
      matchOptionLabel,
    ).choice,
    "University of California - Davis",
  );
});

test("resolveCatalogAnswers fills high-confidence selects without GPT", async () => {
  const catalog = [
    {
      key: "question_reside",
      label: "Please select the country where you currently reside.",
      type: "select",
      options: ["Australia", "US", "UK"],
      required: true,
    },
    {
      key: "school--0",
      label: "School",
      type: "select",
      options: ["Davis College", "University of California - Davis"],
      required: true,
    },
  ];
  const profile = { country: "United States", school: "University of California, Davis" };
  const { answers } = await resolveCatalogAnswers({
    catalog,
    profile,
    answers: {},
    knownAnswer,
    lookupAnswer,
    matchOptionLabel,
    useGpt: false,
  });
  assert.equal(answers.question_reside, "US");
  assert.equal(answers["school--0"], "University of California - Davis");
});

test("catalogAnswersForFill mirrors values onto labels", () => {
  const out = catalogAnswersForFill(
    [{ key: "school--0", label: "School*", name: "school--0" }],
    { "school--0": "University of California - Davis" },
  );
  assert.equal(out["School*"], "University of California - Davis");
});

test("allowlistGptAnswers rejects invented options", () => {
  const fields = [{ key: "q1", options: ["Yes", "No"] }];
  assert.deepEqual(allowlistGptAnswers({ q1: "Maybe", q2: "Yes" }, fields), {});
  assert.deepEqual(allowlistGptAnswers({ q1: "No" }, fields), { q1: "No" });
});

test("rankOptionsForPrompt keeps relevant school near the top", () => {
  const options = [
    "Aalto University",
    "Yale University",
    "University of California - Davis",
    "Z University",
  ];
  while (options.length < 90) options.push(`School ${options.length}`);
  const ranked = rankOptionsForPrompt(options, ["University of California, Davis"], 80);
  assert.ok(ranked.includes("University of California - Davis"));
  assert.equal(ranked.length, 80);
});

test("matchOptionsWithGpt allowlists mocked HTTP responses", async () => {
  const prevEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const prevDeployment = process.env.AZURE_OPENAI_DEPLOYMENT;
  process.env.AZURE_OPENAI_ENDPOINT = "https://example.openai.azure.com";
  process.env.AZURE_OPENAI_DEPLOYMENT = "gpt-5-mini";
  try {
    const fields = [{ key: "q1", label: "Opt in?", options: ["Yes", "No"] }];
    const rejected = await matchOptionsWithGpt({
      profile: { country: "US" },
      fields,
      getAccessToken: async () => "test-token",
      fetchImpl: async () => ({
        ok: true,
        async json() {
          return { choices: [{ message: { content: JSON.stringify({ q1: "Maybe" }) } }] };
        },
      }),
    });
    assert.deepEqual(rejected, {});

    const accepted = await matchOptionsWithGpt({
      profile: { country: "US" },
      fields,
      getAccessToken: async () => "test-token",
      fetchImpl: async () => ({
        ok: true,
        async json() {
          return { choices: [{ message: { content: JSON.stringify({ q1: "No" }) } }] };
        },
      }),
    });
    assert.deepEqual(accepted, { q1: "No" });
  } finally {
    if (prevEndpoint == null) delete process.env.AZURE_OPENAI_ENDPOINT;
    else process.env.AZURE_OPENAI_ENDPOINT = prevEndpoint;
    if (prevDeployment == null) delete process.env.AZURE_OPENAI_DEPLOYMENT;
    else process.env.AZURE_OPENAI_DEPLOYMENT = prevDeployment;
  }
});
