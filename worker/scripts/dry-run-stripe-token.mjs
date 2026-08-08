/**
 * Timed dry-run for Stripe job token (default 8114514 IT SOX).
 */
import { mkdir, copyFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runApplication } from "../src/automation.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(__dirname, "..", "tmp");
const token = process.env.GH_TOKEN || "8114514";
const RESUME_SRC = process.env.RESUME_PATH || String.raw`c:\Users\shiva\Downloads\Shivang_Soni (1).pdf`;

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
  school: "University of California, Davis",
  educationLevel: "Master's Degree",
  currentEmployer: "Microsoft",
  currentJobTitle: "Software Developer",
  workAuthorization: "Need visa sponsorship",
  sponsorship: "Yes",
  preferredLocations: JSON.stringify([{ country: "United States", state: "Washington", city: "Redmond", workplaceTypes: ["Remote"] }]),
  experienceLevel: "5-8",
};

const started = Date.now();
console.log("Starting dry-run for token", token);
const result = await runApplication({
  application: {
    id: "dry-run-8114514",
    sourceUrl: `https://job-boards.greenhouse.io/embed/job_app?for=stripe&token=${token}`,
    company: "Stripe",
    title: "IT SOX Controls Specialist",
    answers: {},
  },
  profile,
  resumePath,
  dryRun: true,
  headed: process.env.HEADED === "1",
  timeoutMs: Number(process.env.TIMEOUT_MS || 4 * 60 * 1000),
});
const elapsedSec = Math.round((Date.now() - started) / 1000);
const report = { elapsedSec, result };
await writeFile(path.join(tmpDir, `dry-run-${token}.json`), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(result.outcome === "dry_run" || result.outcome === "submitted" ? 0 : 1);
