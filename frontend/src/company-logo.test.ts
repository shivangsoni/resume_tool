import { describe, expect, it } from "vitest";
import { companyDomain, companyInitial, resolveCompanyLogoUrl } from "./company-logo";

describe("company logo helpers", () => {
  it("maps greenhouse board tokens and company names to domains", () => {
    expect(companyDomain({ sourceBoard: "stripe", company: "Stripe" })).toBe("stripe.com");
    expect(companyDomain({ company: "Cloudflare" })).toBe("cloudflare.com");
    expect(companyDomain({
      sourceUrl: "https://job-boards.greenhouse.io/embed/job_app?for=stripe&token=1",
    })).toBe("stripe.com");
  });

  it("resolves a favicon logo URL when no explicit logo is present", () => {
    expect(resolveCompanyLogoUrl({ company: "Stripe", sourceBoard: "stripe" })).toContain("stripe.com");
    expect(resolveCompanyLogoUrl({ logoUrl: "https://cdn.example/logo.png", company: "Stripe" }))
      .toBe("https://cdn.example/logo.png");
    expect(companyInitial("Stripe")).toBe("S");
  });
});
