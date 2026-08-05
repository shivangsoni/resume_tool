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
    | "review"
    | "queued"
    | "processing"
    | "needs_action"
    | "submitted"
    | "interview"
    | "offer"
    | "rejected"
    | "failed";
  sourceUrl: string;
  source: string;
  updatedAt: string;
  appliedAt?: string;
};

export type MailMessage = {
  id: string;
  from: { name?: string | null; email: string };
  subject: string;
  textBody: string;
  receivedAt: string;
  isRead: boolean;
  attachmentCount: number;
};

export type ResumeDocument = {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  isPrimary: boolean;
  extractionStatus: "not_requested" | "processing" | "succeeded" | "failed";
  createdAt: string;
};
