/**
 * Dump Greenhouse School select options (typeahead) for Stripe job forms.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(__dirname, "..", "tmp");
const token = process.env.GH_TOKEN || "8114514";
const URL = `https://job-boards.greenhouse.io/embed/job_app?for=stripe&token=${token}`;

await mkdir(tmpDir, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage", "--no-sandbox"] });
const page = await browser.newPage();
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector("#school--0", { timeout: 30000 });
await page.waitForTimeout(2000);

async function openSchool() {
  await page.keyboard.press("Escape").catch(() => {});
  await page.evaluate(() => document.querySelectorAll(".select__menu").forEach((el) => el.remove()));
  const control = page
    .locator("#school--0")
    .locator("xpath=ancestor::div[contains(@class,'select__container')][1]//div[contains(@class,'select__control')]")
    .first();
  await control.click({ timeout: 5000 });
  await page.waitForTimeout(400);
}

async function optionsVisible() {
  return page.evaluate(() =>
    [...document.querySelectorAll(".select__menu")]
      .filter((m) => m.offsetParent)
      .flatMap((m) => [...m.querySelectorAll(".select__option, [role=option]")].map((o) => o.textContent.replace(/\s+/g, " ").trim()))
      .filter(Boolean),
  );
}

async function readValue() {
  return page.locator("#school--0").evaluate((el) => {
    const root = el.closest(".select") || el.closest(".select__container")?.parentElement;
    return root?.querySelector(".select__single-value")?.textContent?.trim() || "";
  });
}

const probes = [];

// Current value after load
probes.push({ probe: "initial", value: await readValue() });

// Open without typing — Greenhouse school is usually async/search-only
await openSchool();
let opts = await optionsVisible();
probes.push({ probe: "open_empty", count: opts.length, options: opts.slice(0, 50) });
console.log("open_empty", opts.length, opts.slice(0, 10));

// Type queries that expand the list; collect unique options
const queries = [
  "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m",
  "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z",
  "University", "College", "Institute", "Davis", "California", "MIT", "Stanford",
];
const all = new Set();
for (const q of queries) {
  await openSchool();
  const input = page.locator("#school--0");
  await input.fill("");
  await input.pressSequentially(q, { delay: 20 });
  await page.waitForTimeout(900);
  opts = await optionsVisible();
  for (const o of opts) all.add(o);
  probes.push({ probe: `type:${q}`, count: opts.length, sample: opts.slice(0, 8) });
  console.log(`type:${q}`, opts.length, "unique_total", all.size);
}

const sorted = [...all].sort((a, b) => a.localeCompare(b));
const report = {
  url: URL,
  currentValue: await readValue(),
  uniqueCount: sorted.length,
  schools: sorted,
  probes,
};

await writeFile(path.join(tmpDir, `school-options-${token}.json`), JSON.stringify(report, null, 2));
await writeFile(path.join(tmpDir, `school-options-${token}.txt`), sorted.join("\n") + "\n");
await page.screenshot({ path: path.join(tmpDir, `school-options-${token}.png`) });
console.log("\nWrote", sorted.length, "unique schools");
console.log("Sample:", sorted.filter((s) => /davis|california/i.test(s)).slice(0, 20));
await browser.close();
