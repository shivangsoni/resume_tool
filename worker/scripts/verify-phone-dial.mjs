/**
 * Verify phone country dial: type +1 → select United States +1 → enter phone.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { fillPhoneCountryDial } from "../src/automation.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(__dirname, "..", "tmp");
const URL = "https://job-boards.greenhouse.io/embed/job_app?for=stripe&token=8075570";

await mkdir(tmpDir, { recursive: true });
const browser = await chromium.launch({
  headless: process.env.HEADED !== "1",
  args: ["--disable-dev-shm-usage", "--no-sandbox"],
});
const page = await browser.newPage();
const report = { at: new Date().toISOString() };

try {
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("#country, #phone", { timeout: 30000 });
  await page.waitForTimeout(1200);

  const t0 = Date.now();
  const dialOk = await Promise.race([
    fillPhoneCountryDial(page.locator("#phone"), "United States", { country: "United States" }),
    new Promise((_, rej) => setTimeout(() => rej(new Error("dial timeout 20s")), 20000)),
  ]);
  report.dialMs = Date.now() - t0;
  report.dialOk = dialOk;
  report.countryValue = await page.locator("#country").evaluate((el) => {
    const root = el.closest(".select") || el.closest(".select__container")?.parentElement || el.parentElement;
    return root?.querySelector(".select__single-value")?.textContent?.trim() || el.value || "";
  });

  await page.locator("#phone").fill("");
  await page.locator("#phone").pressSequentially("5302048592", { delay: 20 });
  report.phoneValue = await page.locator("#phone").inputValue();
  report.ok = Boolean(dialOk && /\+1/.test(report.countryValue) && /5302048592/.test(report.phoneValue));

  await page.screenshot({ path: path.join(tmpDir, "verify-phone-dial.png") });
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.ok = false;
  report.error = String(error?.message || error);
  console.error(JSON.stringify(report, null, 2));
  await page.screenshot({ path: path.join(tmpDir, "verify-phone-dial-error.png") }).catch(() => {});
} finally {
  await writeFile(path.join(tmpDir, "verify-phone-dial.json"), JSON.stringify(report, null, 2));
  await browser.close();
}

process.exit(report.ok ? 0 : 1);
