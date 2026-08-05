const timeoutMs = 30000;

function providerConfiguration(source) {
  const endpoint = process.env.EMPLOYER_SUBMISSION_ENDPOINT;
  const supported = String(process.env.EMPLOYER_SUBMISSION_SOURCES || "")
    .split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  if (!endpoint || !supported.includes(String(source || "").toLowerCase())) return null;
  return { endpoint, token: process.env.EMPLOYER_SUBMISSION_TOKEN || "" };
}

export async function submitToEmployer(application) {
  const provider = providerConfiguration(application.source);
  if (!provider) {
    return { outcome: "needs_action", detail: `No authorized submission provider is configured for ${application.source || "this source"}.` };
  }

  const response = await fetch(provider.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(provider.token ? { Authorization: `Bearer ${provider.token}` } : {}),
    },
    body: JSON.stringify({
      idempotencyKey: application.id,
      applicationId: application.id,
      job: {
        externalId: application.jobExternalId,
        company: application.company,
        title: application.title,
        source: application.source,
        sourceUrl: application.sourceUrl,
      },
      answers: application.answers,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (response.status === 429 || response.status >= 500) throw new Error(`Employer provider temporarily failed (${response.status}).`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return { outcome: "needs_action", detail: body.error || `Employer provider rejected the request (${response.status}).` };
  const receiptId = String(body.receiptId || body.applicationId || "").trim();
  if (!receiptId) return { outcome: "needs_action", detail: "Provider returned success without a verifiable employer receipt." };
  return { outcome: "submitted", receiptId, provider: String(body.provider || application.source || "provider") };
}
