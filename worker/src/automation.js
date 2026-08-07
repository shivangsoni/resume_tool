import { chromium } from "playwright";

const normalize = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Prefer a short label fragment for heuristics when DOM textContent is huge. */
const compactLabel = (label) => {
  const cleaned = String(label || "").replace(/\s+/g, " ").trim();
  if (cleaned.length <= 120) return cleaned;
  const firstLine = cleaned.split(/[.\n|]/)[0] || cleaned;
  return firstLine.slice(0, 120).trim();
};

const humanizeFieldName = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const leaf = raw.includes("[")
    ? (raw.match(/\[([^\]]+)\]/g) || []).map((part) => part.slice(1, -1)).filter(Boolean).pop() || raw
    : raw.split(/[./#]/).pop() || raw;
  const spaced = leaf
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!spaced || isUselessLabel(spaced)) return "";
  return spaced.replace(/\b\w/g, (char) => char.toUpperCase());
};

/** Labels that are markers / placeholders, not real question text. */
const isUselessLabel = (label) => {
  const text = String(label || "").replace(/\s+/g, " ").trim();
  if (!text) return true;
  if (/^[\d\W_]+$/.test(text)) return true;
  if (/^(required|\*|optional)$/i.test(text)) return true;
  if (/^(question\s*)?\d+$/i.test(text)) return true;
  if (/^(question\s*\d+\s*)?required(\s*question)?$/i.test(text)) return true;
  if (/^required(\s*question)?(\s*\d+)?$/i.test(text)) return true;
  if (/^(input|field|select|textarea|question)[\d\s_-]*$/i.test(text)) return true;
  // Placeholder prompts like "Select...", "Please select", "Choose one"
  if (/^select(\s+\w+)?\.?$|^select\.{0,3}$|^please select\.?$|^choose(\s+one)?\.?$/i.test(text)) return true;
  if (/^select\s*\.{1,3}$/i.test(text)) return true;
  // Greenhouse generic leaves (never show these as the question title)
  if (/^(questionnaire(\s+field)?|boolean(\s+value)?|text|answer(s)?|value|field)$/i.test(text)) return true;
  return false;
};

/** Strip volatile `__12` / `__g3` suffixes from answer keys. */
const answerKeyBase = (key) => String(key || "").replace(/__(?:g)?\d+(?:_\d+)?$/i, "").trim();

/**
 * Build a Greenhouse-shaped location query ("City, Region, Country").
 * Bare city names alone rarely commit the geocode typeahead.
 */
const formatLocationQuery = (answer, profile = {}) => {
  const raw = String(answer || "").trim();
  const profileLocation = String(profile.location || "").trim();
  const city = String(profile.city || "").trim();
  const state = String(profile.state || "").trim();
  const country = String(profile.country || "").trim();
  if (raw.includes(",") && raw.split(",").filter((part) => part.trim()).length >= 2) return raw;
  if (profileLocation && (!raw || normalize(profileLocation).includes(normalize(raw)))) return profileLocation;
  const cityPart = raw || city;
  if (!cityPart) return profileLocation || [city, state, country].filter(Boolean).join(", ");
  // Avoid duplicating city when answer is already the city.
  if (city && normalize(cityPart) === normalize(city)) {
    return [city, state, country].filter(Boolean).join(", ");
  }
  if (state || country) return [cityPart, state, country].filter(Boolean).join(", ");
  return cityPart;
};

