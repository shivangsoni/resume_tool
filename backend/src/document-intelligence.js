import { DefaultAzureCredential } from "@azure/identity";

const skillNames = [
  "Azure", "AWS", "C#", "C++", "Docker", "Git", "Java", "JavaScript",
  "Kubernetes", "Node.js", "Python", "React", "SQL", "Terraform", "TypeScript",
];

export function extractProfileFromText(content) {
  const text = String(content || "").replace(/\r/g, "");
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
  const phone = text.match(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/)?.[0] || "";
  const linkedin = text.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[A-Z0-9_-]+\/?/i)?.[0] || "";
  const github = text.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[A-Z0-9_-]+\/?/i)?.[0] || "";
  const portfolio = text.match(/https?:\/\/(?![^\s]*(?:linkedin|github)\.com)[^\s)]+/i)?.[0] || "";
  const nameLine = lines.slice(0, 12).find((line) => {
    const words = line.split(/\s+/);
    return words.length >= 2 && words.length <= 4 && /^[A-Za-z][A-Za-z .'-]+$/.test(line)
      && !/resume|curriculum|profile|summary|engineer|developer/i.test(line);
  }) || "";
  const name = nameLine.split(/\s+/);
  const skills = skillNames.filter((skill) => new RegExp(`(^|[^A-Za-z0-9+#])${skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Za-z0-9+#]|$)`, "i").test(text));

  const locationLine = lines.slice(0, 20).find((line) =>
    /,/.test(line)
    && /[A-Za-z]/.test(line)
    && !/@/.test(line)
    && !/https?:/i.test(line)
    && line.length < 80
    && (/\b[A-Z]{2}\b/.test(line) || /\b(USA|United States|Canada|UK|Remote)\b/i.test(line) || /\b(WA|CA|NY|TX|FL|IL|MA|CO|OR|BC|ON)\b/.test(line)),
  ) || "";
  let city = "";
  let state = "";
  let country = "";
  let location = "";
  if (locationLine) {
    location = locationLine;
    const parts = locationLine.split(",").map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 1) city = parts[0];
    if (parts.length >= 2) {
      const second = parts[1];
      const stateMatch = second.match(/\b([A-Z]{2})\b/);
      state = stateMatch ? stateMatch[1] : second.replace(/\d+/g, "").trim();
    }
    if (/\b(united states|usa|u\.s\.a\.?)\b/i.test(locationLine)) country = "United States";
    else if (/\bcanada\b/i.test(locationLine)) country = "Canada";
    else if (/\b(uk|united kingdom)\b/i.test(locationLine)) country = "United Kingdom";
    else if (parts.length >= 3) country = parts[parts.length - 1];
  }

  const educationLevel = /\bph\.?d\b|\bdoctorate\b/i.test(text) ? "PhD"
    : /\bmaster'?s\b|\bm\.?s\.?\b|\bmba\b/i.test(text) ? "Master's"
      : /\bbachelor'?s\b|\bb\.?s\.?\b|\bb\.?a\.?\b/i.test(text) ? "Bachelor's"
        : "";

  return {
    firstName: name[0] || "",
    lastName: name.length > 1 ? name.slice(1).join(" ") : "",
    email,
    phone,
    linkedin: linkedin && !/^https?:/i.test(linkedin) ? `https://${linkedin}` : linkedin,
    github: github && !/^https?:/i.test(github) ? `https://${github}` : github,
    portfolio,
    skills: skills.join(", "),
    location,
    city,
    state,
    country,
    educationLevel,
  };
}

const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function analyzeResume(buffer, contentType) {
  const endpoint = process.env.DOCUMENT_INTELLIGENCE_ENDPOINT;
  if (!endpoint) throw new Error("Document Intelligence is not configured.");
  const credential = new DefaultAzureCredential();
  const access = await credential.getToken("https://cognitiveservices.azure.com/.default");
  const url = `${endpoint.replace(/\/$/, "")}/documentintelligence/documentModels/prebuilt-layout:analyze?_overload=analyzeDocument&api-version=2024-11-30`;
  const started = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${access.token}`, "Content-Type": contentType },
    body: buffer,
  });
  if (started.status !== 202) throw new Error(`Document analysis start failed (${started.status}).`);
  const operationUrl = started.headers.get("operation-location");
  if (!operationUrl) throw new Error("Document analysis operation URL was not returned.");
  for (let attempt = 0; attempt < 45; attempt += 1) {
    await pause(1000);
    const result = await fetch(operationUrl, { headers: { Authorization: `Bearer ${access.token}` } });
    if (!result.ok) throw new Error(`Document analysis polling failed (${result.status}).`);
    const body = await result.json();
    if (body.status === "succeeded") {
      const content = body.analyzeResult?.content || "";
      return { profile: extractProfileFromText(content), contentPreview: content.slice(0, 4000) };
    }
    if (body.status === "failed") throw new Error("Document Intelligence could not analyze the resume.");
  }
  throw new Error("Document analysis timed out.");
}
