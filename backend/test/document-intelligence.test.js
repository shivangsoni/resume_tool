import test from "node:test";
import assert from "node:assert/strict";
import { extractProfileFromText } from "../src/document-intelligence.js";

test("extracts safe profile suggestions from resume text", () => {
  const profile = extractProfileFromText(`Shivang Soni
shivang@example.com | (425) 555-1212
linkedin.com/in/shivang-soni
https://shivang.dev
Senior developer using React, TypeScript, Node.js, Azure and SQL.`);
  assert.deepEqual(profile, {
    firstName: "Shivang", lastName: "Soni", email: "shivang@example.com",
    phone: "(425) 555-1212", linkedin: "https://linkedin.com/in/shivang-soni",
    portfolio: "https://shivang.dev", skills: "Azure, Node.js, React, SQL, TypeScript",
  });
});
