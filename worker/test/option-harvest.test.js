import test from "node:test";
import assert from "node:assert/strict";
import {
  catalogAnswersForFill,
  schoolSearchTokens,
  cacheCoversSchool,
  fieldKindFromLabel,
} from "../src/option-harvest.js";

test("schoolSearchTokens prefers a short distinctive token for UC Davis", () => {
  assert.deepEqual(
    schoolSearchTokens({ school: "University of California, Davis" }),
    ["Davis"],
  );
});

test("schoolSearchTokens does not dump alphabet letters", () => {
  const tokens = schoolSearchTokens({ school: "Stanford University" });
  assert.ok(tokens.length <= 2);
  assert.ok(!tokens.includes("a"));
  assert.ok(!tokens.includes("m"));
  assert.ok(!tokens.includes("University"));
});

test("cacheCoversSchool detects UC Davis in shared catalog", () => {
  const cached = ["Davis College", "University of California - Davis", "Yale University"];
  assert.equal(cacheCoversSchool(cached, { school: "University of California, Davis" }), true);
  assert.equal(cacheCoversSchool([], { school: "University of California, Davis" }), false);
});

test("fieldKindFromLabel maps school and reside country controls", () => {
  assert.equal(fieldKindFromLabel("School*", "school--0"), "school");
  assert.equal(fieldKindFromLabel("Please select the country where you currently reside.", "question_1"), "reside_country");
  assert.equal(fieldKindFromLabel("Degree", "education_degree"), "degree");
});

test("catalogAnswersForFill mirrors values onto labels", () => {
  const out = catalogAnswersForFill(
    [{ key: "school--0", label: "School*", name: "school--0" }],
    { "school--0": "University of California - Davis" },
  );
  assert.equal(out["School*"], "University of California - Davis");
});