const isLocationAutocompleteLabel = (label, name = "") => {
  const text = normalize(`${label} ${name}`);
  if (!text) return false;
  if (/\bwork authorization\b|\bauthorized to work\b|\bsponsor|\bvisa\b|\bremot(e|ely)\b|\bhybrid\b/.test(text)) return false;
  if (/\blocation\b.*\bcity\b|\bcity\b.*\blocation\b|\blocation \(city\)/.test(text)) return true;
  if (/\b(job_application\[)?location\b/.test(text) && !/\bcountries\b|\bcountry selection\b/.test(text)) return true;
  if (/^location$|^city$|\blocation \(city\)$/.test(text)) return true;
  return false;
};

const isPhoneFieldLabel = (label, name = "") => {
  const text = normalize(`${label} ${name}`);
  return /\bphone\b|\bmobile\b|\btel\b/.test(text);
};

/**
 * Resolve a saved answer even when DOM index suffixes shifted between attempts.
 * Order: exact key → bare name → any key sharing the same base → knownAnswer(label).
 */
const lookupAnswer = (answers, { key, name, label }, profile = {}) => {
  const store = answers && typeof answers === "object" ? answers : {};
  const tryValue = (candidate) => {
    if (candidate == null) return "";
    const text = String(candidate).trim();
    return text;
  };
  const exact = tryValue(store[key]);
  if (exact) return exact;
  const bareName = String(name || "").trim();
  if (bareName) {
    const byName = tryValue(store[bareName]);
    if (byName) return byName;
    const nameBase = answerKeyBase(bareName);
    for (const [storedKey, storedValue] of Object.entries(store)) {
      if (answerKeyBase(storedKey) === bareName || (nameBase && answerKeyBase(storedKey) === nameBase)) {
        const hit = tryValue(storedValue);
        if (hit) return hit;
      }
    }
  }
  const keyBase = answerKeyBase(key);
  if (keyBase && keyBase !== key) {
    const byBase = tryValue(store[keyBase]);
    if (byBase) return byBase;
    for (const [storedKey, storedValue] of Object.entries(store)) {
      if (answerKeyBase(storedKey) === keyBase) {
        const hit = tryValue(storedValue);
        if (hit) return hit;
      }
    }
  }
  return knownAnswer(label, profile, store) || "";
};

const sanitizeLabel = (label) => {
  const cleaned = String(label || "")
    .replace(/\s+/g, " ")
    .replace(/^\*+\s*/, "")
    .replace(/\s*\*+$/, "")
    .replace(/\(\s*required\s*\)/gi, "")
    .replace(/\brequired\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return isUselessLabel(cleaned) ? "" : cleaned;
};

const knownAnswer = (label, profile, answers) => {
  const text = normalize(compactLabel(label));
  const direct = answers[label] ?? answers[normalize(label)] ?? answers[label.replace(/^.*?question[_-]?/, "")];
  if (direct != null && String(direct).trim()) return String(direct);
  if (/\bfirst name\b/.test(text)) return profile.firstName;
  if (/\blast name\b/.test(text)) return profile.lastName;
  if (/\bfull name\b|\blegal name\b/.test(text)) return [profile.firstName, profile.lastName].filter(Boolean).join(" ");
  if (/\bemail\b/.test(text)) return answers.email || profile.email;
  if (/\bphone\b|\bmobile\b|\btel\b/.test(text)) return answers.phone || profile.phone;
  if (/\blinkedin\b/.test(text)) return profile.linkedin;
  if (/\bgithub\b/.test(text)) return profile.github;
  if (/\bportfolio\b|\bwebsite\b|\bpersonal site\b/.test(text)) return profile.portfolio || profile.github;
  if (/\bcountry\b/.test(text)) return answers.country || profile.country;
  if (/\bcity\b/.test(text)) {
    // Greenhouse "Location (City)" needs "City, Region, Country" for typeahead commit.
    if (/\blocation\b/.test(text)) {
      return formatLocationQuery(answers.location || answers.city || profile.location || profile.city, profile);
    }
    return answers.city || profile.city;
  }
  if (/\bstate\b|\bprovince\b/.test(text)) return answers.state || profile.state;
  if (/\bpostal\b|\bzip\b/.test(text)) return answers.postalCode || profile.postalCode;
  if (/\baddress\b/.test(text)) return profile.address || [profile.city, profile.state, profile.postalCode].filter(Boolean).join(", ");
  // Authorization/sponsorship before location: Stripe asks about work rights
  // "in the location(s) you selected", which must not match as a city/location field.
  if (/\bwork authorization\b|\bauthorized to work\b|\blegally authorized\b|\beligible to work\b/.test(text)) return profile.workAuthorization;
  if (/\bsponsor|\bvisa\b|\bwork permit\b/.test(text)) return profile.sponsorship;
  // Remote-intent before location: do not fill city for "work remotely" / hybrid questions.
  if (/\bwork remotely\b|\bplan to work remotely\b|\bremote (work|role|option)\b|\bhybrid\b/.test(text)) {
    const prefs = normalize([profile.preferredLocations, profile.location, profile.employmentTypes].filter(Boolean).join(" "));
    if (/\bremote\b/.test(prefs)) return "Yes";
    if (/\bon.?site\b|\bin.?office\b/.test(prefs)) return "No";
    return "";
  }
  if (/\blocation\b|\bwork from\b/.test(text) && !/\bremot(e|ely)\b|\bhybrid\b/.test(text)) {
    return formatLocationQuery(answers.location || profile.location || "", profile);
  }
  if (/\bschool\b|\buniversity\b|\bcollege\b|\balma mater\b/.test(text)) return profile.school;
  if (/\b(current |most recent |previous |last )?(employer|company name)\b|\bcompany\b/.test(text) && !/\bcompanies to exclude\b/.test(text)) {
    return profile.currentEmployer;
  }
  if (/\b(current |most recent |previous |last )?(job )?title\b|\bposition title\b/.test(text)) return profile.currentJobTitle;
  if (/\beducation\b|\bdegree\b|\bhighest (level|education)\b/.test(text)) return profile.educationLevel;
  if (/\bskills?\b|\btechnologies\b|\btech stack\b/.test(text)) return profile.skills;
  if (/\byears? of experience\b|\bexperience level\b/.test(text)) return profile.experienceLevel;
  if (/\bsalary\b|\bcompensation\b|\bexpected pay\b/.test(text)) return profile.minSalary;
  if (/\bemployment type\b|\bfull.?time|part.?time|contract\b/.test(text)) return profile.employmentTypes;
  if (/\blanguage\b/.test(text)) return profile.preferredLanguages;
  if (/\bcover letter\b|\bwhy (do you want|are you interested)|about yourself\b|\bsummary\b|\badditional (information|info)\b/.test(text)) {
    return profile.additionalInfo || profile.summary || profile.headline || "";
  }
  return "";
};

/** Always include index so duplicate HTML names do not share one answer slot. */
const questionKey = (name, label, index) => {
  const base = String(name || `question_${normalize(compactLabel(label)).replace(/ /g, "_") || "field"}`).trim() || "field";
  return `${base}__${index}`.slice(0, 180);
};

/** Stable key for a shared-name checkbox/radio group (omit per-option index churn). */
const groupQuestionKey = (name, groupLabel, index) => {
  const base = String(name || `group_${normalize(compactLabel(groupLabel)).replace(/ /g, "_") || "field"}`).trim() || "field";
  return `${base}__g${index}`.slice(0, 180);
};

/** Parse saved multiselect answers: JSON array or comma/semicolon/newline separated. */
const parseMultiselectAnswer = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return [];
  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((item) => String(item || "").trim()).filter(Boolean);
    } catch { /* fall through */ }
  }
  return raw.split(/[,;\n|]+/).map((item) => item.trim()).filter(Boolean);
};

const COUNTRY_ALIASES = {
  us: ["united states", "usa", "u s", "u s a", "america"],
  usa: ["united states", "us", "u s", "u s a", "america"],
  "united states": ["us", "usa", "u s", "u s a", "america"],
  "united states of america": ["us", "usa", "u s", "u s a", "america", "united states"],
  uk: ["united kingdom", "great britain", "britain", "england"],
  "united kingdom": ["uk", "great britain", "britain", "england"],
  "great britain": ["uk", "united kingdom", "britain", "england"],
};

/** True when option text matches any wanted token (with common country aliases). */
const optionMatchesTokens = (optionLabel, tokens) => {
  const option = normalize(optionLabel);
  const optionCompact = option.replace(/\s+/g, "");
  if (!option) return false;
  for (const token of tokens) {
    const needle = normalize(token);
    const needleCompact = needle.replace(/\s+/g, "");
    if (!needle) continue;
    if (option === needle || optionCompact === needleCompact) return true;
    // Avoid short-token false positives (e.g. "us" inside "australia").
    if (needle.length >= 4 && (option.includes(needle) || needle.includes(option))) return true;
    if (needleCompact.length >= 4 && optionCompact && (optionCompact.includes(needleCompact) || needleCompact.includes(optionCompact))) return true;
    if (needle.length <= 3) {
      const bounded = new RegExp(`(?:^|\\s)${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`);
      if (bounded.test(option)) return true;
    }
    const aliases = COUNTRY_ALIASES[needle] || COUNTRY_ALIASES[needleCompact] || [];
    if (aliases.some((alias) => {
      const a = normalize(alias);
      const ac = a.replace(/\s+/g, "");
      if (option === a || optionCompact === ac) return true;
      if (a.length >= 4 && (option.includes(a) || a.includes(option))) return true;
      return false;
    })) return true;
  }
  return false;
};

/** Profile-derived tokens used to auto-check country/location multiselects. */
const multiselectTokensFromProfile = (profile = {}) => {
  const parts = [
    profile.country,
    profile.location,
    profile.preferredLocations,
    profile.city,
    profile.state,
  ]
    .flatMap((value) => String(value || "").split(/[,;|/]+/))
    .map((item) => item.trim())
    .filter(Boolean);
  return [...new Set(parts)];
};

/** Which option labels should be selected given answers + profile. */
const resolveMultiselectSelections = (options, answer, profile) => {
  const fromAnswer = parseMultiselectAnswer(answer);
  if (fromAnswer.length) {
    return options.filter((option) => optionMatchesTokens(option, fromAnswer));
  }
  const tokens = multiselectTokensFromProfile(profile);
  return options.filter((option) => optionMatchesTokens(option, tokens));
};

