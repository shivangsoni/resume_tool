/**
 * Inventory every Stripe Greenhouse application field + metadata (no submit).
 * Usage: node scripts/inventory-stripe-fields.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(__dirname, "..", "tmp");
const URL = process.env.STRIPE_URL
  || "https://job-boards.greenhouse.io/embed/job_app?for=stripe&token=8075570";

await mkdir(tmpDir, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage", "--no-sandbox"] });
const page = await browser.newPage();
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector("#application-form, #first_name, form", { timeout: 30000 });
await page.waitForTimeout(2500);

const inventory = await page.evaluate(() => {
  const clean = (value, max = 240) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max);

  const labelFor = (el) => {
    const id = el.id || "";
    if (id) {
      const explicit = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (explicit) {
        const clone = explicit.cloneNode(true);
        clone.querySelectorAll("input, select, textarea, button").forEach((n) => n.remove());
        const text = clean(clone.textContent);
        if (text) return text;
      }
    }
    const wrap = el.closest("label");
    if (wrap) {
      const clone = wrap.cloneNode(true);
      clone.querySelectorAll("input, select, textarea, button").forEach((n) => n.remove());
      const text = clean(clone.textContent);
      if (text) return text;
    }
    const labelledBy = (el.getAttribute("aria-labelledby") || "")
      .split(/\s+/)
      .filter(Boolean)
      .map((ref) => document.getElementById(ref)?.textContent || "")
      .join(" ");
    if (clean(labelledBy)) return clean(labelledBy);
    return clean(el.getAttribute("aria-label") || el.getAttribute("placeholder") || "");
  };

  const sectionFor = (el) => {
    const heading = el.closest("fieldset, section, .field, .application-question, [class*='question']")
      ?.querySelector("legend, h2, h3, h4, .section-header");
    return clean(heading?.textContent || "", 120);
  };

  const classify = (el, meta) => {
    const hay = `${meta.label} ${meta.id} ${meta.name} ${meta.className}`.toLowerCase();
    if (meta.tag === "select" || meta.role === "combobox" || meta.className.includes("select__input")) {
      if (/school--/.test(meta.id) || /\bschool\b/.test(hay)) return "react-select:school";
      if (/degree--/.test(meta.id) || /\bdegree\b/.test(hay)) return "react-select:degree";
      if (meta.id === "candidate-location" || /location \(city\)/.test(hay)) return "react-select:location";
      if (meta.id === "country" || /^country\*?$/.test(meta.label.toLowerCase())) return "react-select:phone-country";
      if (/question_/.test(meta.id)) return "react-select:question";
      if (meta.tag === "select") return "native-select";
      return "react-select";
    }
    if (meta.type === "file") return "file";
    if (meta.type === "checkbox") return "checkbox";
    if (meta.type === "radio") return "radio";
    if (meta.type === "hidden") return "hidden";
    if (meta.tag === "textarea") return "textarea";
    if (meta.type === "email" || /email/.test(hay)) return "email";
    if (meta.type === "tel" || meta.id === "phone" || /^phone/.test(hay)) return "phone";
    if (meta.type === "submit" || meta.type === "button") return "button";
    return meta.type || "text";
  };

  const root = document.querySelector("#application-form") || document.querySelector("form") || document.body;
  const nodes = [...root.querySelectorAll("input, select, textarea, button")];

  const fields = nodes.map((el, index) => {
    const tag = el.tagName.toLowerCase();
    const type = tag === "select" ? "select"
      : tag === "textarea" ? "textarea"
      : tag === "button" ? "button"
      : String(el.type || "text").toLowerCase();
    const id = el.id || "";
    const name = el.getAttribute("name") || "";
    const className = String(el.className || "");
    const role = el.getAttribute("role") || "";
    const label = labelFor(el);
    const required = Boolean(el.required || el.getAttribute("aria-required") === "true" || /\*/.test(label));
    const meta = {
      index,
      tag,
      type,
      id,
      name,
      label,
      section: sectionFor(el),
      required,
      role,
      className: className.slice(0, 120),
      placeholder: clean(el.getAttribute("placeholder"), 80),
      autocomplete: el.getAttribute("autocomplete") || "",
      ariaLabel: clean(el.getAttribute("aria-label"), 120),
      ariaHaspopup: el.getAttribute("aria-haspopup") || "",
      ariaExpanded: el.getAttribute("aria-expanded") || "",
      ariaControls: el.getAttribute("aria-controls") || "",
      ariaAutocomplete: el.getAttribute("aria-autocomplete") || "",
      value: tag === "input" && type !== "file" ? clean(el.value, 80) : "",
      checked: type === "checkbox" || type === "radio" ? Boolean(el.checked) : null,
      disabled: Boolean(el.disabled),
      readOnly: Boolean(el.readOnly),
      visible: !!(el.offsetParent || (el.getClientRects?.().length ?? 0)),
      options: [],
    };
    meta.kind = classify(el, meta);

    if (tag === "select") {
      meta.options = [...el.querySelectorAll("option")]
        .map((o) => clean(o.textContent, 120))
        .filter((t) => t && !/^select/i.test(t))
        .slice(0, 40);
      meta.optionCount = el.options?.length || meta.options.length;
    }

    return meta;
  });

  // Group checkboxes/radios by name for summary
  const groups = {};
  for (const field of fields) {
    if ((field.type === "checkbox" || field.type === "radio") && field.name) {
      if (!groups[field.name]) {
        groups[field.name] = {
          name: field.name,
          type: field.type,
          label: field.label,
          section: field.section,
          count: 0,
          sampleValues: [],
        };
      }
      groups[field.name].count += 1;
      if (groups[field.name].sampleValues.length < 8 && field.value) {
        groups[field.name].sampleValues.push(field.value);
      }
    }
  }

  const pageTitle = clean(document.title, 160);
  const jobTitle = clean(document.querySelector("h1, .app-title, .job__title")?.textContent, 160);

  return {
    pageTitle,
    jobTitle,
    url: location.href,
    fieldCount: fields.length,
    visibleCount: fields.filter((f) => f.visible).length,
    kindCounts: fields.reduce((acc, f) => {
      acc[f.kind] = (acc[f.kind] || 0) + 1;
      return acc;
    }, {}),
    fields,
    groups: Object.values(groups),
  };
});

