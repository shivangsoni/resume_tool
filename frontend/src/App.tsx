import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Bell,
  Briefcase,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  FileText,
  Filter,
  LayoutDashboard,
  MapPin,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Upload,
  UserRound,
  WandSparkles,
  X,
} from "lucide-react";
import { loadProfile, saveProfile } from "./storage";
import type { Profile } from "./types";

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
  const [auto, setAuto] = useState(false);
  const [dismissed, setDismissed] = useState<number[]>([]);
  const [profile, setProfile] = useState(loadProfile);
  const [toast, setToast] = useState("");
  const [liveJobs, setLiveJobs] = useState<Job[]>([]);
  const [feedState, setFeedState] = useState<"loading" | "live" | "error">(
    "loading",
  );
  const [feedError, setFeedError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${import.meta.env.VITE_API_BASE_URL || "/api"}/jobs?limit=50`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok)
          throw new Error(`Job API returned ${response.status}`);
        return response.json();
      })
      .then((result: { jobs?: Job[] }) => {
        const incoming = result.jobs || [];
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
  const visible = useMemo(
    () =>
      liveJobs.filter(
        (j) =>
          !dismissed.includes(j.id) &&
          (status === "all" || j.status === status) &&
          (j.title + j.company).toLowerCase().includes(query.toLowerCase()),
      ),
    [dismissed, status, query, liveJobs],
  );
  const job = liveJobs.find((j) => j.id === selected) || visible[0];
  const notify = (s: string) => {
    setToast(s);
    setTimeout(() => setToast(""), 2200);
  };
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
            count={liveJobs.filter((item) => item.status === "applied").length}
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
              <span>Weekly applications</span>
              <b>
                {liveJobs.filter((item) => item.status === "applied").length} /
                100
              </b>
            </div>
            <i>
              <em
                style={{
                  width: `${Math.min(liveJobs.filter((item) => item.status === "applied").length, 100)}%`,
                }}
              />
            </i>
            <small>Resets Monday</small>
          </div>
          <Side
            icon={<CircleHelp />}
            label="Help & support"
            click={() => notify("Support center coming soon")}
          />
          <Side
            icon={<Settings />}
            label="Settings"
            click={() => notify("Settings coming soon")}
          />
          <div className="user">
            <span>SS</span>
            <div>
              <b>Shivang Soni</b>
              <small>Free plan</small>
            </div>
            <ChevronRight />
          </div>
        </div>
      </aside>
      <main className="sa-main">
        <header className="sa-header">
          <div className="mobile-logo">
            <WandSparkles /> ApplyPilot
          </div>
          <div className="header-spacer" />
          <button className="icon-btn">
            <Bell />
          </button>
          <button className="upgrade">
            <Sparkles /> Upgrade
          </button>
        </header>
        {page === "dashboard" && (
          <Dashboard
            visible={visible}
            allJobs={liveJobs}
            selected={selected}
            setSelected={setSelected}
            job={job}
            query={query}
            setQuery={setQuery}
            status={status}
            setStatus={setStatus}
            auto={auto}
            feedState={feedState}
            feedError={feedError}
            retry={() => {
              setFeedState("loading");
              setFeedError("");
              setReloadKey((value) => value + 1);
            }}
            setAuto={setAuto}
            dismiss={(id) => {
              setDismissed([...dismissed, id]);
              notify("Removed from your matches");
            }}
            apply={(j) =>
              notify(`Application for ${j.title} queued for review`)
            }
          />
        )}
        {page === "applications" && (
          <Applications
            jobs={liveJobs.filter((item) => item.status === "applied")}
          />
        )}
        {page === "resume" && <Resume />}
        {page === "preferences" && <Preferences />}
        {page === "profile" && (
          <ProfileView
            profile={profile}
            setProfile={setProfile}
            save={() => {
              saveProfile(profile);
              notify("Profile saved");
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
  auto: boolean;
  feedState: "loading" | "live" | "error";
  feedError: string;
  retry: () => void;
  setAuto: (b: boolean) => void;
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
        <div className="auto-box">
          <div className="pulse">
            <WandSparkles />
          </div>
          <div>
            <b>Full Auto-Apply</b>
            <small>
              {p.auto
                ? "Actively applying to strong matches"
                : "Turn on to apply while you sleep"}
            </small>
          </div>
          <button
            className={`switch ${p.auto ? "on" : ""}`}
            onClick={() => p.setAuto(!p.auto)}
          >
            <i />
          </button>
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
            <b>You’re ready for Simple Apply</b>
            <small>Resume and preferences are complete</small>
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
        <button>
          <MapPin /> United States <ChevronDown />
        </button>
        <button>
          <Filter /> Filters <i>2</i>
        </button>
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

function Applications({ jobs: appliedJobs }: { jobs: Job[] }) {
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
        {appliedJobs.length === 0 && (
          <div className="no-results">
            <Briefcase />
            <b>No submitted applications yet</b>
            <span>
              Applications submitted through the API will appear here.
            </span>
          </div>
        )}
        {appliedJobs.map((j) => (
          <div className="table-row" key={j.id}>
            <div>
              <span className="job-logo">{j.logo}</span>
              <div>
                <b>{j.title}</b>
                <small>{j.company}</small>
              </div>
            </div>
            <span className="success-pill">
              <Check /> Applied
            </span>
            <time>Jul 30, 2026</time>
          </div>
        ))}
      </div>
    </div>
  );
}
function Resume() {
  return (
    <div className="basic-page">
      <h1>Resumes</h1>
      <p>Your résumé powers job matching and application answers.</p>
      <div className="upload-card">
        <span>
          <Upload />
        </span>
        <h2>Upload your primary résumé</h2>
        <p>PDF or DOCX, up to 5 MB</p>
        <label className="apply">
          Choose résumé
          <input type="file" accept=".pdf,.doc,.docx" hidden />
        </label>
      </div>
    </div>
  );
}
function Preferences() {
  return (
    <div className="basic-page">
      <h1>Job Preferences</h1>
      <p>Tell the matching agent exactly what you are looking for.</p>
      <div className="settings-card">
        <label>
          Target job titles
          <input defaultValue="Product Manager, Senior Product Manager" />
        </label>
        <label>
          Preferred locations
          <input defaultValue="United States, Remote" />
        </label>
        <div className="two">
          <label>
            Minimum salary
            <input defaultValue="$120,000" />
          </label>
          <label>
            Experience level
            <select>
              <option>Mid level</option>
              <option>Senior level</option>
            </select>
          </label>
        </div>
        <button className="apply">Save preferences</button>
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