/** Fuzzy match a single answer string to one option label (radios / selects). */
const matchOptionLabel = (options, answer) => {
  const wanted = String(answer || "").trim();
  if (!wanted || !options?.length) return "";
  const usable = options.map((option) => String(option || "").trim()).filter(Boolean);
  if (!usable.length) return "";
  const needle = normalize(wanted);
  const exact = usable.find((option) => normalize(option) === needle);
  if (exact) return exact;

  // Coerce bare Yes/No/True/False onto a clear matching option (not long narrative options).
  if (/^(yes|true|y|1|on)$/i.test(wanted)) {
    const yesOpt = usable.find((option) => /^(yes|true|y)\b/i.test(option.trim()) || normalize(option) === "yes");
    if (yesOpt) return yesOpt;
  }
  if (/^(no|false|n|0|off)$/i.test(wanted)) {
    const noOpt = usable.find((option) => /^(no|false|n)\b/i.test(option.trim()) || normalize(option) === "no");
    if (noOpt) return noOpt;
  }

  // Country aliases: "United States" ↔ "US" / "USA", etc.
  const aliasHit = usable.find((option) => optionMatchesTokens(option, [wanted]));
  if (aliasHit) return aliasHit;

  const includes = usable.find((option) => {
    const label = normalize(option);
    if (!label) return false;
    if (label.includes(needle) || needle.includes(label)) return true;
    const labelCompact = label.replace(/\s+/g, "");
    const needleCompact = needle.replace(/\s+/g, "");
    return Boolean(needleCompact && labelCompact && (labelCompact === needleCompact
      || (needleCompact.length >= 4 && (labelCompact.includes(needleCompact) || needleCompact.includes(labelCompact)))));
  });
  return includes || "";
};

const selectOptionTexts = async (field) => {
  const texts = await field.locator("option").allTextContents();
  return texts.map((item) => item.trim()).filter(Boolean);
};

/** Live control type — nth() locators can rematerialize after DOM updates. */
const liveFieldType = async (field, fallback = "text") => {
  const value = await field.evaluate((el) => {
    if (el.tagName === "SELECT") return "select";
    if (el.tagName === "TEXTAREA") return "textarea";
    if (el instanceof HTMLInputElement) return String(el.type || "text").toLowerCase();
    return String(el.getAttribute("type") || el.tagName || "text").toLowerCase();
  }).catch(() => "");
  return value || fallback;
};

/** Prefer id / name(+value) so actions survive checkbox-driven re-renders. */
const stabilizeField = (scope, item) => {
  const { info, field } = item;
  if (info.id) {
    return scope.locator(`[id=${JSON.stringify(info.id)}]`).first();
  }
  if (info.name && (info.type === "checkbox" || info.type === "radio") && info.value !== undefined && info.value !== "") {
    return scope.locator(`input[type=${JSON.stringify(info.type)}][name=${JSON.stringify(info.name)}][value=${JSON.stringify(info.value)}]`).first();
  }
  if (info.name) {
    const tag = info.tag === "select" ? "select" : info.tag === "textarea" ? "textarea" : "input";
    return scope.locator(`${tag}[name=${JSON.stringify(info.name)}]`).first();
  }
  return field;
};

/** Fill a text-like control and verify the value stuck (Greenhouse/React-friendly). */
const fillTextControl = async (field, answer) => {
  const wanted = String(answer || "").trim();
  if (!wanted) return false;
  const digits = (value) => String(value || "").replace(/\D+/g, "");
  const matches = (actual) => {
    const text = String(actual || "").trim();
    if (!text) return false;
    if (text === wanted) return true;
    const a = digits(text);
    const b = digits(wanted);
    return Boolean(a && b && (a === b || a.endsWith(b) || b.endsWith(a)));
  };

  await field.scrollIntoViewIfNeeded().catch(() => {});
  await field.click({ timeout: 3000 }).catch(() => {});
  await field.fill("").catch(() => {});
  await field.fill(wanted).catch(() => {});
  await field.evaluate((el) => el.dispatchEvent(new Event("blur", { bubbles: true }))).catch(() => {});
  let value = await field.inputValue().catch(() => "");
  if (matches(value)) return true;

  await field.click({ timeout: 3000 }).catch(() => {});
  await field.fill("").catch(() => {});
  await field.pressSequentially(wanted, { delay: 20 }).catch(() => {});
  await field.press("Tab").catch(() => {});
  value = await field.inputValue().catch(() => "");
  if (matches(value)) return true;

  // React controlled inputs ignore direct .value assigns — use the native setter.
  await field.evaluate((el, next) => {
    el.focus();
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
    if (descriptor?.set) descriptor.set.call(el, next);
    else el.value = next;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new InputEvent("input", { bubbles: true, data: next, inputType: "insertText" }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }, wanted).catch(() => {});
  value = await field.inputValue().catch(() => "");
  return matches(value);
};

/** True when Greenhouse hidden lat/lon are committed (or not present). */
const locationLatLonCommitted = async (field) => {
  const result = await field.evaluate((el) => {
    const root = el.closest("form")
      || el.closest(".field, .form-group, .application-question, .question, [class*='question' i], [class*='field' i]")
      || el.parentElement
      || document;
    const lat = root.querySelector('input[name*="latitude" i], input[id*="latitude" i], input[name="latitude"]');
    const lon = root.querySelector('input[name*="longitude" i], input[id*="longitude" i], input[name="longitude"]');
    // Also check the whole form when lat/lon are siblings outside the field wrapper.
    const form = el.closest("form") || document;
    const formLat = lat || form.querySelector('input[name*="latitude" i], input[name="latitude"]');
    const formLon = lon || form.querySelector('input[name*="longitude" i], input[name="longitude"]');
    if (!formLat && !formLon) return { hasHidden: false, ok: true };
    const latVal = String(formLat?.value || "").trim();
    const lonVal = String(formLon?.value || "").trim();
    return { hasHidden: true, ok: Boolean(latVal && lonVal) };
  }).catch(() => ({ hasHidden: false, ok: true }));
  return result;
};

/**
 * Greenhouse Location (City) typeahead: type, wait for geocode suggestions, click one.
 * Typing alone leaves hidden latitude/longitude empty and validation fails.
 */
const fillLocationAutocomplete = async (field, answer, profile = {}) => {
  const query = formatLocationQuery(answer, profile);
  if (!query) return false;
  const searchToken = query.split(",")[0].trim() || query;
  const page = field.page();

  await field.scrollIntoViewIfNeeded().catch(() => {});
  await field.click({ timeout: 3000 }).catch(() => {});
  await field.fill("").catch(() => {});
  await field.pressSequentially(searchToken.slice(0, 48), { delay: 35 }).catch(() => {});

  const optionSelectors = [
    '[role="listbox"] [role="option"]',
    '[role="option"]',
    ".select2-results__option",
    "ul[class*='suggestion' i] li",
    "div[class*='autocomplete' i] li",
    ".pac-item",
    "[class*='dropdown' i] [class*='option' i]",
  ];

  let optionTexts = [];
  let optionLocator = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await page.waitForTimeout(250);
    for (const selector of optionSelectors) {
      const locator = page.locator(selector);
      const count = await locator.count().catch(() => 0);
      if (!count) continue;
      const texts = [];
      for (let i = 0; i < Math.min(count, 40); i += 1) {
        if (!(await locator.nth(i).isVisible().catch(() => false))) continue;
        const text = String(await locator.nth(i).innerText().catch(() => ""))
          .replace(/\s+/g, " ")
          .trim()
          .split("\n")[0]
          .trim();
        if (text) texts.push(text);
      }
      if (texts.length) {
        optionTexts = texts;
        optionLocator = locator;
        break;
      }
    }
    if (optionTexts.length) break;
  }

  if (optionTexts.length && optionLocator) {
    const matched = matchOptionLabel(optionTexts, query)
      || matchOptionLabel(optionTexts, searchToken)
      || optionTexts.find((option) => normalize(option).includes(normalize(searchToken)))
      || optionTexts[0];
    const index = optionTexts.findIndex((option) => normalize(option) === normalize(matched));
    const target = optionLocator.nth(index >= 0 ? index : 0);
    await target.click({ timeout: 3000 }).catch(async () => {
      await field.press("ArrowDown").catch(() => {});
      await field.press("Enter").catch(() => {});
    });
  } else {
    await field.press("ArrowDown").catch(() => {});
    await page.waitForTimeout(150);
    await field.press("Enter").catch(() => {});
  }

  await page.waitForTimeout(400);
  const value = String(await field.inputValue().catch(() => "")).trim();
  const latLon = await locationLatLonCommitted(field);
  if (latLon.hasHidden) return Boolean(value) && latLon.ok;
  return Boolean(value);
};

