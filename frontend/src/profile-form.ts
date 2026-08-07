/** Profile form helpers: countries, US states, work locations, employment chips. */

export const PROFILE_COUNTRIES = [
  "United States",
  "Canada",
  "United Kingdom",
  "Australia",
  "Germany",
  "France",
  "Ireland",
  "India",
  "Singapore",
  "Netherlands",
  "Brazil",
  "Mexico",
  "Japan",
  "South Korea",
  "Spain",
  "Italy",
  "Sweden",
  "Switzerland",
  "New Zealand",
  "Other",
] as const;

export const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut",
  "Delaware", "District of Columbia", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois",
  "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts",
  "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada",
  "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota",
  "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
  "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia",
  "Wisconsin", "Wyoming",
] as const;

export const WORKPLACE_TYPES = ["Remote", "Hybrid", "On-site"] as const;
export type WorkplaceType = (typeof WORKPLACE_TYPES)[number];

export const EMPLOYMENT_TYPE_OPTIONS = [
  "Full-Time",
  "Part-Time",
  "Contract",
  "Freelance",
  "Internship",
] as const;

export const EXPERIENCE_LEVEL_OPTIONS = ["Entry", "Mid", "Senior", "Executive"] as const;

export const EXPERIENCE_YEARS_OPTIONS = [
  "0-1 years",
  "1-3 years",
  "3-5 years",
  "5-8 years",
  "8+ years",
] as const;

export type WorkLocationCard = {
  workplaceTypes: WorkplaceType[];
  country: string;
  state?: string;
  city?: string;
  radiusMiles?: number;
};

export function isUnitedStates(country: string) {
  return /^(united states|usa|us|u\.s\.a?\.?)$/i.test(String(country || "").trim());
}

export function parseListField(value: string) {
  return String(value || "")
    .split(/[,;\n|]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function serializeListField(items: string[]) {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))].join(", ");
}

export function toggleListItem(value: string, item: string, checked: boolean) {
  const current = parseListField(value);
  const next = checked
    ? [...new Set([...current, item])]
    : current.filter((entry) => entry.toLowerCase() !== item.toLowerCase());
  return serializeListField(next);
}

export function listFieldHas(value: string, item: string) {
  return parseListField(value).some((entry) => entry.toLowerCase() === item.toLowerCase());
}

/** Parse preferredLocations JSON array or legacy free text into cards. */
export function parseWorkLocations(value: string): WorkLocationCard[] {
  const raw = String(value || "").trim();
  if (!raw) return [];
  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => normalizeWorkLocationCard(item))
          .filter((card): card is WorkLocationCard => Boolean(card));
      }
    } catch {
      /* fall through */
    }
  }
  // Legacy free text → one Remote card using the text as country/city hint.
  return [{
    workplaceTypes: ["Remote"],
    country: raw.includes(",") ? raw.split(",").pop()!.trim() : raw,
    city: raw.includes(",") ? raw.split(",")[0].trim() : undefined,
  }];
}

function normalizeWorkLocationCard(item: unknown): WorkLocationCard | null {
  if (!item || typeof item !== "object") return null;
  const row = item as Record<string, unknown>;
  const types = Array.isArray(row.workplaceTypes)
    ? row.workplaceTypes.map((type) => String(type)).filter((type): type is WorkplaceType =>
      (WORKPLACE_TYPES as readonly string[]).includes(type))
    : [];
  const country = String(row.country || "").trim();
  if (!country && !types.length) return null;
  const radius = Number(row.radiusMiles);
  return {
    workplaceTypes: types.length ? types : ["Remote"],
    country: country || "United States",
    state: String(row.state || "").trim() || undefined,
    city: String(row.city || "").trim() || undefined,
    radiusMiles: Number.isFinite(radius) && radius > 0 ? radius : undefined,
  };
}

export function serializeWorkLocations(cards: WorkLocationCard[]) {
  const cleaned = cards
    .map((card) => ({
      workplaceTypes: card.workplaceTypes.length ? card.workplaceTypes : (["Remote"] as WorkplaceType[]),
      country: String(card.country || "").trim(),
      state: String(card.state || "").trim() || undefined,
      city: String(card.city || "").trim() || undefined,
      radiusMiles: card.radiusMiles && card.radiusMiles > 0 ? card.radiusMiles : undefined,
    }))
    .filter((card) => card.country);
  return cleaned.length ? JSON.stringify(cleaned) : "";
}

export function summarizeWorkLocation(card: WorkLocationCard) {
  const types = card.workplaceTypes.length ? card.workplaceTypes.join(" + ") : "Remote";
  const place = [card.city, card.state, card.country].filter(Boolean).join(", ");
  const radius = card.radiusMiles ? ` (${card.radiusMiles}mi)` : "";
  return `${types} — ${place || "Anywhere"}${radius}`;
}

export function flattenWorkLocationsForWorker(cards: WorkLocationCard[]) {
  const tokens: string[] = [];
  for (const card of cards) {
    tokens.push(...card.workplaceTypes);
    if (card.country) tokens.push(card.country);
    if (card.state) tokens.push(card.state);
    if (card.city) tokens.push(card.city);
  }
  return [...new Set(tokens)].join(", ");
}

export function emptyWorkLocation(country = "United States"): WorkLocationCard {
  return { workplaceTypes: ["Remote"], country };
}

/** Sync residence into a concise location string for worker city fills. */
export function residenceLocationString(profile: {
  city?: string;
  state?: string;
  country?: string;
}) {
  return [profile.city, profile.state, profile.country].filter(Boolean).join(", ");
}
