/**
 * Azure OpenAI chat match for employer select options.
 * Uses managed identity when AZURE_OPENAI_ENDPOINT is set; otherwise returns {}.
 */
import { DefaultAzureCredential } from "@azure/identity";

const credential = new DefaultAzureCredential();
const MAX_OPTIONS_PER_FIELD = 80;

function endpointBase() {
  return String(process.env.AZURE_OPENAI_ENDPOINT || "").replace(/\/$/, "");
}

function deployment() {
  return String(process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-5-mini").trim();
}

function apiVersion() {
  return String(process.env.AZURE_OPENAI_API_VERSION || "2024-10-21").trim();
}

export function isOpenAiConfigured() {
  return Boolean(endpointBase() && deployment());
}

const normalize = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Prefer options that share tokens with profile / field label before capping for the prompt. */
export function rankOptionsForPrompt(options, hints = [], limit = MAX_OPTIONS_PER_FIELD) {
  const list = [...new Set((options || []).map((item) => String(item || "").trim()).filter(Boolean))];
  if (list.length <= limit) return list;
  const hintTokens = hints
    .flatMap((hint) => normalize(hint).split(/\s+/).filter((token) => token.length > 2))
    .filter(Boolean);
  const scored = list.map((option, index) => {
    const text = normalize(option);
    let score = 0;
    for (const token of hintTokens) {
      if (text.includes(token)) score += token.length >= 5 ? 3 : 1;
    }
    return { option, score, index };
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.slice(0, limit).map((row) => row.option);
}

/** Keep only GPT values that appear verbatim in that field's full option list. */
export function allowlistGptAnswers(parsed, fields) {
  const allowed = Object.fromEntries(fields.map((field) => [field.key, new Set(field.options || [])]));
  const out = {};
  for (const [key, value] of Object.entries(parsed || {})) {
    if (value == null) continue;
    const text = String(value).trim();
    if (!text) continue;
    if (allowed[key]?.has(text)) out[key] = text;
  }
  return out;
}

/**
 * @param {{ profile: object, fields: Array<{ key: string, label: string, options: string[], candidate?: string }> }} input
 * @returns {Promise<Record<string, string>>}
 */
export async function matchOptionsWithGpt({ profile, fields }) {
  if (!isOpenAiConfigured() || !fields?.length) return {};

  const compactProfile = {
    firstName: profile.firstName,
    lastName: profile.lastName,
    email: profile.email,
    phone: profile.phone,
    country: profile.country,
    state: profile.state,
    city: profile.city,
    school: profile.school,
    educationLevel: profile.educationLevel,
    currentEmployer: profile.currentEmployer,
    currentJobTitle: profile.currentJobTitle,
    experienceLevel: profile.experienceLevel,
    workAuthorization: profile.workAuthorization,
    sponsorship: profile.sponsorship,
    preferredLocations: profile.preferredLocations,
  };

  const payload = fields.map((field) => ({
    key: field.key,
    label: field.label,
    options: rankOptionsForPrompt(field.options, [
      field.candidate,
      field.label,
      profile.school,
      profile.country,
      profile.educationLevel,
      profile.experienceLevel,
      profile.sponsorship,
      profile.workAuthorization,
    ]),
  }));

  const system = [
    "You match a job-seeker profile to employer form select options.",
    "Return ONLY valid JSON object mapping each field key to exactly one option string from that field's options array, or null if none fit.",
    "Never invent option text. Prefer the closest semantic match (e.g. United States → US, Master's → Master's Degree, UC Davis → University of California - Davis).",
  ].join(" ");

  const user = JSON.stringify({ profile: compactProfile, fields: payload });

  const token = await credential.getToken("https://cognitiveservices.azure.com/.default");
  const url = `${endpointBase()}/openai/deployments/${encodeURIComponent(deployment())}/chat/completions?api-version=${encodeURIComponent(apiVersion())}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Azure OpenAI match failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  const body = await response.json();
  const content = body?.choices?.[0]?.message?.content || "{}";
  let parsed = {};
  try {
    parsed = JSON.parse(content);
  } catch {
    return {};
  }

  return allowlistGptAnswers(parsed, fields);
}