/**
 * Select the custom phone Country dial-code widget (flags + +1) next to Phone.
 * Returns true when no dial widget exists or a matching country was chosen.
 */
const fillPhoneCountryDial = async (phoneField, countryAnswer, profile = {}) => {
  const wanted = String(countryAnswer || profile.country || "").trim();
  if (!wanted) return true;
  const page = phoneField.page();

  const containers = [
    phoneField.locator("xpath=ancestor::*[contains(@class,'phone') or contains(@class,'field') or contains(@class,'application')][1]"),
    phoneField.locator("xpath=../.."),
    phoneField.locator("xpath=.."),
  ];

  for (const container of containers) {
    const triggers = container.locator('button, [role="combobox"], [aria-haspopup="listbox"], [aria-haspopup="true"]');
    const triggerCount = await triggers.count().catch(() => 0);
    for (let i = 0; i < triggerCount; i += 1) {
      const trigger = triggers.nth(i);
      if (!(await trigger.isVisible().catch(() => false))) continue;
      const box = await trigger.boundingBox().catch(() => null);
      const phoneBox = await phoneField.boundingBox().catch(() => null);
      // Prefer controls sitting to the left of / beside the phone input.
      if (box && phoneBox && box.x > phoneBox.x + 20) continue;

      await trigger.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(350);

      const options = page.locator('[role="listbox"] [role="option"], [role="option"], .iti__country, li[class*="country" i], [class*="country-list" i] li');
      const optionCount = await options.count().catch(() => 0);
      if (!optionCount) {
        await page.keyboard.press("Escape").catch(() => {});
        continue;
      }

      const labels = [];
      const max = Math.min(optionCount, 320);
      for (let j = 0; j < max; j += 1) {
        const text = String(await options.nth(j).innerText().catch(() => ""))
          .replace(/\s+/g, " ")
          .trim();
        labels.push(text);
      }
      const matched = matchOptionLabel(labels.filter(Boolean), wanted)
        || labels.find((label) => label && optionMatchesTokens(label, [wanted]));
      if (matched) {
        const index = labels.findIndex((label) => label === matched);
        if (index >= 0) {
          await options.nth(index).click({ timeout: 3000 }).catch(() => {});
          await page.waitForTimeout(200);
          return true;
        }
      }
      await page.keyboard.press("Escape").catch(() => {});
    }
  }
  return false;
};

/** Labels that are true yes/no prompts (not country / multi-select lists). */
const isBooleanChoiceLabel = (label) => {
  const text = normalize(label);
  if (!text) return false;
  if (/\b(country|countries|nation|citizenship|select all|which of the following)\b/.test(text)) return false;
  if (/^(do you|are you|have you|will you|can you|did you)\b/.test(text)) return true;
  if (/\b(yes or no|y\/n)\b/.test(text)) return true;
  if (/\b(agree|accept|acknowledge|authorize|sponsorship|legally authorized|work authorization|remote(ly)?|hybrid)\b/.test(text)) return true;
  return false;
};

/** Keep array-style Greenhouse names as groups even when only one option was collected. */
const isCheckboxGroupName = (name) => /\[\]/.test(String(name || ""));

/** Option labels for a checkbox/radio group — never treat the shared prompt as an option. */
const choiceOptionLabels = (group, groupLabel) => {
  const prompt = normalize(groupLabel);
  return group.map((item) => {
    const option = String(item.info.optionLabel || "").trim();
    if (option && normalize(option) !== prompt) return option;
    const label = String(item.info.label || "").trim();
    if (label && normalize(label) !== prompt) return label;
    return option;
  }).filter(Boolean);
};

async function fillSelect(field, answer) {
  const wanted = String(answer || "").trim();
  if (!wanted) return false;
  const byLabel = await field.selectOption({ label: wanted }).then(() => true).catch(() => false);
  if (byLabel) return true;
  const byValue = await field.selectOption({ value: wanted }).then(() => true).catch(() => false);
  if (byValue) return true;
  const byExact = await field.selectOption(wanted).then(() => true).catch(() => false);
  if (byExact) return true;

  const options = await field.evaluate((element) =>
    Array.from(element.querySelectorAll("option")).map((option) => ({
      value: option.value,
      label: (option.textContent || "").trim(),
    })),
  );
  const labels = options.map((option) => option.label);
  const matchedLabel = matchOptionLabel(labels, wanted);
  if (matchedLabel) {
    const match = options.find((option) => option.label === matchedLabel);
    if (match && match.value !== "") {
      const ok = await field.selectOption(match.value).then(() => true).catch(() => false);
      if (ok) return true;
    }
    const byMatchedLabel = await field.selectOption({ label: matchedLabel }).then(() => true).catch(() => false);
    if (byMatchedLabel) return true;
  }
  const needle = wanted.toLowerCase();
  const needleCompact = needle.replace(/[^a-z0-9]+/g, "");
  const match = options.find((option) => {
    const label = option.label.toLowerCase();
    const value = String(option.value || "").toLowerCase();
    const labelCompact = label.replace(/[^a-z0-9]+/g, "");
    return label === needle || value === needle || label.includes(needle) || needle.includes(label)
      || (needleCompact && labelCompact && (labelCompact === needleCompact || labelCompact.includes(needleCompact) || needleCompact.includes(labelCompact)));
  });
  if (!match || match.value === "") return false;
  return field.selectOption(match.value).then(() => true).catch(() => false);
}

const isSkippableFieldMeta = (info) => {
  const haystack = normalize(`${info.name} ${info.label} ${info.type}`);
  if (info.type === "search" || info.type === "button" || info.type === "reset" || info.type === "image") return true;
  if (/\b(search|filter|sort|subscribe|newsletter|password|csrf)\b/.test(haystack)) return true;
  return false;
};

/**
 * Prefer a direct Greenhouse application embed when the listing URL is a
 * careers search deep-link (common for Stripe absolute_url values).
 */
function resolveApplicationUrl(application) {
  const sourceUrl = String(application?.sourceUrl || "").trim();
  if (!sourceUrl) return sourceUrl;
  try {
    const url = new URL(sourceUrl);
    const host = url.hostname.toLowerCase();
    const jid = url.searchParams.get("gh_jid") || url.searchParams.get("gh_jid".toUpperCase());
    const tokenFromPath = url.pathname.match(/\/jobs\/(\d+)/)?.[1];
    const jobId = jid || tokenFromPath;
    const board = guessGreenhouseBoard(application);
    if (jobId && board && (host.includes("stripe.com") || host.includes("greenhouse.io") || host.includes(board))) {
      return `https://boards.greenhouse.io/embed/job_app?for=${encodeURIComponent(board)}&token=${encodeURIComponent(jobId)}`;
    }
  } catch {
    // Fall through to the original listing URL.
  }
  return sourceUrl;
}

