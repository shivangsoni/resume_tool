import { normalizeGreenhouseJob } from "../normalize.js";

const DEFAULT_BOARDS = [
  { token: "stripe", company: "Stripe" },
  { token: "cloudflare", company: "Cloudflare" },
  { token: "figma", company: "Figma" },
  { token: "airbnb", company: "Airbnb" },
];

export function configuredBoards(value = process.env.GREENHOUSE_BOARDS) {
  if (!value) return DEFAULT_BOARDS;
  return value.split(",").map((entry) => {
    const [token, company] = entry.trim().split(":");
    return { token, company: company || token };
  }).filter((board) => /^[a-zA-Z0-9_-]+$/.test(board.token));
}

export async function fetchGreenhouseJobs({ signal } = {}) {
  const results = await Promise.allSettled(configuredBoards().map(async (board) => {
    const url = `https://boards-api.greenhouse.io/v1/boards/${board.token}/jobs?content=true`;
    const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "ApplyPilot/1.0" }, signal });
    if (!response.ok) throw new Error(`${board.token} returned ${response.status}`);
    const payload = await response.json();
    return (payload.jobs || []).map((job) => normalizeGreenhouseJob(job, board));
  }));
  return results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
}
