/** Dump what appears when typing into Stripe Location (City). */
import { chromium } from "playwright";

const URL = "https://job-boards.greenhouse.io/embed/job_app?for=stripe&token=8075570";
const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage", "--no-sandbox"] });
const page = await browser.newPage();
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector("#candidate-location", { timeout: 30000 });
const field = page.locator("#candidate-location");
await field.click();
await field.fill("");
await field.pressSequentially("Redmond", { delay: 50 });
await page.waitForTimeout(2000);

const dump = await page.evaluate(() => {
  const visible = [];
  for (const el of document.querySelectorAll("body *")) {
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") continue;
    const text = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (!text || text.length > 120) continue;
    if (!/redmond/i.test(text)) continue;
    if (el.children.length > 3) continue;
    visible.push({
      tag: el.tagName,
      cls: String(el.className || "").slice(0, 80),
      role: el.getAttribute("role") || "",
      text,
    });
  }
  const input = document.querySelector("#candidate-location");
  const hiddens = Array.from(document.querySelectorAll("input[type=hidden]"))
    .map((el) => ({ name: el.name, id: el.id, value: el.value }))
    .filter((row) => /lat|lon|location|geo|place/i.test(`${row.name} ${row.id}`));
  return {
    inputValue: input?.value || "",
    inputAttrs: {
      role: input?.getAttribute("role"),
      autocomplete: input?.getAttribute("autocomplete"),
      className: input?.className,
    },
    redmondNodes: visible.slice(0, 20),
    hiddens,
  };
});

console.log(JSON.stringify(dump, null, 2));
await browser.close();
