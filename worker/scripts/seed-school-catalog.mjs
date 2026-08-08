/**
 * Seed dbo.EmployerOptionCatalogs school list from a text dump (one school per line).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { saveOptionCatalog } from "../src/option-catalog.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = process.env.SCHOOL_LIST
  || path.join(__dirname, "..", "tmp", "school-options-8114514.txt");
const board = process.env.BOARD || "stripe";

const raw = await readFile(file, "utf8");
const schools = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
const ok = await saveOptionCatalog(board, "school", schools);
console.log({ board, count: schools.length, saved: ok });
process.exit(ok ? 0 : 1);
