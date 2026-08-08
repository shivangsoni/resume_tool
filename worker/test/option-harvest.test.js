import test from "node:test";
import assert from "node:assert/strict";

test("harvest catalog entries expose key, label, type, options", () => {
  const entry = {
    key: "school--0",
    name: "school--0",
    label: "School*",
    type: "select",
    options: ["University of California - Davis", "Davis College"],
    required: true,
    fieldKind: "school",
  };
  assert.equal(typeof entry.key, "string");
  assert.equal(entry.type, "select");
  assert.ok(Array.isArray(entry.options));
  assert.ok(entry.options.includes("University of California - Davis"));
});
