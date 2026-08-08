/**
 * Narrow headed check: fill only School + Degree react-selects and report selected values.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { fillCustomBooleanChoice } from "../src/automation.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(__dirname, "..", "tmp");
const URL = "https://job-boards.greenhouse.io/embed/job_app?for=stripe&token=8075570";

await mkdir(tmpDir, { recursive: true });
const browser = await chromium.launch({
  headless: process.env.HEADED !== "1",
  args: ["--disable-dev-shm-usage", "--no-sandbox"],
});
const page = await browser.newPage();
const report = { at: new Date().toISOString(), steps: [] };

async function readSelected(id) {
  return page.locator(`[id="${id}"]`).evaluate((el) => {
    const root = el.closest(".select")
      || el.closest(".select__container")?.parentElement
      || el.parentElement;
    return {
      singleValue: root?.querySelector(".select__single-value")?.textContent?.trim() || "",
      inputValue: el.value || "",
    };
  }).catch(() => ({ singleValue: "", inputValue: "" }));
}

try {
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("#school--0, #degree--0", { timeout: 30000 });
  await page.waitForTimeout(1500);

  const schoolOk = await fillCustomBooleanChoice(
    page.locator("#school--0"),
    "University of California, Davis",
  );
  const school = await readSelected("school--0");
  report.steps.push({ field: "school--0", fillOk: schoolOk, ...school });
  console.log("school", schoolOk, school);

  const degreeOk = await fillCustomBooleanChoice(
    page.locator("#degree--0"),
    "Master's Degree",
  );
  const degree = await readSelected("degree--0");
  report.steps.push({ field: "degree--0", fillOk: degreeOk, ...degree });
  console.log("degree", degreeOk, degree);

  await page.screenshot({ path: path.join(tmpDir, "verify-school-degree.png"), fullPage: true });
  report.ok = Boolean(
    school.singleValue.includes("Davis")
    && /master'?s degree/i.test(degree.singleValue)
    && !/redmond/i.test(school.inputValue + school.singleValue),
  );
} catch (error) {
  report.ok = false;
  report.error = String(error?.message || error);
  console.error(error);
  await page.screenshot({ path: path.join(tmpDir, "verify-school-degree-error.png"), fullPage: true }).catch(() => {});
} finally {
  await writeFile(path.join(tmpDir, "verify-school-degree.json"), JSON.stringify(report, null, 2));
  await browser.close();
}

console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
