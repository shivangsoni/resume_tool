import { describe, expect, it } from "vitest";
import { matchesJob, paginateJobs } from "./job-filter";

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
    expect(matchesJob(job, "", "ready", "Greenhouse", "onsite", "Seattle")).toBe(true);
    expect(matchesJob(job, "", "ready", "Greenhouse", "onsite", "Boston")).toBe(false);
  });
});

it("paginates jobs ten at a time and clamps invalid pages", () => {
  const jobs = Array.from({ length: 23 }, (_, index) => index + 1);
  expect(paginateJobs(jobs, 1).jobs).toHaveLength(10);
  expect(paginateJobs(jobs, 3)).toEqual({ page: 3, pageCount: 3, jobs: [21, 22, 23] });
  expect(paginateJobs(jobs, 99).page).toBe(3);
});
