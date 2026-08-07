/**
 * Live dry-run probe against Stripe Greenhouse embed.
 * Fills with the user's profile fixture; does NOT submit.
 *
 * Usage: node scripts/probe-stripe-form.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  expandLocationStates,
  findBestLocationOption,
  formatLocationQuery,
  knownAnswer,
  runApplication,
} from "../src/automation.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(__dirname, "..", "tmp");
const STRIPE_URL = "https://job-boards.greenhouse.io/embed/job_app?for=stripe&token=8075570";

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
  workAuthorization: "Need visa sponsorship",
  sponsorship: "Yes",
  preferredLocations: JSON.stringify([{ workplaceTypes: ["Remote"], country: "United States" }]),
  targetRoles: "Software Developer",
  employmentTypes: "Full-Time",
  experienceLevel: "5-8 years",
  minSalary: "150000",
  educationLevel: "Master's",
  school: "University of California, Davis",
  linkedin: "https://www.linkedin.com/in/shivang-soni-b97575116/",
  github: "https://github.com/shivangsoni",
  currentEmployer: "Microsoft",
  currentJobTitle: "Software Developer",
  skills: "Azure, C#, C++, Java, JavaScript, Python, React, SQL, TypeScript",
};

const application = {
  id: "probe-stripe-8075570",
  company: "Stripe",
  source: "Greenhouse",
  sourceUrl: STRIPE_URL,
  answers: {
    email: profile.email,
    phone: profile.phone,
    country: profile.country,
    city: profile.city,
    state: profile.state,
    location: formatLocationQuery("", profile),
    whatsapp: "No",
    "job_application[answers][whatsapp][boolean_value]": "No",
  },
};

await mkdir(tmpDir, { recursive: true });

const locationQuery = formatLocationQuery("", profile);
const usCityState = knownAnswer(
  "If located in the US, in what city and state do you reside?",
  profile,
  application.answers,
);
const whatsappAnswer = knownAnswer(
  "Do you opt-in to receive WhatsApp messages from Stripe Recruiting?",
  profile,
  application.answers,
);

console.log("Expected Location query:", locationQuery);
console.log("Expected US city/state:", usCityState);
console.log("Expected WhatsApp:", whatsappAnswer);
console.log("Best option sample:", findBestLocationOption([
  "Redmond, Oregon, United States",
  "Redmond, Washington, United States",
  "Redmond, Utah, United States",
], "Redmond, WA, United States"));
console.log("Expanded WA:", expandLocationStates("Redmond, WA, United States"));

const headed = process.env.HEADED === "1";
const result = await runApplication({
  application,
  profile,
  resumePath: "",
  dryRun: true,
  headed,
});

const report = {
  at: new Date().toISOString(),
  url: STRIPE_URL,
  expected: { locationQuery, usCityState, whatsappAnswer },
  result,
};

const reportPath = path.join(tmpDir, "stripe-probe-report.json");
await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
console.log("Outcome:", result.outcome);
console.log("Detail:", result.detail);
if (result.questions?.length) {
  console.log("Missing questions:");
  for (const question of result.questions) {
    console.log(` - [${question.type}] ${question.label}`);
  }
}
console.log("Wrote", reportPath);

// Extra DOM snapshot for Location + WhatsApp after a second headed pass if still failing.
if (result.outcome === "needs_action") {
  const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage", "--no-sandbox"] });
  const page = await browser.newPage();
  try {
    await page.goto(STRIPE_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(2000);
    const diagnostics = await page.evaluate(() => {
      const fields = Array.from(document.querySelectorAll("input, select, textarea"));
      const interesting = fields
        .map((el) => {
          const label = el.labels?.[0]?.textContent
            || el.getAttribute("aria-label")
            || el.getAttribute("placeholder")
            || "";
          return {
            tag: el.tagName,
            type: el.getAttribute("type") || "",
            name: el.getAttribute("name") || "",
            id: el.id || "",
            label: String(label).replace(/\s+/g, " ").trim().slice(0, 120),
            value: "value" in el ? String(el.value || "").slice(0, 80) : "",
            options: el.tagName === "SELECT"
              ? Array.from(el.options).map((opt) => opt.textContent?.trim()).filter(Boolean).slice(0, 8)
              : [],
          };
        })
        .filter((row) => /location|city|whatsapp|opt-?in|phone|country/i.test(`${row.label} ${row.name}`));
      const lat = document.querySelector('input[name*="latitude" i], input[name="latitude"]');
      const lon = document.querySelector('input[name*="longitude" i], input[name="longitude"]');
      return {
        interesting,
        lat: lat ? String(lat.value || "") : null,
        lon: lon ? String(lon.value || "") : null,
      };
    });
    const shot = path.join(tmpDir, "stripe-probe.png");
    await page.screenshot({ path: shot, fullPage: true });
    await writeFile(path.join(tmpDir, "stripe-probe-dom.json"), JSON.stringify(diagnostics, null, 2));
    console.log("DOM diagnostics written; screenshot:", shot);
  } finally {
    await browser.close();
  }
}
