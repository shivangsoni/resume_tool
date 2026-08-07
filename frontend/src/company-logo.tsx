import { useState } from "react";

/** Known career-board tokens / company names → public website domains for logo lookup. */
const COMPANY_DOMAINS: Record<string, string> = {
  stripe: "stripe.com",
  cloudflare: "cloudflare.com",
  figma: "figma.com",
  airbnb: "airbnb.com",
  databricks: "databricks.com",
  google: "google.com",
  meta: "meta.com",
  facebook: "meta.com",
  amazon: "amazon.com",
  microsoft: "microsoft.com",
  apple: "apple.com",
  netflix: "netflix.com",
  uber: "uber.com",
  lyft: "lyft.com",
  shopify: "shopify.com",
  snowflake: "snowflake.com",
  openai: "openai.com",
  anthropic: "anthropic.com",
  nvidia: "nvidia.com",
  adobe: "adobe.com",
  salesforce: "salesforce.com",
  oracle: "oracle.com",
  ibm: "ibm.com",
  intel: "intel.com",
  twitter: "x.com",
  x: "x.com",
};

const normalizeKey = (value: string) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();

/** Prefer an explicit domain; otherwise map company / board token. */
export function companyDomain(input: {
  company?: string;
  sourceUrl?: string;
  sourceBoard?: string;
}) {
  const board = normalizeKey(input.sourceBoard || "");
  if (board && COMPANY_DOMAINS[board]) return COMPANY_DOMAINS[board];

  const companyKey = normalizeKey(input.company || "");
  if (companyKey && COMPANY_DOMAINS[companyKey]) return COMPANY_DOMAINS[companyKey];

  for (const [key, domain] of Object.entries(COMPANY_DOMAINS)) {
    if (companyKey.startsWith(key) || companyKey.includes(key)) return domain;
  }

  try {
    const url = new URL(String(input.sourceUrl || ""));
    const host = url.hostname.toLowerCase();
    if (host && !host.includes("greenhouse.io") && !host.includes("lever.co") && !host.includes("workday.com")) {
      return host.replace(/^www\./, "");
    }
    const forToken = url.searchParams.get("for");
    if (forToken && COMPANY_DOMAINS[normalizeKey(forToken)]) return COMPANY_DOMAINS[normalizeKey(forToken)];
    const pathToken = String(input.sourceUrl || "")
      .split("/")
      .filter(Boolean)
      .find((part) => COMPANY_DOMAINS[normalizeKey(part)]);
    if (pathToken) return COMPANY_DOMAINS[normalizeKey(pathToken)];
  } catch {
    // ignore invalid URLs
  }

  if (companyKey && companyKey.length >= 3 && companyKey.length <= 24) return `${companyKey}.com`;
  return "";
}

/** Public favicon CDN — no API key required. */
export function logoUrlForDomain(domain: string, size = 128) {
  const host = String(domain || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim();
  if (!host) return "";
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=${size}`;
}

export function resolveCompanyLogoUrl(input: {
  logoUrl?: string;
  company?: string;
  sourceUrl?: string;
  sourceBoard?: string;
}) {
  const explicit = String(input.logoUrl || "").trim();
  if (explicit) return explicit;
  const domain = companyDomain(input);
  return domain ? logoUrlForDomain(domain) : "";
}

export function companyInitial(company: string) {
  const text = String(company || "?").trim();
  return (text.slice(0, 1) || "?").toUpperCase();
}

type LogoJob = {
  company: string;
  logo?: string;
  logoUrl?: string;
  sourceUrl?: string;
  sourceBoard?: string;
};

/** Company mark with image fallback to initials when the CDN/image fails. */
export function CompanyLogo({
  job,
  className = "job-logo",
}: {
  job: LogoJob;
  className?: string;
}) {
  const src = resolveCompanyLogoUrl(job);
  const initial = job.logo || companyInitial(job.company);
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return <span className={className} aria-hidden>{initial}</span>;
  }

  return (
    <span className={className} aria-hidden>
      <img
        src={src}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    </span>
  );
}
