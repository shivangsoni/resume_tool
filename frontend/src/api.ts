import type { Application, MailMessage, Profile, ResumeDocument } from "./types";

const API = import.meta.env.VITE_API_BASE_URL || "/api";
const SESSION_KEY = "applypilot.session";
const DEV_AUTH_KEY = "applypilot.devAuth";
const DEV_USER = {
  userId: "local-development-user",
  userDetails: "local@example.test",
  userRoles: ["authenticated"],
};

function sessionHeaders(): HeadersInit {
  const token = localStorage.getItem(SESSION_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...sessionHeaders(),
      ...(init?.headers || {}),
    },
  });
  if (response.status === 401) throw new Error("AUTH_REQUIRED");
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

export type AuthUser = {
  userId: string;
  userDetails?: string;
  userRoles?: string[];
  identityProvider?: string;
};

export function setSessionToken(token: string | null) {
  if (token) localStorage.setItem(SESSION_KEY, token);
  else localStorage.removeItem(SESSION_KEY);
}

/** Local-only OAuth stub so the landing page stays public until you click Sign in. */
export function setDevSignedIn(signedIn: boolean) {
  if (!import.meta.env.DEV) return;
  if (signedIn) localStorage.setItem(DEV_AUTH_KEY, "1");
  else localStorage.removeItem(DEV_AUTH_KEY);
}

function isValidPrincipal(principal: unknown): AuthUser | null {
  if (!principal || typeof principal !== "object") return null;
  const record = principal as Record<string, unknown>;
  const userId = String(record.userId || "").trim();
  if (!userId) return null;
  const roles = Array.isArray(record.userRoles)
    ? record.userRoles.map((role) => String(role))
    : [];
  if (roles.length > 0 && !roles.includes("authenticated")) return null;
  return {
    userId,
    userDetails: record.userDetails != null ? String(record.userDetails) : undefined,
    userRoles: roles,
    identityProvider: record.identityProvider != null ? String(record.identityProvider) : undefined,
  };
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  if (import.meta.env.DEV && localStorage.getItem(DEV_AUTH_KEY) === "1") {
    return DEV_USER;
  }

  if (!import.meta.env.DEV) {
    try {
      const response = await fetch("/.auth/me");
      if (response.ok) {
        const body = await response.json().catch(() => ({}));
        const principal = isValidPrincipal(body.clientPrincipal);
        if (principal) return principal;
      }
    } catch {
      /* fall through to password session */
    }
  }

  const token = localStorage.getItem(SESSION_KEY);
  if (!token) return null;
  try {
    const response = await fetch(`${API}/auth/me`, {
      credentials: "same-origin",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      setSessionToken(null);
      return null;
    }
    const body = await response.json().catch(() => ({}));
    return isValidPrincipal(body.user);
  } catch {
    return null;
  }
}

export async function registerWithPassword(input: {
  username: string;
  email: string;
  password: string;
}) {
  const result = await request<{ token: string; user: AuthUser }>("/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
  setSessionToken(result.token);
  setDevSignedIn(false);
  return result.user;
}

export async function loginWithPassword(input: { username: string; password: string }) {
  const result = await request<{ token: string; user: AuthUser }>("/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
  setSessionToken(result.token);
  setDevSignedIn(false);
  return result.user;
}

/** Clear password session, DEV stub, and Azure Static Web Apps Easy Auth cookies. */
export async function beginSignOut() {
  setSessionToken(null);
  setDevSignedIn(false);

  try {
    await fetch(`${API}/auth/logout`, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    /* ignore */
  }

  if (import.meta.env.DEV) {
    window.location.replace("/logged-out");
    return;
  }

  // A plain navigation to /.auth/logout often leaves AppServiceAuthSession /
  // StaticWebAppsAuthCookie set, so /.auth/me still returns a principal.
  // Hitting logout then logout/complete clears those cookies (same-origin).
  try {
    await fetch("/.auth/logout", { mode: "no-cors", cache: "no-store", credentials: "include" });
    await fetch("/.auth/logout/complete", { mode: "no-cors", cache: "no-store", credentials: "include" });
  } catch {
    /* ignore */
  }

  window.location.replace("/logged-out");
}

/** Re-check Easy Auth after logout UI loads; clear any leftover SWA session. */
export async function ensureSignedOut(): Promise<boolean> {
  setSessionToken(null);
  setDevSignedIn(false);
  if (import.meta.env.DEV) return true;

  try {
    const response = await fetch("/.auth/me", { cache: "no-store", credentials: "include" });
    if (!response.ok) return true;
    const body = await response.json().catch(() => ({}));
    if (!body?.clientPrincipal?.userId) return true;

    await fetch("/.auth/logout", { mode: "no-cors", cache: "no-store", credentials: "include" });
    await fetch("/.auth/logout/complete", { mode: "no-cors", cache: "no-store", credentials: "include" });

    const again = await fetch("/.auth/me", { cache: "no-store", credentials: "include" });
    if (!again.ok) return true;
    const againBody = await again.json().catch(() => ({}));
    return !againBody?.clientPrincipal?.userId;
  } catch {
    return true;
  }
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

export const deleteApplication = (id: string) =>
  request<{ deleted: boolean; id: string }>(`/applications/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

export async function uploadResume(file: File) {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(`${API}/resume`, {
    method: "POST",
    body: form,
    credentials: "same-origin",
    headers: { ...sessionHeaders() },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(body.error || `Upload failed (${response.status})`);
  return body as {
    document: ResumeDocument;
    suggestions: Partial<Profile>;
    profile?: Profile | null;
    mergedFields?: string[];
    extractionStatus: "succeeded" | "failed";
  };
}

export const getResumes = () => request<{ documents: ResumeDocument[] }>("/resumes");
export const getResumeContentUrl = (id: string) => `${API}/resumes/${encodeURIComponent(id)}/content`;
export async function getResumeBlob(id: string) {
  const response = await fetch(getResumeContentUrl(id), {
    credentials: "same-origin",
    cache: "no-store",
    headers: { ...sessionHeaders() },
  });
  if (response.status === 401) throw new Error("AUTH_REQUIRED");
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Resume could not be opened (${response.status})`);
  }
  return response.blob();
}
export const renameResume = (id: string, fileName: string) =>
  request<{ document: ResumeDocument }>(`/resumes/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ fileName }),
  });
export const deleteResume = (id: string) => request<void>(`/resumes/${encodeURIComponent(id)}`, { method: "DELETE" });

export const submitApplication = (id: string) =>
  request<{ application: Application; queue: { accepted: boolean } }>(`/applications/${encodeURIComponent(id)}/submit`, {
    method: "POST",
    body: "{}",
  });
export const answerApplicationQuestions = (id: string, answers: Record<string, string>) =>
  request<{ application: Application; queued?: boolean; awaitingVerification?: boolean; message?: string }>(`/applications/${encodeURIComponent(id)}/answers`, {
    method: "POST",
    body: JSON.stringify({ answers }),
  });

export const getMailbox = (offset = 0) =>
  request<{ address: string | null; messages: MailMessage[]; total: number; routingNote?: string }>(`/mailbox?limit=25&offset=${offset}`);

export const markMailboxMessageRead = (id: string) =>
  request<{ message: MailMessage }>(`/mailbox/${id}`, { method: "PATCH", body: "{}" });

export const getAuthProviders = () =>
  request<{ providers: Array<{ id: string; label: string; href: string; enabled: boolean }> }>("/auth/providers");
