/** Shared helpers for employer question answer keys and select coercion. */

export function answerKeyBase(key: string) {
  return String(key || "").replace(/__(?:g)?\d+(?:_\d+)?$/i, "").trim();
}

export function isUselessQuestionLabel(label: string) {
  const text = String(label || "").replace(/\s+/g, " ").trim();
  if (!text) return true;
  if (/^[\d\W_]+$/.test(text)) return true;
  if (/^(required|\*|optional)$/i.test(text)) return true;
  if (/^(question\s*)?\d+$/i.test(text)) return true;
  if (/^(question\s*\d+\s*)?required(\s*question)?$/i.test(text)) return true;
  if (/^required(\s*question)?(\s*\d+)?$/i.test(text)) return true;
  if (/^(input|field|select|textarea|question)[\d\s_-]*$/i.test(text)) return true;
  if (/^select(\s+\w+)?\.?$|^select\.{0,3}$|^please select\.?$|^choose(\s+one)?\.?$/i.test(text)) return true;
  if (/^select\s*\.{1,3}$/i.test(text)) return true;
  if (/^(questionnaire(\s+field)?|boolean(\s+value)?|text|answer(s)?|value|field)$/i.test(text)) return true;
  return false;
}

export function matchSelectOption(options: string[] | undefined, answer: string) {
  const wanted = String(answer || "").trim();
  const usable = (options || []).map((option) => String(option || "").trim()).filter(Boolean);
  if (!wanted || !usable.length) return "";
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const needle = normalize(wanted);
  const exact = usable.find((option) => normalize(option) === needle);
  if (exact) return exact;
  if (/^(yes|true|y|1|on)$/i.test(wanted)) {
    const yesOpt = usable.find((option) => /^(yes|true|y)\b/i.test(option.trim()) || normalize(option) === "yes");
    if (yesOpt) return yesOpt;
  }
  if (/^(no|false|n|0|off)$/i.test(wanted)) {
    const noOpt = usable.find((option) => /^(no|false|n)\b/i.test(option.trim()) || normalize(option) === "no");
    if (noOpt) return noOpt;
  }
  const COUNTRY_ALIASES: Record<string, string[]> = {
    us: ["united states", "usa", "america"],
    usa: ["united states", "us", "america"],
    "united states": ["us", "usa", "america"],
    "united states of america": ["us", "usa", "united states", "america"],
  };
  const aliasHit = usable.find((option) => {
    const label = normalize(option);
    const labelCompact = label.replace(/\s+/g, "");
    const aliases = COUNTRY_ALIASES[needle] || COUNTRY_ALIASES[needle.replace(/\s+/g, "")] || [];
    if (aliases.some((alias) => {
      const a = normalize(alias);
      return label === a || labelCompact === a.replace(/\s+/g, "") || (a.length >= 4 && label.includes(a));
    })) return true;
    const reverse = COUNTRY_ALIASES[label] || COUNTRY_ALIASES[labelCompact] || [];
    return reverse.some((alias) => normalize(alias) === needle || needle.includes(normalize(alias)));
  });
  if (aliasHit) return aliasHit;
  const includes = usable.find((option) => {
    const label = normalize(option);
    if (!label) return false;
    if (label.includes(needle) || needle.includes(label)) return true;
    const labelCompact = label.replace(/\s+/g, "");
    const needleCompact = needle.replace(/\s+/g, "");
    return Boolean(
      needleCompact
      && labelCompact
      && (labelCompact === needleCompact
        || (needleCompact.length >= 4 && (labelCompact.includes(needleCompact) || needleCompact.includes(labelCompact)))),
    );
  });
  return includes || "";
}

/** Collect candidate keys that may hold a stored answer for this question. */
export function priorAnswerKeys(questionKey: string, remappedKey: string) {
  const keys = new Set<string>();
  for (const key of [remappedKey, questionKey]) {
    const raw = String(key || "").trim();
    if (!raw) continue;
    keys.add(raw);
    const base = answerKeyBase(raw);
    if (base) keys.add(base);
  }
  return [...keys];
}

