import { app } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { BlobServiceClient } from "@azure/storage-blob";
import { getPrincipal, unauthorized } from "../identity.js";
import { saveDocument } from "../database.js";

app.http("resume", {
  methods: ["POST"], authLevel: "anonymous", route: "resume",
  handler: async (request, context) => {
    const principal = getPrincipal(request); if (!principal) return unauthorized();
    try {
      const form = await request.formData(); const file = form.get("file");
      if (!(file instanceof File)) return { status: 400, jsonBody: { error: "A résumé file is required." } };
      if (file.size > 5 * 1024 * 1024) return { status: 413, jsonBody: { error: "Résumé must be 5 MB or smaller." } };
      const allowed = new Set(["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);
      if (!allowed.has(file.type)) return { status: 415, jsonBody: { error: "Only PDF and DOCX résumés are supported." } };
      const account = process.env.AZURE_STORAGE_ACCOUNT; if (!account) throw new Error("Storage is not configured.");
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const blobName = `${principal.subject}/${crypto.randomUUID()}-${safeName}`;
      const service = new BlobServiceClient(`https://${account}.blob.core.windows.net`, new DefaultAzureCredential());
      const blob = service.getContainerClient(process.env.RESUME_CONTAINER || "resumes").getBlockBlobClient(blobName);
      await blob.uploadData(Buffer.from(await file.arrayBuffer()), { blobHTTPHeaders: { blobContentType: file.type } });
      const document = await saveDocument(principal, { fileName: file.name, contentType: file.type, blobName, size: file.size });
      return { status: 201, jsonBody: { document } };
    } catch (error) { context.error("Resume upload failed", error); return { status: 500, jsonBody: { error: "Résumé upload failed." } }; }
  },
});
