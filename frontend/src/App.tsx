import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Briefcase,
  Check,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  FileText,
  CreditCard,
  Download,
  LayoutDashboard,
  MapPin,
  Mail,
  Maximize2,
  Minus,
  Minimize2,
  Pencil,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Upload,
  Trash2,
  UserRound,
  WandSparkles,
  X,
} from "lucide-react";
import { Document as PdfDocument, Page as PdfPage, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { emptyProfile, loadProfile, saveProfile } from "./storage";
import {
  answerApplicationQuestions,
  createApplication,
  submitApplication,
  getApplications,
  getAllJobs,
  getCurrentUser,
  getMailbox,
  getRemoteProfile,
  getResumes,
  getResumeBlob,
  putRemoteProfile,
  markMailboxMessageRead,
  updateApplication,
  uploadResume,
  deleteResume,
  renameResume,
} from "./api";
import type { Application, MailMessage, Profile, ResumeDocument } from "./types";
import { matchesJob, paginateJobs } from "./job-filter";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

type Page = "dashboard" | "applications" | "resume" | "preferences" | "profile" | "inbox" | "search" | "credits" | "settings" | "auth";
type Job = {
  id: number;
  company: string;
  logo: string;
  title: string;
  location: string;
  posted: string;
  match: number;
  salary: string;
  level: string;
  remote: boolean;
  status: "ready" | "queued" | "applied" | "failed";
  summary: string;
  skills: string[];
  sourceUrl?: string;
  logoUrl?: string;
  source?: string;
  postedAt?: string;
};

export default function App() {
  const routePath = window.location.pathname.toLowerCase();
  const [page, setPage] = useState<Page>("dashboard");
  const [selected, setSelected] = useState(0);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "ready" | "queued" | "applied" | "failed">(
    "all",
  );
  const [source, setSource] = useState("all");
  const [workplace, setWorkplace] = useState("all");
  const [locationFilter, setLocationFilter] = useState("");
  const [jobPage, setJobPage] = useState(1);
  const [dismissed, setDismissed] = useState<number[]>([]);
  const [profile, setProfile] = useState(loadProfile);
  const [toast, setToast] = useState("");
  const [liveJobs, setLiveJobs] = useState<Job[]>([]);
  const [feedState, setFeedState] = useState<"loading" | "live" | "error">(
    "loading",
  );
  const [feedError, setFeedError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [applications, setApplications] = useState<Application[]>([]);
  const [currentUser, setCurrentUser] = useState<{
    userId: string;
    userDetails?: string;
  } | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [resumeDocuments, setResumeDocuments] = useState<ResumeDocument[]>([]);
  const notify = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(""), 2200);
  };
  useEffect(() => {
    getCurrentUser()
      .then(async (user) => {
        setCurrentUser(user);
        if (user) {
          const [remoteProfile, remoteApplications, remoteResumes] = await Promise.all([
            getRemoteProfile(),
            getApplications(),
            getResumes(),
          ]);
          if (remoteProfile.profile) {
            const normalized = { ...emptyProfile, ...remoteProfile.profile };
            setProfile(normalized);
            saveProfile(normalized);
          }
          setApplications(remoteApplications.applications);
          setResumeDocuments(remoteResumes.documents);
        }
      })
      .catch(() => notify("Account data could not be loaded"))
      .finally(() => setAuthReady(true));
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    getAllJobs(controller.signal)
      .then((result) => {
        const incoming = result.jobs as Job[];
        setLiveJobs(incoming);
        setSelected(incoming[0]?.id || 0);
        setFeedState("live");
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") {
          setLiveJobs([]);
          setFeedError("We couldn't load current jobs from the API.");
          setFeedState("error");
        }
      });
    return () => controller.abort();
  }, [reloadKey]);
  const displayJobs = useMemo(
    () =>
      liveJobs.map((item) => {
        const application = applications.find(
          (entry) => entry.jobId === item.id,
        );
        return {
          ...item,
          status:
            application && ["submitted", "interview", "offer"].includes(application.status)
              ? ("applied" as const)
              : application && ["review", "queued", "processing"].includes(application.status)
                ? ("queued" as const)
              : application && ["failed", "needs_action"].includes(application.status)
                ? ("failed" as const)
                : ("ready" as const),
        };
      }),
    [liveJobs, applications],
  );
  const visible = useMemo(
    () =>
      displayJobs.filter(
        (j) =>
          !dismissed.includes(j.id) &&
          matchesJob(j, query, status, source, workplace, locationFilter),
      ),
    [dismissed, status, source, workplace, locationFilter, query, displayJobs],
  );
  const pagination = paginateJobs(visible, jobPage);
  const { page: safePage, pageCount, jobs: pagedJobs } = pagination;
  const job = pagedJobs.find((j) => j.id === selected) || pagedJobs[0];
  if (!authReady) return <AuthLoading />;
  if (routePath === "/logged-out") return <LoggedOutPage signedIn={Boolean(currentUser)} />;
  if (!currentUser && routePath === "/login") return <AuthPage />;
  if (!currentUser) return <LandingPage />;
  return (
    <div className="sa-shell">
      <aside className="sa-side">
        <div className="sa-logo">
          <span>
            <WandSparkles />
          </span>
          <b>ApplyPilot</b>
        </div>
        <nav>
          <Side
            icon={<LayoutDashboard />}
            label="Job Matches"
            active={page === "dashboard"}
            click={() => setPage("dashboard")}
          />
          <Side
            icon={<Briefcase />}
            label="Applications"
            active={page === "applications"}
            click={() => setPage("applications")}
            count={applications.length}
          />
          <Side
            icon={<FileText />}
            label="Resumes"
            active={page === "resume"}
            click={() => setPage("resume")}
          />
          <Side
            icon={<SlidersHorizontal />}
            label="Job Preferences"
            active={page === "preferences"}
            click={() => setPage("preferences")}
          />
          <Side
            icon={<UserRound />}
            label="Profile"
            active={page === "profile"}
            click={() => setPage("profile")}
          />
        </nav>
        <div className="side-lower">
          <div className="usage">
            <div>
              <span>Submitted applications</span>
              <b>
                {
                  applications.filter((item) => item.status === "submitted")
                    .length
                }{" "}
                / 100
              </b>
            </div>
            <i>
              <em
                style={{
                  width: `${Math.min(applications.filter((item) => item.status === "submitted").length, 100)}%`,
                }}
              />
            </i>
            <small>Persisted in your account</small>
          </div>
          {authReady && currentUser ? (
            <button className="user" onClick={() => setPage("profile")}>
              <span>{(profile.firstName?.[0] || currentUser.userDetails?.[0] || "U").toUpperCase()}</span>
              <div>
                <b>{[profile.firstName, profile.lastName].filter(Boolean).join(" ") || currentUser.userDetails || "Signed in"}</b>
                <small>Profile and applications saved</small>
              </div>
              <ChevronRight />
            </button>
          ) : (
            <a className="user login-card" href="/login">
              <span><UserRound /></span>
              <div>
                <b>Sign in</b>
                <small>Save profile and applications</small>
              </div>
              <ChevronRight />
            </a>
          )}
        </div>
      </aside>
      <main className="sa-main">
        <header className="sa-header">
          <div className="mobile-logo">
            <WandSparkles /> ApplyPilot
          </div>
          <div className="header-spacer" />
          <nav className="top-nav" aria-label="Primary navigation">
            <button className={page === "dashboard" ? "active" : ""} onClick={() => setPage("dashboard")}>Dashboard</button>
            <button className={page === "inbox" ? "active" : ""} onClick={() => setPage("inbox")}><Mail /> Email Inbox</button>
            <button className={page === "search" ? "active" : ""} onClick={() => setPage("search")}>Job Search</button>
            <button className={page === "profile" ? "active" : ""} onClick={() => setPage("profile")}>Profile</button>
            <button className={page === "resume" ? "active" : ""} onClick={() => setPage("resume")}><FileText /> Résumé</button>
            <button className={page === "credits" ? "active" : ""} onClick={() => setPage("credits")}>Credits</button>
            <button className={page === "settings" ? "active" : ""} onClick={() => setPage("settings")}>Settings</button>
          </nav>
          {!authReady ? (
            <span className="auth-label">Checking account…</span>
          ) : currentUser ? (
            <a
              className="upgrade"
              href="/.auth/logout?post_logout_redirect_uri=/logged-out"
            >
              Sign out
            </a>
          ) : (
            <button
              className="upgrade"
              onClick={() => { location.href = "/login"; }}
            >
              <UserRound /> Sign in
            </button>
          )}
        </header>
        {page === "dashboard" && (
          <Dashboard
            visible={pagedJobs}
            allJobs={displayJobs}
            filteredCount={visible.length}
            page={safePage}
            pageCount={pageCount}
            setPage={setJobPage}
            selected={selected}
            setSelected={setSelected}
            job={job}
            query={query}
            setQuery={(value) => { setQuery(value); setJobPage(1); }}
            status={status}
            setStatus={(value) => { setStatus(value); setJobPage(1); }}
            source={source}
            setSource={(value) => { setSource(value); setJobPage(1); }}
            workplace={workplace}
            setWorkplace={(value) => { setWorkplace(value); setJobPage(1); }}
            locationFilter={locationFilter}
            setLocationFilter={(value) => { setLocationFilter(value); setJobPage(1); }}
            feedState={feedState}
            feedError={feedError}
            retry={() => {
              setFeedState("loading");
              setFeedError("");
              setReloadKey((value) => value + 1);
            }}
            dismiss={(id) => {
              setDismissed([...dismissed, id]);
              notify("Removed from your matches");
            }}
            apply={async (j) => {
              if (!currentUser) {
                location.href = "/.auth/login/aad?post_login_redirect_uri=/dashboard";
                return;
              }
              try {
                const result = await createApplication(j, { ...profile });
                const queued = await submitApplication(result.application.id);
                setApplications((items) => [
                  queued.application,
                  ...items.filter((item) => item.id !== queued.application.id),
                ]);
                notify(
                  result.notification?.sent
                    ? "Application queued for submission. A confirmation was emailed to your sign-in address."
                    : "Application queued for submission using your saved profile.",
                );
              } catch (error) {
                notify(
                  error instanceof Error
                    ? error.message
                    : "Could not create application",
                );
              }
            }}
          />
        )}
        {page === "applications" && (
          <Applications
            applications={applications}
            update={async (id, nextStatus) => {
              try {
                const result = await updateApplication(id, nextStatus);
                setApplications((items) =>
                  items.map((item) =>
                    item.id === id ? result.application : item,
                  ),
                );
                notify(`Application updated to ${nextStatus}`);
              } catch (error) {
                notify(
                  error instanceof Error ? error.message : "Update failed",
                );
              }
            }}
            resolve={async (id, answers) => {
              try {
                const result = await answerApplicationQuestions(id, answers);
                setApplications((items) => items.map((item) => item.id === id ? result.application : item));
                notify("Answers saved. Application queued again.");
              } catch (error) { notify(error instanceof Error ? error.message : "Answers could not be saved"); }
            }}
          />
        )}
        {page === "resume" && (
          <Resume
            documents={resumeDocuments}
            upload={async (file) => {
              if (!currentUser) {
                location.href = "/.auth/login/aad?post_login_redirect_uri=/dashboard";
                return;
              }
              try {
                const result = await uploadResume(file);
                setResumeDocuments((items) => [result.document, ...items.map((item) => ({ ...item, isPrimary: false }))]);
                notify(
                  result.extractionStatus === "succeeded"
                    ? "Résumé uploaded. Your profile was not changed."
                    : "Resume uploaded securely, but automatic extraction needs retrying",
                );
              } catch (error) {
                notify(
                  error instanceof Error ? error.message : "Upload failed",
                );
              }
            }}
            remove={async (id) => {
              try {
                await deleteResume(id);
                const refreshed = await getResumes();
                setResumeDocuments(refreshed.documents);
                notify("Résumé removed");
              } catch (error) {
                notify(error instanceof Error ? error.message : "Résumé could not be removed");
              }
            }}
            rename={async (id, fileName) => {
              const result = await renameResume(id, fileName);
              setResumeDocuments((items) => items.map((item) => item.id === id ? result.document : item));
              notify("Resume renamed");
            }}
          />
        )}
        {page === "preferences" && (
          <Preferences
            profile={profile}
            setProfile={setProfile}
            save={async () => {
              try {
                const result = await putRemoteProfile(profile);
                setProfile(result.profile);
                saveProfile(result.profile);
                try {
                  const refreshed = await getApplications();
                  setApplications(refreshed.applications);
                } catch {
                  // ignore application refresh failures for preferences save
                }
                notify("Preferences saved");
              } catch (error) {
                notify(error instanceof Error ? error.message : "Save failed");
              }
            }}
          />
        )}
        {page === "profile" && (
          <ProfileView
            profile={profile}
            setProfile={setProfile}
            save={async () => {
              try {
                const result = await putRemoteProfile(profile);
                setProfile(result.profile);
                saveProfile(result.profile);
                try {
                  const refreshed = await getApplications();
                  setApplications(refreshed.applications);
                } catch {
                  // ignore application refresh failures on profile save
                }
                notify("Profile saved securely");
              } catch (error) {
                notify(error instanceof Error ? error.message : "Save failed");
              }
            }}
          />
        )}
        {page === "search" && (
          <JobSearchPage query={query} setQuery={setQuery} location={locationFilter} setLocation={setLocationFilter} search={() => setPage("dashboard")} />
        )}
        {page === "inbox" && <InboxPage />}
        {page === "credits" && <CreditsPage queued={applications.filter((item) => ["review", "queued", "processing"].includes(item.status)).length} />}
        {page === "settings" && <SettingsPage />}
        {page === "auth" && <AuthPage />}
      </main>
      {toast && (
        <div className="toast">
          <Check />
          {toast}
        </div>
      )}
    </div>
  );
}

