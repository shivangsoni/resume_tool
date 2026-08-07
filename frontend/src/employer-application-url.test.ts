import { describe, expect, it } from "vitest";
import { resolveEmployerApplicationUrl } from "./employer-application-url";

describe("resolveEmployerApplicationUrl", () => {
  it("rewrites Stripe Greenhouse search links to the embed apply URL", () => {
    expect(resolveEmployerApplicationUrl({
      company: "Stripe",
      source: "Greenhouse",
      sourceUrl: "https://stripe.com/jobs/search?gh_jid=7277110",
      jobExternalId: "7277110",
    })).toBe("https://boards.greenhouse.io/embed/job_app?for=stripe&token=7277110");
  });

  it("falls back to the original listing URL", () => {
    const sourceUrl = "https://example.com/jobs/123";
    expect(resolveEmployerApplicationUrl({ company: "Acme", sourceUrl })).toBe(sourceUrl);
  });
});
