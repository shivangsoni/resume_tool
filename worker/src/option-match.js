/**
 * Rules + confidence matching of profile answers onto harvested option lists.
 */
import { matchOptionsWithGpt, isOpenAiConfigured } from "./openai-match.js";

const normalize = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * @param {string[]} options
 * @param {string} answer
 * @param {(options: string[], answer: string) => string} matchOptionLabel
 * @returns {{ choice: string, confidence: "high" | "low" | "none" }}
 */
export function matchWithConfidence(options, answer, matchOptionLabel) {
  const wanted = String(answer || "").trim();
  if (!wanted || !options?.length) return { choice: "", confidence: "none" };

  const exact = options.find((option) => normalize(option) === normalize(wanted));
  if (exact) return { choice: exact, confidence: "high" };

  const matched = matchOptionLabel(options, wanted);
  if (!matched) return { choice: "", confidence: "none" };

  // Alias / Yes-No / short-code hits from matchOptionLabel are high confidence.
  if (
    /^(yes|no)$/i.test(wanted)
    || wanted.length <= 3
    || /united states|^us$|usa|united kingdom|^uk$/i.test(wanted)
    || /master|bachelor|davis|california/i.test(wanted)
  ) {
    return { choice: matched, confidence: "high" };
  }

  if (normalize(matched).includes(normalize(wanted)) || normalize(wanted).includes(normalize(matched))) {
    return { choice: matched, confidence: "high" };
  }

  return { choice: matched, confidence: "low" };
}

/**
 * Resolve answers for a harvested catalog.
 * @param {object} args
 * @param {Array<{ key: string, label: string, type: string, options?: string[], required?: boolean }>} args.catalog
 * @param {object} args.profile
 * @param {object} args.answers
 * @param {(label: string, profile: object, answers: object) => string} args.knownAnswer
 * @param {(answers: object, refs: object, profile: object) => string} args.lookupAnswer
 * @param {(options: string[], answer: string) => string} args.matchOptionLabel
 * @param {boolean} [args.useGpt]
 */
export async function resolveCatalogAnswers({
  catalog,
  profile,
  answers,
  knownAnswer,
  lookupAnswer,
  matchOptionLabel,
  useGpt = true,
}) {
  const resolved = { ...answers };
  const ambiguous = [];

  for (const field of catalog || []) {
    if (!field?.key) continue;
    const options = Array.isArray(field.options) ? field.options.filter(Boolean) : [];
    const fromLookup = lookupAnswer(resolved, { key: field.key, name: field.name || field.key, label: field.label }, profile);
    const candidate = String(fromLookup || knownAnswer(field.label, profile, resolved) || "").trim();

    if (!options.length) {
      if (candidate) resolved[field.key] = candidate;
      continue;
    }

    const { choice, confidence } = matchWithConfidence(options, candidate, matchOptionLabel);
    if (confidence === "high" && choice) {
      resolved[field.key] = choice;
      continue;
    }
    if (confidence === "low" && choice) {
      ambiguous.push({ ...field, options, candidate, provisional: choice });
      continue;
    }
    if (candidate || field.required) {
      ambiguous.push({ ...field, options, candidate, provisional: "" });
    }
  }

  if (useGpt && ambiguous.length && isOpenAiConfigured()) {
    try {
      const gpt = await matchOptionsWithGpt({
        profile,
        fields: ambiguous.map(({ key, label, options, candidate }) => ({
          key,
          label,
          options,
          candidate,
        })),
      });
      for (const field of ambiguous) {
        if (gpt[field.key]) {
          resolved[field.key] = gpt[field.key];
        } else if (field.provisional) {
          resolved[field.key] = field.provisional;
        }
      }
    } catch (error) {
      console.error("GPT option match failed; using provisional heuristics", error);
      for (const field of ambiguous) {
        if (field.provisional) resolved[field.key] = field.provisional;
      }
    }
  } else {
    for (const field of ambiguous) {
      if (field.provisional) resolved[field.key] = field.provisional;
    }
  }

  return { answers: resolved, ambiguousCount: ambiguous.length };
}
