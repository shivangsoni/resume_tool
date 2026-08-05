export type Profile = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  location: string;
  headline: string;
  summary: string;
  linkedin: string;
  portfolio: string;
  workAuthorization: string;
  sponsorship: string;
  skills: string;
  targetRoles: string;
  preferredLocations: string;
  minSalary: string;
  experienceLevel: string;
  country: string;
  state: string;
  city: string;
  address: string;
  postalCode: string;
  github: string;
  educationLevel: string;
  employmentTypes: string;
  preferredLanguages: string;
  companiesToExclude: string;
  additionalInfo: string;
};

export type Application = {
  id: string;
  jobId: number;
  company: string;
  title: string;
  location: string;
  status:
    "review" | "submitted" | "interview" | "offer" | "rejected" | "failed";
  sourceUrl: string;
  source: string;
  updatedAt: string;
  appliedAt?: string;
};
