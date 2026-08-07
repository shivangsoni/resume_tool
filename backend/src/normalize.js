const decodeEntities = (value = "") => value
  .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&");
const stripHtml = (html = "") => decodeEntities(decodeEntities(html).replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
const titleCase = (value = "") => value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const hash = (value) => [...String(value)].reduce((sum, char) => ((sum << 5) - sum + char.charCodeAt(0)) | 0, 0);

const COMPANY_DOMAINS = {
  stripe: "stripe.com",
  cloudflare: "cloudflare.com",
  figma: "figma.com",
  airbnb: "airbnb.com",
  databricks: "databricks.com",
  google: "google.com",
  meta: "meta.com",
  amazon: "amazon.com",
  microsoft: "microsoft.com",
  shopify: "shopify.com",
  snowflake: "snowflake.com",
  openai: "openai.com",
  nvidia: "nvidia.com",
  adobe: "adobe.com",
  salesforce: "salesforce.com",
};

const normalizeKey = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "").trim();

export function resolveCompanyLogoUrl({ logoUrl, company, sourceUrl, sourceBoard } = {}) {
  const explicit = String(logoUrl || "").trim();
  if (explicit) return explicit;
  const board = normalizeKey(sourceBoard || "");
  let domain = (board && COMPANY_DOMAINS[board]) || "";
  if (!domain) {
    const companyKey = normalizeKey(company || "");
    domain = COMPANY_DOMAINS[companyKey] || "";
    if (!domain) {
      for (const [key, value] of Object.entries(COMPANY_DOMAINS)) {
        if (companyKey.startsWith(key) || companyKey.includes(key)) {
          domain = value;
          break;
        }
      }
    }
  }
  if (!domain && company) {
    const companyKey = normalizeKey(company);
    if (companyKey.length >= 3 && companyKey.length <= 24) domain = `${companyKey}.com`;
  }
  void sourceUrl;
  if (!domain) return undefined;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
}

export function normalizeJob(job) {
  const description = stripHtml(job.description);
  const skills = Array.from(new Set([job.category, ...(description.match(/\b(JavaScript|TypeScript|Python|React|Node|SQL|AWS|Azure|Product Management|Machine Learning|Sales|Marketing)\b/gi) || [])])).filter(Boolean).slice(0, 6);
  const ageDays = Math.max(0, Math.floor((Date.now() - Date.parse(job.publication_date || new Date())) / 86400000));
  const company = job.company_name || "Unknown company";
  return {
    id: Number(job.id),
    company,
    logo: company.slice(0, 1).toUpperCase(),
    logoUrl: resolveCompanyLogoUrl({ logoUrl: job.company_logo, company, sourceUrl: job.url }),
    title: job.title || "Untitled role",
    location: job.candidate_required_location || "Remote",
    posted: ageDays === 0 ? "Today" : `${ageDays}d ago`,
    match: 70 + Math.abs(hash(`${job.title}${job.category}`)) % 27,
    salary: job.salary || "Salary not listed",
    level: titleCase(job.job_type || "Not specified"),
    remote: true,
    status: "ready",
    summary: description.slice(0, 700) || "Open the original listing for full role details.",
    skills: skills.map(titleCase),
    sourceUrl: job.url,
    source: "Remotive",
    postedAt: job.publication_date || new Date().toISOString(),
  };
}

export function normalizeGreenhouseJob(job, board) {
  const description = stripHtml(job.content);
  const company = board.company || board.token;
  const skills = Array.from(new Set(description.match(/\b(JavaScript|TypeScript|Python|React|Node|SQL|AWS|Azure|Product Management|Machine Learning|Sales|Marketing|Kubernetes|Java|C\+\+)\b/gi) || [])).slice(0, 6);
  const postedAt = job.updated_at || new Date().toISOString();
  const ageDays = Math.max(0, Math.floor((Date.now() - Date.parse(postedAt)) / 86400000));
  const sourceUrl = job.absolute_url;
  return {
    id: Math.abs(hash(`greenhouse:${board.token}:${job.id}`)),
    externalId: String(job.id),
    company,
    logo: company.slice(0, 1).toUpperCase(),
    logoUrl: resolveCompanyLogoUrl({ company, sourceUrl, sourceBoard: board.token }),
    title: job.title || "Untitled role",
    location: job.location?.name || "Location not listed",
    posted: ageDays === 0 ? "Today" : `${ageDays}d ago`,
    postedAt,
    match: 70 + Math.abs(hash(`${job.title}${description.slice(0, 250)}`)) % 27,
    salary: "Salary not listed",
    level: /senior|staff|principal|lead/i.test(job.title || "") ? "Senior level" : "Not specified",
    remote: /remote/i.test(job.location?.name || ""),
    status: "ready",
    summary: description.slice(0, 900) || "Open the employer listing for full role details.",
    skills: skills.map(titleCase),
    sourceUrl,
    source: "Greenhouse",
    sourceBoard: board.token,
  };
}
