import type { Profile } from "./types";
import { parseWorkLocations } from "./profile-form";

/** Fields required before Simple Apply can queue a submission. */
export const REQUIRED_PROFILE_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "country",
  "state",
  "city",
  "address",
  "postalCode",
  "linkedin",
  "workAuthorization",
  "sponsorship",
  "targetRoles",
  "employmentTypes",
  "experienceLevel",
  "minSalary",
  "preferredLocations",
  "educationLevel",
] as const satisfies readonly (keyof Profile)[];

export type RequiredProfileField = (typeof REQUIRED_PROFILE_FIELDS)[number];

export function missingProfileFields(profile: Profile | null | undefined): RequiredProfileField[] {
  const current = profile || ({} as Profile);
  return REQUIRED_PROFILE_FIELDS.filter((field) => {
    const value = String(current[field] || "").trim();
    if (!value) return true;
    if (field === "preferredLocations") {
      const cards = parseWorkLocations(value);
      return !cards.some((card) => card.country && card.workplaceTypes.length);
    }
    return false;
  });
}

export function profileReadyForApply(profile: Profile | null | undefined, hasResume: boolean) {
  const missing = missingProfileFields(profile);
  return {
    ready: missing.length === 0 && hasResume,
    missing,
    needsResume: !hasResume,
  };
}

const FIELD_LABELS: Partial<Record<string, string>> = {
  firstName: "First name",
  lastName: "Last name",
  email: "Email",
  phone: "Phone",
  country: "Country of residence",
  state: "State",
  city: "City",
  address: "Address",
  postalCode: "Postal code",
  linkedin: "LinkedIn URL",
  github: "GitHub URL",
  portfolio: "Portfolio URL",
  workAuthorization: "Legal to work",
  sponsorship: "Require sponsorship",
  targetRoles: "Desired job title",
  employmentTypes: "Employment type preferences",
  experienceLevel: "Years of experience",
  minSalary: "Minimum salary",
  preferredLocations: "Work locations",
  educationLevel: "Education level",
  school: "School",
  preferredLanguages: "Preferred languages",
  companiesToExclude: "Companies to exclude",
  additionalInfo: "Additional information",
  currentEmployer: "Current employer",
  currentJobTitle: "Current job title",
  skills: "Skills",
};

export function fieldLabel(field: string) {
  return FIELD_LABELS[field] || field.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
}
