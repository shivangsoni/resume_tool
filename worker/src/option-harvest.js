/**
 * Playwright helpers to harvest select / react-select option lists from employer forms.
 */
import { loadOptionCatalog, saveOptionCatalog } from "./option-catalog.js";

export async function readVisibleSelectOptions(page) {
  return page.evaluate(() => {
    const menus = [...document.querySelectorAll(".select__menu")].filter((m) => m.offsetParent);
    return menus.flatMap((menu) =>
      [...menu.querySelectorAll(".select__option, [role=option]")]
        .map((o) => o.textContent.replace(/\s+/g, " ").trim())
        .filter(Boolean),
    );
  }).catch(() => []);
}

async function closeMenus(page) {
  await page.keyboard.press("Escape").catch(() => {});
  await page.evaluate(() => {
    document.querySelectorAll(".select__menu").forEach((el) => el.remove());
  }).catch(() => {});
  await page.waitForTimeout(100);
}

async function openReactSelect(page, field) {
  await closeMenus(page);
  const control = field.locator("xpath=ancestor::div[contains(@class,'select__container')][1]//div[contains(@class,'select__control')]").first();
  if (await control.isVisible().catch(() => false)) {
    await control.scrollIntoViewIfNeeded().catch(() => {});
    await control.click({ timeout: 3000 }).catch(() => {});
  } else {
    await field.scrollIntoViewIfNeeded().catch(() => {});
    await field.click({ timeout: 3000 }).catch(() => {});
  }
  await page.waitForTimeout(250);
}

/**
 * Harvest options for one react-select / combobox, optionally typing filterText.
 */
export async function harvestReactSelectOptions(page, field, { filterText = "", waitMs = 700 } = {}) {
  if (!(await field.isVisible().catch(() => false))) return [];
  await openReactSelect(page, field);
  if (filterText) {
    await field.fill("").catch(() => {});
    await field.pressSequentially(String(filterText).slice(0, 40), { delay: 20 }).catch(() => {});
    await page.waitForTimeout(waitMs);
  } else {
    await page.waitForTimeout(400);
  }
  const options = await readVisibleSelectOptions(page);
  await closeMenus(page);
  return options.filter((text) => !/\+\d+$/.test(text) || /united states|country/i.test(filterText));
}

const normalize = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Distinctive typeahead tokens from the profile school (no alphabet dumps). */
export function schoolSearchTokens(profile = {}) {
  const school = String(profile.school || "").trim();
  const tokens = [];
  if (/university of california.*davis|uc\s*davis/i.test(school)) tokens.push("Davis");
  else if (school) {
    const parts = school.split(/[\s,/-]+/).filter((part) => part.length > 3 && !/^(university|college|institute|school)$/i.test(part));
    if (parts.length) tokens.push(parts[parts.length - 1]);
    if (parts[0] && parts[0] !== parts[parts.length - 1]) tokens.push(parts[0]);
  }
  return [...new Set(tokens.map((t) => String(t).trim()).filter(Boolean))].slice(0, 2);
}

/** True when cache already contains a usable match for the profile school. */
export function cacheCoversSchool(cached, profile = {}) {
  const school = String(profile.school || "").trim();
  if (!school || !cached?.length) return false;
  const needle = normalize(school);
  if (cached.some((option) => normalize(option) === needle)) return true;
  if (/university of california.*davis|uc\s*davis/i.test(school)) {
    return cached.some((option) => /california\s*-\s*davis/i.test(option));
  }
  const tokens = schoolSearchTokens(profile);
  return tokens.some((token) => {
    const t = normalize(token);
    return t.length >= 4 && cached.some((option) => normalize(option).includes(t));
  });
}

/**
 * Harvest school typeahead options (cache first; live probe only when needed).
 */
export async function harvestSchoolOptions(page, field, profile = {}, { board = "stripe" } = {}) {
  const cached = await loadOptionCatalog(board, "school");
  if (cacheCoversSchool(cached, profile)) {
    return cached;
  }

  const live = new Set(cached);
  const tokens = schoolSearchTokens(profile);
  // Cold cache: one short distinctive probe only (avoid a/m/s alphabet sweeps that blow the 8‑min budget).
  for (const token of tokens.slice(0, 1)) {
    const batch = await harvestReactSelectOptions(page, field, { filterText: token, waitMs: 700 });
    for (const option of batch) live.add(option);
  }
  const list = [...live];
  if (list.length > (cached.length || 0)) {
    await saveOptionCatalog(board, "school", list);
  }
  return list.length ? list : cached;
}

function guessBoard(application = {}) {
  const company = String(application.company || "").toLowerCase();
  if (company.includes("stripe")) return "stripe";
  try {
    const host = new URL(String(application.sourceUrl || "")).hostname.toLowerCase();
    if (host.includes("stripe.com")) return "stripe";
  } catch { /* ignore */ }
  return "greenhouse";
}

