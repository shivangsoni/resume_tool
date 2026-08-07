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
  if (/\b(agree|accept|acknowledge|authorize|sponsorship|legally authorized|work authorization|remote|hybrid)\b/.test(text)) return true;
  return false;
}

/** Normalize worker question types so country prompts are not rendered as Yes/No. */
export function resolveQuestionInputType(question: { type?: string; label?: string; options?: string[] }) {
  const options = (question.options || []).filter((option) => String(option).trim());
  const type = String(question.type || "text").toLowerCase();
  if (type === "blocking" || type === "textarea" || type === "multiselect" || type === "file") return type;
  if (type === "select") return options.length ? "select" : "text";
  if (type === "checkbox") {
    if (options.length > 1) return "multiselect";
    if (options.length === 1 || isBooleanQuestionLabel(question.label || "")) return "checkbox";
    return "text";
  }
  return type || "text";
}

export function coerceQuestionAnswer(
  question: { type?: string; label?: string; options?: string[] },
  value: string,
) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const inputType = resolveQuestionInputType(question);
  if (inputType === "select" || inputType === "checkbox") {
    const options = inputType === "checkbox" && !(question.options || []).length
      ? ["yes", "no"]
      : (question.options || []);
    return matchSelectOption(options, raw) || raw;
  }
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
    return Boolean(matchSelectOption(["yes", "no", ...(question.options || [])], raw) || /^(yes|no)$/i.test(raw));
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
