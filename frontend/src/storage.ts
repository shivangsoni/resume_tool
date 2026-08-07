import type { Profile } from "./types";

export const emptyProfile: Profile = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  location: "",
  headline: "",
  summary: "",
  linkedin: "",
  portfolio: "",
  workAuthorization: "",
  sponsorship: "",
  skills: "",
  targetRoles: "",
  preferredLocations: "",
  minSalary: "",
  experienceLevel: "",
  country: "",
  state: "",
  city: "",
  address: "",
  postalCode: "",
  github: "",
  educationLevel: "",
  school: "",
  currentEmployer: "",
  currentJobTitle: "",
  employmentTypes: "",
  preferredLanguages: "",
  companiesToExclude: "",
  additionalInfo: "",
  photoUrl: "",
};

export function loadProfile(): Profile {
  try {
    return {
      ...emptyProfile,
      ...JSON.parse(localStorage.getItem("applymate.profile") || "{}"),
    };
  } catch {
    return emptyProfile;
  }
}
export function saveProfile(profile: Profile) {
  localStorage.setItem("applymate.profile", JSON.stringify(profile));
}
