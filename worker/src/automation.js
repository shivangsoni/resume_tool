import { chromium } from "playwright";

const normalize = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Prefer a short label fragment for heuristics when DOM textContent is huge. */
const compactLabel = (label) => {
  const cleaned = String(label || "").replace(/\s+/g, " ").trim();
  if (cleaned.length <= 120) return cleaned;
  const firstLine = cleaned.split(/[.\n|]/)[0] || cleaned;
  return firstLine.slice(0, 120).trim();
};

const humanizeFieldName = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const leaf = raw.includes("[")
    ? (raw.match(/\[([^\]]+)\]/g) || []).map((part) => part.slice(1, -1)).filter(Boolean).pop() || raw
    : raw.split(/[./#]/).pop() || raw;
  const spaced = leaf
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!spaced || isUselessLabel(spaced)) return "";
  return spaced.replace(/\b\w/g, (char) => char.toUpperCase());
};

/** Labels that are markers / placeholders, not real question text. */
const isUselessLabel = (label) => {
  const text = String(label || "").replace(/\s+/g, " ").trim();
  if (!text) return true;
  if (/^[\d\W_]+$/.test(text)) return true;
  if (/^(required|\*|optional)$/i.test(text)) return true;
  if (/^(question\s*)?\d+$/i.test(text)) return true;
  if (/^(question\s*\d+\s*)?required(\s*question)?$/i.test(text)) return true;
  if (/^required(\s*question)?(\s*\d+)?$/i.test(text)) return true;
  if (/^(input|field|select|textarea|question)[\d\s_-]*$/i.test(text)) return true;
  return false;
};

