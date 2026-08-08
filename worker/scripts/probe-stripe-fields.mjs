/**
 * Dump School / Degree / Country / Years field structure + option lists.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(__dirname, "..", "tmp");
const URL = "https://job-boards.greenhouse.io/embed/job_app?for=stripe&token=8075570";

await mkdir(tmpDir, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage", "--no-sandbox"] });
const page = await browser.newPage();
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector("#first_name, #candidate-location", { timeout: 30000 });
await page.waitForTimeout(2500);

const dump = await page.evaluate(() => {
  const labels = [...document.querySelectorAll("label")].map((l) => {
    const text = (l.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120);
    const forId = l.getAttribute("for");
    const input = forId
      ? document.getElementById(forId)
      : l.querySelector("input, select, textarea") || l.parentElement?.querySelector("input, select, textarea");
    return {
      text,
      forId,
      inputId: input?.id || null,
      inputName: input?.name || null,
      inputClass: (input?.className || "").toString().slice(0, 80),
      role: input?.getAttribute?.("role") || null,
      type: input?.type || input?.tagName,
    };
  });

  const education = [...document.querySelectorAll("[id*='education'], [class*='education'], [data-testid*='education']")].map((el) => ({
    tag: el.tagName,
    id: el.id,
    className: String(el.className).slice(0, 100),
    html: el.outerHTML.slice(0, 300),
  }));

  const selects = [...document.querySelectorAll("input.select__input, input[role=combobox], select")].map((el) => {
    const container = el.closest(".select-shell, .select__container, .select, [class*='select']") || el.parentElement;
    const label =
      (el.id && document.querySelector(`label[for="${el.id}"]`)?.textContent) ||
      container?.previousElementSibling?.textContent ||
      el.closest("div")?.querySelector("label")?.textContent ||
      "";
    return {
      id: el.id,
      name: el.name,
      className: String(el.className).slice(0, 80),
      ariaLabel: el.getAttribute("aria-label"),
      label: String(label).replace(/\s+/g, " ").trim().slice(0, 100),
      placeholder: el.placeholder,
    };
  });

  return { labels: labels.filter((l) => /school|degree|country|year|phone|reside|experience/i.test(l.text)), selects, education: education.slice(0, 20) };
});

async function openAndList(labelContains) {
  const input = page.locator(`xpath=//label[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${labelContains.toLowerCase()}')]/following::input[1]`).first();
  const visible = await input.isVisible().catch(() => false);
  if (!visible) return { labelContains, visible: false };
  await input.scrollIntoViewIfNeeded();
  await input.click({ timeout: 4000 });
  await page.waitForTimeout(600);
  // type a probe for school/degree/country
  const probeType = labelContains.includes("school")
    ? "Davis"
    : labelContains.includes("degree")
      ? "Master"
      : labelContains.includes("reside")
        ? "United"
        : labelContains.includes("year")
          ? ""
          : labelContains.includes("country") && !labelContains.includes("reside")
            ? "United"
            : "";
  if (probeType) {
    await input.fill("").catch(() => {});
    await input.pressSequentially(probeType, { delay: 40 }).catch(() => {});
    await page.waitForTimeout(1200);
  }
  const options = await page.locator(".select__option, [role=option]").allTextContents().catch(() => []);
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(300);
  return {
    labelContains,
    visible: true,
    id: await input.getAttribute("id"),
    name: await input.getAttribute("name"),
    className: await input.getAttribute("class"),
    options: options.map((o) => o.trim()).filter(Boolean).slice(0, 40),
  };
}

const probes = [];
for (const key of ["school", "degree", "country where you currently reside", "years of experience", "select a country"]) {
  try {
    probes.push(await openAndList(key));
  } catch (e) {
    probes.push({ labelContains: key, error: String(e) });
  }
}

// Also try education-specific ids
const eduInputs = await page.locator("#education_school, input[id*='school'], input[name*='school'], input[id*='education']").evaluateAll((els) =>
  els.map((el) => ({ id: el.id, name: el.name, className: String(el.className).slice(0, 80) })),
);

const report = { dump, probes, eduInputs };
await writeFile(path.join(tmpDir, "stripe-fields-probe.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