// For react-select question fields, briefly open and sample options (bounded).
const sampleIds = inventory.fields
  .filter((f) => f.visible && (f.kind.startsWith("react-select") || f.id === "candidate-location"))
  .map((f) => f.id)
  .filter(Boolean)
  .slice(0, 20);

const optionSamples = {};
for (const id of sampleIds) {
  try {
    const field = page.locator(`[id="${id}"]`);
    if (!(await field.isVisible().catch(() => false))) continue;
    const control = page.locator(`[id="${id}"]`).locator(
      "xpath=ancestor::div[contains(@class,'select__container')][1]//div[contains(@class,'select__control')]",
    ).first();
    if (await control.isVisible().catch(() => false)) {
      await control.click({ timeout: 3000 });
    } else {
      await field.click({ timeout: 3000 });
    }
    await page.waitForTimeout(500);
    // Type a short probe for searchable lists
    if (/school/i.test(id)) {
      await field.fill("").catch(() => {});
      await field.pressSequentially("Davis", { delay: 20 }).catch(() => {});
      await page.waitForTimeout(1200);
    } else if (/degree/i.test(id)) {
      await field.fill("").catch(() => {});
      await field.pressSequentially("Master", { delay: 20 }).catch(() => {});
      await page.waitForTimeout(800);
    } else if (id === "country") {
      await field.fill("").catch(() => {});
      await field.pressSequentially("United States", { delay: 15 }).catch(() => {});
      await page.waitForTimeout(700);
    } else if (id === "candidate-location") {
      await field.fill("").catch(() => {});
      await field.pressSequentially("Redmond", { delay: 30 }).catch(() => {});
      await page.waitForTimeout(1500);
    } else if (/question_/i.test(id)) {
      await page.waitForTimeout(400);
    }

    const options = await page.evaluate(() =>
      [...document.querySelectorAll(".select__menu")]
        .filter((m) => m.offsetParent)
        .flatMap((m) => [...m.querySelectorAll(".select__option, [role=option]")]
          .map((o) => (o.textContent || "").replace(/\s+/g, " ").trim())
          .filter(Boolean))
        .slice(0, 25),
    );
    optionSamples[id] = options;
    await page.keyboard.press("Escape").catch(() => {});
    await page.evaluate(() => {
      document.querySelectorAll(".select__menu").forEach((el) => el.remove());
    }).catch(() => {});
    await page.waitForTimeout(200);
  } catch (error) {
    optionSamples[id] = { error: String(error?.message || error) };
  }
}

for (const field of inventory.fields) {
  if (field.id && optionSamples[field.id]) {
    const sample = optionSamples[field.id];
    if (Array.isArray(sample)) {
      field.sampledOptions = sample;
      field.sampledOptionCount = sample.length;
    } else {
      field.sampleError = sample.error;
    }
  }
}

inventory.optionSamples = optionSamples;
inventory.fetchedAt = new Date().toISOString();

const outPath = path.join(tmpDir, "stripe-field-inventory.json");
await writeFile(outPath, JSON.stringify(inventory, null, 2));
await page.screenshot({ path: path.join(tmpDir, "stripe-field-inventory.png"), fullPage: true }).catch(() => {});
await browser.close();

console.log(JSON.stringify({
  url: inventory.url,
  jobTitle: inventory.jobTitle,
  fieldCount: inventory.fieldCount,
  visibleCount: inventory.visibleCount,
  kindCounts: inventory.kindCounts,
  groupCount: inventory.groups.length,
  outPath,
}, null, 2));