const sanitizeLabel = (label) => {
  const cleaned = String(label || "")
    .replace(/\s+/g, " ")
    .replace(/^\*+\s*/, "")
    .replace(/\s*\*+$/, "")
    .replace(/\(\s*required\s*\)/gi, "")
    .replace(/\brequired\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return isUselessLabel(cleaned) ? "" : cleaned;
};

const knownAnswer = (label, profile, answers) => {
  const text = normalize(compactLabel(label));
  const direct = answers[label] ?? answers[normalize(label)] ?? answers[label.replace(/^.*?question[_-]?/, "")];
  if (direct != null && String(direct).trim()) return String(direct);
  if (/\bfirst name\b/.test(text)) return profile.firstName;
  if (/\blast name\b/.test(text)) return profile.lastName;
  if (/\bfull name\b|\blegal name\b/.test(text)) return [profile.firstName, profile.lastName].filter(Boolean).join(" ");
  if (/\bemail\b/.test(text)) return profile.email;
  if (/\bphone\b|\bmobile\b/.test(text)) return profile.phone;
  if (/\blinkedin\b/.test(text)) return profile.linkedin;
  if (/\bgithub\b/.test(text)) return profile.github;
  if (/\bportfolio\b|\bwebsite\b|\bpersonal site\b/.test(text)) return profile.portfolio || profile.github;
  if (/\bcountry\b/.test(text)) return profile.country;
  if (/\bcity\b/.test(text)) return profile.city;
  if (/\bstate\b|\bprovince\b/.test(text)) return profile.state;
  if (/\bpostal\b|\bzip\b/.test(text)) return profile.postalCode;
  if (/\baddress\b/.test(text)) return profile.address || [profile.city, profile.state, profile.postalCode].filter(Boolean).join(", ");
  if (/\blocation\b/.test(text)) return profile.location || [profile.city, profile.state, profile.country].filter(Boolean).join(", ");
  if (/\bwork authorization\b|\bauthorized to work\b|\blegally authorized\b|\beligible to work\b/.test(text)) return profile.workAuthorization;
  if (/\bsponsor|\bvisa\b/.test(text)) return profile.sponsorship;
  if (/\beducation\b|\bdegree\b|\bhighest (level|education)\b/.test(text)) return profile.educationLevel;
  if (/\bskills?\b|\btechnologies\b|\btech stack\b/.test(text)) return profile.skills;
  if (/\byears? of experience\b|\bexperience level\b/.test(text)) return profile.experienceLevel;
  if (/\bsalary\b|\bcompensation\b|\bexpected pay\b/.test(text)) return profile.minSalary;
  if (/\bemployment type\b|\bfull.?time|part.?time|contract\b/.test(text)) return profile.employmentTypes;
  if (/\blanguage\b/.test(text)) return profile.preferredLanguages;
  if (/\bcover letter\b|\bwhy (do you want|are you interested)|about yourself\b|\bsummary\b|\badditional (information|info)\b/.test(text)) {
    return profile.additionalInfo || profile.summary || profile.headline || "";
  }
  return "";
};

/** Always include index so duplicate HTML names do not share one answer slot. */
const questionKey = (name, label, index) => {
  const base = String(name || `question_${normalize(compactLabel(label)).replace(/ /g, "_") || "field"}`).trim() || "field";
  return `${base}__${index}`.slice(0, 180);
};

const selectOptionTexts = async (field) => {
  const texts = await field.locator("option").allTextContents();
  return texts.map((item) => item.trim()).filter(Boolean);
};

async function fillSelect(field, answer) {
  const wanted = String(answer || "").trim();
  if (!wanted) return false;
  const byLabel = await field.selectOption({ label: wanted }).then(() => true).catch(() => false);
  if (byLabel) return true;
  const byValue = await field.selectOption({ value: wanted }).then(() => true).catch(() => false);
  if (byValue) return true;
  const byExact = await field.selectOption(wanted).then(() => true).catch(() => false);
  if (byExact) return true;

  const options = await field.evaluate((element) =>
    Array.from(element.querySelectorAll("option")).map((option) => ({
      value: option.value,
      label: (option.textContent || "").trim(),
    })),
  );
  const needle = wanted.toLowerCase();
  const match = options.find((option) => {
    const label = option.label.toLowerCase();
    const value = String(option.value || "").toLowerCase();
    return label === needle || value === needle || label.includes(needle) || needle.includes(label);
  });
  if (!match || match.value === "") return false;
  return field.selectOption(match.value).then(() => true).catch(() => false);
}

const isSkippableFieldMeta = (info) => {
  const haystack = normalize(`${info.name} ${info.label} ${info.type}`);
  if (info.type === "search" || info.type === "button" || info.type === "reset" || info.type === "image") return true;
  if (/\b(search|filter|sort|subscribe|newsletter|password|csrf)\b/.test(haystack)) return true;
  return false;
};

/**
 * Prefer a direct Greenhouse application embed when the listing URL is a
 * careers search deep-link (common for Stripe absolute_url values).
 */
function resolveApplicationUrl(application) {
  const sourceUrl = String(application?.sourceUrl || "").trim();
  if (!sourceUrl) return sourceUrl;
  try {
    const url = new URL(sourceUrl);
    const host = url.hostname.toLowerCase();
    const jid = url.searchParams.get("gh_jid") || url.searchParams.get("gh_jid".toUpperCase());
    const tokenFromPath = url.pathname.match(/\/jobs\/(\d+)/)?.[1];
    const jobId = jid || tokenFromPath;
    const board = guessGreenhouseBoard(application);
    if (jobId && board && (host.includes("stripe.com") || host.includes("greenhouse.io") || host.includes(board))) {
      return `https://boards.greenhouse.io/embed/job_app?for=${encodeURIComponent(board)}&token=${encodeURIComponent(jobId)}`;
    }
  } catch {
    // Fall through to the original listing URL.
  }
  return sourceUrl;
}

function guessGreenhouseBoard(application) {
  const company = normalize(application?.company);
  if (company.includes("stripe")) return "stripe";
  if (company.includes("cloudflare")) return "cloudflare";
  if (company.includes("figma")) return "figma";
  if (company.includes("airbnb")) return "airbnb";
  const source = normalize(application?.source);
  if (source.includes("greenhouse")) {
    try {
      const url = new URL(String(application?.sourceUrl || ""));
      const fromPath = url.pathname.match(/\/(?:embed\/job_app|boards?\/|job-boards\/)?(?:for=)?/i);
      const token = url.searchParams.get("for") || url.pathname.split("/").filter(Boolean)[0];
      if (token && /^[a-z0-9_-]+$/i.test(token) && !["embed", "jobs", "job", "boards", "job-boards"].includes(token)) return token;
      void fromPath;
    } catch { /* ignore */ }
  }
  return "";
}

/**
 * Invisible reCAPTCHA Enterprise (Greenhouse) must not block automation.
 * Only fail when an interactive checkbox/challenge/hCaptcha/Turnstile is present.
 */
async function pageHasBlockingCaptcha(page) {
  if (await page.locator('iframe[src*="recaptcha"][src*="bframe"], iframe[src*="hcaptcha.com"][src*="frame="], iframe[src*="challenges.cloudflare.com"]').first().isVisible().catch(() => false)) {
    return true;
  }
  if (await page.locator(".h-captcha[data-sitekey] iframe, .cf-turnstile iframe").first().isVisible().catch(() => false)) {
    return true;
  }
  for (const frame of page.frames()) {
    const frameUrl = frame.url();
    if (!/recaptcha|hcaptcha/i.test(frameUrl)) continue;
    const kind = await frame.evaluate(() => {
      if (document.querySelector(".rc-anchor-invisible")) return "invisible";
      if (document.querySelector("#recaptcha-anchor, .rc-anchor-checkbox, .recaptcha-checkbox")) return "checkbox";
      if (document.querySelector(".rc-imageselect, .challenge-container, #rc-imageselect")) return "challenge";
      return "unknown";
    }).catch(() => "unknown");
    if (kind === "checkbox" || kind === "challenge") return true;
  }
  return false;
}

export async function runApplication({ application, profile, resumePath }) {
  const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage", "--no-sandbox"] });
  const page = await browser.newPage();
  try {
    await page.goto(resolveApplicationUrl(application), { waitUntil: "domcontentloaded", timeout: 45000 });
    // If the embed/application form is already present, do not click listing CTAs
    // like "Quick Apply with MyGreenhouse" (those match /apply/ and derail the flow).
    const formReady = page.locator("#application-form, form#application-form, form[action*='job_app'], button[type='submit'], input[type='submit']").first();
    const alreadyOnForm = await formReady.isVisible().catch(() => false);
    if (!alreadyOnForm) {
      const apply = page
        .getByRole("link", { name: /^(apply( now)?|apply for this job)$/i })
        .or(page.getByRole("button", { name: /^(apply( now)?|apply for this job)$/i }))
        .first();
      if (await apply.isVisible().catch(() => false)) {
        await apply.click();
        await page.waitForLoadState("domcontentloaded").catch(() => {});
      }
    }
    await formReady.waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(alreadyOnForm ? 500 : 1500);

    if (await pageHasBlockingCaptcha(page)) {
      return {
        outcome: "needs_action",
        detail: "Employer CAPTCHA requires completion on the original application page.",
        questions: [{ key: "captcha", label: "Complete the employer CAPTCHA on the original listing, then retry.", type: "blocking", required: true }],
      };
    }

    const contexts = [page, ...page.frames().filter((frame) => frame !== page.mainFrame())];
    let root = page;
    let bestScore = -1;
    for (const context of contexts) {
      const score = await context.evaluate(() => {
        const forms = Array.from(document.querySelectorAll("form"));
        const candidates = forms.length ? forms : [document.body];
        let best = 0;
        for (const form of candidates) {
          if (form.closest("nav, header, footer, [role='search']")) continue;
          const fields = form.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select');
          let points = fields.length;
          if (form.querySelector('input[type="file"]')) points += 20;
          if (/apply|application|job/i.test(`${form.id} ${form.className} ${form.getAttribute("action") || ""}`)) points += 15;
          if (form.querySelector('input[name*="first" i], input[name*="email" i], input[autocomplete="email"]')) points += 10;
          best = Math.max(best, points);
        }
        return best;
      }).catch(() => 0);
      if (score > bestScore) { bestScore = score; root = context; }
    }

    const formLocator = root.locator("form").filter({ has: root.locator('input:not([type="hidden"]), textarea, select') });
    const formCount = await formLocator.count();
    let scope = root;
    if (formCount) {
      let bestIndex = 0;
      let top = -1;
      for (let i = 0; i < formCount; i += 1) {
        const form = formLocator.nth(i);
        const points = await form.evaluate((node) => {
          let score = node.querySelectorAll('input:not([type="hidden"]):not([type="submit"]), textarea, select').length;
          if (node.querySelector('input[type="file"]')) score += 20;
          if (/apply|application|job/i.test(`${node.id} ${node.className} ${node.getAttribute("action") || ""}`)) score += 15;
          return score;
        }).catch(() => 0);
        if (points > top) { top = points; bestIndex = i; }
      }
      scope = formLocator.nth(bestIndex);
    }

    const fields = scope.locator('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), textarea, select');
    const missing = [];
    const seenKeys = new Set();
    for (let index = 0; index < await fields.count(); index += 1) {
      const field = fields.nth(index);
      if (!await field.isVisible().catch(() => false) || await field.isDisabled().catch(() => true)) continue;
      const info = await field.evaluate((element) => {
        const id = element.id || "";
        const name = element.getAttribute("name") || "";
        const labelledBy = (element.getAttribute("aria-labelledby") || "")
          .split(/\s+/)
          .filter(Boolean)
          .map((ref) => document.getElementById(ref)?.textContent || "")
          .join(" ")
          .trim();
        const explicitLabel = id
          ? document.querySelector(`label[for="${CSS.escape(id)}"]`)
          : null;
        const wrapLabel = element.closest("label");
        const labelNode = explicitLabel || wrapLabel;
        const readLabelText = (node) => {
          if (!node) return "";
          const clone = node.cloneNode(true);
          clone.querySelectorAll("input, select, textarea, button, script, style, option").forEach((child) => child.remove());
          return (clone.textContent || "").replace(/\s+/g, " ").trim();
        };
        const siblingText = () => {
          const prev = element.previousElementSibling;
          if (prev && !/^(INPUT|SELECT|TEXTAREA|BUTTON)$/i.test(prev.tagName)) {
            const text = (prev.textContent || "").replace(/\s+/g, " ").trim();
            if (text && text.length < 160) return text;
          }
          const parent = element.parentElement;
          const aunt = parent?.previousElementSibling;
          if (aunt) {
            const text = (aunt.textContent || "").replace(/\s+/g, " ").trim();
            if (text && text.length < 160) return text;
          }
          const fieldRoot = element.closest(".field, .form-group, .application-question, .question, [class*='field' i], [data-qa], [data-field]");
          if (fieldRoot) {
            const heading = fieldRoot.querySelector("label, legend, .label, .question-label, [class*='label' i], span, p, div");
            if (heading && !heading.contains(element)) {
              const text = (heading.textContent || "").replace(/\s+/g, " ").trim();
              if (text && text.length < 160) return text;
            }
          }
          return "";
        };
        const dataHint = element.getAttribute("data-qa")
          || element.getAttribute("data-field")
          || element.getAttribute("data-testid")
          || element.getAttribute("data-name")
          || "";
        const pickText = (...candidates) => {
          for (const candidate of candidates) {
            const text = String(candidate || "").replace(/\s+/g, " ").trim();
            if (!text || text.length > 180) continue;
            const cleaned = text
              .replace(/^\*+\s*/, "")
              .replace(/\s*\*+$/, "")
              .replace(/\(\s*required\s*\)/gi, "")
              .replace(/\brequired\b/gi, " ")
              .replace(/\s+/g, " ")
              .trim();
            if (!cleaned) continue;
            if (/^(required|\*|optional|question\s*\d+)$/i.test(cleaned)) continue;
            if (/^(question\s*\d+\s*)?required(\s*question)?$/i.test(cleaned)) continue;
            if (/^(input|field|select|textarea|question)[\d\s_-]*$/i.test(cleaned)) continue;
            return cleaned;
          }
          return "";
        };
        const humanize = (value) => {
          const raw = String(value || "").trim();
          if (!raw) return "";
          const leaf = raw.includes("[")
            ? (raw.match(/\[([^\]]+)\]/g) || []).map((part) => part.slice(1, -1)).filter(Boolean).pop() || raw
            : raw.split(/[./#]/).pop() || raw;
          const spaced = leaf.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();
          if (!spaced || /^(input|field|select|textarea|question|required)[\d\s_-]*$/i.test(spaced)) return "";
          return spaced.replace(/\b\w/g, (char) => char.toUpperCase());
        };
        const label = pickText(
          labelledBy,
          readLabelText(labelNode),
          element.getAttribute("aria-label"),
          siblingText(),
          element.getAttribute("placeholder"),
          element.getAttribute("title"),
          humanize(dataHint),
          humanize(name),
          humanize(id),
        );
        const required = element.required
          || element.getAttribute("aria-required") === "true"
          || /\*\s*$|required/i.test(label)
          || !!element.closest("[aria-required='true'], .required");
        return {
          tag: element.tagName.toLowerCase(),
          type: element.getAttribute("type") || "text",
          name: name || id || dataHint,
          label: label.trim(),
          required,
        };
      });
      if (isSkippableFieldMeta(info)) continue;
      const key = questionKey(info.name, info.label, index);
      const displayLabel = sanitizeLabel(compactLabel(info.label))
        || humanizeFieldName(info.name)
        || humanizeFieldName(info.label)
        || `Question ${index + 1}`;
      if (info.type === "file") { if (resumePath && /resume|cv/i.test(`${info.name} ${info.label}`)) await field.setInputFiles(resumePath); continue; }
      if (info.type === "checkbox" || info.type === "radio") {
        const answer = String(application.answers[key] || knownAnswer(displayLabel, profile, application.answers) || "");
        if (/^(true|yes|1|on)$/i.test(answer)) await field.check();
        else if (info.required && !await field.isChecked()) {
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            missing.push({ key, label: displayLabel, type: "checkbox", required: true });
          }
        }
        continue;
      }
      const answer = String(application.answers[key] || knownAnswer(displayLabel, profile, application.answers) || "");
      if (answer) {
        if (info.tag === "select") await fillSelect(field, answer);
        else await field.fill(answer);
      }
      const value = await field.inputValue().catch(() => "");
      if (info.required && !value) {
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        const options = info.tag === "select" ? await selectOptionTexts(field) : undefined;
        missing.push({
          key,
          label: displayLabel,
          type: info.tag === "select" ? "select" : info.tag === "textarea" ? "textarea" : "text",
          options: options?.filter((item) => item.length > 0),
          required: true,
        });
      }
    }
    if (missing.length) return { outcome: "needs_action", detail: `${missing.length} required employer question(s) need your answer.`, questions: missing };

    // Advance multi-step employer flows (Continue/Next) until a final submit appears.
    for (let step = 0; step < 4; step += 1) {
      const submit = await findSubmitControl([scope, root, page]);
      if (submit) {
        await submit.scrollIntoViewIfNeeded().catch(() => {});
        await submit.click();
        await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
        const confirmation = await page.locator("body").innerText().catch(() => "");
        if (!/thank you|application (has been )?(submitted|received)|thanks for applying|application was sent/i.test(confirmation)) {
          return { outcome: "needs_action", detail: "Employer did not return a recognizable submission confirmation.", questions: [{ key: "submission_confirmation", label: "Review the employer page for an error or confirmation.", type: "blocking", required: true }] };
        }
        return { outcome: "submitted", provider: "ApplyPilot Playwright", receiptId: `${application.id}:${Date.now()}`, detail: `Confirmed at ${page.url()}` };
      }
      const advanced = await clickContinueControl([scope, root, page]);
      if (!advanced) break;
      await page.waitForTimeout(1000);
    }

    return { outcome: "needs_action", detail: "The employer submission control could not be identified.", questions: [{ key: "submission_control", label: "Open the original listing to review its unsupported submission step.", type: "blocking", required: true }] };
  } finally { await browser.close(); }
}

const SUBMIT_NAME = /submit(\s+(my\s+)?application)?|send(\s+my)?\s+application|finish(\s+application)?|complete(\s+application)?/i;
const CONTINUE_NAME = /^(continue|next|save and continue|review)\b/i;

/** Prefer an actionable, visible submit control across form / page / frames. */
async function findSubmitControl(contexts) {
  for (const context of contexts) {
    if (!context) continue;
    const candidates = [
      context.locator('#submit_app, [data-qa="btn-submit"], [data-testid*="submit" i], [name="commit"]'),
      context.locator('button[type="submit"], input[type="submit"]'),
      context.getByRole("button", { name: SUBMIT_NAME }),
      context.getByRole("link", { name: SUBMIT_NAME }),
    ];
    for (const locator of candidates) {
      const count = await locator.count().catch(() => 0);
      for (let i = count - 1; i >= 0; i -= 1) {
        const item = locator.nth(i);
        if (!(await item.isVisible().catch(() => false))) continue;
        if (await item.isDisabled().catch(() => false)) continue;
        const labelText = await item.innerText().catch(() => "");
        const valueText = await item.getAttribute("value").catch(() => "");
        const text = normalize(labelText || valueText || "");
        // Skip MyGreenhouse / listing CTAs that are not the final form submit.
        if (/quick apply|mygreenhouse|^apply( now)?$/.test(text)) continue;
        return item;
      }
    }
  }
  return null;
}

async function clickContinueControl(contexts) {
  for (const context of contexts) {
    if (!context) continue;
    const candidates = [
      context.getByRole("button", { name: CONTINUE_NAME }),
      context.locator('button[type="button"], input[type="button"], a[role="button"]').filter({ hasText: CONTINUE_NAME }),
    ];
    for (const locator of candidates) {
      const count = await locator.count().catch(() => 0);
      for (let i = 0; i < count; i += 1) {
        const item = locator.nth(i);
        if (!(await item.isVisible().catch(() => false))) continue;
        if (await item.isDisabled().catch(() => false)) continue;
        await item.click();
        return true;
      }
    }
  }
  return false;
}

export { knownAnswer, questionKey, fillSelect, compactLabel, humanizeFieldName, isUselessLabel, sanitizeLabel, SUBMIT_NAME, CONTINUE_NAME, resolveApplicationUrl, pageHasBlockingCaptcha };
