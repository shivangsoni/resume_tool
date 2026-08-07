/**
 * Probe Stripe fields by exact IDs (avoid phone-dial leakage).
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
await page.waitForSelector("#school--0", { timeout: 30000 });
await page.waitForTimeout(2000);

async function closeMenus() {
  await page.keyboard.press("Escape").catch(() => {});
  await page.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.waitForTimeout(400);
}

async function probeField(id, typeText = "") {
  await closeMenus();
  const field = page.locator(`#${id}`).first();
  const visible = await field.isVisible().catch(() => false);
  if (!visible) return { id, visible: false };
  await field.scrollIntoViewIfNeeded();
  await field.click({ timeout: 5000 });
  await page.waitForTimeout(500);
  if (typeText) {
    await field.fill("").catch(() => {});
    await field.pressSequentially(typeText, { delay: 35 });
    await page.waitForTimeout(1500);
  } else {
    await page.waitForTimeout(800);
  }
  const options = await page.locator(".select__menu .select__option, [role=listbox] [role=option], .select__option").allTextContents().catch(() => []);
  const single = await page.locator(`#${id}`).evaluate((el) => {
    const root = el.closest(".select, .select__container") || el.parentElement;
    const val = root?.querySelector(".select__single-value")?.textContent || "";
    return val.trim();
  }).catch(() => "");
  await closeMenus();
  return {
    id,
    visible: true,
    typed: typeText,
    currentValue: single,
    options: options.map((o) => o.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 50),
  };
}

const report = {
  country: await probeField("country", "United States"),
  school: await probeField("school--0", "Davis"),
  schoolUc: await probeField("school--0", "University of California"),
  degreeMaster: await probeField("degree--0", "Master"),
  degreeScience: await probeField("degree--0", "Science"),
  reside: await probeField("question_68165586", "United States"),
  years: await probeField("question_68320893", ""),
  years5: await probeField("question_68320893", "5"),
};

await writeFile(path.join(tmpDir, "stripe-id-probe.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