function Side({
  icon,
  label,
  active,
  click,
  count,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  click: () => void;
  count?: number;
}) {
  return (
    <button className={`side-item ${active ? "active" : ""}`} onClick={click}>
      {icon}
      <span>{label}</span>
      {count && <em>{count}</em>}
    </button>
  );
}

function Dashboard(p: {
  visible: Job[];
  allJobs: Job[];
  filteredCount: number;
  page: number;
  pageCount: number;
  setPage: (page: number) => void;
  selected: number;
  setSelected: (n: number) => void;
  job?: Job;
  query: string;
  setQuery: (s: string) => void;
  status: "all" | "ready" | "queued" | "applied" | "failed";
  setStatus: (s: "all" | "ready" | "queued" | "applied" | "failed") => void;
  source: string;
  setSource: (source: string) => void;
  workplace: string;
  setWorkplace: (workplace: string) => void;
  locationFilter: string;
  setLocationFilter: (location: string) => void;
  feedState: "loading" | "live" | "error";
  feedError: string;
  retry: () => void;
  dismiss: (n: number) => void;
  apply: (j: Job) => Promise<void>;
}) {
  return (
    <div className="dash">
      <section className="dash-top">
        <div>
          <h1>Job Matches</h1>
          <p>
            AI-matched opportunities based on your résumé and preferences.{" "}
            <span className={`feed ${p.feedState}`}>
              {p.feedState === "live"
                ? "Live API data"
                : p.feedState === "loading"
                  ? "Loading current jobs…"
                  : "API unavailable"}
            </span>
          </p>
        </div>
      </section>
      <div className="metric-row">
        <Metric
          n={String(p.allJobs.filter((job) => job.status === "queued").length)}
          label="Queued"
          color="purple"
          onClick={() => p.setStatus("queued")}
        />
        <Metric
          n={String(p.allJobs.filter((job) => job.status === "ready").length)}
          label="Not applied"
          color="purple"
          onClick={() => p.setStatus("ready")}
        />
        <Metric
          n={String(p.allJobs.filter((job) => job.status === "applied").length)}
          label="Applied"
          color="green"
          onClick={() => p.setStatus("applied")}
        />
        <Metric
          n={String(p.allJobs.filter((job) => job.status === "failed").length)}
          label="Failed"
          color="red"
          onClick={() => p.setStatus("failed")}
        />
        <div className="ready-card">
          <span>
            <Check />
          </span>
          <div>
            <b>Review-first application workflow</b>
            <small>Every submission requires your confirmation</small>
          </div>
        </div>
      </div>
      <div className="toolbar">
        <div className="searchbox">
          <Search />
          <input
            placeholder="Search title or company"
            value={p.query}
            onChange={(e) => p.setQuery(e.target.value)}
          />
        </div>
        <div className="searchbox location-filter">
          <MapPin />
          <input placeholder="Filter by location" value={p.locationFilter} onChange={(e) => p.setLocationFilter(e.target.value)} />
        </div>
        <select value={p.source} onChange={(e) => p.setSource(e.target.value)} aria-label="Job source">
          <option value="all">All sources</option>
          {[...new Set(p.allJobs.map((job) => job.source).filter(Boolean))].sort().map((source) => (
            <option key={source} value={source}>{source}</option>
          ))}
        </select>
        <select value={p.workplace} onChange={(e) => p.setWorkplace(e.target.value)} aria-label="Workplace">
          <option value="all">All workplaces</option>
          <option value="remote">Remote</option>
          <option value="onsite">On-site / hybrid</option>
        </select>
        <select
          value={p.status}
          onChange={(e) => p.setStatus(e.target.value as typeof p.status)}
        >
          <option value="all">All matches</option>
          <option value="ready">Not applied</option>
          <option value="queued">Queued</option>
          <option value="applied">Applied</option>
          <option value="failed">Failed</option>
        </select>
      </div>
      {p.feedState === "error" && (
        <div className="feed-error">
          <div>
            <b>Current jobs are unavailable</b>
            <span>{p.feedError}</span>
          </div>
          <button onClick={p.retry}>Try again</button>
        </div>
      )}
      <div className="job-layout">
        <section className="job-list">
          <div className="list-head">
            <b>Showing {p.visible.length} of {p.filteredCount} matches</b>
            <span>
              Sorted by best match <ChevronDown />
            </span>
          </div>
          {p.visible.map((j) => (
            <JobRow
              key={j.id}
              j={j}
              active={p.selected === j.id}
              click={() => p.setSelected(j.id)}
            />
          ))}
          {!p.visible.length && (
            <div className="no-results">
              <Search />
              <b>
                {p.feedState === "loading"
                  ? "Loading current jobs"
                  : p.feedState === "error"
                    ? "Job API unavailable"
                    : "No matching jobs"}
              </b>
              <span>
                {p.feedState === "loading"
                  ? "Fetching the newest employer listings…"
                  : p.feedState === "error"
                    ? "Retry the API request above."
                    : "Try changing your search or filters."}
              </span>
            </div>
          )}
          {p.filteredCount > 0 && (
            <div className="pagination" aria-label="Job pages">
              <button disabled={p.page === 1} onClick={() => p.setPage(p.page - 1)}><ChevronLeft /> Previous</button>
              <span>Page {p.page} of {p.pageCount}</span>
              <button disabled={p.page === p.pageCount} onClick={() => p.setPage(p.page + 1)}>Next <ChevronRight /></button>
            </div>
          )}
        </section>
        {p.job && <JobDetail job={p.job} dismiss={p.dismiss} apply={p.apply} />}
      </div>
    </div>
  );
}