function guessGreenhouseBoard(application) {
  const company = normalize(application?.company);
  if (company.includes("stripe")) return "stripe";
  if (company.includes("cloudflare")) return "cloudflare";
  if (company.includes("figma")) return "figma";
  if (company.includes("airbnb")) return "airbnb";
  const source = normalize(application?.source);
  if (source.includes("greenhouse")) {
    try {
      const url = new URL(String(application?.sourceUrl || ""));
      const fromPath = url.pathname.match(/\/(?:embed\/job_app|boards?\/|job-boards\/)?(?:for=)?/i);
      const token = url.searchParams.get("for") || url.pathname.split("/").filter(Boolean)[0];
      if (token && /^[a-z0-9_-]+$/i.test(token) && !["embed", "jobs", "job", "boards", "job-boards"].includes(token)) return token;
      void fromPath;
    } catch { /* ignore */ }
  }
  return "";
}

/**
 * Invisible reCAPTCHA Enterprise (Greenhouse) must not block automation.
 * Only fail when an interactive checkbox/challenge/hCaptcha/Turnstile is present.
 */
async function pageHasBlockingCaptcha(page) {
  if (await page.locator('iframe[src*="recaptcha"][src*="bframe"], iframe[src*="hcaptcha.com"][src*="frame="], iframe[src*="challenges.cloudflare.com"]').first().isVisible().catch(() => false)) {
    return true;
  }
  if (await page.locator(".h-captcha[data-sitekey] iframe, .cf-turnstile iframe").first().isVisible().catch(() => false)) {
    return true;
  }
  for (const frame of page.frames()) {
    const frameUrl = frame.url();
    if (!/recaptcha|hcaptcha/i.test(frameUrl)) continue;
    const kind = await frame.evaluate(() => {
      if (document.querySelector(".rc-anchor-invisible")) return "invisible";
      if (document.querySelector("#recaptcha-anchor, .rc-anchor-checkbox, .recaptcha-checkbox")) return "checkbox";
      if (document.querySelector(".rc-imageselect, .challenge-container, #rc-imageselect")) return "challenge";
      return "unknown";
    }).catch(() => "unknown");
    if (kind === "checkbox" || kind === "challenge") return true;
  }
  return false;
}

