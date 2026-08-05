import { normalizeJob } from "../normalize.js";

export async function fetchRemotiveJobs({ signal } = {}) {
  const response = await fetch("https://remotive.com/api/remote-jobs?limit=100", { headers: { Accept: "application/json", "User-Agent": "ApplyPilot/1.0" }, signal });
  if (!response.ok) throw new Error(`Remotive returned ${response.status}`);
  const payload = await response.json();
  return (payload.jobs || []).map(normalizeJob);
}
