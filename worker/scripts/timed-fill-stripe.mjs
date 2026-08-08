/**
 * Step-timed fill against Stripe token to find hangs (no submit).
 */
import { mkdir, copyFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  fillCustomBooleanChoice,
  fillLocationAutocomplete,
  fillPhoneCountryDial,
  formatLocationQuery,
  resolveApplicationUrl,
} from "../src/automation.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(__dirname, "..", "tmp");
const token = process.env.GH_TOKEN || "8114514";
const RESUME_SRC = process.env.RESUME_PATH || String.raw`c:\Users\shiva\Downloads\Shivang_Soni (1).pdf`;
await mkdir(tmpDir, { recursive: true });
const resumePath = path.join(tmpDir, "Shivang_Soni_resume.pdf");
await copyFile(RESUME_SRC, resumePath);

const profile = {
  firstName: "Shivang",
  lastName: "Soni",
  email: "shivangsoni22@gmail.com",
  phone: "5302048592",
  country: "United States",
  state: "Washington",
  city: "Redmond",
  school: "Davis",
  degree: "Master's Degree",
  employer: "Microsoft",
  title: "Software Developer",
};

const steps = [];
async function step(name, fn) {
  const t0 = Date.now();
  console.log(`→ ${name}`);
  try {
    const result = await Promise.race([
      fn(),
      new Promise((_, rej) => setTimeout(() => rej(new Error(`step timeout 45s: ${name}`)), 45000)),
    ]);
    const ms = Date.now() - t0;
    steps.push({ name, ms, ok: true, result });
    console.log(`✓ ${name} ${ms}ms`, result ?? "");
    return result;
  } catch (error) {
    const ms = Date.now() - t0;
    steps.push({ name, ms, ok: false, error: String(error?.message || error) });
    console.log(`✗ ${name} ${ms}ms`, error?.message || error);
    throw error;
  }
}

const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage", "--no-sandbox"] });
const page = await browser.newPage();
try {
  const url = resolveApplicationUrl({
    sourceUrl: `https://stripe.com/jobs/search?gh_jid=${token}`,
    company: "Stripe",
  });
  console.log("url", url);
  await step("goto", () => page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 }));
  await step("waitForm", () => page.waitForSelector("#first_name, #school--0", { timeout: 30000 }));
  await page.waitForTimeout(1500);

  await step("basics", async () => {
    await page.locator("#first_name").fill(profile.firstName);
    await page.locator("#last_name").fill(profile.lastName);
    await page.locator("#email").fill(profile.email);
  });

  await step("phoneCountry", () => fillPhoneCountryDial(page.locator("#phone"), profile.country, profile));
  await step("phone", async () => {
    await page.locator("#phone").fill("");
    await page.locator("#phone").pressSequentially(profile.phone, { delay: 20 });
  });
  await step("location", () => fillLocationAutocomplete(page.locator("#candidate-location"), formatLocationQuery("", profile), profile));
  await step("resume", () => page.locator('input[type="file"]').first().setInputFiles(resumePath));

  await step("school", () => fillCustomBooleanChoice(page.locator("#school--0"), "Davis"));
  await step("degree", () => fillCustomBooleanChoice(page.locator("#degree--0"), "Master's Degree"));
  await step("reside", () => fillCustomBooleanChoice(page.locator("#question_68165586"), "US").catch(() =>
    fillCustomBooleanChoice(page.locator("xpath=//label[contains(., 'currently reside')]/following::input[1]"), "US"),
  ));

  // Discover question ids
  const ids = await page.evaluate(() =>
    [...document.querySelectorAll("input.select__input, input[role=combobox]")].map((el) => ({
      id: el.id,
      label: (document.querySelector(`label[for="${el.id}"]`)?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80),
    })),
  );
  steps.push({ name: "discoverSelects", ids });
  console.log("selects", JSON.stringify(ids, null, 2));

  for (const item of ids) {
    if (!item.id || /school|degree|country|candidate-location|gender|hispanic|veteran|disability/i.test(item.id + item.label)) continue;
    if (/authorized|sponsor|remote|employed by Stripe|WhatsApp/i.test(item.label)) {
      const answer = /WhatsApp|employed by Stripe/i.test(item.label) ? "No" : "Yes";
      await step(`q:${item.id}`, () => fillCustomBooleanChoice(page.locator(`#${item.id}`), answer));
    }
  }

  await step("employer", async () => {
    const el = page.locator("xpath=//label[contains(., 'employer')]/following::input[not(contains(@class,'select__input'))][1]").first();
    if (await el.isVisible()) await el.fill(profile.employer);
  });
  await step("title", async () => {
    const el = page.locator("xpath=//label[contains(., 'job title')]/following::input[not(contains(@class,'select__input'))][1]").first();
    if (await el.isVisible()) await el.fill(profile.title);
  });

  await page.screenshot({ path: path.join(tmpDir, `timed-fill-${token}.png`), fullPage: true });
} catch (error) {
  console.error("stopped:", error.message);
  await page.screenshot({ path: path.join(tmpDir, `timed-fill-${token}-error.png`), fullPage: true }).catch(() => {});
} finally {
  await browser.close();
}

await writeFile(path.join(tmpDir, `timed-fill-${token}.json`), JSON.stringify(steps, null, 2));
console.log("DONE", steps.filter((s) => !s.ok));
