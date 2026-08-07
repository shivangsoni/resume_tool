/**
 * Focused probe: school/degree/reside with visible-only options + proper menu close.
 */
import { writeFile, mkdir } from "node:fs/promises";
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
  await page.keyboard.press("Escape").catch(() => {});
  await page.evaluate(() => {
    document.querySelectorAll(".select__menu").forEach((el) => el.remove());
    document.querySelectorAll(".iti__dropdown, .iti__country-list").forEach((el) => {
      el.classList.add("iti__hide");
      el.style.display = "none";
    });
  });
  await page.waitForTimeout(300);
}

async function visibleOpts() {
  return page.evaluate(() => {
    const menus = [...document.querySelectorAll(".select__menu")].filter((m) => {
      const s = getComputedStyle(m);
      return s.display !== "none" && s.visibility !== "hidden" && m.offsetParent !== null;
    });
    return menus.flatMap((m) =>
      [...m.querySelectorAll(".select__option, [role=option]")].map((o) => o.textContent.replace(/\s+/g, " ").trim()),
    );
  });
}

async function probe(id, typeText) {
  await closeMenus();
  const field = page.locator(`#${id}`);
  // click the control wrapper, not just input
  const control = page.locator(`#${id}`).locator("xpath=ancestor::div[contains(@class,'select__container')][1]//div[contains(@class,'select__control')]").first();
  if (await control.isVisible().catch(() => false)) {
    await control.click({ timeout: 5000 });
  } else {
    await field.click({ timeout: 5000 });
  }
  await page.waitForTimeout(500);
  if (typeText) {
    await field.pressSequentially(typeText, { delay: 40 });
    await page.waitForTimeout(2000);
  }
  const options = await visibleOpts();
  const html = await page.evaluate((fid) => {
    const el = document.getElementById(fid);
    const root = el?.closest(".select") || el?.closest(".select__container");
    return {
      menuCount: document.querySelectorAll(".select__menu").length,
      visibleMenus: [...document.querySelectorAll(".select__menu")].filter((m) => m.offsetParent).length,
      controlHtml: root?.outerHTML?.slice(0, 500) || null,
      siblingText: root?.parentElement?.innerText?.slice(0, 200) || null,
    };
  }, id);
  await page.screenshot({ path: path.join(tmpDir, `probe-${id}.png`) });
  await closeMenus();
  return { id, typeText, options: options.slice(0, 30), ...html };
}

// First set phone country so iti isn't empty/weird
await closeMenus();
await page.locator("#country").click();
await page.locator("#country").pressSequentially("United States", { delay: 30 });
await page.waitForTimeout(800);
const usOpt = page.locator(".select__menu:visible .select__option").filter({ hasText: /United States/i }).first();
if (await usOpt.isVisible().catch(() => false)) await usOpt.click();
await closeMenus();

const report = {
  schoolDavis: await probe("school--0", "Davis"),
  schoolUc: await probe("school--0", "University of California, Davis"),
  degreeMs: await probe("degree--0", "Master of Science"),
  degreeMaster: await probe("degree--0", "Master"),
  reside: await probe("question_68165586", "United"),
  years: await probe("question_68320893", ""),
};

await writeFile(path.join(tmpDir, "stripe-visible-probe.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
