import { app } from "@azure/functions";
import { createHash } from "node:crypto";
import { DefaultAzureCredential } from "@azure/identity";
import { BlobServiceClient } from "@azure/storage-blob";
import { getPrincipal, unauthorized } from "../identity.js";
import { mergeProfileSuggestions, refreshQueuedApplications, saveDocument } from "../database.js";
import { analyzeResume } from "../document-intelligence.js";

app.http("resume", {
  methods: ["POST"], authLevel: "anonymous", route: "resume",
  handler: async (request, context) => {
    const principal = getPrincipal(request); if (!principal) return unauthorized();
    try {
      const form = await request.formData(); const file = form.get("file");
      if (!(file instanceof File)) return { status: 400, jsonBody: { error: "A résumé file is required." } };
      if (file.size > 4 * 1024 * 1024) return { status: 413, jsonBody: { error: "Résumé must be 4 MB or smaller." } };
      const allowed = new Set(["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);
      if (!allowed.has(file.type)) return { status: 415, jsonBody: { error: "Only PDF and DOCX résumés are supported." } };
      const account = process.env.AZURE_STORAGE_ACCOUNT; if (!account) throw new Error("Storage is not configured.");
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const blobName = `${createHash("sha256").update(principal.subject).digest("hex")}/${crypto.randomUUID()}-${safeName}`;
      const service = new BlobServiceClient(`https://${account}.blob.core.windows.net`, new DefaultAzureCredential());
      const blob = service.getContainerClient(process.env.RESUME_CONTAINER || "resumes").getBlockBlobClient(blobName);
      const bytes = Buffer.from(await file.arrayBuffer());
      await blob.uploadData(bytes, { blobHTTPHeaders: { blobContentType: file.type } });
      let extractionStatus = "succeeded"; let extraction; let profile; let refreshedApplications = 0;
      try {
        extraction = await analyzeResume(bytes, file.type);
        profile = (await mergeProfileSuggestions(principal, extraction.profile)).profile;
        if (profile) {
          refreshedApplications = await refreshQueuedApplications(principal, profile);
        }
      } catch (analysisError) {
        extractionStatus = "failed";
        context.warn("Resume extraction failed; the private upload was retained", analysisError);
      }
      const document = await saveDocument(principal, { fileName: file.name, contentType: file.type, blobName, size: file.size, extractionStatus, extraction });
      return { status: 201, jsonBody: { document, profile, suggestions: extraction?.profile || {}, extractionStatus, refreshedApplications } };
    } catch (error) { context.error("Resume upload failed", error); return { status: 500, jsonBody: { error: "Résumé upload failed." } }; }
  },
});
