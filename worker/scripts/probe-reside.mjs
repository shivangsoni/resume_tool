import { chromium } from "playwright";

const URL = "https://job-boards.greenhouse.io/embed/job_app?for=stripe&token=8075570";
const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage", "--no-sandbox"] });
const page = await browser.newPage();
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector("#question_68165586", { timeout: 30000 });
await page.waitForTimeout(2000);

async function opts() {
  return page.evaluate(() =>
    [...document.querySelectorAll(".select__menu")]
      .filter((m) => m.offsetParent)
      .flatMap((m) => [...m.querySelectorAll(".select__option")].map((o) => o.textContent.replace(/\s+/g, " ").trim())),
  );
}

async function probe(type) {
  await page.keyboard.press("Escape");
  await page.evaluate(() => document.querySelectorAll(".select__menu").forEach((e) => e.remove()));
  const control = page.locator("#question_68165586").locator("xpath=ancestor::div[contains(@class,'select__container')][1]//div[contains(@class,'select__control')]").first();
  await control.click();
  await page.waitForTimeout(400);
  if (type !== null) {
    await page.locator("#question_68165586").fill("");
    await page.locator("#question_68165586").pressSequentially(type, { delay: 30 });
    await page.waitForTimeout(1200);
  } else {
    await page.waitForTimeout(800);
  }
  const o = await opts();
  console.log(JSON.stringify({ type, count: o.length, sample: o.slice(0, 25), us: o.filter((x) => /united|usa|\bus\b/i.test(x)) }));
  await page.keyboard.press("Escape");
}

await probe(null);
await probe("US");
await probe("States");
await probe("America");
await probe("United States");
await browser.close();