export function fieldKindFromLabel(label = "", id = "") {
  const text = `${label} ${id}`.toLowerCase();
  // Experience before school — "software engineer" questions must not hit /school|college/.
  if (/years? of experience|software engineer/.test(text) && !/school--|degree--/i.test(id)) return "experience_years";
  if (/school--|degree--/i.test(id) || (/school|university|college|alma mater/.test(text) && !/years? of experience/.test(text))) {
    if (/\bdegree\b/.test(text) || /degree--/i.test(id)) return "degree";
    return "school";
  }
  if (/\bdegree\b/.test(text) || /degree--/i.test(id)) return "degree";
  if (/currently reside|country where you/.test(text)) return "reside_country";
  if (/whatsapp|opt-?in/.test(text)) return "whatsapp";
  if (/sponsor|work permit/.test(text)) return "sponsorship";
  if (/authorized to work/.test(text)) return "work_auth";
  if (/work remotely|plan to work remotely/.test(text)) return "remote";
  if (/employed by stripe/.test(text)) return "stripe_employee";
  if (/^country\*?$|#country/.test(text) || id === "country") return "phone_country";
  if (/candidate-location|location \(city\)/i.test(text) || id === "candidate-location") return "location";
  return "select";
}

/**
 * Build a catalog of form fields with option lists for matching.
 * @param {import('playwright').Page} page
 * @param {import('playwright').Locator} scope
 * @param {object} profile
 * @param {object} application
 */
export async function harvestFormCatalog(page, scope, profile = {}, application = {}) {
  const board = guessBoard(application);
  const catalog = [];
  let schoolOptionsCache = null;

  const nativeSelects = scope.locator("select");
  const nativeCount = await nativeSelects.count().catch(() => 0);
  for (let i = 0; i < nativeCount; i += 1) {
    const field = nativeSelects.nth(i);
    if (!(await field.isVisible().catch(() => false))) continue;
    const meta = await field.evaluate((el) => {
      const id = el.id || "";
      const name = el.name || "";
      const label = (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent)
        || el.closest("label")?.textContent
        || el.getAttribute("aria-label")
        || name
        || id;
      const options = [...el.querySelectorAll("option")]
        .map((o) => (o.textContent || "").replace(/\s+/g, " ").trim())
        .filter((t) => t && !/^select/i.test(t));
      return {
        id,
        name,
        label: String(label || "").replace(/\s+/g, " ").trim().slice(0, 180),
        options,
        required: el.required || el.getAttribute("aria-required") === "true",
      };
    }).catch(() => null);
    if (!meta) continue;
    catalog.push({
      key: meta.id || meta.name || `select_${i}`,
      name: meta.name,
      label: meta.label || meta.name || meta.id,
      type: "select",
      options: meta.options,
      required: meta.required,
      fieldKind: fieldKindFromLabel(meta.label, meta.id),
    });
  }

  const comboboxes = scope.locator("input.select__input, input[role='combobox']");
  const comboCount = await comboboxes.count().catch(() => 0);
  for (let i = 0; i < comboCount; i += 1) {
    const field = comboboxes.nth(i);
    if (!(await field.isVisible().catch(() => false))) continue;
    const id = (await field.getAttribute("id").catch(() => "")) || "";
    if (/iti-.*search|gender|hispanic|veteran|disability/i.test(id)) continue;

    const label = await field.evaluate((el) => {
      const fid = el.id || "";
      const text = (fid && document.querySelector(`label[for="${CSS.escape(fid)}"]`)?.textContent)
        || el.getAttribute("aria-label")
        || "";
      return String(text || "").replace(/\s+/g, " ").trim().slice(0, 180);
    }).catch(() => id);

    const kind = fieldKindFromLabel(label, id);
    let options = [];
    if (kind === "location") {
      options = [];
    } else if (kind === "school" || /school--/i.test(id)) {
      if (!schoolOptionsCache) {
        schoolOptionsCache = await harvestSchoolOptions(page, field, profile, { board });
      }
      options = schoolOptionsCache;
    } else if (kind === "phone_country" || id === "country") {
      options = await harvestReactSelectOptions(page, field, { filterText: "United States", waitMs: 600 });
    } else if (kind === "reside_country") {
      options = await harvestReactSelectOptions(page, field, { filterText: "US", waitMs: 600 });
      if (options.length < 2) {
        options = await harvestReactSelectOptions(page, field, { filterText: "", waitMs: 500 });
      }
    } else if (kind === "degree") {
      options = await harvestReactSelectOptions(page, field, { filterText: "Master", waitMs: 800 });
      const more = await harvestReactSelectOptions(page, field, { filterText: "Bachelor", waitMs: 600 });
      options = [...new Set([...options, ...more])];
    } else if (kind === "experience_years") {
      options = await harvestReactSelectOptions(page, field, { filterText: "", waitMs: 500 });
    } else {
      options = await harvestReactSelectOptions(page, field, { filterText: "", waitMs: 400 });
      if (!options.length) {
        options = await harvestReactSelectOptions(page, field, { filterText: "Yes", waitMs: 400 });
      }
    }

    catalog.push({
      key: id || `combobox_${i}`,
      name: id,
      label: label || id || `Question ${i + 1}`,
      type: "select",
      options: [...new Set(options)],
      required: /\*/.test(label) || /required/i.test(label),
      fieldKind: kind,
    });
  }

  return catalog;
}

/**
 * Map catalog keys (often input ids) onto answer keys used during fill.
 */
export function catalogAnswersForFill(catalog, resolvedAnswers) {
  const out = { ...resolvedAnswers };
  for (const field of catalog || []) {
    const value = resolvedAnswers[field.key];
    if (value == null || value === "") continue;
    out[field.key] = value;
    if (field.label) out[field.label] = value;
    if (field.name) out[field.name] = value;
  }
  return out;
}