function Metric({
  n,
  label,
  color,
  onClick,
}: {
  n: string;
  label: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <button className="metric" onClick={onClick}>
      <span className={color}>{n}</span>
      <div>
        <b>{label}</b>
        <small>job matches</small>
      </div>
      <ChevronRight />
    </button>
  );
}
function JobRow({
  j,
  active,
  click,
}: {
  j: Job;
  active: boolean;
  click: () => void;
}) {
  return (
    <button className={`job-row ${active ? "active" : ""}`} onClick={click}>
      <span className="job-logo">
        {j.logoUrl ? <img src={j.logoUrl} alt="" /> : j.logo}
      </span>
      <div className="job-main">
        <div>
          <b>{j.title}</b>
          {j.status === "applied" && (
            <em className="applied">
              <Check /> Applied
            </em>
          )}
        </div>
        <strong>{j.company}</strong>
        <small>
          <MapPin />
          {j.location} · {j.level}
        </small>
        <div className="row-tags">
          {j.remote && <i>Remote</i>}
          <i>{j.salary}</i>
        </div>
      </div>
      <div className="job-score">
        <span className={j.match > 88 ? "great" : ""}>{j.match}%</span>
        <small>match</small>
        <time>{j.posted}</time>
        {j.source && <em className="source-badge">{j.source}</em>}
      </div>
    </button>
  );
}
function JobDetail({
  job,
  dismiss,
  apply,
}: {
  job: Job;
  dismiss: (n: number) => void;
  apply: (j: Job) => Promise<void>;
}) {
  const [applying, setApplying] = useState(false);
  return (
    <section className="job-detail">
      <div className="detail-top">
        <span className="big-logo">
          {job.logoUrl ? <img src={job.logoUrl} alt="" /> : job.logo}
        </span>
        <div>
          <h2>{job.title}</h2>
          <p>
            {job.company} · {job.location}
          </p>
        </div>
        <button className="icon-btn">
          <X />
        </button>
      </div>
      <div className="match-card">
        <div className="match-ring">
          <b>{job.match}%</b>
          <small>match</small>
        </div>
        <div>
          <b>Great match for your profile</b>
          <p>Your experience and skills align with this role.</p>
        </div>
      </div>
      <div className="detail-tags">
        <span>
          <MapPin /> {job.remote ? "Remote" : "On-site"}
        </span>
        <span>
          <BarChart3 /> {job.level}
        </span>
        <span>{job.salary}</span>
      </div>
      <div className="detail-copy">
        <h3>About the role</h3>
        <p>{job.summary}</p>
        <h3>Skills match</h3>
        <div className="skills">
          {job.skills.map((s) => (
            <span key={s}>
              <Check />
              {s}
            </span>
          ))}
        </div>
      </div>
      <div className="detail-actions">
        <button className="not" onClick={() => dismiss(job.id)}>
          Not interested
        </button>
        <button className="apply" disabled={applying || job.status !== "ready"} onClick={async () => {
          setApplying(true);
          try { await apply(job); } finally { setApplying(false); }
        }}>
          <WandSparkles /> {applying ? "Queuing..." : job.status === "ready" ? "Simple Apply" : "Already queued"}
        </button>
      </div>
      {job.sourceUrl && (
        <a
          className="source-link"
          href={job.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          View original listing{job.source ? ` on ${job.source}` : ""}
        </a>
      )}
      <div className="safe-note">
        <Check /> You’ll review all answers before submission
      </div>
    </section>
  );
}

function Applications({
  applications,
  update,
  resolve,
}: {
  applications: Application[];
  update: (id: string, status: Application["status"]) => Promise<void>;
  resolve: (id: string, answers: Record<string, string>) => Promise<void>;
}) {
  return (
    <div className="basic-page">
      <h1>Applications</h1>
      <p>Track every application submitted through ApplyPilot.</p>
      <div className="table-card">
        <div className="table-head">
          <span>ROLE</span>
          <span>STATUS</span>
          <span>DATE</span>
        </div>
        {applications.length === 0 && (
          <div className="no-results">
            <Briefcase />
            <b>No applications in progress</b>
            <span>Choose Simple Apply on a job match to start a review.</span>
          </div>
        )}
        {applications.map((application) => (
          <div className="table-row application-row" key={application.id}>
            <div>
              <span className="job-logo">
                {application.company?.slice(0, 1) || "?"}
              </span>
              <div>
                <b>{application.title}</b>
                <small>
                  {application.company} · {application.location}
                </small>
              </div>
            </div>
            <span className={`status-pill ${application.status}`}>
              {application.status === "submitted" && <Check />}{" "}
              {application.status}
            </span>
            <div className="application-actions">
              {application.status === "review" && (
                <span className="queued-message">
                  Queued with your saved profile; awaiting a supported employer submission channel.
                </span>
              )}
              {application.status === "submitted" && (
                <button onClick={() => update(application.id, "interview")}>
                  Mark interview
                </button>
              )}
              {application.status === "interview" && (
                <button onClick={() => update(application.id, "offer")}>
                  Mark offer
                </button>
              )}
              <time>
                {new Date(application.updatedAt).toLocaleDateString()}
              </time>
            </div>
            {application.status === "needs_action" && <ApplicationQuestions application={application} resolve={resolve} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function ApplicationQuestions({ application, resolve }: { application: Application; resolve: (id: string, answers: Record<string, string>) => Promise<void> }) {
  const questions = application.requiredQuestions || [];
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  if (!questions.length) return <div className="action-required"><b>Action required</b><p>{application.lastSubmissionError || "The employer application needs manual review."}</p><div className="action-required-buttons"><button className="apply" onClick={() => void resolve(application.id, {})}>Retry with browser worker</button><a href={application.sourceUrl} target="_blank" rel="noreferrer">Open original application</a></div></div>;
  const blocking = questions.some((question) => question.type === "blocking");
  return <form className="action-required" onSubmit={async (event) => { event.preventDefault(); if (blocking) return; setSaving(true); try { await resolve(application.id, answers); } finally { setSaving(false); } }}>
    <b>Additional employer questions</b>
    <p>{application.lastSubmissionError}</p>
    {questions.map((question) => <label key={question.key}>{question.label}
      {question.type === "blocking" ? <a href={application.sourceUrl} target="_blank" rel="noreferrer">Open employer application</a> : question.type === "select" ? <select required value={answers[question.key] || ""} onChange={(event) => setAnswers({ ...answers, [question.key]: event.target.value })}><option value="">Select an answer</option>{question.options?.map((option) => <option key={option}>{option}</option>)}</select> : question.type === "checkbox" ? <select required value={answers[question.key] || ""} onChange={(event) => setAnswers({ ...answers, [question.key]: event.target.value })}><option value="">Select an answer</option><option value="yes">Yes</option><option value="no">No</option></select> : question.type === "textarea" ? <textarea required value={answers[question.key] || ""} onChange={(event) => setAnswers({ ...answers, [question.key]: event.target.value })} /> : <input required value={answers[question.key] || ""} onChange={(event) => setAnswers({ ...answers, [question.key]: event.target.value })} />}
    </label>)}
    {!blocking && <button className="apply" disabled={saving}>{saving ? "Saving…" : "Save answers and retry"}</button>}
  </form>;
}
function Resume({
  documents,
  upload,
  remove,
  rename,
}: {
  documents: ResumeDocument[];
  upload: (file: File) => Promise<void>;
  remove: (id: string) => Promise<void>;
  rename: (id: string, fileName: string) => Promise<void>;
}) {
  const [uploading, setUploading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pdfUrl, setPdfUrl] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const selected = documents.find((item) => item.id === selectedId) || documents[0] || null;

  useEffect(() => {
    let objectUrl = "";
    let cancelled = false;
    if (!selected || selected.contentType !== "application/pdf") return;
    getResumeBlob(selected.id).then((blob) => {
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setPageCount(0);
      setPreviewError("");
      setPdfUrl(objectUrl);
    }).catch((error: Error) => { if (!cancelled) setPreviewError(error.message); });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [selected]);

  const download = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const blob = await getResumeBlob(selected.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = selected.fileName;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally { setBusy(false); }
  };

  const renameSelected = async () => {
    if (!selected) return;
    const fileName = prompt("Rename resume", selected.fileName)?.trim();
    if (!fileName || fileName === selected.fileName) return;
    setBusy(true);
    try { await rename(selected.id, fileName); } finally { setBusy(false); }
  };

  return (
    <div className="basic-page resume-page">
      <h1>Résumés</h1>
      <p>Upload, select, rename, download, and review résumé versions. Uploading never changes your profile automatically.</p>
      <div className="resume-library">
        <section className="resume-left">
          <div className="upload-card simple-card">
            <span><Upload /></span>
            <h2>Upload another résumé</h2>
            <p>PDF or DOCX, up to 4 MB · Stored privately in Azure</p>
            <label className="apply">
              {uploading ? "Uploading…" : "Choose résumé"}
              <input type="file" accept=".pdf,.docx" hidden disabled={uploading} onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setUploading(true);
                try { await upload(file); } finally { setUploading(false); event.target.value = ""; }
              }} />
            </label>
          </div>
          <div className="resume-history simple-card">
            <h2>Previously uploaded</h2>
            {documents.length === 0 && <p>No résumés uploaded yet.</p>}
            {documents.map((item) => (
              <article className={selected?.id === item.id ? "selected" : ""} key={item.id}>
                <button className="resume-select" onClick={() => { setSelectedId(item.id); setPdfUrl(""); setPreviewError(""); setPageCount(0); setZoom(1); }}>
                  <FileText />
                  <span><b>{item.fileName}</b><small>{(item.sizeBytes / 1024).toFixed(0)} KB · {new Date(item.createdAt).toLocaleDateString()} {item.isPrimary ? "· Primary" : ""}</small></span>
                </button>
                <button className="resume-delete" aria-label={`Remove ${item.fileName}`} onClick={() => { if (confirm(`Remove ${item.fileName}?`)) void remove(item.id); }}><Trash2 /></button>
              </article>
            ))}
          </div>
        </section>
        <section className={`resume-preview simple-card ${fullScreen ? "fullscreen" : ""}`}>
          <div className="resume-preview-toolbar">
            <h2>{selected ? selected.fileName : "Preview"}</h2>
            {selected && <div>
              <button disabled={busy} onClick={() => void renameSelected()}><Pencil /> Rename</button>
              <button disabled={busy} onClick={() => void download()}><Download /> Download</button>
              <button onClick={() => setFullScreen((value) => !value)} title={fullScreen ? "Exit full screen" : "View full screen"}>{fullScreen ? <Minimize2 /> : <Maximize2 />} {fullScreen ? "Exit" : "Full screen"}</button>
              {selected.contentType === "application/pdf" && <><button onClick={() => setZoom((value) => Math.max(.5, value - .15))} aria-label="Zoom out"><Minus /></button><span>{Math.round(zoom * 100)}%</span><button onClick={() => setZoom((value) => Math.min(2.5, value + .15))} aria-label="Zoom in"><Plus /></button></>}
            </div>}
          </div>
          {!selected ? <p>Select an uploaded PDF to preview it.</p> : selected.contentType !== "application/pdf" ? (
            <div className="resume-preview-empty"><FileText /><p>DOCX preview is not available in the browser.</p><button className="apply" onClick={() => void download()}>Download DOCX</button></div>
          ) : previewError ? (
            <div className="resume-preview-empty"><FileText /><p>{previewError}</p></div>
          ) : !pdfUrl ? (
            <div className="resume-preview-empty"><FileText /><p>Loading PDF…</p></div>
          ) : (
            <PdfDocument key={pdfUrl} file={pdfUrl} loading="Loading PDF…" error="PDF preview could not be loaded." onLoadSuccess={({ numPages }) => setPageCount(numPages)}>
              {Array.from({ length: pageCount }, (_, index) => <PdfPage key={index + 1} pageNumber={index + 1} scale={zoom} renderAnnotationLayer renderTextLayer />)}
            </PdfDocument>
          )}
        </section>
      </div>
    </div>
  );
}

function JobSearchPage({ query, setQuery, location, setLocation, search }: { query: string; setQuery: (value: string) => void; location: string; setLocation: (value: string) => void; search: () => void }) {
  return (
    <div className="simple-page narrow-page">
      <div className="page-heading"><h1>Job Search <em>BETA</em></h1><p>Search current opportunities using the same live feed as your dashboard.</p></div>
      <section className="simple-card search-panel">
        <h2><Search /> Search Jobs</h2>
        <label>Job title, company, or skill<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Software Engineer, React, Azure…" /></label>
        <label>Location<input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Remote, Seattle, United States…" /></label>
        <button className="orange-action" onClick={search}><Search /> Search jobs</button>
      </section>
    </div>
  );
}

function AuthPage() {
  return (
    <div className="auth-page">
      <section className="auth-card">
        <div className="auth-brand"><WandSparkles /></div>
        <h1>Create your ApplyPilot account</h1>
        <p>Sign in and your account is created automatically. Your profile, resume, and applications remain scoped to that identity.</p>
        <a className="provider-button microsoft" href="/.auth/login/aad?post_login_redirect_uri=/dashboard">
          <span className="microsoft-mark"><i /><i /><i /><i /></span>
          Continue with Microsoft
        </a>
        <a className="provider-button" href="/.auth/login/google?post_login_redirect_uri=/dashboard">
          <span className="provider-letter google">G</span>
          Continue with Google
        </a>
        <a className="provider-button github" href="/.auth/login/github?post_login_redirect_uri=/dashboard">
          <span className="provider-letter github">GH</span>
          Continue with GitHub
        </a>
        <button className="provider-button" disabled title="Facebook OAuth registration is not configured in Azure yet">
          <span className="provider-letter facebook">f</span>
          Continue with Facebook
          <small>Provider setup required</small>
        </button>
        <div className="auth-note">By continuing, you agree to use ApplyPilot for your own job search and to review information before submission.</div>
      </section>
    </div>
  );
}

function AuthLoading() {
  return <main className="public-shell"><div className="public-brand"><WandSparkles /><b>ApplyPilot</b></div><section className="public-centered"><div className="landing-orb"><WandSparkles /></div><h1>Preparing your workspace…</h1><p>Checking your secure session.</p></section></main>;
}

function LandingPage() {
  return (
    <main className="public-shell">
      <header className="public-header"><div className="public-brand"><WandSparkles /><b>ApplyPilot</b></div><nav><a href="#features">Features</a><a href="/login" className="public-link">Sign in</a><a href="/login" className="orange-action">Get started</a></nav></header>
      <section className="landing-hero"><div><span className="landing-kicker">A focused job-search workspace</span><h1>Find better roles.<br /><em>Apply with confidence.</em></h1><p>Bring your profile, résumé, job matches, application queue, and recruiter messages into one secure place.</p><p className="landing-tagline">End-to-end job apply in one click, from match to submission.</p><div className="landing-actions"><a className="orange-action" href="/login">Create your account</a><a className="secondary-action" href="/login">Sign in</a></div><small>Microsoft, Google, and GitHub delegated sign-in. No password stored by ApplyPilot.</small></div><div className="landing-preview"><div className="preview-top"><span /><span /><span /></div><b>Your job search, organized</b><div className="preview-metrics"><span><strong>10</strong> jobs per page</span><span><strong>1</strong> private inbox</span><span><strong>100%</strong> profile control</span></div><div className="preview-job"><Briefcase /><div><b>Senior Software Engineer</b><small>Matched to your profile</small></div><Check /></div><div className="preview-job"><Mail /><div><b>Recruiter replies</b><small>Delivered to your private alias</small></div><Check /></div></div></section>
      <section className="landing-features" id="features"><article><Search /><h2>Live job discovery</h2><p>Search current roles with location, workplace and source filters.</p></article><article><FileText /><h2>Reusable profile</h2><p>Upload your résumé and review extracted details before applying.</p></article><article><Mail /><h2>Application inbox</h2><p>Track application messages through your private inbound alias.</p></article></section>
    </main>
  );
}

function LoggedOutPage({ signedIn }: { signedIn: boolean }) {
  return (
    <main className="public-shell"><header className="public-header"><a className="public-brand" href="/"><WandSparkles /><b>ApplyPilot</b></a></header><section className="public-centered"><div className="logout-check"><Check /></div><h1>{signedIn ? "You’re still signed in" : "You’re signed out"}</h1><p>{signedIn ? "Your session is still active. Return to your dashboard or sign out again." : "Your ApplyPilot session ended successfully. Your profile and applications remain safely stored."}</p><div className="landing-actions">{signedIn ? <><a className="orange-action" href="/.auth/logout?post_logout_redirect_uri=/logged-out">Sign out again</a><a className="secondary-action" href="/dashboard">Return to dashboard</a></> : <a className="orange-action" href="/login">Sign in again</a>}<a className="secondary-action" href="/">Go to home page</a></div></section></main>
  );
}

function InboxPage() {
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [address, setAddress] = useState<string | null>(null);
  const [selected, setSelected] = useState<MailMessage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getMailbox().then((result) => {
      setAddress(result.address);
      setMessages(result.messages);
      setSelected(result.messages[0] || null);
    }).catch((cause) => setError(cause.message === "AUTH_REQUIRED" ? "Sign in to open your mailbox." : cause.message)).finally(() => setLoading(false));
  }, []);

  const openMessage = async (message: MailMessage) => {
    setSelected(message);
    if (!message.isRead) {
      const result = await markMailboxMessageRead(message.id);
      setMessages((current) => current.map((item) => item.id === message.id ? result.message : item));
      setSelected(result.message);
    }
  };

  return (
    <div className="simple-page">
      <div className="page-heading left"><h1><Mail /> Email Inbox</h1><p>Application messages received through a connected mailbox appear here.</p></div>
      {address && <div className="info-banner">Your private application address: <strong>{address}</strong></div>}
      {loading ? <section className="simple-card empty-feature"><Mail /><h2>Loading mailbox…</h2></section> : error ? <section className="simple-card empty-feature"><Mail /><h2>Mailbox unavailable</h2><p>{error}</p></section> : messages.length === 0 ? <section className="simple-card empty-feature"><Mail /><h2>Your inbox is ready</h2><p>Use the address above on applications. Recruiter replies and verification messages will appear here.</p></section> : (
        <section className="simple-card mailbox-layout">
          <div className="mail-list">{messages.map((message) => <button className={`${selected?.id === message.id ? "active" : ""} ${message.isRead ? "" : "unread"}`} key={message.id} onClick={() => void openMessage(message)}><b>{message.from.name || message.from.email}</b><span>{message.subject}</span><small>{new Date(message.receivedAt).toLocaleString()}</small></button>)}</div>
          <article className="mail-content">{selected && <><h2>{selected.subject}</h2><p className="mail-from">From {selected.from.name ? `${selected.from.name} <${selected.from.email}>` : selected.from.email}</p><pre>{selected.textBody}</pre>{selected.attachmentCount > 0 && <small>{selected.attachmentCount} attachment(s) recorded; downloads are disabled until malware scanning is configured.</small>}</>}</article>
        </section>
      )}
    </div>
  );
}

function CreditsPage({ queued }: { queued: number }) {
  return (
    <div className="simple-page narrow-page">
      <section className="simple-card credits-card"><CreditCard /><h1>Applications & usage</h1><strong>{queued}</strong><p>applications currently queued for review</p><hr /><h2>No artificial credit limit</h2><p>ApplyPilot does not sell or invent credits. Azure usage remains governed by your subscription budget.</p></section>
    </div>
  );
}

function SettingsPage() {
  const initial = () => {
    try { return JSON.parse(localStorage.getItem("applypilot.settings") || "{}") as Record<string, boolean>; }
    catch { return {}; }
  };
  const [settings, setSettings] = useState({ jobAlerts: true, weeklySummary: true, profileReminders: true, ...initial() });
  const toggle = (key: keyof typeof settings) => {
    const next = { ...settings, [key]: !settings[key] };
    setSettings(next);
    localStorage.setItem("applypilot.settings", JSON.stringify(next));
  };
  return (
    <div className="simple-page narrow-page settings-page"><section className="simple-card"><h1><Settings /> Settings</h1><p>Manage local notification preferences.</p>{([
      ["jobAlerts", "Daily job alerts", "Show new matching roles when you return"],
      ["weeklySummary", "Weekly application summary", "Summarize queued and submitted applications"],
      ["profileReminders", "Profile improvement reminders", "Prompt when important profile fields are blank"],
    ] as const).map(([key, title, description]) => <div className="setting-row" key={key}><div><b>{title}</b><small>{description}</small></div><button className={`switch ${settings[key] ? "on" : ""}`} onClick={() => toggle(key)} aria-pressed={settings[key]}><i /></button></div>)}</section></div>
  );
}

function Preferences({
  profile,
  setProfile,
  save,
}: {
  profile: Profile;
  setProfile: (profile: Profile) => void;
  save: () => void;
}) {
  return (
    <div className="basic-page">
      <h1>Job Preferences</h1>
      <p>Tell the matching agent exactly what you are looking for.</p>
      <div className="settings-card">
        <label>
          Target job titles
          <input
            value={profile.targetRoles}
            onChange={(event) =>
              setProfile({ ...profile, targetRoles: event.target.value })
            }
          />
        </label>
        <label>
          Preferred locations
          <input
            value={profile.preferredLocations}
            onChange={(event) =>
              setProfile({ ...profile, preferredLocations: event.target.value })
            }
          />
        </label>
        <div className="two">
          <label>
            Minimum salary
            <input
              value={profile.minSalary}
              onChange={(event) =>
                setProfile({ ...profile, minSalary: event.target.value })
              }
            />
          </label>
          <label>
            Experience level
            <select
              value={profile.experienceLevel}
              onChange={(event) =>
                setProfile({ ...profile, experienceLevel: event.target.value })
              }
            >
              <option value="">Any level</option>
              <option>Mid level</option>
              <option>Senior level</option>
            </select>
          </label>
        </div>
        <button className="apply" onClick={save}>
          Save preferences
        </button>
      </div>
    </div>
  );
}
function ProfileView({
  profile,
  setProfile,
  save,
}: {
  profile: Profile;
  setProfile: (p: Profile) => void;
  save: () => void;
}) {
  return (
    <div className="basic-page screenshot-profile">
      <h1>Profile Information</h1>
      <p>These details are reused when applications ask common questions. Review extracted resume data before queueing applications.</p>
      <div className="settings-card profile-grid">
        {(
          [
            "firstName",
            "lastName",
            "email",
            "phone",
            "location",
            "country",
            "state",
            "city",
            "address",
            "postalCode",
            "linkedin",
            "github",
            "portfolio",
            "workAuthorization",
            "sponsorship",
            "skills",
            "targetRoles",
            "preferredLocations",
            "employmentTypes",
            "experienceLevel",
            "minSalary",
            "educationLevel",
            "preferredLanguages",
            "companiesToExclude",
            "additionalInfo",
          ] as (keyof Profile)[]
        ).map((k) => (
          <label key={k}>
            {k.replace(/([A-Z])/g, " $1")}
            <input
              value={profile[k]}
              onChange={(e) => setProfile({ ...profile, [k]: e.target.value })}
            />
          </label>
        ))}
        <button className="apply" onClick={save}>
          Save profile
        </button>
      </div>
    </div>
  );
}
