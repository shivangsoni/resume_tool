import { chromium } from "playwright";
import { resolveApplicationUrl } from "../src/automation.js";

const src = "https://stripe.com/jobs/search?gh_jid=8114514";
const resolved = resolveApplicationUrl({ sourceUrl: src, company: "Stripe" });
const preferred = `https://job-boards.greenhouse.io/embed/job_app?for=stripe&token=8114514`;
console.log({ resolved, preferred });

const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage", "--no-sandbox"] });
for (const url of [resolved, preferred]) {
  const page = await browser.newPage();
  const t0 = Date.now();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(4000);
  const info = await page.evaluate(() => ({
    url: location.href,
    title: document.title,
    first: !!document.querySelector("#first_name"),
    school: !!document.querySelector("#school--0"),
    submit: !!document.querySelector("#submit_app, button[type=submit]"),
    bodyStart: (document.body?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 200),
  }));
  console.log(JSON.stringify({ opened: url, ms: Date.now() - t0, ...info }, null, 2));
  await page.close();
}
await browser.close();