export async function runApplication({ application, profile, resumePath }) {
  const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage", "--no-sandbox"] });
  const page = await browser.newPage();
  try {
    await page.goto(resolveApplicationUrl(application), { waitUntil: "domcontentloaded", timeout: 45000 });
    // If the embed/application form is already present, do not click listing CTAs
    // like "Quick Apply with MyGreenhouse" (those match /apply/ and derail the flow).
    const formReady = page.locator("#application-form, form#application-form, form[action*='job_app'], button[type='submit'], input[type='submit']").first();
    const alreadyOnForm = await formReady.isVisible().catch(() => false);
    if (!alreadyOnForm) {
      const apply = page
        .getByRole("link", { name: /^(apply( now)?|apply for this job)$/i })
        .or(page.getByRole("button", { name: /^(apply( now)?|apply for this job)$/i }))
        .first();
      if (await apply.isVisible().catch(() => false)) {
        await apply.click();
        await page.waitForLoadState("domcontentloaded").catch(() => {});
      }
    }
    await formReady.waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(alreadyOnForm ? 500 : 1500);

    if (await pageHasBlockingCaptcha(page)) {
      return {
        outcome: "needs_action",
        detail: "Employer CAPTCHA requires completion on the original application page.",
        questions: [{ key: "captcha", label: "Complete the employer CAPTCHA on the original listing, then retry.", type: "blocking", required: true }],
      };
    }

    const contexts = [page, ...page.frames().filter((frame) => frame !== page.mainFrame())];
    let root = page;
    let bestScore = -1;
    for (const context of contexts) {
      const score = await context.evaluate(() => {
        const forms = Array.from(document.querySelectorAll("form"));
        const candidates = forms.length ? forms : [document.body];
        let best = 0;
        for (const form of candidates) {
          if (form.closest("nav, header, footer, [role='search']")) continue;
          const fields = form.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select');
          let points = fields.length;
          if (form.querySelector('input[type="file"]')) points += 20;
          if (/apply|application|job/i.test(`${form.id} ${form.className} ${form.getAttribute("action") || ""}`)) points += 15;
          if (form.querySelector('input[name*="first" i], input[name*="email" i], input[autocomplete="email"]')) points += 10;
          best = Math.max(best, points);
        }
        return best;
      }).catch(() => 0);
      if (score > bestScore) { bestScore = score; root = context; }
    }

    const formLocator = root.locator("form").filter({ has: root.locator('input:not([type="hidden"]), textarea, select') });
    const formCount = await formLocator.count();
    let scope = root;
    if (formCount) {
      let bestIndex = 0;
      let top = -1;
      for (let i = 0; i < formCount; i += 1) {
        const form = formLocator.nth(i);
        const points = await form.evaluate((node) => {
          let score = node.querySelectorAll('input:not([type="hidden"]):not([type="submit"]), textarea, select').length;
          if (node.querySelector('input[type="file"]')) score += 20;
          if (/apply|application|job/i.test(`${node.id} ${node.className} ${node.getAttribute("action") || ""}`)) score += 15;
          return score;
        }).catch(() => 0);
        if (points > top) { top = points; bestIndex = i; }
      }
      scope = formLocator.nth(bestIndex);
    }

    const fields = scope.locator('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), textarea, select');
    const missing = [];
    const seenKeys = new Set();
    const collected = [];
    for (let index = 0; index < await fields.count(); index += 1) {
      const field = fields.nth(index);
      const choiceType = await field.evaluate((el) => {
        if (!(el instanceof HTMLInputElement)) return "";
        return String(el.type || "").toLowerCase();
      }).catch(() => "");
      const isChoice = choiceType === "checkbox" || choiceType === "radio";
      // Keep off-screen country/checkbox options so groups are not demoted to Yes/No.
      if (!isChoice && (!await field.isVisible().catch(() => false) || await field.isDisabled().catch(() => true))) continue;
      if (isChoice && await field.isDisabled().catch(() => true)) continue;
      const info = await field.evaluate((element) => {
        const id = element.id || "";
        const name = element.getAttribute("name") || "";
        const labelledBy = (element.getAttribute("aria-labelledby") || "")
          .split(/\s+/)
          .filter(Boolean)
          .map((ref) => document.getElementById(ref)?.textContent || "")
          .join(" ")
          .trim();
        const explicitLabel = id
          ? document.querySelector(`label[for="${CSS.escape(id)}"]`)
          : null;
        const wrapLabel = element.closest("label");
        const labelNode = explicitLabel || wrapLabel;
        const readLabelText = (node) => {
          if (!node) return "";
          const clone = node.cloneNode(true);
          clone.querySelectorAll("input, select, textarea, button, script, style, option").forEach((child) => child.remove());
          return (clone.textContent || "").replace(/\s+/g, " ").trim();
        };
        const shortText = (value, max = 120) => {
          const text = String(value || "").replace(/\s+/g, " ").trim();
          return text && text.length <= max ? text : "";
        };
        // Prefer the option's own short label; ignore long prompt text on the control.
        const optionLabel = (() => {
          const fromLabel = shortText(readLabelText(wrapLabel), 100) || shortText(readLabelText(explicitLabel), 100);
          if (fromLabel) return fromLabel;
          const next = element.nextElementSibling;
          if (next && !/^(INPUT|SELECT|TEXTAREA|BUTTON)$/i.test(next.tagName)) {
            const text = shortText(next.textContent, 100);
            if (text) return text;
          }
          const parent = element.parentElement;
          if (parent && !wrapLabel) {
            const clone = parent.cloneNode(true);
            clone.querySelectorAll("input, select, textarea, button, script, style, .helper, .description, [id$='-description'], [id$='-error']").forEach((child) => child.remove());
            const text = shortText(clone.textContent, 100);
            if (text) return text;
          }
          return "";
        })();
        const fieldset = element.closest("fieldset");
        const legendText = (fieldset?.querySelector("legend")?.textContent || "").replace(/\s+/g, " ").trim();
        const describedByText = (element.getAttribute("aria-describedby") || "")
          .split(/\s+/)
          .filter(Boolean)
          .map((ref) => document.getElementById(ref)?.textContent || "")
          .join(" ")
          .trim();
        const siblingText = () => {
          const prev = element.previousElementSibling;
          if (prev && !/^(INPUT|SELECT|TEXTAREA|BUTTON)$/i.test(prev.tagName)) {
            const text = (prev.textContent || "").replace(/\s+/g, " ").trim();
            if (text && text.length < 200) return text;
          }
          const parent = element.parentElement;
          const aunt = parent?.previousElementSibling;
          if (aunt) {
            const text = (aunt.textContent || "").replace(/\s+/g, " ").trim();
            if (text && text.length < 200) return text;
          }
          const fieldRoot = element.closest(".field, .form-group, .application-question, .question, [class*='question' i], [class*='field' i], [data-qa], [data-field]");
          if (fieldRoot) {
            const heading = fieldRoot.querySelector(":scope > label, label, legend, .label, .question-label, [class*='label' i], p, span, div");
            if (heading && !heading.contains(element)) {
              const clone = heading.cloneNode(true);
              clone.querySelectorAll("input, select, textarea, button, script, style, option").forEach((child) => child.remove());
              const text = (clone.textContent || "").replace(/\s+/g, " ").trim();
              if (text && text.length < 200) return text;
            }
          }
          return "";
        };
        const groupHeading = () => {
          if (legendText && legendText.length < 200) return legendText;
          const fromDescribed = shortText(describedByText, 200);
          if (fromDescribed) return fromDescribed;
          const fromDescriptionAttr = shortText(element.getAttribute("description"), 200);
          if (fromDescriptionAttr) return fromDescriptionAttr;
          const fieldRoot = element.closest(".field, .form-group, .application-question, .question, [class*='question' i], [class*='field' i], [data-qa], [data-field]");
          if (!fieldRoot) return "";
          const heading = fieldRoot.querySelector(":scope > label, :scope > legend, :scope > .label, :scope > .question-label, :scope > p, :scope > div > label, label");
          if (heading && !heading.contains(element)) {
            const clone = heading.cloneNode(true);
            clone.querySelectorAll("input, select, textarea, button").forEach((child) => child.remove());
            const text = (clone.textContent || "").replace(/\s+/g, " ").trim();
            if (text && text.length < 200) return text;
          }
          return "";
        };
        const dataHint = element.getAttribute("data-qa")
          || element.getAttribute("data-field")
          || element.getAttribute("data-testid")
          || element.getAttribute("data-name")
          || "";
        const isUseless = (cleaned) => {
          if (!cleaned) return true;
          if (/^(required|\*|optional|question\s*\d+)$/i.test(cleaned)) return true;
          if (/^(question\s*\d+\s*)?required(\s*question)?$/i.test(cleaned)) return true;
          if (/^(input|field|select|textarea|question)[\d\s_-]*$/i.test(cleaned)) return true;
          if (/^select(\s+\w+)?\.?$|^select\.{0,3}$|^please select\.?$|^choose(\s+one)?\.?$/i.test(cleaned)) return true;
          if (/^select\s*\.{1,3}$/i.test(cleaned)) return true;
          if (/^(questionnaire(\s+field)?|boolean(\s+value)?|text|answer(s)?|value|field)$/i.test(cleaned)) return true;
          return false;
        };
        const pickText = (...candidates) => {
          for (const candidate of candidates) {
            const text = String(candidate || "").replace(/\s+/g, " ").trim();
            if (!text || text.length > 180) continue;
            const cleaned = text
              .replace(/^\*+\s*/, "")
              .replace(/\s*\*+$/, "")
              .replace(/\(\s*required\s*\)/gi, "")
              .replace(/\brequired\b/gi, " ")
              .replace(/\s+/g, " ")
              .trim();
            if (isUseless(cleaned)) continue;
            return cleaned;
          }
          return "";
        };
        const humanize = (value) => {
          const raw = String(value || "").trim();
          if (!raw) return "";
          const leaf = raw.includes("[")
            ? (raw.match(/\[([^\]]+)\]/g) || []).map((part) => part.slice(1, -1)).filter(Boolean).pop() || raw
            : raw.split(/[./#]/).pop() || raw;
          const spaced = leaf.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();
          if (isUseless(spaced)) return "";
          return spaced.replace(/\b\w/g, (char) => char.toUpperCase());
        };
        // Prefer IDL type (normalized) over raw attribute — avoids treating checkboxes as text.
        const type = (() => {
          if (element.tagName === "SELECT") return "select";
          if (element.tagName === "TEXTAREA") return "textarea";
          if (element instanceof HTMLInputElement && element.type) return String(element.type).toLowerCase();
          return String(element.getAttribute("type") || "text").toLowerCase();
        })();
        const isChoice = type === "checkbox" || type === "radio";
        const groupLabel = isChoice
          ? pickText(groupHeading(), labelledBy, siblingText(), humanize(name), humanize(dataHint))
          : "";
        // Prefer fieldset/group heading and nearby labels over placeholder/"Select..."/generic names
        const label = isChoice
          ? pickText(groupLabel, labelledBy, shortText(optionLabel, 100), siblingText(), groupHeading(), humanize(dataHint), humanize(name), humanize(id), element.getAttribute("aria-label"))
          : pickText(groupHeading(), labelledBy, readLabelText(labelNode), siblingText(), humanize(dataHint), humanize(name), humanize(id), element.getAttribute("aria-label"), element.getAttribute("placeholder"), element.getAttribute("title"));
        const selfRequired = element.required || element.getAttribute("aria-required") === "true";
        const groupRequired = !!element.closest("fieldset[required], [aria-required='true'], .required");
        // For choice options, do not treat every option as required just because the group is.
        const required = isChoice ? selfRequired : (selfRequired || /\*\s*$|required/i.test(label) || groupRequired);
        return {
          tag: element.tagName.toLowerCase(),
          type,
          id,
          value: element.getAttribute("value") || "",
          name: name || id || dataHint,
          label: label.trim(),
          optionLabel: (optionLabel || "").trim(),
          groupLabel: (groupLabel || "").trim(),
          groupRequired: isChoice ? (groupRequired || /\*\s*$|required/i.test(groupLabel || label)) : false,
          required,
        };
      });
      if (isSkippableFieldMeta(info)) continue;
      collected.push({ index, field, info });
    }

    const checkboxGroups = new Map();
    const radioGroups = new Map();
    const singles = [];
    for (const item of collected) {
      const { info } = item;
      if (info.type === "checkbox" && info.name) {
        const list = checkboxGroups.get(info.name) || [];
        list.push(item);
        checkboxGroups.set(info.name, list);
      } else if (info.type === "radio" && info.name) {
        const list = radioGroups.get(info.name) || [];
        list.push(item);
        radioGroups.set(info.name, list);
      } else {
        singles.push(item);
      }
    }
    // Lone boolean checkboxes stay as singles; array names / multi prompts stay grouped.
    for (const [name, list] of [...checkboxGroups.entries()]) {
      if (list.length >= 2 || isCheckboxGroupName(name)) continue;
      const label = list[0]?.info?.groupLabel || list[0]?.info?.label || "";
      if (!isBooleanChoiceLabel(label) && /\b(country|countries|select all|which of)\b/i.test(label)) continue;
      checkboxGroups.delete(name);
      singles.push(...list);
    }

    // Fill text/select/file first so checkbox mutations cannot rematerialize nth() locators.
    const choiceSingles = [];
    for (const item of singles) {
      const { index, info } = item;
      const field = stabilizeField(scope, item);
      const key = questionKey(info.name, info.label, index);
      let displayLabel = sanitizeLabel(compactLabel(info.groupLabel || info.label))
        || humanizeFieldName(info.name)
        || humanizeFieldName(info.label)
        || "";
      if (!displayLabel || isUselessLabel(displayLabel)) displayLabel = `Question ${index + 1}`;
      const liveType = await liveFieldType(field, info.type);
      if (liveType === "checkbox" || liveType === "radio" || info.type === "checkbox" || info.type === "radio") {
        choiceSingles.push({ item, field, key, displayLabel, liveType });
        continue;
      }
      if (liveType === "file" || info.type === "file") {
        if (resumePath && /resume|cv/i.test(`${info.name} ${info.label}`)) await field.setInputFiles(resumePath);
        continue;
      }
      const answer = lookupAnswer(application.answers, { key, name: info.name, label: displayLabel }, profile);
      let filled = false;
      const isSelect = info.tag === "select" || liveType === "select";
      const isLocationField = isLocationAutocompleteLabel(displayLabel, info.name);
      const isPhoneField = isPhoneFieldLabel(displayLabel, info.name);
      let dialOk = true;
      if (answer || isLocationField || isPhoneField) {
        if (isPhoneField) {
          const countryAnswer = lookupAnswer(application.answers, { key: "country", name: "country", label: "Country" }, profile)
            || application.answers?.country
            || profile.country
            || "";
          dialOk = await fillPhoneCountryDial(field, countryAnswer, profile);
        }
        if (isLocationField && !isSelect) {
          filled = await fillLocationAutocomplete(field, answer || formatLocationQuery("", profile), profile);
        } else if (isSelect) {
          const options = await selectOptionTexts(field);
          const coerced = matchOptionLabel(options, answer) || answer;
          filled = await fillSelect(field, coerced);
          if (!filled && options.length) {
            // City fields often list "Redmond, WA" — retry with includes match already in matchOptionLabel;
            // if still empty try the first option that contains the answer token.
            const token = normalize(answer).split(/\s+/)[0];
            const fuzzy = options.find((option) => normalize(option).includes(token) && token.length >= 3);
            if (fuzzy) filled = await fillSelect(field, fuzzy);
          }
        } else if (answer) {
          filled = await fillTextControl(field, answer);
          // Some Greenhouse "text" questions are actually selects rematerialized after load.
          if (!filled) {
            const retryType = await liveFieldType(field, liveType);
            if (retryType === "select") {
              const options = await selectOptionTexts(field);
              const coerced = matchOptionLabel(options, answer) || answer;
              filled = await fillSelect(field, coerced);
            }
          }
        }
      }
      let value = await field.inputValue().catch(() => "");
      if (answer && !String(value || "").trim() && !filled) {
        // nth() locators can rematerialize — retry once with a fresh stable locator.
        const retryField = stabilizeField(scope, item);
        if (isLocationField && !isSelect) {
          filled = await fillLocationAutocomplete(retryField, answer, profile);
        } else if (isSelect || await liveFieldType(retryField, liveType) === "select") {
          const options = await selectOptionTexts(retryField);
          const coerced = matchOptionLabel(options, answer) || answer;
          filled = await fillSelect(retryField, coerced);
        } else {
          filled = await fillTextControl(retryField, answer);
        }
        value = await retryField.inputValue().catch(() => "");
      }
      if (isLocationField && filled) {
        const latLon = await locationLatLonCommitted(stabilizeField(scope, item));
        if (latLon.hasHidden && !latLon.ok) filled = false;
      }
      const digits = (text) => String(text || "").replace(/\D+/g, "");
      const hasValue = Boolean(String(value || "").trim());
      const digitsMatch = Boolean(
        answer && digits(value) && digits(answer) && (digits(value).includes(digits(answer)) || digits(answer).includes(digits(value))),
      );
      // Trust a successful select fill even when inputValue is briefly stale after rematerialization.
      const looksFilled = hasValue || digitsMatch || (isSelect && filled) || (isLocationField && filled);
      const phoneLooksFilled = isPhoneField ? (looksFilled && dialOk) : looksFilled;
      if (info.required && !phoneLooksFilled) {
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        const options = isSelect ? await selectOptionTexts(field) : undefined;
        let missingType = isSelect ? "select" : info.tag === "textarea" || liveType === "textarea" ? "textarea" : "text";
        if (isLocationField && !isSelect) missingType = "autocomplete";
        if (isPhoneField) missingType = "phone";
        missing.push({
          key,
          label: displayLabel,
          type: missingType,
          options: options?.filter((opt) => opt.length > 0 && !/^(select|please select|choose)/i.test(opt)),
          required: true,
          hadAnswer: Boolean(answer),
          placeholder: missingType === "autocomplete" ? "e.g. Redmond, Washington, United States" : undefined,
        });
      }
    }

    for (const [, group] of checkboxGroups) {
      const first = group[0];
      const groupLabel = sanitizeLabel(compactLabel(first.info.groupLabel))
        || humanizeFieldName(first.info.name)
        || "Select all that apply";
      const key = groupQuestionKey(first.info.name, groupLabel, first.index);
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      const options = choiceOptionLabels(group, groupLabel);
      const answer = lookupAnswer(application.answers, { key, name: first.info.name, label: groupLabel }, profile);
      const selections = resolveMultiselectSelections(options, answer, profile);
      for (const item of group) {
        const target = stabilizeField(scope, item);
        const optionText = item.info.optionLabel || item.info.label;
        if (selections.some((selected) => optionMatchesTokens(optionText, [selected]))) {
          await target.check().catch(() => {});
        }
      }
      const anyChecked = await Promise.all(group.map((item) => stabilizeField(scope, item).isChecked().catch(() => false))).then((flags) => flags.some(Boolean));
      if (first.info.groupRequired && !anyChecked) {
        missing.push({ key, label: groupLabel, type: "multiselect", options, required: true });
      }
    }

    for (const [, group] of radioGroups) {
      const first = group[0];
      const groupLabel = sanitizeLabel(compactLabel(first.info.groupLabel || first.info.label))
        || humanizeFieldName(first.info.name)
        || `Question ${first.index + 1}`;
      const key = groupQuestionKey(first.info.name, groupLabel, first.index);
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      const options = choiceOptionLabels(group, groupLabel);
      const answer = lookupAnswer(application.answers, { key, name: first.info.name, label: groupLabel }, profile);
      const matched = matchOptionLabel(options, answer);
      if (matched) {
        const targetItem = group.find((item) => normalize(item.info.optionLabel || item.info.label) === normalize(matched));
        if (targetItem) await stabilizeField(scope, targetItem).check().catch(() => {});
      } else if (/^(true|yes|1|on)$/i.test(answer) && options.length) {
        const yesOpt = matchOptionLabel(options, "Yes") || options[0];
        const targetItem = group.find((item) => normalize(item.info.optionLabel || item.info.label) === normalize(yesOpt));
        if (targetItem) await stabilizeField(scope, targetItem).check().catch(() => {});
      }
      const anyChecked = await Promise.all(group.map((item) => stabilizeField(scope, item).isChecked().catch(() => false))).then((flags) => flags.some(Boolean));
      if ((first.info.groupRequired || first.info.required) && !anyChecked) {
        missing.push({ key, label: isUselessLabel(groupLabel) ? `Question ${first.index + 1}` : groupLabel, type: "select", options, required: true });
      }
    }

    for (const { field, key, displayLabel, item } of choiceSingles) {
      const info = item.info;
      const optionText = info.optionLabel || displayLabel;
      const answer = lookupAnswer(application.answers, { key, name: info.name, label: displayLabel }, profile);
      const matched = matchOptionLabel([optionText], answer);
      if (matched || /^(true|yes|1|on)$/i.test(answer) || optionMatchesTokens(optionText, parseMultiselectAnswer(answer).concat(multiselectTokensFromProfile(profile)))) {
        await field.check().catch(() => {});
      } else if (info.required && !await field.isChecked().catch(() => false)) {
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          if (isBooleanChoiceLabel(displayLabel)) {
            missing.push({ key, label: displayLabel, type: "checkbox", required: true });
          } else {
            missing.push({ key, label: displayLabel, type: "text", required: true });
          }
        }
      }
    }
    if (missing.length) {
      const unanswered = missing.filter((item) => !item.hadAnswer);
      const detail = unanswered.length
        ? `${unanswered.length} required employer question(s) need your answer.`
        : `Could not apply your saved answers on the employer form (${missing.map((item) => item.label).join(", ")}). Open the employer page or retry.`;
      return {
        outcome: "needs_action",
        detail,
        questions: missing.map(({ hadAnswer, ...question }) => question),
      };
    }

    // Advance multi-step employer flows (Continue/Next) until a final submit appears.
    for (let step = 0; step < 4; step += 1) {
      const submit = await findSubmitControl([scope, root, page]);
      if (submit) {
        await submit.scrollIntoViewIfNeeded().catch(() => {});
        await submit.click();
        await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
        const confirmation = await page.locator("body").innerText().catch(() => "");
        if (!/thank you|application (has been )?(submitted|received)|thanks for applying|application was sent/i.test(confirmation)) {
          return { outcome: "needs_action", detail: "Employer did not return a recognizable submission confirmation.", questions: [{ key: "submission_confirmation", label: "Review the employer page for an error or confirmation.", type: "blocking", required: true }] };
        }
        return { outcome: "submitted", provider: "ApplyPilot Playwright", receiptId: `${application.id}:${Date.now()}`, detail: `Confirmed at ${page.url()}` };
      }
      const advanced = await clickContinueControl([scope, root, page]);
      if (!advanced) break;
      await page.waitForTimeout(1000);
    }

    return { outcome: "needs_action", detail: "The employer submission control could not be identified.", questions: [{ key: "submission_control", label: "Open the original listing to review its unsupported submission step.", type: "blocking", required: true }] };
  } finally { await browser.close(); }
}

