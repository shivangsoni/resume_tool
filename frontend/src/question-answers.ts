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

export function coerceQuestionAnswer(
  question: { type?: string; options?: string[] },
  value: string,
) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (question.type === "select" || question.type === "checkbox") {
    const options = question.type === "checkbox" && !(question.options || []).length
      ? ["yes", "no"]
      : (question.options || []);
    return matchSelectOption(options, raw) || raw;
  }
  return raw;
}

export function isQuestionAnswered(
  question: { type?: string; options?: string[]; key: string },
  answers: Record<string, string>,
) {
  const raw = String(answers[question.key] || "").trim();
  if (!raw) return false;
  if (question.type === "select") {
    const options = (question.options || []).filter((option) => String(option).trim());
    if (!options.length) return true;
    return Boolean(matchSelectOption(options, raw));
  }
  if (question.type === "checkbox") {
    return Boolean(matchSelectOption(["yes", "no", ...(question.options || [])], raw) || /^(yes|no)$/i.test(raw));
  }
  if (question.type === "multiselect") {
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
