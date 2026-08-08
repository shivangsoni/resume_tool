/**
 * Headed Stripe fill using runApplication with harvest/match timing logs.
 */
import { mkdir, copyFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { harvestFormCatalog } from "../src/option-harvest.js";
import { resolveCatalogAnswers } from "../src/option-match.js";
import {
  formatLocationQuery,
  knownAnswer,
  lookupAnswer,
  matchOptionLabel,
  resolveApplicationUrl,
  runApplication,
} from "../src/automation.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(__dirname, "..", "tmp");
const STRIPE_URL = "https://job-boards.greenhouse.io/embed/job_app?for=stripe&token=8075570";
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
  postalCode: "98052",
  address: "15606 NE 40th street",
  location: "Redmond, Washington, United States",
  workAuthorization: "Yes",
  sponsorship: "Yes",
  preferredLocations: JSON.stringify([{ workplaceTypes: ["Remote"], country: "United States" }]),
  school: "University of California, Davis",
  educationLevel: "Master's",
  currentEmployer: "Microsoft",
  currentJobTitle: "Software Developer",
  experienceLevel: "5-8 years",
};

const mode = process.env.MODE || "harvest"; // harvest | full
const headed = process.env.HEADED === "1";

if (mode === "harvest") {
  const browser = await chromium.launch({ headless: !headed, args: ["--disable-dev-shm-usage", "--no-sandbox"] });
  const page = await browser.newPage();
  const log = [];
  const mark = async (name, fn) => {
    const t0 = Date.now();
    process.stdout.write(`→ ${name}… `);
    try {
      const result = await Promise.race([
        fn(),
        new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout 60s: ${name}`)), 60000)),
      ]);
      const ms = Date.now() - t0;
      console.log(`${ms}ms`);
      log.push({ name, ms, ok: true });
      return result;
    } catch (error) {
      const ms = Date.now() - t0;
      console.log(`FAIL ${ms}ms ${error.message}`);
      log.push({ name, ms, ok: false, error: error.message });
      throw error;
    }
  };

  try {
    await mark("goto", () => page.goto(STRIPE_URL, { waitUntil: "domcontentloaded", timeout: 60000 }));
    await mark("waitForm", () => page.waitForSelector("#first_name, #application-form", { timeout: 30000 }));
    await page.waitForTimeout(1500);
    if (resumePath) {
      await mark("resume", () => page.locator('input[type="file"]').first().setInputFiles(resumePath));
    }
    const scope = page.locator("#application-form, form").first();
    const catalog = await mark("harvestFormCatalog", () => harvestFormCatalog(page, scope, profile, {
      company: "Stripe",
      sourceUrl: STRIPE_URL,
    }));
    console.log("catalog fields:", catalog.map((f) => ({ key: f.key, kind: f.fieldKind, n: f.options?.length || 0 })));
    const matched = await mark("resolveCatalogAnswers", () => resolveCatalogAnswers({
      catalog,
      profile,
      answers: { email: profile.email, phone: profile.phone, school: profile.school, educationLevel: "Master's Degree", workAuthorization: "Yes", sponsorship: "Yes" },
      knownAnswer,
      lookupAnswer,
      matchOptionLabel,
      useGpt: true,
    }));
    console.log("matched keys:", Object.keys(matched.answers || {}));
    await page.screenshot({ path: path.join(tmpDir, "diag-harvest.png"), fullPage: true });
    await writeFile(path.join(tmpDir, "diag-harvest.json"), JSON.stringify({ log, catalog: catalog.map((f) => ({ key: f.key, kind: f.fieldKind, options: (f.options || []).slice(0, 8) })), matched }, null, 2));
  } catch (error) {
    console.error(error);
    await page.screenshot({ path: path.join(tmpDir, "diag-harvest-error.png"), fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
  }
  process.exit(log.some((s) => !s.ok) ? 1 : 0);
}

console.log("Running full runApplication (headed=%s)…", headed);
const result = await runApplication({
  application: {
    id: `diag-${Date.now()}`,
    company: "Stripe",
    source: "Greenhouse",
    sourceUrl: STRIPE_URL,
    answers: {
      email: profile.email,
      phone: profile.phone,
      country: "United States",
      city: profile.city,
      state: profile.state,
      location: formatLocationQuery("", profile),
      school: profile.school,
      educationLevel: "Master's Degree",
      experienceLevel: "5-8 years",
      currentEmployer: profile.currentEmployer,
      currentJobTitle: profile.currentJobTitle,
      workAuthorization: "Yes",
      sponsorship: "Yes",
      whatsapp: "No",
    },
  },
  profile,
  resumePath,
  dryRun: process.env.DRY_RUN !== "0",
  headed,
  timeoutMs: Number(process.env.TIMEOUT_MS || 240000),
});
await writeFile(path.join(tmpDir, "diag-full-report.json"), JSON.stringify({ at: new Date().toISOString(), result }, null, 2));
console.log(JSON.stringify(result, null, 2));
process.exit(result.outcome === "submitted" || result.outcome === "dry_run" ? 0 : 1);
