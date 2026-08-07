/**
 * Lightweight DOM probe — open Stripe form, fill Location + WhatsApp custom widgets.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  expandLocationStates,
  findBestLocationOption,
  fillCustomBooleanChoice,
  fillLocationAutocomplete,
  formatLocationQuery,
  isLocationAutocompleteLabel,
  knownAnswer,
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
  preferredLocations: JSON.stringify([{ workplaceTypes: ["Remote"], country: "United States" }]),
};

await mkdir(tmpDir, { recursive: true });

console.log("Location label detect:", isLocationAutocompleteLabel("Location (City)", "candidate-location"));
console.log("Expanded:", expandLocationStates("Redmond, WA, United States"));
console.log("Best:", findBestLocationOption([
  "Redmond, Oregon, United States",
  "Redmond, Washington, United States",
], "Redmond, WA, United States"));

const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage", "--no-sandbox"] });
const page = await browser.newPage();
const report = { at: new Date().toISOString(), url: STRIPE_URL };

try {
  await page.goto(STRIPE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("#candidate-location, #question_68165592", { timeout: 30000 });
  await page.waitForTimeout(1500);

  const locationInput = page.locator("#candidate-location");
  const query = formatLocationQuery("", profile);
  console.log("Filling location…", query);
  const locationOk = await fillLocationAutocomplete(locationInput, query, profile);
  const locationValue = await locationInput.evaluate((el) => {
    const root = el.closest(".select__control, .select") || el.parentElement;
    const single = root?.querySelector(".select__single-value");
    return { input: el.value || "", single: (single?.textContent || "").trim() };
  });
  const latLon = await locationInput.evaluate((el) => {
    const form = el.closest("form") || document;
    const lat = form.querySelector('input[name*="latitude" i], input[name="latitude"]');
    const lon = form.querySelector('input[name*="longitude" i], input[name="longitude"]');
    return { lat: lat?.value || "", lon: lon?.value || "", hasHidden: Boolean(lat || lon) };
  });
  report.location = { ok: locationOk, value: locationValue, latLon, query };
  console.log("Location:", report.location);

  const whatsappInput = page.locator("#question_68165592");
  const whatsappAnswer = knownAnswer(
    "Do you opt-in to receive WhatsApp messages from Stripe Recruiting?",
    profile,
    { whatsapp: "No" },
  );
  console.log("Filling WhatsApp…", whatsappAnswer);
  // Export fillCustomBooleanChoice — if missing, inline click path:
  let whatsappOk = false;
  try {
    whatsappOk = await fillCustomBooleanChoice(whatsappInput, whatsappAnswer);
  } catch {
    await whatsappInput.click();
    await page.waitForTimeout(400);
    await page.getByRole("option", { name: /^No$/i }).first().click().catch(async () => {
      await page.locator("text=No").first().click();
    });
    whatsappOk = true;
  }
  const whatsappValue = await whatsappInput.inputValue().catch(() => "");
  report.whatsapp = { ok: whatsappOk, value: whatsappValue, answer: whatsappAnswer };
  console.log("WhatsApp:", report.whatsapp);

  report.usCityState = knownAnswer("If located in the US, in what city and state do you reside?", profile, {});
  report.success = Boolean(report.location?.ok && report.whatsapp?.ok);

  await page.screenshot({ path: path.join(tmpDir, "stripe-probe.png"), fullPage: true });
  console.log(report.success ? "PROBE OK" : "PROBE PARTIAL");
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
  console.error(report.error);
} finally {
  await browser.close();
}

await writeFile(path.join(tmpDir, "stripe-probe-report.json"), JSON.stringify(report, null, 2));
process.exit(report.success ? 0 : 1);
