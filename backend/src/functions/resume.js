import { app } from "@azure/functions";
import { createHash } from "node:crypto";
import { DefaultAzureCredential } from "@azure/identity";
import { BlobServiceClient } from "@azure/storage-blob";
import { getPrincipal, unauthorized } from "../identity.js";
import { deleteResumeDocument, getProfile, listResumeDocuments, mergeProfileSuggestions, refreshQueuedApplications, renameResumeDocument, saveDocument, getResumeDocument } from "../database.js";
import { analyzeResume } from "../document-intelligence.js";

const storage = () => {
  const account = process.env.AZURE_STORAGE_ACCOUNT;
  if (!account) throw new Error("Storage is not configured.");
  return new BlobServiceClient(`https://${account}.blob.core.windows.net`, new DefaultAzureCredential())
    .getContainerClient(process.env.RESUME_CONTAINER || "resumes");
};

const readStream = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
};

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
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const blobName = `${createHash("sha256").update(principal.subject).digest("hex")}/${crypto.randomUUID()}-${safeName}`;
      const blob = storage().getBlockBlobClient(blobName);
      const bytes = Buffer.from(await file.arrayBuffer());
      await blob.uploadData(bytes, { blobHTTPHeaders: { blobContentType: file.type } });
      let extractionStatus = "succeeded"; let extraction;
      try {
        extraction = await analyzeResume(bytes, file.type);
      } catch (analysisError) {
        extractionStatus = "failed";
        context.warn("Resume extraction failed; the private upload was retained", analysisError);
      }
      const document = await saveDocument(principal, { fileName: file.name, contentType: file.type, blobName, size: file.size, extractionStatus, extraction });
      let profile = null;
      let mergedFields = [];
      if (extractionStatus === "succeeded" && extraction?.profile) {
        const before = await getProfile(principal);
        const prior = before.profile || {};
        const suggestions = { ...extraction.profile };
        if (!String(suggestions.email || "").trim() && principal.email) suggestions.email = principal.email;
        const merged = await mergeProfileSuggestions(principal, suggestions);
        profile = merged.profile;
        mergedFields = Object.keys(suggestions).filter((key) => {
          const next = String(suggestions[key] || "").trim();
          const previous = String(prior[key] || "").trim();
          return Boolean(next && !previous && String(profile?.[key] || "").trim() === next);
        });
        if (mergedFields.length) {
          try { await refreshQueuedApplications(principal, profile); } catch { /* ignore */ }
        }
      }
      return {
        status: 201,
        jsonBody: {
          document: { id: document.Id, fileName: document.FileName, contentType: document.ContentType, sizeBytes: Number(document.SizeBytes), isPrimary: true, extractionStatus: document.ExtractionStatus, createdAt: document.CreatedAt },
          suggestions: extraction?.profile || {},
          profile,
          mergedFields,
          extractionStatus,
        },
      };
    } catch (error) { context.error("Resume upload failed", error); return { status: 500, jsonBody: { error: "Résumé upload failed." } }; }
  },
});

app.http("resumes", {
  methods: ["GET"], authLevel: "anonymous", route: "resumes",
  handler: async (request, context) => {
    const principal = getPrincipal(request); if (!principal) return unauthorized();
    try { return { jsonBody: { documents: await listResumeDocuments(principal) }, headers: { "Cache-Control": "no-store" } }; }
    catch (error) { context.error("Resume list failed", error); return { status: 500, jsonBody: { error: "Résumés could not be loaded." } }; }
  },
});

app.http("resumeContent", {
  methods: ["GET"], authLevel: "anonymous", route: "resumes/{id}/content",
  handler: async (request, context) => {
    const principal = getPrincipal(request); if (!principal) return unauthorized();
    try {
      const document = await getResumeDocument(principal, request.params.id);
      if (!document) return { status: 404, jsonBody: { error: "Résumé not found." } };
      const response = await storage().getBlobClient(document.BlobName).download();
      const bytes = await readStream(response.readableStreamBody);
      const safeName = document.FileName.replace(/[\r\n"]/g, "_");
      return { body: bytes, headers: { "Content-Type": document.ContentType, "Content-Disposition": `inline; filename="${safeName}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } };
    } catch (error) { context.error("Resume content failed", error); return { status: 500, jsonBody: { error: "Résumé could not be opened." } }; }
  },
});

app.http("deleteResume", {
  methods: ["DELETE", "PATCH"], authLevel: "anonymous", route: "resumes/{id}",
  handler: async (request, context) => {
    const principal = getPrincipal(request); if (!principal) return unauthorized();
    try {
      if (request.method === "PATCH") {
        const body = await request.json();
        const fileName = String(body?.fileName || "").trim();
        if (!fileName || fileName.length > 260 || /[\\/:*?"<>|\r\n]/.test(fileName)) {
          return { status: 400, jsonBody: { error: "Enter a valid file name up to 260 characters." } };
        }
        const current = await getResumeDocument(principal, request.params.id);
        if (!current) return { status: 404, jsonBody: { error: "Resume not found." } };
        const currentExtension = current.FileName.split(".").pop()?.toLowerCase();
        const nextExtension = fileName.split(".").pop()?.toLowerCase();
        if (currentExtension !== nextExtension) {
          return { status: 400, jsonBody: { error: `Keep the .${currentExtension} file extension when renaming.` } };
        }
        return { jsonBody: { document: await renameResumeDocument(principal, request.params.id, fileName) } };
      }
      const blobName = await deleteResumeDocument(principal, request.params.id);
      if (!blobName) return { status: 404, jsonBody: { error: "Résumé not found." } };
      await storage().deleteBlob(blobName, { deleteSnapshots: "include" }).catch((error) => context.warn("Orphaned resume blob cleanup failed", error));
      return { status: 204 };
    } catch (error) { context.error("Resume delete failed", error); return { status: 500, jsonBody: { error: "Résumé could not be removed." } }; }
  },
});