/** Find a stored answer by exact key or shared base (index may have shifted). */
export function lookupStoredAnswer(stored: Record<string, string>, candidates: string[]) {
  for (const key of candidates) {
    const value = String(stored[key] || "").trim();
    if (value) return value;
  }
  const bases = new Set(candidates.map(answerKeyBase).filter(Boolean));
  for (const [key, value] of Object.entries(stored || {})) {
    if (!bases.has(answerKeyBase(key))) continue;
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
}

export function isBooleanQuestionLabel(label: string) {
  const text = String(label || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!text) return false;
  if (/\b(country|countries|nation|citizenship|select all|which of the following)\b/.test(text)) return false;
  if (/^(do you|are you|have you|will you|can you|did you)\b/.test(text)) return true;
  if (/\b(yes or no|y n)\b/.test(text)) return true;
  if (/\b(opt-?in|whatsapp|agree|accept|acknowledge|authorize|sponsorship|legally authorized|work authorization|remote|hybrid)\b/.test(text)) return true;
  return false;
}

/** Normalize worker question types so country prompts are not rendered as Yes/No. */
export function resolveQuestionInputType(question: { type?: string; label?: string; options?: string[] }) {
  const options = (question.options || []).filter((option) => String(option).trim());
  const type = String(question.type || "text").toLowerCase();
  if (type === "blocking" || type === "textarea" || type === "multiselect" || type === "file") return type;
  if (type === "autocomplete" || type === "phone") return type;
  if (type === "select") {
    if (options.length) return "select";
    // Stripe WhatsApp etc. sometimes arrive as select without scraped options.
    if (isBooleanQuestionLabel(question.label || "")) return "checkbox";
    return "text";
  }
  if (type === "checkbox") {
    if (options.length > 1) return "multiselect";
    if (options.length === 1 || isBooleanQuestionLabel(question.label || "")) return "checkbox";
    return "text";
  }
  // Heuristic: Location (City) without a typed autocomplete still benefits from combobox UX.
  const label = String(question.label || "").toLowerCase();
  if (/\blocation\b/.test(label) && /\bcity\b/.test(label)) return "autocomplete";
  if (/^(phone|mobile|tel)\b/.test(label) || /\bphone\b/.test(label)) return "phone";
  // Free-text "Do you opt-in…?" should still be Yes/No, not a raw text box.
  if (isBooleanQuestionLabel(question.label || "")) return "checkbox";
  return type || "text";
}

const PLACE_COUNTRY_TOKENS = [
  "united states", "usa", "us", "america", "canada", "united kingdom", "uk", "england",
  "australia", "germany", "france", "ireland", "india", "singapore", "netherlands",
  "brazil", "mexico", "japan", "south korea", "spain", "italy", "sweden", "switzerland",
  "new zealand",
];

const US_STATE_BY_ABBREV: Record<string, string> = {
  al: "Alabama", ak: "Alaska", az: "Arizona", ar: "Arkansas", ca: "California",
  co: "Colorado", ct: "Connecticut", de: "Delaware", dc: "District of Columbia",
  fl: "Florida", ga: "Georgia", hi: "Hawaii", id: "Idaho", il: "Illinois",
  in: "Indiana", ia: "Iowa", ks: "Kansas", ky: "Kentucky", la: "Louisiana",
  me: "Maine", md: "Maryland", ma: "Massachusetts", mi: "Michigan", mn: "Minnesota",
  ms: "Mississippi", mo: "Missouri", mt: "Montana", ne: "Nebraska", nv: "Nevada",
  nh: "New Hampshire", nj: "New Jersey", nm: "New Mexico", ny: "New York",
  nc: "North Carolina", nd: "North Dakota", oh: "Ohio", ok: "Oklahoma", or: "Oregon",
  pa: "Pennsylvania", ri: "Rhode Island", sc: "South Carolina", sd: "South Dakota",
  tn: "Tennessee", tx: "Texas", ut: "Utah", vt: "Vermont", va: "Virginia",
  wa: "Washington", wv: "West Virginia", wi: "Wisconsin", wy: "Wyoming",
};

/** Expand "Redmond, WA, United States" → "Redmond, Washington, United States". */
export function expandLocationStates(value: string) {
  const parts = String(value || "").split(",").map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return "";
  return parts.map((part) => {
    if (/^[A-Za-z]{2}$/.test(part)) {
      return US_STATE_BY_ABBREV[part.toLowerCase()] || part;
    }
    return part;
  }).join(", ");
}

/** Reject course titles / brand strings that pollute Location (City). */
export function looksLikePlaceString(
  value: string,
  profile?: { city?: string; state?: string; country?: string },
) {
  const raw = String(value || "").trim();
  if (!raw || raw.length > 120) return false;
  const text = raw.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (/\b(deeplearning|deep learning|coursera|udemy|advancement|certificate|bootcamp|nanodegree|mooc|andrew ng)\b/.test(text)) {
    return false;
  }
  if (/\b\w+\.(ai|io|com|org|net|dev)\b/i.test(raw)) return false;
  const countryHints = [
    ...PLACE_COUNTRY_TOKENS,
    String(profile?.country || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
    String(profile?.state || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
  ].filter(Boolean);
  const hasCountryHint = countryHints.some((hint) => hint.length >= 2 && text.includes(hint));
  const commaParts = raw.split(",").map((part) => part.trim()).filter(Boolean);
  if (commaParts.length >= 2) {
    if (hasCountryHint) return true;
    if (commaParts.length === 2 && /^[A-Za-z]{2}$/.test(commaParts[1])) return true;
    if (raw.length > 48 || commaParts.some((part) => part.split(/\s+/).length > 5)) return false;
    return commaParts.every((part) => part.split(/\s+/).length <= 4);
  }
  return raw.split(/\s+/).length <= 4 && raw.length <= 48;
}

/** Shape a city answer for Greenhouse-style typeaheads. Prefer city/state/country over junk location. */
export function formatLocationAnswer(
  value: string,
  profile?: { city?: string; state?: string; country?: string; location?: string },
) {
  const raw = String(value || "").trim();
  const city = String(profile?.city || "").trim();
  const state = expandLocationStates(String(profile?.state || "").trim()) || String(profile?.state || "").trim();
  const country = String(profile?.country || "").trim();
  const residence = expandLocationStates([city, state, country].filter(Boolean).join(", "));
  const fullResidence = Boolean(city && (state || country));
  const location = String(profile?.location || "").trim();
  const safeLocation = looksLikePlaceString(location, profile) ? expandLocationStates(location) : "";
  const safeRaw = looksLikePlaceString(raw, profile) ? expandLocationStates(raw) : "";
  const norm = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  if (fullResidence) {
    // Keep an already-shaped place answer; don't append state/country again.
    if (safeRaw.includes(",") && safeRaw.split(",").filter((part) => part.trim()).length >= 2) {
      return safeRaw;
    }
    if (!safeRaw || norm(residence).includes(norm(safeRaw)) || (city && norm(safeRaw) === norm(city))) {
      return residence;
    }
    return expandLocationStates([safeRaw, state, country].filter(Boolean).join(", "));
  }

  if (safeRaw.includes(",") && safeRaw.split(",").filter((part) => part.trim()).length >= 2) {
    return safeRaw;
  }
  if (safeLocation && (!safeRaw || norm(safeLocation).includes(norm(safeRaw)))) {
    return safeLocation;
  }

  const cityPart = safeRaw || city;
  if (!cityPart) return safeLocation || residence;
  if (city && cityPart.toLowerCase() === city.toLowerCase()) {
    return residence || cityPart;
  }
  if (state || country) return expandLocationStates([cityPart, state, country].filter(Boolean).join(", "));
  return cityPart;
}

/** Dedupe worker missing questions so users never see two Phone blocks. */
export function dedupeEmployerQuestions<T extends { key?: string; label?: string; type?: string }>(items: T[]) {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const type = resolveQuestionInputType(item);
    const labelNorm = String(item.label || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const soft = `${type}|${labelNorm}`;
    const hard = type === "phone" ? "phone" : soft;
    if (seen.has(hard) || seen.has(soft)) continue;
    seen.add(hard);
    seen.add(soft);
    out.push(item);
  }
  return out;
}


/** Common dial-code countries for Greenhouse phone Country widgets. */
export const PHONE_DIAL_OPTIONS = [
  { country: "United States", dial: "+1" },
  { country: "Canada", dial: "+1" },
  { country: "United Kingdom", dial: "+44" },
  { country: "India", dial: "+91" },
  { country: "Australia", dial: "+61" },
  { country: "Germany", dial: "+49" },
  { country: "France", dial: "+33" },
  { country: "Ireland", dial: "+353" },
  { country: "Singapore", dial: "+65" },
  { country: "Brazil", dial: "+55" },
  { country: "Mexico", dial: "+52" },
  { country: "Japan", dial: "+81" },
  { country: "South Korea", dial: "+82" },
  { country: "Netherlands", dial: "+31" },
] as const;

export function matchPhoneDialCountry(country: string) {
  const wanted = String(country || "").trim();
  if (!wanted) return PHONE_DIAL_OPTIONS[0].country;
  const hit = matchSelectOption(PHONE_DIAL_OPTIONS.map((item) => item.country), wanted);
  return hit || PHONE_DIAL_OPTIONS[0].country;
}

export function coerceQuestionAnswer(
  question: { type?: string; label?: string; options?: string[] },
  value: string,
  profile?: { city?: string; state?: string; country?: string; location?: string },
) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const inputType = resolveQuestionInputType(question);
  if (inputType === "select" || inputType === "checkbox") {
    const options = inputType === "checkbox" && !(question.options || []).length
      ? ["Yes", "No"]
      : (question.options || []);
    return matchSelectOption(options, raw) || raw;
  }
  if (inputType === "autocomplete") return formatLocationAnswer(raw, profile);
  if (inputType === "phone") return raw.replace(/[^\d+]/g, "") || raw;
  return raw;
}

export function isQuestionAnswered(
  question: { type?: string; label?: string; options?: string[]; key: string },
  answers: Record<string, string>,
) {
  const raw = String(answers[question.key] || "").trim();
  if (!raw) return false;
  const inputType = resolveQuestionInputType(question);
  if (inputType === "select") {
    const options = (question.options || []).filter((option) => String(option).trim());
    if (!options.length) return true;
    return Boolean(matchSelectOption(options, raw));
  }
  if (inputType === "checkbox") {
    return Boolean(matchSelectOption(["Yes", "No", ...(question.options || [])], raw) || /^(yes|no)$/i.test(raw));
  }
  if (inputType === "multiselect") {
    try {
      const parsed = raw.startsWith("[") ? JSON.parse(raw) : raw.split(/[,;\n|]+/);
      return Array.isArray(parsed) ? parsed.some((item) => String(item || "").trim()) : Boolean(raw);
    } catch {
      return Boolean(raw);
    }
  }
  return true;
}

/** True when any merged answer key answers this required question (base-key aware). */
export function answersCoverQuestionKey(answers: Record<string, unknown>, questionKey: string) {
  if (String(answers[questionKey] ?? "").trim()) return true;
  const base = answerKeyBase(questionKey);
  if (!base) return false;
  if (String(answers[base] ?? "").trim()) return true;
  return Object.entries(answers).some(
    ([key, value]) => answerKeyBase(key) === base && String(value ?? "").trim(),
  );
}
