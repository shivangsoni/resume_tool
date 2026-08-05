import { fetchGreenhouseJobs } from "./greenhouse.js";
import { fetchRemotiveJobs } from "./remotive.js";

export async function fetchLatestJobs() {
  const signal = AbortSignal.timeout(15000);
  const results = await Promise.allSettled([fetchGreenhouseJobs({ signal }), fetchRemotiveJobs({ signal })]);
  const jobs = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  const unique = new Map();
  for (const job of jobs) {
    const key = `${job.company}|${job.title}|${job.location}`.toLowerCase();
    if (!unique.has(key)) unique.set(key, job);
  }
  return [...unique.values()].sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt));
}
