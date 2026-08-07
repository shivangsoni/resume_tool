import test from "node:test";
import assert from "node:assert/strict";
import { extractProfileFromText } from "../src/document-intelligence.js";

test("extracts safe profile suggestions from resume text", () => {
  const profile = extractProfileFromText(`Shivang Soni
Seattle, WA, United States
shivang@example.com | (425) 555-1212
linkedin.com/in/shivang-soni
github.com/shivang
https://shivang.dev
Bachelor's degree in Computer Science.
Senior developer using React, TypeScript, Node.js, Azure and SQL.`);
  assert.equal(profile.firstName, "Shivang");
  assert.equal(profile.lastName, "Soni");
  assert.equal(profile.email, "shivang@example.com");
  assert.equal(profile.phone, "(425) 555-1212");
  assert.equal(profile.linkedin, "https://linkedin.com/in/shivang-soni");
  assert.equal(profile.github, "https://github.com/shivang");
  assert.equal(profile.portfolio, "https://shivang.dev");
  assert.equal(profile.skills, "Azure, Node.js, React, SQL, TypeScript");
  assert.equal(profile.city, "Seattle");
  assert.equal(profile.state, "WA");
  assert.equal(profile.country, "United States");
  assert.equal(profile.educationLevel, "Bachelor's");
});

test("extracts school employer and job title from structured resume sections", () => {
  const profile = extractProfileFromText(`Jane Doe
Redmond, WA, United States
jane@example.com

Experience
Contoso Technologies
Senior Software Engineer
Jan 2020 - Present
Built cloud platforms with React and TypeScript.

Education
University of Washington
Bachelor's degree in Computer Science
`);
  assert.equal(profile.school, "University of Washington");
  assert.equal(profile.currentEmployer, "Contoso Technologies");
  assert.equal(profile.currentJobTitle, "Senior Software Engineer");
  assert.equal(profile.educationLevel, "Bachelor's");
});

test("extracts title at company experience lines", () => {
  const profile = extractProfileFromText(`Alex Rivera
Experience
Staff Engineer at Fabrikam Inc.
2021 - Present
Education
Massachusetts Institute of Technology
`);
  assert.equal(profile.currentJobTitle, "Staff Engineer");
  assert.equal(profile.currentEmployer, "Fabrikam Inc.");
  assert.equal(profile.school, "Massachusetts Institute of Technology");
});
