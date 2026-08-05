import { chromium } from "playwright";

const normalize = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const knownAnswer = (label, profile, answers) => {
  const text = normalize(label);
  const direct = answers[label] ?? answers[normalize(label)] ?? answers[label.replace(/^.*?question[_-]?/, "")];
  if (direct != null && String(direct).trim()) return String(direct);
  if (/first name/.test(text)) return profile.firstName;
  if (/last name/.test(text)) return profile.lastName;
  if (/full name|legal name/.test(text)) return [profile.firstName, profile.lastName].filter(Boolean).join(" ");
  if (/email/.test(text)) return profile.email;
  if (/phone|mobile/.test(text)) return profile.phone;
  if (/linkedin/.test(text)) return profile.linkedin;
  if (/github/.test(text)) return profile.github;
  if (/portfolio|website/.test(text)) return profile.portfolio;
  if (/city/.test(text)) return profile.city;
  if (/state/.test(text)) return profile.state;
  if (/postal|zip/.test(text)) return profile.postalCode;
  if (/address/.test(text)) return profile.address;
  if (/country/.test(text)) return profile.country;
  return "";
};

const questionKey = (name, label, index) => String(name || `question_${index}_${normalize(label).replace(/ /g, "_")}`).slice(0, 180);

export async function runApplication({ application, profile, resumePath }) {
  const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage", "--no-sandbox"] });
  const page = await browser.newPage();
  try {
    await page.goto(application.sourceUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    const apply = page.getByRole("link", { name: /apply/i }).or(page.getByRole("button", { name: /apply/i })).first();
    if (await apply.isVisible().catch(() => false)) { await apply.click(); await page.waitForLoadState("domcontentloaded").catch(() => {}); }
    await page.waitForTimeout(1500);

    const captcha = page.locator('iframe[src*="captcha" i], [class*="captcha" i], [id*="captcha" i]').first();
    if (await captcha.isVisible().catch(() => false)) return { outcome: "needs_action", detail: "Employer CAPTCHA requires completion on the original application page.", questions: [{ key: "captcha", label: "Complete the employer CAPTCHA on the original listing, then retry.", type: "blocking", required: true }] };

    const contexts = [page, ...page.frames().filter((frame) => frame !== page.mainFrame())];
    let root = contexts.find(async (context) => await context.locator("form").count()) || page;
    for (const context of contexts) { if (await context.locator("form").count()) { root = context; break; } }
    const fields = root.locator('input:not([type="hidden"]):not([type="submit"]), textarea, select');
    const missing = [];
    for (let index = 0; index < await fields.count(); index += 1) {
      const field = fields.nth(index);
      if (!await field.isVisible().catch(() => false) || await field.isDisabled().catch(() => true)) continue;
      const info = await field.evaluate((element) => {
        const id = element.id;
        const label = (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent) || element.closest("label")?.textContent || element.getAttribute("aria-label") || element.getAttribute("placeholder") || element.name || "Required question";
        return { tag: element.tagName.toLowerCase(), type: element.getAttribute("type") || "text", name: element.getAttribute("name") || id, label: label.trim(), required: element.required || element.getAttribute("aria-required") === "true" };
      });
      const key = questionKey(info.name, info.label, index);
      if (info.type === "file") { if (resumePath && /resume|cv/i.test(`${info.name} ${info.label}`)) await field.setInputFiles(resumePath); continue; }
      if (info.type === "checkbox" || info.type === "radio") {
        const answer = String(application.answers[key] || knownAnswer(info.label, profile, application.answers) || "");
        if (/^(true|yes|1|on)$/i.test(answer)) await field.check();
        else if (info.required && !await field.isChecked()) missing.push({ key, label: info.label, type: "checkbox", required: true });
        continue;
      }
      const answer = String(application.answers[key] || knownAnswer(info.label, profile, application.answers) || "");
      if (answer) {
        if (info.tag === "select") await field.selectOption({ label: answer }).catch(() => field.selectOption(answer).catch(() => {}));
        else await field.fill(answer);
      }
      const value = await field.inputValue().catch(() => "");
      if (info.required && !value) {
        const options = info.tag === "select" ? await field.locator("option").allTextContents() : undefined;
        missing.push({ key, label: info.label.replace(/\s+/g, " ").trim(), type: info.tag === "select" ? "select" : info.tag === "textarea" ? "textarea" : "text", options: options?.map((item) => item.trim()).filter(Boolean), required: true });
      }
    }
    if (missing.length) return { outcome: "needs_action", detail: `${missing.length} required employer question(s) need your answer.`, questions: missing };

    const submit = root.getByRole("button", { name: /submit|apply/i }).last();
    if (!await submit.isVisible().catch(() => false)) return { outcome: "needs_action", detail: "The employer submission control could not be identified.", questions: [{ key: "submission_control", label: "Open the original listing to review its unsupported submission step.", type: "blocking", required: true }] };
    await submit.click();
    await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
    const confirmation = await page.locator("body").innerText().catch(() => "");
    if (!/thank you|application (has been )?(submitted|received)|thanks for applying/i.test(confirmation)) return { outcome: "needs_action", detail: "Employer did not return a recognizable submission confirmation.", questions: [{ key: "submission_confirmation", label: "Review the employer page for an error or confirmation.", type: "blocking", required: true }] };
    return { outcome: "submitted", provider: "ApplyPilot Playwright", receiptId: `${application.id}:${Date.now()}`, detail: `Confirmed at ${page.url()}` };
  } finally { await browser.close(); }
}

export { knownAnswer };
