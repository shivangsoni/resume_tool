/**
 * Targeted Stripe Greenhouse fill + submit for token 8075570.
 * Uses exact field IDs and option labels from live DOM probes.
 */
import { mkdir, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  fillCustomBooleanChoice,
  fillLocationAutocomplete,
  fillPhoneCountryDial,
  formatLocationQuery,
} from "../src/automation.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(__dirname, "..", "tmp");
const URL = "https://job-boards.greenhouse.io/embed/job_app?for=stripe&token=8075570";
const RESUME_SRC = process.env.RESUME_PATH || String.raw`c:\Users\shiva\Downloads\Shivang_Soni (1).pdf`;

const profile = {
  firstName: "Shivang",
  lastName: "Soni",
  email: "shivangsoni22@gmail.com",
  phone: "5302048592",
  country: "United States",
  state: "Washington",
  city: "Redmond",
  employer: "Microsoft",
  title: "Software Developer",
};

await mkdir(tmpDir, { recursive: true });
const resumePath = path.join(tmpDir, "Shivang_Soni_resume.pdf");
await copyFile(RESUME_SRC, resumePath);

async function closeMenus(page) {
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(150);
  await page.keyboard.press("Escape").catch(() => {});
  await page.evaluate(() => {
    document.querySelectorAll(".select__menu").forEach((el) => el.remove());
    document.querySelectorAll(".iti__dropdown, .iti__country-list").forEach((el) => {
      el.classList.add("iti__hide");
      el.style.display = "none";
    });
  }).catch(() => {});
  await page.waitForTimeout(200);
}

async function readSelectValue(page, inputId) {
  return page.locator(`#${inputId}`).evaluate((el) => {
    const root = el.closest(".select") || el.closest(".select__container")?.parentElement || el.parentElement;
    return root?.querySelector(".select__single-value")?.textContent?.trim() || "";
  }).catch(() => "");
}

async function visibleOptions(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll(".select__menu")]
      .filter((m) => m.offsetParent)
      .flatMap((m) => [...m.querySelectorAll(".select__option, [role=option]")].map((o) => o.textContent.replace(/\s+/g, " ").trim()))
      .filter(Boolean),
  );
}

async function openSelect(page, inputId) {
  await closeMenus(page);
  const control = page
    .locator(`#${inputId}`)
    .locator("xpath=ancestor::div[contains(@class,'select__container')][1]//div[contains(@class,'select__control')]")
    .first();
  if (await control.isVisible().catch(() => false)) {
    await control.scrollIntoViewIfNeeded().catch(() => {});
    await control.click({ timeout: 5000 });
  } else {
    await page.locator(`#${inputId}`).click({ timeout: 5000 });
  }
  await page.waitForTimeout(400);
}

