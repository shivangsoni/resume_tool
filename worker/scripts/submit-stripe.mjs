/**
 * Fill + submit Stripe Greenhouse application (token 8075570) with profile fixture + resume.
 * Usage: node scripts/submit-stripe.mjs
 */
import { mkdir, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runApplication, formatLocationQuery } from "../src/automation.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(__dirname, "..", "tmp");
const STRIPE_URL = "https://job-boards.greenhouse.io/embed/job_app?for=stripe&token=8075570";
const RESUME_SRC = process.env.RESUME_PATH
  || String.raw`c:\Users\shiva\Downloads\Shivang_Soni (1).pdf`;

await mkdir(tmpDir, { recursive: true });
const resumePath = path.join(tmpDir, "Shivang_Soni_resume.pdf");
await copyFile(RESUME_SRC, resumePath);

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
  workAuthorization: "Yes",
  sponsorship: "Yes",
  preferredLocations: JSON.stringify([{ workplaceTypes: ["Remote"], country: "United States" }]),
  targetRoles: "Software Developer",
  employmentTypes: "Full-Time",
  experienceLevel: "5-8 years",
  minSalary: "150000",
  educationLevel: "Master's",
  school: "University of California, Davis",
  linkedin: "https://www.linkedin.com/in/shivang-soni-b97575116/",
  github: "https://github.com/shivangsoni",
  currentEmployer: "Microsoft",
  currentJobTitle: "Software Developer",
  skills: "Azure, C#, C++, Java, JavaScript, Python, React, SQL, TypeScript",
};

const location = formatLocationQuery("", profile);

const application = {
  id: `stripe-submit-${Date.now()}`,
  company: "Stripe",
  source: "Greenhouse",
  sourceUrl: STRIPE_URL,
  answers: {
    email: profile.email,
    phone: profile.phone,
    country: "United States",
    city: profile.city,
    state: profile.state,
    location,
    whatsapp: "No",
    school: profile.school,
    educationLevel: "Master's Degree",
    experienceLevel: "5-8 years",
    currentEmployer: profile.currentEmployer,
    currentJobTitle: profile.currentJobTitle,
    workAuthorization: "Yes",
    sponsorship: "Yes",
    // Common Greenhouse / Stripe questionnaire keys (best-effort; label lookup also used)
    "US": "US",
  },
};

console.log("Resume:", resumePath);
console.log("Submitting to", STRIPE_URL);

const headed = process.env.HEADED === "1";
const result = await runApplication({
  application,
  profile,
  resumePath,
  dryRun: false,
  headed,
});

const reportPath = path.join(tmpDir, "stripe-submit-report.json");
await writeFile(reportPath, JSON.stringify({ at: new Date().toISOString(), result }, null, 2));
console.log(JSON.stringify(result, null, 2));
console.log("Wrote", reportPath);
process.exit(result.outcome === "submitted" ? 0 : 1);