const SUBMIT_NAME = /submit(\s+(my\s+)?application)?|send(\s+my)?\s+application|finish(\s+application)?|complete(\s+application)?/i;
const CONTINUE_NAME = /^(continue|next|save and continue|review)\b/i;

/** Prefer an actionable, visible submit control across form / page / frames. */
async function findSubmitControl(contexts) {
  for (const context of contexts) {
    if (!context) continue;
    const candidates = [
      context.locator('#submit_app, [data-qa="btn-submit"], [data-testid*="submit" i], [name="commit"]'),
      context.locator('button[type="submit"], input[type="submit"]'),
      context.getByRole("button", { name: SUBMIT_NAME }),
      context.getByRole("link", { name: SUBMIT_NAME }),
    ];
    for (const locator of candidates) {
      const count = await locator.count().catch(() => 0);
      for (let i = count - 1; i >= 0; i -= 1) {
        const item = locator.nth(i);
        if (!(await item.isVisible().catch(() => false))) continue;
        if (await item.isDisabled().catch(() => false)) continue;
        const labelText = await item.innerText().catch(() => "");
        const valueText = await item.getAttribute("value").catch(() => "");
        const text = normalize(labelText || valueText || "");
        // Skip MyGreenhouse / listing CTAs that are not the final form submit.
        if (/quick apply|mygreenhouse|^apply( now)?$/.test(text)) continue;
        return item;
      }
    }
  }
  return null;
}