async function fillReactSelectById(page, inputId, {
  typeText = "",
  exactOption = "",
  optionIncludes = [],
  waitMs = 1500,
} = {}) {
  const field = page.locator(`#${inputId}`).first();
  if (!(await field.isVisible().catch(() => false))) return { ok: false, reason: "not_visible" };

  await openSelect(page, inputId);

  if (typeText) {
    await field.fill("").catch(() => {});
    await field.pressSequentially(typeText, { delay: 40 });
    await page.waitForTimeout(waitMs);
  } else {
    await page.waitForTimeout(700);
  }

  const options = await visibleOptions(page);
  let pick =
    (exactOption && options.find((o) => o === exactOption)) ||
    options.find((o) =>
      optionIncludes.some((h) => {
        const hint = String(h).toLowerCase();
        const text = o.toLowerCase();
        if (hint.length <= 3) return text === hint; // "US" must not match "Australia"
        return text.includes(hint);
      }),
    ) ||
    null;

  // Prefer exact Master's Degree over MBA when both match "Master"
  if (pick && /mba|business administration/i.test(pick) && optionIncludes.some((h) => /master'?s degree/i.test(h))) {
    const better = options.find((o) => /master'?s degree/i.test(o) && !/mba|business/i.test(o));
    if (better) pick = better;
  }

  if (!pick) {
    return { ok: false, reason: "no_option", options: options.slice(0, 20), typed: typeText };
  }

  // Exact text match — Playwright hasText("US") wrongly matches "Australia".
  const clicked = await page.evaluate((label) => {
    const menus = [...document.querySelectorAll(".select__menu")].filter((m) => m.offsetParent);
    for (const menu of menus) {
      const opt = [...menu.querySelectorAll(".select__option, [role=option]")].find(
        (o) => o.textContent.replace(/\s+/g, " ").trim() === label,
      );
      if (opt) {
        opt.dispatchEvent(newMouseEvent());
        opt.click();
        return true;
      }
    }
    return false;

    function newMouseEvent() {
      return new MouseEvent("mousedown", { bubbles: true });
    }
  }, pick);

  if (!clicked) {
    await page.getByRole("option", { name: pick, exact: true }).first().click({ timeout: 5000 }).catch(() => {});
  }
  await page.waitForTimeout(450);
  const value = await readSelectValue(page, inputId);
  const normalizedPick = pick.replace(/\s*\+\d+$/, "").trim();
  const ok =
    Boolean(value) &&
    (value === pick ||
      value === normalizedPick ||
      (pick.includes("+") && /^\+\d+$/.test(value)) || // phone dial shows "+1"
      value.toLowerCase().includes(normalizedPick.toLowerCase()));
  return { ok, value, pick, options: options.slice(0, 12) };
}

const browser = await chromium.launch({
  headless: process.env.HEADED !== "1",
  args: ["--disable-dev-shm-usage", "--no-sandbox"],
});
const page = await browser.newPage();
const report = { at: new Date().toISOString(), steps: [] };

try {
  console.log("Opening form…");
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("#first_name, #school--0, #candidate-location", { timeout: 30000 });
  await page.waitForTimeout(2500);

  for (const [sel, val] of [
    ["#first_name", profile.firstName],
    ["#last_name", profile.lastName],
    ["#email", profile.email],
  ]) {
    await page.locator(sel).fill(val);
    report.steps.push({ field: sel, ok: true, val });
  }

  console.log("Phone country…");
  const dialOk = await fillPhoneCountryDial(page.locator("#phone"), "United States", profile);
  const phoneCountryValue = await readSelectValue(page, "country");
  report.steps.push({ field: "phoneCountry", ok: dialOk, value: phoneCountryValue });
  console.log({ dialOk, phoneCountryValue });

  const phone = page.locator("#phone");
  await phone.click();
  await phone.fill("");
  await phone.pressSequentially(profile.phone, { delay: 35 });
  report.steps.push({ field: "phone", ok: true, value: await phone.inputValue() });
  console.log("Phone:", await phone.inputValue());

  await closeMenus(page);
  const locOk = await fillLocationAutocomplete(page.locator("#candidate-location"), formatLocationQuery("", profile), profile);
  report.steps.push({ field: "location", ok: locOk, value: await readSelectValue(page, "candidate-location") });
  console.log("Location:", locOk, report.steps.at(-1).value);

  const files = page.locator('input[type="file"]');
  for (let i = 0; i < (await files.count()); i++) {
    await files.nth(i).setInputFiles(resumePath).catch(() => {});
  }
  await page.waitForTimeout(2000);
  report.steps.push({ field: "resume", ok: true });
  console.log("Resume uploaded");

  console.log("School…");
  const school = await fillReactSelectById(page, "school--0", {
    typeText: "Davis",
    exactOption: "University of California - Davis",
    optionIncludes: ["California - Davis", "California, Davis"],
    waitMs: 2000,
  });
  report.steps.push({ field: "school", ...school });
  console.log(school);

  console.log("Degree…");
  const degree = await fillReactSelectById(page, "degree--0", {
    typeText: "Master",
    exactOption: "Master's Degree",
    optionIncludes: ["Master's Degree"],
    waitMs: 1500,
  });
  report.steps.push({ field: "degree", ...degree });
  console.log(degree);

  const employer = page.locator("xpath=//label[contains(., 'employer')]/following::input[not(contains(@class,'select__input'))][1]").first();
  if (await employer.isVisible().catch(() => false)) {
    await employer.fill(profile.employer);
    report.steps.push({ field: "employer", ok: true });
  }
  const title = page.locator("xpath=//label[contains(., 'job title')]/following::input[not(contains(@class,'select__input'))][1]").first();
  if (await title.isVisible().catch(() => false)) {
    await title.fill(profile.title);
    report.steps.push({ field: "title", ok: true });
  }

  console.log("Reside country…");
  const reside = await fillReactSelectById(page, "question_68165586", {
    typeText: "US",
    exactOption: "US",
    optionIncludes: ["US"],
    waitMs: 1000,
  });
  report.steps.push({ field: "resideCountry", ...reside });
  console.log(reside);

  const usLabel = page.locator("label").filter({ hasText: /^US$/ }).first();
  if (await usLabel.isVisible().catch(() => false)) {
    const checked = await usLabel.locator("input[type=checkbox]").isChecked().catch(() => false);
    if (!checked) await usLabel.click();
    report.steps.push({ field: "workCountriesUS", ok: true });
  }

  const questionnaire = [
    { id: "question_68165588", answer: "Yes", name: "authorized" },
    { id: "question_68165589", answer: "Yes", name: "sponsorship" },
    { id: "question_68165590", answer: "Yes, I intend to work remotely.", name: "remote" },
    { id: "question_68165591", answer: "No", name: "stripeEmployee" },
    { id: "question_68165592", answer: "No", name: "whatsapp" },
  ];
  for (const item of questionnaire) {
    await closeMenus(page);
    const el = page.locator(`#${item.id}`);
    const ok = await fillCustomBooleanChoice(el, item.answer);
    const value = await readSelectValue(page, item.id);
    report.steps.push({ field: item.name, ok, value });
    console.log(item.name, ok, value);
  }

  const cityState = page.locator("#question_68187457");
  if (await cityState.isVisible().catch(() => false)) {
    await cityState.fill("Redmond, Washington");
    report.steps.push({ field: "cityState", ok: true });
  }

  console.log("Years…");
  const years = await fillReactSelectById(page, "question_68320893", {
    typeText: "",
    exactOption: "5 - 10 years of experience as a software engineer",
    optionIncludes: ["5 - 10"],
    waitMs: 800,
  });
  report.steps.push({ field: "years", ...years });
  console.log(years);

  const required = {
    phoneCountry: await readSelectValue(page, "country"),
    location: await readSelectValue(page, "candidate-location"),
    school: await readSelectValue(page, "school--0"),
    degree: await readSelectValue(page, "degree--0"),
    reside: await readSelectValue(page, "question_68165586"),
    years: await readSelectValue(page, "question_68320893"),
  };
  report.required = required;
  console.log("Required:", required);

  await page.screenshot({ path: path.join(tmpDir, "stripe-before-submit.png"), fullPage: true });

  const missingRequired = Object.entries(required).filter(([, v]) => !v || /^select/i.test(v));
  // Reject accidental Australia when we intended US
  if (required.reside && required.reside !== "US") {
    missingRequired.push(["reside", `got ${required.reside}, want US`]);
  }
  if (missingRequired.length) {
    report.outcome = "blocked_missing_required";
    report.missingRequired = missingRequired;
    console.log("Blocked — missing:", missingRequired);
  } else if (process.env.SKIP_SUBMIT === "1" || process.env.DRY_RUN === "1") {
    report.outcome = "filled_dry_run";
    console.log("SKIP_SUBMIT=1 — form filled for review (no submit).");
    const holdMs = Number(process.env.HOLD_MS || 60000);
    console.log(`Holding browser open ${holdMs}ms — check the form now.`);
    await page.waitForTimeout(holdMs);
  } else {
    const submit = page.locator("#submit_app, button:has-text('Submit application')").first();
    await submit.scrollIntoViewIfNeeded();
    console.log("Clicking submit…");
    await submit.click({ timeout: 10000 });
    await page.waitForTimeout(5000);
    await page.waitForLoadState("networkidle", { timeout: 90000 }).catch(() => {});
    await page.waitForTimeout(3000);

    let body = await page.locator("body").innerText().catch(() => "");
    let submitted = /thank you|application (has been )?(submitted|received)|thanks for applying|we (have )?received your application/i.test(body);
    const needsVerify = /verification code was sent|enter the \d+-character code|confirm you're a human/i.test(body);

    if (!submitted && needsVerify) {
      report.verificationRequired = true;
      console.log("Email verification required. Waiting for code…");
      console.log(`Put the 6-character code in: ${path.join(tmpDir, "stripe-verify-code.txt")}`);
      console.log("Or set env VERIFY_CODE before/during wait.");
      await writeFile(path.join(tmpDir, "stripe-verify-code.txt"), "");
      await writeFile(path.join(tmpDir, "stripe-submit-report.json"), JSON.stringify({ ...report, outcome: "awaiting_verification" }, null, 2));

      const code = await waitForVerifyCode(tmpDir, Number(process.env.VERIFY_WAIT_MS || 300000));
      if (!code) {
        report.outcome = "awaiting_verification";
        report.confirmationSnippet = body.slice(0, 1200);
        report.url = page.url();
        console.log("No verification code received in time.");
      } else {
        console.log("Entering verification code…");
        report.verifyCodeUsed = code;
        await enterVerifyCode(page, code);
        await page.waitForTimeout(1000);
        // Re-click submit after entering code
        const submit2 = page.locator("#submit_app, button:has-text('Submit application')").first();
        if (await submit2.isVisible().catch(() => false)) {
          await submit2.click({ timeout: 10000 }).catch(() => {});
        }
        await page.waitForTimeout(5000);
        await page.waitForLoadState("networkidle", { timeout: 90000 }).catch(() => {});
        await page.waitForTimeout(2500);
        body = await page.locator("body").innerText().catch(() => "");
        submitted = /thank you|application (has been )?(submitted|received)|thanks for applying|we (have )?received your application/i.test(body);
        report.outcome = submitted ? "submitted" : "needs_action";
        report.confirmationSnippet = body.slice(0, 1200);
        report.url = page.url();
        if (!submitted) {
          report.errors = (await page.locator(".field-error, .error, [class*='error' i], .flash").allTextContents().catch(() => []))
            .map((e) => e.trim())
            .filter(Boolean)
            .slice(0, 40);
          console.log("Errors:", report.errors);
        }
      }
    } else {
      report.outcome = submitted ? "submitted" : "needs_action";
      report.confirmationSnippet = body.slice(0, 1200);
      report.url = page.url();
      if (!submitted) {
        report.errors = (await page.locator(".field-error, .error, [class*='error' i], .flash").allTextContents().catch(() => []))
          .map((e) => e.trim())
          .filter(Boolean)
          .slice(0, 40);
        console.log("Errors:", report.errors);
      }
    }
  }

  await page.screenshot({ path: path.join(tmpDir, "stripe-after-submit.png"), fullPage: true });
  console.log("Outcome:", report.outcome);
} catch (error) {
  report.outcome = "error";
  report.error = error instanceof Error ? error.message : String(error);
  console.error(report.error);
  await page.screenshot({ path: path.join(tmpDir, "stripe-error.png"), fullPage: true }).catch(() => {});
} finally {
  await browser.close();
}

await writeFile(path.join(tmpDir, "stripe-submit-report.json"), JSON.stringify(report, null, 2));
process.exit(report.outcome === "submitted" || report.outcome === "filled_dry_run" ? 0 : 1);

async function waitForVerifyCode(dir, timeoutMs) {
  const filePath = path.join(dir, "stripe-verify-code.txt");
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (process.env.VERIFY_CODE && String(process.env.VERIFY_CODE).trim().length >= 4) {
      return String(process.env.VERIFY_CODE).trim().replace(/\s+/g, "");
    }
    try {
      const { readFile } = await import("node:fs/promises");
      const raw = (await readFile(filePath, "utf8")).trim().replace(/\s+/g, "");
      if (/^[A-Za-z0-9]{6,8}$/.test(raw) || /^\d{8}$/.test(raw)) return raw;
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return null;
}

async function enterVerifyCode(page, code) {
  const chars = String(code).split("");
  // Greenhouse uses either one input or 6 separate boxes
  const multi = page.locator("input[autocomplete='one-time-code'], input[inputmode='numeric'], input[maxlength='1']");
  const multiCount = await multi.count();
  if (multiCount >= chars.length) {
    for (let i = 0; i < chars.length; i++) {
      await multi.nth(i).fill(chars[i]);
    }
    return;
  }
  const single = page.locator("input[name*='verification' i], input[id*='verification' i], input[placeholder*='code' i]").first();
  if (await single.isVisible().catch(() => false)) {
    await single.fill(code);
    return;
  }
  // Fallback: focused inputs near verification text
  const boxes = page.locator("xpath=//*[contains(., 'verification code')]/following::input[position()<=6]");
  const n = Math.min(await boxes.count(), chars.length);
  for (let i = 0; i < n; i++) {
    await boxes.nth(i).fill(chars[i]);
  }
}
