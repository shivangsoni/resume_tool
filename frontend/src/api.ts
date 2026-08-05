import type { Application, MailMessage, Profile } from "./types";

const API = import.meta.env.VITE_API_BASE_URL || "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (response.status === 401) throw new Error("AUTH_REQUIRED");
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

export async function getCurrentUser() {
  if (import.meta.env.DEV)
    return {
      userId: "local-development-user",
      userDetails: "local@example.test",
    };
  const response = await fetch("/.auth/me");
  if (!response.ok) return null;
  const body = await response.json();
  return body.clientPrincipal || null;
}

export async function getAllJobs(signal?: AbortSignal) {
  const jobs: unknown[] = [];
  let offset: number | null = 0;
  let total = 0;
  let pageCount = 0;
  while (offset !== null) {
    if (pageCount >= 100) throw new Error("Job API returned too many pages.");
    const page: { jobs: unknown[]; total: number; nextOffset: number | null } = await request(
      `/jobs?limit=100&offset=${offset}`,
      { signal },
    );
    pageCount += 1;
    jobs.push(...(page.jobs || []));
    total = page.total || jobs.length;
    offset = page.nextOffset;
  }
  return { jobs, total };
}

export const getRemoteProfile = () =>
  request<{ profile: Profile | null; updatedAt: string | null }>("/profile");
export const putRemoteProfile = (profile: Profile) =>
  request<{ profile: Profile; updatedAt: string }>("/profile", {
    method: "PUT",
    body: JSON.stringify(profile),
  });
export const getApplications = () =>
  request<{ applications: Application[] }>("/applications");
export const createApplication = (
  job: unknown,
  answers: Record<string, string>,
) =>
  request<{ application: Application; notification: { sent: boolean; status?: string } }>("/applications", {
    method: "POST",
    body: JSON.stringify({ job, answers }),
  });
export const updateApplication = (
  id: string,
  status: Application["status"],
  notes?: string,
) =>
  request<{ application: Application }>(`/applications/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status, notes }),
  });

export async function uploadResume(file: File) {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(`${API}/resume`, { method: "POST", body: form });
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(body.error || `Upload failed (${response.status})`);
  return body as {
    document: {
      Id: string;
      FileName: string;
      SizeBytes: number;
      CreatedAt: string;
      ExtractionStatus: "succeeded" | "failed";
    };
    profile?: Profile;
    suggestions: Partial<Profile>;
    extractionStatus: "succeeded" | "failed";
  };
}

export const getMailbox = (offset = 0) =>
  request<{ address: string | null; messages: MailMessage[]; total: number }>(`/mailbox?limit=25&offset=${offset}`);

export const markMailboxMessageRead = (id: string) =>
  request<{ message: MailMessage }>(`/mailbox/${id}`, { method: "PATCH", body: "{}" });
