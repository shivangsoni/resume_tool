/** Resolve a browser-ready employer application URL (Greenhouse embeds, etc.). */
export function resolveEmployerApplicationUrl(input: {
  sourceUrl?: string | null;
  company?: string | null;
  source?: string | null;
  jobExternalId?: string | null;
}): string {
  const sourceUrl = String(input.sourceUrl || "").trim();
  if (!sourceUrl) return "";
  try {
    const url = new URL(sourceUrl);
    const host = url.hostname.toLowerCase();
    const jid = url.searchParams.get("gh_jid") || String(input.jobExternalId || "").trim() || url.pathname.match(/\/jobs\/(\d+)/)?.[1] || "";
    const board = guessGreenhouseBoard(input);
    if (jid && board && (host.includes("greenhouse.io") || host.includes(board) || /stripe|cloudflare|figma|airbnb/i.test(host))) {
      return `https://boards.greenhouse.io/embed/job_app?for=${encodeURIComponent(board)}&token=${encodeURIComponent(jid)}`;
    }
  } catch {
    // Fall through to the original listing URL.
  }
  return sourceUrl;
}

function guessGreenhouseBoard(input: { company?: string | null; source?: string | null; sourceUrl?: string | null }) {
  const company = String(input.company || "").toLowerCase();
  if (company.includes("stripe")) return "stripe";
  if (company.includes("cloudflare")) return "cloudflare";
  if (company.includes("figma")) return "figma";
  if (company.includes("airbnb")) return "airbnb";
  const source = String(input.source || "").toLowerCase();
  if (source.includes("greenhouse")) {
    try {
      const url = new URL(String(input.sourceUrl || ""));
      const token = url.searchParams.get("for") || url.pathname.split("/").filter(Boolean)[0];
      if (token && /^[a-z0-9_-]+$/i.test(token) && !["embed", "jobs", "job", "boards", "job-boards"].includes(token)) return token;
    } catch { /* ignore */ }
  }
  return "";
}
