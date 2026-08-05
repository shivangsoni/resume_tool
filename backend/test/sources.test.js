import test from "node:test";
import assert from "node:assert/strict";
import { configuredBoards } from "../src/sources/greenhouse.js";

test("parses and validates configurable Greenhouse boards", () => {
  assert.deepEqual(configuredBoards("stripe:Stripe,bad token:Bad,figma:Figma"), [{ token: "stripe", company: "Stripe" }, { token: "figma", company: "Figma" }]);
});
