import { describe, expect, it } from "vitest";
import { matchesJob } from "./job-filter";

const job = { title: "Senior Platform Engineer", company: "Example", location: "Seattle, WA", summary: "Build cloud services", skills: ["Azure", "TypeScript"], source: "Greenhouse", remote: false, status: "ready" as const };

describe("job filtering", () => {
  it("searches title, company, location, summary, source, and skills with multiple terms", () => {
    expect(matchesJob(job, "azure seattle", "all", "all", "all")).toBe(true);
    expect(matchesJob(job, "python", "all", "all", "all")).toBe(false);
  });
  it("combines status, source, and workplace filters", () => {
    expect(matchesJob(job, "", "ready", "Greenhouse", "onsite")).toBe(true);
    expect(matchesJob(job, "", "applied", "Greenhouse", "onsite")).toBe(false);
    expect(matchesJob(job, "", "ready", "Remotive", "onsite")).toBe(false);
  });
});
