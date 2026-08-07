import { describe, expect, it } from "vitest";
import {
  emptyWorkLocation,
  flattenWorkLocationsForWorker,
  parseWorkLocations,
  serializeWorkLocations,
  summarizeWorkLocation,
  toggleListItem,
} from "./profile-form";
import { missingProfileFields, profileReadyForApply } from "./profileCompleteness";
import { emptyProfile } from "./storage";

describe("work location serialize/parse", () => {
  it("round-trips JSON work location cards", () => {
    const cards: ReturnType<typeof parseWorkLocations> = [
      { workplaceTypes: ["Remote", "Hybrid"], country: "United States", state: "Washington", city: "Seattle", radiusMiles: 50 },
      { workplaceTypes: ["On-site"], country: "Canada", city: "Toronto" },
    ];
    const serialized = serializeWorkLocations(cards);
    expect(serialized.startsWith("[")).toBe(true);
    expect(parseWorkLocations(serialized)).toEqual([
      { workplaceTypes: ["Remote", "Hybrid"], country: "United States", state: "Washington", city: "Seattle", radiusMiles: 50 },
      { workplaceTypes: ["On-site"], country: "Canada", city: "Toronto" },
    ]);
  });

  it("parses legacy free-text preferredLocations", () => {
    expect(parseWorkLocations("Seattle, United States")).toEqual([
      { workplaceTypes: ["Remote"], country: "United States", city: "Seattle" },
    ]);
  });

  it("flattens tokens for worker-friendly display", () => {
    const card = emptyWorkLocation("Germany");
    card.workplaceTypes = ["Remote", "Hybrid"];
    card.city = "Berlin";
    expect(flattenWorkLocationsForWorker([card])).toContain("Remote");
    expect(flattenWorkLocationsForWorker([card])).toContain("Berlin");
    expect(summarizeWorkLocation(card)).toMatch(/Remote \+ Hybrid/);
  });

  it("toggles employment type chips", () => {
    expect(toggleListItem("Full-Time", "Contract", true)).toBe("Full-Time, Contract");
    expect(toggleListItem("Full-Time, Contract", "Full-Time", false)).toBe("Contract");
  });
});

describe("expanded profile completeness", () => {
  it("requires apply-critical fields including work locations", () => {
    const missing = missingProfileFields(emptyProfile);
    expect(missing).toEqual(expect.arrayContaining([
      "firstName",
      "phone",
      "country",
      "linkedin",
      "workAuthorization",
      "sponsorship",
      "targetRoles",
      "employmentTypes",
      "preferredLocations",
      "educationLevel",
    ]));
  });

  it("accepts valid preferredLocations JSON cards", () => {
    const profile = {
      ...emptyProfile,
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      phone: "+1 555 0100",
      country: "United States",
      state: "California",
      city: "San Francisco",
      address: "1 Market St",
      postalCode: "94105",
      linkedin: "https://linkedin.com/in/ada",
      workAuthorization: "Yes",
      sponsorship: "No",
      targetRoles: "Software Engineer",
      employmentTypes: "Full-Time",
      experienceLevel: "5-8 years",
      minSalary: "180000",
      preferredLocations: serializeWorkLocations([
        { workplaceTypes: ["Remote"], country: "United States", city: "San Francisco" },
      ]),
      educationLevel: "Bachelor's",
    };
    expect(missingProfileFields(profile)).toEqual([]);
    expect(profileReadyForApply(profile, true).ready).toBe(true);
    expect(profileReadyForApply(profile, false).needsResume).toBe(true);
  });

  it("rejects preferredLocations without country/workplace type", () => {
    const profile = {
      ...emptyProfile,
      preferredLocations: '[{"workplaceTypes":[],"country":""}]',
    };
    expect(missingProfileFields(profile)).toContain("preferredLocations");
  });
});
