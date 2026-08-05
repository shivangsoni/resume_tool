import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Briefcase,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  LayoutDashboard,
  MapPin,
  Search,
  SlidersHorizontal,
  Upload,
  UserRound,
  WandSparkles,
  X,
} from "lucide-react";
import { emptyProfile, loadProfile, saveProfile } from "./storage";
import {
  createApplication,
  getApplications,
  getAllJobs,
  getCurrentUser,
  getRemoteProfile,
  putRemoteProfile,
  updateApplication,
  uploadResume,
} from "./api";
import type { Application, Profile } from "./types";
import { matchesJob } from "./job-filter";

type Page = "dashboard" | "applications" | "resume" | "preferences" | "profile";
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
  status: "ready" | "applied" | "failed";
  summary: string;
  skills: string[];
  sourceUrl?: string;
  logoUrl?: string;
  source?: string;
  postedAt?: string;
};

export default function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [selected, setSelected] = useState(0);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "ready" | "applied" | "failed">(
    "all",
  );
  const [source, setSource] = useState("all");
  const [workplace, setWorkplace] = useState("all");
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
  const [resumeDocument, setResumeDocument] = useState<{
    name: string;
    size: number;
    extractionStatus: "succeeded" | "failed";
  } | null>(null);
  const notify = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(""), 2200);
  };
  useEffect(() => {
    getCurrentUser()
      .then(async (user) => {
        setCurrentUser(user);
        if (user) {
          const [remoteProfile, remoteApplications] = await Promise.all([
            getRemoteProfile(),
            getApplications(),
          ]);
          if (remoteProfile.profile) {
            const normalized = { ...emptyProfile, ...remoteProfile.profile };
            setProfile(normalized);
            saveProfile(normalized);
          }
          setApplications(remoteApplications.applications);
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
            application &&
            ["submitted", "interview", "offer"].includes(application.status)
              ? ("applied" as const)
              : application?.status === "failed"
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
          matchesJob(j, query, status, source, workplace),
      ),
    [dismissed, status, source, workplace, query, displayJobs],
  );
  const job = displayJobs.find((j) => j.id === selected) || visible[0];
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
            <a className="user login-card" href="/.auth/login/aad?post_login_redirect_uri=/">
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
          {!authReady ? (
            <span className="auth-label">Checking account…</span>
          ) : currentUser ? (
            <a
              className="upgrade"
              href="/.auth/logout?post_logout_redirect_uri=/"
            >
              Sign out
            </a>
          ) : (
            <a
              className="upgrade"
              href="/.auth/login/aad?post_login_redirect_uri=/"
            >
              <UserRound /> Sign in
            </a>
          )}
        </header>
        {page === "dashboard" && (
          <Dashboard
            visible={visible}
            allJobs={displayJobs}
            selected={selected}
            setSelected={setSelected}
            job={job}
            query={query}
            setQuery={setQuery}
            status={status}
            setStatus={setStatus}
            source={source}
            setSource={setSource}
            workplace={workplace}
            setWorkplace={setWorkplace}
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
                location.href = "/.auth/login/aad?post_login_redirect_uri=/";
                return;
              }
              try {
                const result = await createApplication(j, {
                  workAuthorization: profile.workAuthorization,
                  sponsorship: profile.sponsorship,
                });
                setApplications((items) => [
                  result.application,
                  ...items.filter((item) => item.id !== result.application.id),
                ]);
                window.open(j.sourceUrl, "_blank", "noopener,noreferrer");
                setPage("applications");
                notify(
                  "Review saved. Complete the employer form, then confirm submission here.",
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
          />
        )}
        {page === "resume" && (
          <Resume
            document={resumeDocument}
            upload={async (file) => {
              if (!currentUser) {
                location.href = "/.auth/login/aad?post_login_redirect_uri=/";
                return;
              }
              try {
                const result = await uploadResume(file);
                setResumeDocument({
                  name: result.document.FileName,
                  size: result.document.SizeBytes,
                  extractionStatus: result.extractionStatus,
                });
                if (result.profile) {
                  const normalized = { ...emptyProfile, ...result.profile };
                  setProfile(normalized);
                  saveProfile(normalized);
                }
                notify(
                  result.extractionStatus === "succeeded"
                    ? "Resume uploaded; detected details added to blank profile fields"
                    : "Resume uploaded securely, but automatic extraction needs retrying",
                );
              } catch (error) {
                notify(
                  error instanceof Error ? error.message : "Upload failed",
                );
              }
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
                notify("Profile saved securely");
              } catch (error) {
                notify(error instanceof Error ? error.message : "Save failed");
              }
            }}
          />
        )}
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
  selected: number;
  setSelected: (n: number) => void;
  job?: Job;
  query: string;
  setQuery: (s: string) => void;
  status: "all" | "ready" | "applied" | "failed";
  setStatus: (s: "all" | "ready" | "applied" | "failed") => void;
  source: string;
  setSource: (source: string) => void;
  workplace: string;
  setWorkplace: (workplace: string) => void;
  feedState: "loading" | "live" | "error";
  feedError: string;
  retry: () => void;
  dismiss: (n: number) => void;
  apply: (j: Job) => void;
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
            <b>{p.visible.length} matches</b>
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
  apply: (j: Job) => void;
}) {
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
        <button className="apply" onClick={() => apply(job)}>
          <WandSparkles /> Simple Apply
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
}: {
  applications: Application[];
  update: (id: string, status: Application["status"]) => Promise<void>;
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
                <>
                  <a
                    href={application.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open employer form
                  </a>
                  <button onClick={() => update(application.id, "submitted")}>
                    Confirm submitted
                  </button>
                </>
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
          </div>
        ))}
      </div>
    </div>
  );
}
function Resume({
  document,
  upload,
}: {
  document: {
    name: string;
    size: number;
    extractionStatus: "succeeded" | "failed";
  } | null;
  upload: (file: File) => Promise<void>;
}) {
  const [uploading, setUploading] = useState(false);
  return (
    <div className="basic-page">
      <h1>Resumes</h1>
      <p>Your résumé powers job matching and application answers.</p>
      <div className="upload-card">
        <span>
          <Upload />
        </span>
        <h2>{document ? document.name : "Upload your primary résumé"}</h2>
        <p>
          {document
            ? `${(document.size / 1024).toFixed(0)} KB · Stored privately in Azure`
            : "PDF or DOCX, up to 4 MB"}
        </p>
        {document && (
          <p className={`extraction-status ${document.extractionStatus}`}>
            {document.extractionStatus === "succeeded"
              ? "Details extracted. Review your profile before applying."
              : "The file is safe in Blob Storage, but details were not extracted."}
          </p>
        )}
        <label className="apply">
          {uploading
            ? "Uploading…"
            : document
              ? "Replace résumé"
              : "Choose résumé"}
          <input
            type="file"
            accept=".pdf,.docx"
            hidden
            disabled={uploading}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setUploading(true);
              try {
                await upload(file);
              } finally {
                setUploading(false);
                event.target.value = "";
              }
            }}
          />
        </label>
      </div>
    </div>
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
    <div className="basic-page">
      <h1>Application Profile</h1>
      <p>These details are reused when applications ask common questions.</p>
      <div className="settings-card profile-grid">
        {(
          [
            "firstName",
            "lastName",
            "email",
            "phone",
            "location",
            "linkedin",
            "portfolio",
            "workAuthorization",
            "sponsorship",
            "skills",
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