async function clickContinueControl(contexts) {
  for (const context of contexts) {
    if (!context) continue;
    const candidates = [
      context.getByRole("button", { name: CONTINUE_NAME }),
      context.locator('button[type="button"], input[type="button"], a[role="button"]').filter({ hasText: CONTINUE_NAME }),
    ];
    for (const locator of candidates) {
      const count = await locator.count().catch(() => 0);
      for (let i = 0; i < count; i += 1) {
        const item = locator.nth(i);
        if (!(await item.isVisible().catch(() => false))) continue;
        if (await item.isDisabled().catch(() => false)) continue;
        await item.click();
        return true;
      }
    }
  }
  return false;
}

export { knownAnswer, questionKey, groupQuestionKey, fillSelect, compactLabel, humanizeFieldName, isUselessLabel, sanitizeLabel, answerKeyBase, lookupAnswer, parseMultiselectAnswer, optionMatchesTokens, multiselectTokensFromProfile, resolveMultiselectSelections, matchOptionLabel, choiceOptionLabels, isBooleanChoiceLabel, isCheckboxGroupName, formatLocationQuery, isLocationAutocompleteLabel, isPhoneFieldLabel, SUBMIT_NAME, CONTINUE_NAME, resolveApplicationUrl, pageHasBlockingCaptcha };
