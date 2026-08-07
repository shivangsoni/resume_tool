import type { Profile } from "./types";

/** Fields required before Simple Apply can queue a submission. */
export const REQUIRED_PROFILE_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "country",
  "linkedin",
  "workAuthorization",
  "sponsorship",
] as const satisfies readonly (keyof Profile)[];

export type RequiredProfileField = (typeof REQUIRED_PROFILE_FIELDS)[number];

export function missingProfileFields(profile: Profile | null | undefined): RequiredProfileField[] {
  const current = profile || ({} as Profile);
  return REQUIRED_PROFILE_FIELDS.filter((field) => !String(current[field] || "").trim());
}

export function profileReadyForApply(profile: Profile | null | undefined, hasResume: boolean) {
  const missing = missingProfileFields(profile);
  return {
    ready: missing.length === 0 && hasResume,
    missing,
    needsResume: !hasResume,
  };
}

export function fieldLabel(field: string) {
  return field.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
}
