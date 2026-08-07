import { useEffect, useMemo, useState } from "react";
import {
  Avatar,
  Button,
  CounterBadge,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  NavDrawer,
  NavDrawerBody,
  NavDrawerFooter,
  NavDrawerHeader,
  NavItem,
  NavSectionHeader,
  Tooltip,
  type OnNavItemSelectData,
} from "@fluentui/react-components";
import {
  Add24Regular,
  Alert24Regular,
  ArrowDownload24Regular,
  ArrowUpload24Regular,
  Board24Regular,
  Briefcase24Regular,
  Checkmark24Regular,
  CheckmarkCircle24Regular,
  ChevronDown24Regular,
  ChevronLeft24Regular,
  ChevronRight24Regular,
  Clock24Regular,
  DataBarVertical24Regular,
  Delete24Regular,
  Dismiss24Regular,
  Document24Regular,
  Edit24Regular,
  ErrorCircle24Regular,
  FullScreenMaximize24Regular,
  FullScreenMinimize24Regular,
  Location24Regular,
  Mail24Regular,
  Navigation24Regular,
  Options24Regular,
  Payment24Regular,
  Person24Regular,
  Search24Regular,
  Settings24Regular,
  SignOut24Regular,
  Sparkle24Filled,
  Subtract24Regular,
} from "@fluentui/react-icons";
import { Document as PdfDocument, Page as PdfPage, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { emptyProfile, loadProfile, saveProfile } from "./storage";
import { fieldLabel, missingProfileFields, profileReadyForApply, REQUIRED_PROFILE_FIELDS } from "./profileCompleteness";
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
  getAuthProviders,
  setDevSignedIn,
} from "./api";
import type { Application, MailMessage, Profile, ResumeDocument } from "./types";
import { matchesJob, paginateJobs } from "./job-filter";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

type Page = "dashboard" | "applications" | "resume" | "preferences" | "profile" | "inbox" | "search" | "credits" | "settings" | "auth";

const pageTitles: Record<Page, string> = {
  dashboard: "Job Matches",
  applications: "Applications",
  resume: "Résumé",
  preferences: "Preferences",
  profile: "Profile",
  inbox: "Email Inbox",
  search: "Job Search",
  credits: "Usage",
  settings: "Settings",
  auth: "Account",
};
const productTourSteps = [
  { page: "dashboard" as const, title: "Job Matches", body: "Browse AI-matched roles. Use the KPI cards to filter Queued, Not applied, Applied, or Failed jobs." },
  { page: "applications" as const, title: "Applications", body: "Track every submission, answer employer follow-up questions, and retry failed applies." },
  { page: "inbox" as const, title: "Email Inbox", body: "Status emails and recruiter replies land here. Applications use your private inbound address so replies are routed correctly." },
  { page: "resume" as const, title: "Résumé", body: "Upload a PDF or DOCX. Extracted details help fill employer forms during Simple Apply." },
  { page: "profile" as const, title: "Profile", body: "Keep contact details and work history current so automated applies stay accurate." },
  { page: "preferences" as const, title: "Preferences", body: "Set target titles, locations, and workplace types to improve match quality." },
];
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
  applicationId?: string;
  applicationStatus?: Application["status"];
  applicationError?: string;
  applicationUpdatedAt?: string;
  submissionQueuedAt?: string;
  requiredQuestions?: Application["requiredQuestions"];
  applicationAnswers?: Record<string, string>;
};

export default function App() {
  const routePath = window.location.pathname.toLowerCase();
  const linkedApplicationId = new URLSearchParams(window.location.search).get("application");
  const [page, setPage] = useState<Page>(linkedApplicationId ? "applications" : "dashboard");
  const [focusedApplicationId, setFocusedApplicationId] = useState(linkedApplicationId);
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
  const [navOpen, setNavOpen] = useState(true);
  const [unreadMailCount, setUnreadMailCount] = useState(0);
  const notify = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(""), 2200);
  };
  const resolveAnswers = async (id: string, answers: Record<string, string>) => {
    try {
      const result = await answerApplicationQuestions(id, answers);
      setApplications((items) => items.map((item) => (item.id === id ? result.application : item)));
      notify("Answers saved. Application queued again.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Answers could not be saved");
    }
  };
  const requeueApplication = async (id: string) => {
    try {
      const queued = await submitApplication(id);
      setApplications((items) => items.map((item) => (item.id === id ? queued.application : item)));
      notify("Application re-queued for the browser worker.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not re-queue application");
    }
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
    if (!currentUser) return;
    let active = true;
    const refreshApplications = async () => {
      try {
        const result = await getApplications();
        if (active) setApplications(result.applications);
      } catch {
        // Keep the last known state; the next poll retries automatically.
      }
    };
    const refreshUnread = async () => {
      try {
        const mailbox = await getMailbox(0);
        if (!active) return;
        setUnreadMailCount(mailbox.messages.filter((message) => !message.isRead).length);
      } catch {
        // Inbox may be unavailable; keep the last badge count.
      }
    };
    void refreshApplications();
    void refreshUnread();
    const interval = window.setInterval(() => {
      void refreshApplications();
      void refreshUnread();
    }, 10_000);
    return () => { active = false; window.clearInterval(interval); };
  }, [currentUser]);
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
          applicationId: application?.id,
          applicationStatus: application?.status,
          applicationError: application?.lastSubmissionError,
          applicationUpdatedAt: application?.updatedAt,
          submissionQueuedAt: application?.submissionQueuedAt,
          requiredQuestions: application?.requiredQuestions,
          applicationAnswers: application?.answers,
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
  if (routePath === "/") return <LandingPage signedIn={Boolean(currentUser)} />;
  if (routePath === "/logged-out") return <LoggedOutPage signedIn={Boolean(currentUser)} />;
  if (!currentUser && routePath === "/login") return <AuthPage />;
  if (!currentUser) return <LandingPage signedIn={false} />;

  const displayName = [profile.firstName, profile.lastName].filter(Boolean).join(" ") || currentUser.userDetails || "Signed in";
  const avatarInitials = (profile.firstName?.[0] || currentUser.userDetails?.[0] || "U").toUpperCase();
  const onNavSelect = (_event: Event | React.SyntheticEvent, data: OnNavItemSelectData) => {
    if (data.value) setPage(String(data.value) as Page);
  };

  return (
    <div className={`sa-shell ${navOpen ? "nav-expanded" : "nav-collapsed"}`}>
      <NavDrawer
        open
        type="inline"
        selectedValue={page}
        onNavItemSelect={onNavSelect}
        className="sa-nav"
      >
        <NavDrawerHeader>
          <div className="sa-logo">
            <span><Sparkle24Filled /></span>
            <b>ApplyPilot</b>
          </div>
        </NavDrawerHeader>
        <NavDrawerBody>
          <NavSectionHeader>Workspace</NavSectionHeader>
          <NavItem value="dashboard" icon={<Board24Regular />}>Job Matches</NavItem>
          <NavItem value="applications" icon={<Briefcase24Regular />}>
            Applications
            {applications.length > 0 ? <CounterBadge className="nav-count" count={applications.length} size="small" appearance="filled" color="informative" /> : null}
          </NavItem>
          <NavItem value="inbox" icon={<Mail24Regular />}>
            Email Inbox
            {unreadMailCount > 0 ? <CounterBadge className="nav-count" count={unreadMailCount} size="small" appearance="filled" color="danger" /> : null}
          </NavItem>
          <NavItem value="search" icon={<Search24Regular />}>Job Search</NavItem>
          <NavSectionHeader>Candidate</NavSectionHeader>
          <NavItem value="resume" icon={<Document24Regular />}>Résumé</NavItem>
          <NavItem value="profile" icon={<Person24Regular />}>Profile</NavItem>
          <NavItem value="preferences" icon={<Options24Regular />}>Preferences</NavItem>
          <NavSectionHeader>Account</NavSectionHeader>
          <NavItem value="settings" icon={<Settings24Regular />}>Settings</NavItem>
          <NavItem value="credits" icon={<Payment24Regular />}>Usage</NavItem>
        </NavDrawerBody>
        <NavDrawerFooter>
          <div className="usage">
            <div>
              <span>Submitted applications</span>
              <b>{applications.filter((item) => item.status === "submitted").length} / 100</b>
            </div>
            <i>
              <em style={{ width: `${Math.min(applications.filter((item) => item.status === "submitted").length, 100)}%` }} />
            </i>
            <small>Persisted in your account</small>
          </div>
        </NavDrawerFooter>
      </NavDrawer>

      <div className="sa-main-column">
        <header className="sa-header">
          <Button
            appearance="subtle"
            icon={<Navigation24Regular />}
            aria-label={navOpen ? "Collapse navigation" : "Expand navigation"}
            onClick={() => setNavOpen((value) => !value)}
          />
          <div className="header-title">
            <b>{pageTitles[page]}</b>
          </div>
          <div className="header-spacer" />
          <Tooltip content="Email notifications" relationship="label">
            <Button
              appearance="subtle"
              className="header-icon-btn"
              icon={
                <span className="header-bell">
                  <Alert24Regular />
                  {unreadMailCount > 0 ? <CounterBadge count={unreadMailCount} size="small" appearance="filled" color="danger" /> : null}
                </span>
              }
              aria-label="Email notifications"
              onClick={() => setPage("inbox")}
            />
          </Tooltip>
          <Menu>
            <MenuTrigger disableButtonEnhancement>
              <Button appearance="subtle" className="header-profile-btn" aria-label="Account menu">
                <Avatar name={displayName} initials={avatarInitials} color="colorful" size={32} />
              </Button>
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                <MenuItem icon={<Person24Regular />} onClick={() => setPage("profile")}>Profile</MenuItem>
                <MenuItem icon={<Settings24Regular />} onClick={() => setPage("settings")}>Settings</MenuItem>
                <MenuItem icon={<Sparkle24Filled />} onClick={() => window.dispatchEvent(new Event("applypilot:start-tour"))}>Product tour</MenuItem>
                <MenuItem
                  icon={<SignOut24Regular />}
                  onClick={(event) => {
                    if (import.meta.env.DEV) {
                      event.preventDefault();
                      setDevSignedIn(false);
                      window.location.assign("/logged-out");
                      return;
                    }
                    window.location.assign("/.auth/logout?post_logout_redirect_uri=/logged-out");
                  }}
                >
                  Sign out
                </MenuItem>
              </MenuList>
            </MenuPopover>
          </Menu>
        </header>
        <ProductTour page={page} setPage={setPage} />
        <main className="sa-main">
        {currentUser && (() => {
          const readiness = profileReadyForApply(profile, resumeDocuments.length > 0);
          if (readiness.ready) return null;
          return (
            <div className="onboarding-banner">
              <div>
                <b>Finish setup for one-click apply</b>
                <p>
                  {readiness.needsResume ? "Upload a résumé, then " : ""}
                  fill required profile fields
                  {readiness.missing.length ? `: ${readiness.missing.map(fieldLabel).join(", ")}` : ""}.
                  Extracted résumé details fill blank fields automatically.
                </p>
              </div>
              <div className="onboarding-banner-actions">
                {readiness.needsResume && <button className="apply" onClick={() => setPage("resume")}>Upload résumé</button>}
                <button className="apply" onClick={() => setPage("profile")}>Complete profile</button>
              </div>
            </div>
          );
        })()}
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
                window.location.assign("/login");
                return;
              }
              const readiness = profileReadyForApply(profile, resumeDocuments.length > 0);
              if (!readiness.ready) {
                const parts = [
                  readiness.needsResume ? "upload a résumé" : "",
                  readiness.missing.length ? `complete required profile fields (${readiness.missing.map(fieldLabel).join(", ")})` : "",
                ].filter(Boolean);
                notify(`Before Simple Apply, ${parts.join(" and ")}.`);
                setPage(readiness.needsResume ? "resume" : "profile");
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
            resolve={resolveAnswers}
            requeue={requeueApplication}
            profile={profile}
          />
        )}
        {page === "applications" && (
          <Applications
            applications={applications}
            focusedApplicationId={focusedApplicationId}
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
            resolve={resolveAnswers}
            requeue={requeueApplication}
            profile={profile}
          />
        )}
        {page === "resume" && (
          <Resume
            documents={resumeDocuments}
            upload={async (file) => {
              if (!currentUser) {
                window.location.assign("/login");
                return;
              }
              try {
                const result = await uploadResume(file);
                setResumeDocuments((items) => [result.document, ...items.map((item) => ({ ...item, isPrimary: false }))]);
                if (result.profile) {
                  const normalized = { ...emptyProfile, ...result.profile };
                  setProfile(normalized);
                  saveProfile(normalized);
                }
                const filled = (result.mergedFields || []).length;
                notify(
                  result.extractionStatus === "succeeded"
                    ? filled
                      ? `Résumé uploaded. Filled ${filled} blank profile field${filled === 1 ? "" : "s"} from extraction.`
                      : "Résumé uploaded. Profile already had extracted contact details."
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
            hasResume={resumeDocuments.length > 0}
            goResume={() => setPage("resume")}
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
        {page === "inbox" && <InboxPage openApplication={(applicationId) => {
          setFocusedApplicationId(applicationId);
          setPage("applications");
        }} />}
        {page === "credits" && <CreditsPage queued={applications.filter((item) => ["review", "queued", "processing"].includes(item.status)).length} />}
        {page === "settings" && <SettingsPage />}
        {page === "auth" && <AuthPage />}
        </main>
        {toast && (
          <div className="toast">
            <CheckmarkCircle24Regular />
            {toast}
          </div>
        )}
      </div>
    </div>
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
  resolve: (id: string, answers: Record<string, string>) => Promise<void>;
  requeue: (id: string) => Promise<void>;
  profile: Profile;
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
          active={p.status === "queued"}
          onClick={() => p.setStatus(p.status === "queued" ? "all" : "queued")}
        />
        <Metric
          n={String(p.allJobs.filter((job) => job.status === "ready").length)}
          label="Not applied"
          color="purple"
          active={p.status === "ready"}
          onClick={() => p.setStatus(p.status === "ready" ? "all" : "ready")}
        />
        <Metric
          n={String(p.allJobs.filter((job) => job.status === "applied").length)}
          label="Applied"
          color="green"
          active={p.status === "applied"}
          onClick={() => p.setStatus(p.status === "applied" ? "all" : "applied")}
        />
        <Metric
          n={String(p.allJobs.filter((job) => job.status === "failed").length)}
          label="Failed"
          color="red"
          active={p.status === "failed"}
          onClick={() => p.setStatus(p.status === "failed" ? "all" : "failed")}
        />
        <div className="ready-card">
          <span>
            <Checkmark24Regular />
          </span>
          <div>
            <b>One-click application workflow</b>
            <small>Simple Apply queues a background worker to submit for you</small>
          </div>
        </div>
      </div>
      <div className="toolbar">
        <div className="searchbox">
          <Search24Regular />
          <input
            placeholder="Search title or company"
            value={p.query}
            onChange={(e) => p.setQuery(e.target.value)}
          />
        </div>
        <div className="searchbox location-filter">
          <Location24Regular />
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
              Sorted by best match <ChevronDown24Regular />
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
              <Search24Regular />
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
              <button disabled={p.page === 1} onClick={() => p.setPage(p.page - 1)}><ChevronLeft24Regular /> Previous</button>
              <span>Page {p.page} of {p.pageCount}</span>
              <button disabled={p.page === p.pageCount} onClick={() => p.setPage(p.page + 1)}>Next <ChevronRight24Regular /></button>
            </div>
          )}
        </section>
        {p.job && <JobDetail job={p.job} dismiss={p.dismiss} apply={p.apply} resolve={p.resolve} requeue={p.requeue} profile={p.profile} />}
      </div>
    </div>
  );
}

function Metric({
  n,
  label,
  color,
  active,
  onClick,
}: {
  n: string;
  label: string;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button className={`metric ${active ? `active ${color}` : ""}`} onClick={onClick} aria-pressed={active}>
      <span className={color}>{n}</span>
      <div>
        <b>{label}</b>
        <small>job matches</small>
      </div>
      <ChevronRight24Regular />
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
            <em className="status-tag applied">
              <Checkmark24Regular /> Applied
            </em>
          )}
          {j.status === "queued" && (
            <em className="status-tag queued">
              <Clock24Regular /> {j.applicationStatus === "processing" ? "Submitting" : "Queued"}
            </em>
          )}
          {j.status === "failed" && (
            <em className="status-tag failed">
              <Dismiss24Regular /> Failed
            </em>
          )}
        </div>
        <strong>{j.company}</strong>
        <small>
          <Location24Regular />
          {j.location} · {j.level}
        </small>
        <div className="row-tags">
          {j.remote && <i>Remote</i>}
          <i>{j.salary}</i>
        </div>
        {j.status === "failed" && (
          <p className="job-error">
            <ErrorCircle24Regular />
            {j.applicationError || "Submission failed. Open the job for details or retry from Applications."}
          </p>
        )}
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
  resolve,
  requeue,
  profile,
}: {
  job: Job;
  dismiss: (n: number) => void;
  apply: (j: Job) => Promise<void>;
  resolve: (id: string, answers: Record<string, string>) => Promise<void>;
  requeue: (id: string) => Promise<void>;
  profile: Profile;
}) {
  const [applying, setApplying] = useState(false);
  const [requeuing, setRequeuing] = useState(false);
  const failedApplication = job.status === "failed" && job.applicationId
    ? {
        id: job.applicationId,
        jobId: job.id,
        company: job.company,
        title: job.title,
        location: job.location,
        status: (job.applicationStatus || "needs_action") as Application["status"],
        sourceUrl: job.sourceUrl || "",
        source: job.source || "",
        updatedAt: job.applicationUpdatedAt || new Date().toISOString(),
        lastSubmissionError: job.applicationError,
        requiredQuestions: job.requiredQuestions,
        answers: job.applicationAnswers,
      }
    : null;
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
          <Dismiss24Regular />
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
      {job.status === "queued" && (
        <div className="submission-banner queued">
          <Clock24Regular />
          <div>
            <b>{job.applicationStatus === "processing" ? "Submitting now" : "Queued for submission"}</b>
            <p>
              {job.applicationStatus === "processing"
                ? "A browser worker is filling out the employer application."
                : "Waiting for a browser worker. If this stays queued for more than a few minutes, retry the queue below."}
            </p>
            {job.applicationId && job.applicationStatus !== "processing" && (
              <button
                className="apply"
                disabled={requeuing}
                onClick={async () => {
                  setRequeuing(true);
                  try { await requeue(job.applicationId!); } finally { setRequeuing(false); }
                }}
              >
                {requeuing ? "Re-queuing…" : "Retry queue"}
              </button>
            )}
          </div>
        </div>
      )}
      {job.status === "failed" && !failedApplication && (
        <div className="submission-banner failed">
          <ErrorCircle24Regular />
          <div>
            <b>Application failed</b>
            <p>{job.applicationError || "Submission could not be completed. Retry from Applications after fixing any missing answers."}</p>
          </div>
        </div>
      )}
      {failedApplication && (
        <ApplicationQuestions application={failedApplication} resolve={resolve} profile={profile} />
      )}
      {job.status === "applied" && (
        <div className="submission-banner applied">
          <Checkmark24Regular />
          <div>
            <b>Applied</b>
            <p>This application was submitted successfully.</p>
          </div>
        </div>
      )}
      <div className="detail-tags">
        <span>
          <Location24Regular /> {job.remote ? "Remote" : "On-site"}
        </span>
        <span>
          <DataBarVertical24Regular /> {job.level}
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
              <Checkmark24Regular />
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
          <Sparkle24Filled />{" "}
          {applying
            ? "Queuing..."
            : job.status === "ready"
              ? "Simple Apply"
              : job.status === "failed"
                ? "Answer questions below"
                : job.status === "applied"
                  ? "Already applied"
                  : "Queued"}
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
        <Checkmark24Regular /> One click queues the application; a background worker fills and submits the employer form
      </div>
    </section>
  );
}

function Applications({
  applications,
  focusedApplicationId,
  update,
  resolve,
  requeue,
  profile,
}: {
  applications: Application[];
  focusedApplicationId: string | null;
  update: (id: string, status: Application["status"]) => Promise<void>;
  resolve: (id: string, answers: Record<string, string>) => Promise<void>;
  requeue: (id: string) => Promise<void>;
  profile: Profile;
}) {
  useEffect(() => {
    if (!focusedApplicationId) return;
    document.getElementById(`application-${focusedApplicationId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusedApplicationId]);

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
            <Briefcase24Regular />
            <b>No applications in progress</b>
            <span>Choose Simple Apply on a job match to queue submission.</span>
          </div>
        )}
        {applications.map((application) => (
          <div id={`application-${application.id}`} className={`table-row application-row ${focusedApplicationId === application.id ? "focused" : ""}`} key={application.id}>
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
              {application.status === "submitted" && <Checkmark24Regular />}{" "}
              {application.status}
            </span>
            <div className="application-actions">
              {(application.status === "queued" || application.status === "processing" || application.status === "review") && (
                <div className="queued-message">
                  <span>
                    {application.status === "processing"
                      ? "Browser worker is submitting this application now."
                      : application.status === "review"
                        ? "Ready to queue. Submission was not accepted by the queue yet."
                        : "Waiting in the submission queue for a browser worker."}
                  </span>
                  {application.status !== "processing" && (
                    <button onClick={() => void requeue(application.id)}>Retry queue</button>
                  )}
                </div>
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
            {(application.status === "needs_action" || application.status === "failed") && (
              <ApplicationQuestions application={application} resolve={resolve} profile={profile} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function profileAnswerForLabel(label: string, profile: Profile) {
  const text = String(label || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (/\bfirst name\b/.test(text)) return profile.firstName;
  if (/\blast name\b/.test(text)) return profile.lastName;
  if (/\bfull name\b|\blegal name\b/.test(text)) return [profile.firstName, profile.lastName].filter(Boolean).join(" ");
  if (/\bemail\b/.test(text)) return profile.email;
  if (/\bphone\b|\bmobile\b/.test(text)) return profile.phone;
  if (/\blinkedin\b/.test(text)) return profile.linkedin;
  if (/\bgithub\b/.test(text)) return profile.github;
  if (/\bportfolio\b|\bwebsite\b|\bpersonal site\b/.test(text)) return profile.portfolio || profile.github;
  if (/\bcountry\b/.test(text)) return profile.country;
  if (/\bcity\b/.test(text)) return profile.city;
  if (/\bstate\b|\bprovince\b/.test(text)) return profile.state;
  if (/\bpostal\b|\bzip\b/.test(text)) return profile.postalCode;
  if (/\baddress\b/.test(text)) return profile.address || [profile.city, profile.state, profile.postalCode].filter(Boolean).join(", ");
  if (/\blocation\b/.test(text)) return profile.location || [profile.city, profile.state, profile.country].filter(Boolean).join(", ");
  if (/\bwork authorization\b|\bauthorized to work\b|\blegally authorized\b|\beligible to work\b/.test(text)) return profile.workAuthorization;
  if (/\bsponsor|\bvisa\b/.test(text)) return profile.sponsorship;
  if (/\beducation\b|\bdegree\b|\bhighest (level|education)\b/.test(text)) return profile.educationLevel;
  if (/\bskills?\b|\btechnologies\b|\btech stack\b/.test(text)) return profile.skills;
  if (/\byears? of experience\b|\bexperience level\b/.test(text)) return profile.experienceLevel;
  if (/\bsalary\b|\bcompensation\b|\bexpected pay\b/.test(text)) return profile.minSalary;
  if (/\bemployment type\b|\bfull.?time|part.?time|contract\b/.test(text)) return profile.employmentTypes;
  if (/\blanguage\b/.test(text)) return profile.preferredLanguages;
  if (/\bcover letter\b|\bwhy (do you want|are you interested)|about yourself\b|\bsummary\b|\badditional (information|info)\b/.test(text)) {
    return profile.additionalInfo || profile.summary || profile.headline || "";
  }
  return "";
}

function displayQuestionLabel(question: { key: string; label: string }, index: number) {
  const label = String(question.label || "").replace(/\s+/g, " ").trim();
  if (label && !/^required question$/i.test(label)) return label;
  const key = String(question.key || "");
  const leaf = key.includes("[")
    ? (key.match(/\[([^\]]+)\]/g) || []).map((part) => part.slice(1, -1)).filter(Boolean).pop() || key
    : key.replace(/__\d+$/, "").split(/[./#]/).pop() || key;
  const humanized = leaf
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (humanized && !/^(input|field|select|textarea|question|required question)\d*$/i.test(humanized)) {
    return humanized.replace(/\b\w/g, (char) => char.toUpperCase());
  }
  return `Question ${index + 1}`;
}

function ApplicationQuestions({
  application,
  resolve,
  profile,
}: {
  application: Application;
  resolve: (id: string, answers: Record<string, string>) => Promise<void>;
  profile: Profile;
}) {
  const questions = application.requiredQuestions;
  const answersSignature = JSON.stringify(application.answers || {});
  const questionsSignature = JSON.stringify(
    (questions || []).map((question) => [question.key, question.label, question.type, question.options || []]),
  );
  const profileSignature = JSON.stringify({
    firstName: profile.firstName,
    lastName: profile.lastName,
    email: profile.email,
    phone: profile.phone,
    linkedin: profile.linkedin,
    github: profile.github,
    portfolio: profile.portfolio,
    city: profile.city,
    state: profile.state,
    postalCode: profile.postalCode,
    address: profile.address,
    country: profile.country,
    workAuthorization: profile.workAuthorization,
    sponsorship: profile.sponsorship,
  });
  const seedAnswers = useMemo(() => {
    const list = questions || [];
    const next: Record<string, string> = { ...(application.answers || {}) };
    for (const [index, question] of list.entries()) {
      if (String(next[question.key] || "").trim()) continue;
      const guessed = profileAnswerForLabel(displayQuestionLabel(question, index), profile);
      if (guessed) next[question.key] = guessed;
    }
    return next;
    // Signatures keep seed stable across poll-driven object identity churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [application.id, answersSignature, questionsSignature, profileSignature]);
  const seedKey = `${application.id}|${answersSignature}|${questionsSignature}|${profileSignature}`;
  const [answers, setAnswers] = useState(seedAnswers);
  const [appliedSeedKey, setAppliedSeedKey] = useState(seedKey);
  const [saving, setSaving] = useState(false);
  if (appliedSeedKey !== seedKey) {
    setAppliedSeedKey(seedKey);
    setAnswers(seedAnswers);
  }

  if (!questions?.length) {
    return (
      <div className="action-required">
        <b>Action required</b>
        <p>{application.lastSubmissionError || "The employer application needs manual review."}</p>
        <div className="action-required-buttons">
          <button className="apply" onClick={() => void resolve(application.id, {})}>Retry with browser worker</button>
          <a href={application.sourceUrl} target="_blank" rel="noreferrer">Open original application</a>
        </div>
      </div>
    );
  }

  const blocking = questions.some((question) => question.type === "blocking");
  const answeredCount = questions.filter((question) => String(answers[question.key] || "").trim()).length;
  const setAnswer = (key: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <form
      className="action-required"
      onSubmit={async (event) => {
        event.preventDefault();
        if (blocking) return;
        setSaving(true);
        try {
          await resolve(application.id, answers);
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className="action-required-head">
        <b>Employer questions ({questions.length})</b>
        <small>{answeredCount} of {questions.length} filled · Profile values prefilled where possible</small>
      </div>
      <p>{application.lastSubmissionError}</p>
      <div className="action-required-fields">
        {questions.map((question, index) => {
          const selectOptions = (question.options || []).filter((option) => String(option).trim().length > 0);
          const label = displayQuestionLabel(question, index);
          return (
          <label key={`${question.key}__${index}`}>
            <span>{label}</span>
            {question.type === "blocking" ? (
              <a href={application.sourceUrl} target="_blank" rel="noreferrer">Open employer application</a>
            ) : question.type === "select" ? (
              <select
                required={question.required !== false}
                value={answers[question.key] || ""}
                onChange={(event) => setAnswer(question.key, event.target.value)}
              >
                <option value="">Select an answer</option>
                {selectOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            ) : question.type === "checkbox" ? (
              <select
                required={question.required !== false}
                value={answers[question.key] || ""}
                onChange={(event) => setAnswer(question.key, event.target.value)}
              >
                <option value="">Select an answer</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            ) : question.type === "textarea" ? (
              <textarea
                required={question.required !== false}
                value={answers[question.key] || ""}
                onChange={(event) => setAnswer(question.key, event.target.value)}
              />
            ) : (
              <input
                required={question.required !== false}
                value={answers[question.key] || ""}
                onChange={(event) => setAnswer(question.key, event.target.value)}
              />
            )}
          </label>
          );
        })}
      </div>
      {!blocking && (
        <button className="apply" disabled={saving}>
          {saving ? "Saving…" : "Save answers and retry"}
        </button>
      )}
    </form>
  );
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
            <span><ArrowUpload24Regular /></span>
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
                  <Document24Regular />
                  <span><b>{item.fileName}</b><small>{(item.sizeBytes / 1024).toFixed(0)} KB · {new Date(item.createdAt).toLocaleDateString()} {item.isPrimary ? "· Primary" : ""}</small></span>
                </button>
                <button className="resume-delete" aria-label={`Remove ${item.fileName}`} onClick={() => { if (confirm(`Remove ${item.fileName}?`)) void remove(item.id); }}><Delete24Regular /></button>
              </article>
            ))}
          </div>
        </section>
        <section className={`resume-preview simple-card ${fullScreen ? "fullscreen" : ""}`}>
          <div className="resume-preview-toolbar">
            <h2>{selected ? selected.fileName : "Preview"}</h2>
            {selected && <div>
              <button disabled={busy} onClick={() => void renameSelected()}><Edit24Regular /> Rename</button>
              <button disabled={busy} onClick={() => void download()}><ArrowDownload24Regular /> Download</button>
              <button onClick={() => setFullScreen((value) => !value)} title={fullScreen ? "Exit full screen" : "View full screen"}>{fullScreen ? <FullScreenMinimize24Regular /> : <FullScreenMaximize24Regular />} {fullScreen ? "Exit" : "Full screen"}</button>
              {selected.contentType === "application/pdf" && <><button onClick={() => setZoom((value) => Math.max(.5, value - .15))} aria-label="Zoom out"><Subtract24Regular /></button><span>{Math.round(zoom * 100)}%</span><button onClick={() => setZoom((value) => Math.min(2.5, value + .15))} aria-label="Zoom in"><Add24Regular /></button></>}
            </div>}
          </div>
          {!selected ? <p>Select an uploaded PDF to preview it.</p> : selected.contentType !== "application/pdf" ? (
            <div className="resume-preview-empty"><Document24Regular /><p>DOCX preview is not available in the browser.</p><button className="apply" onClick={() => void download()}>Download DOCX</button></div>
          ) : previewError ? (
            <div className="resume-preview-empty"><Document24Regular /><p>{previewError}</p></div>
          ) : !pdfUrl ? (
            <div className="resume-preview-empty"><Document24Regular /><p>Loading PDF…</p></div>
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
        <h2><Search24Regular /> Search Jobs</h2>
        <label>Job title, company, or skill<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Software Engineer, React, Azure…" /></label>
        <label>Location<input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Remote, Seattle, United States…" /></label>
        <button className="orange-action" onClick={search}><Search24Regular /> Search jobs</button>
      </section>
    </div>
  );
}

function AuthPage() {
  const [providers, setProviders] = useState<Array<{ id: string; label: string; href: string; enabled: boolean }>>([
    { id: "aad", label: "Microsoft", href: "/.auth/login/aad?post_login_redirect_uri=/dashboard", enabled: true },
  ]);
  useEffect(() => {
    getAuthProviders()
      .then((result) => setProviders(result.providers))
      .catch(() => undefined);
  }, []);
  const mark = (id: string) => {
    if (id === "aad") return <span className="microsoft-mark"><i /><i /><i /><i /></span>;
    if (id === "google") return <span className="provider-letter google">G</span>;
    if (id === "github") return <span className="provider-letter github">GH</span>;
    return <span className="provider-letter">{id.slice(0, 1).toUpperCase()}</span>;
  };
  const continueWith = (provider: { id: string; href: string }) => {
    if (import.meta.env.DEV) {
      setDevSignedIn(true);
      window.location.assign("/dashboard");
      return;
    }
    window.location.assign(provider.href);
  };
  return (
    <div className="auth-page">
      <section className="auth-card">
        <div className="auth-brand"><Sparkle24Filled /></div>
        <h1>Create your ApplyPilot account</h1>
        <p>Sign in and your account is created automatically. Your profile, resume, and applications remain scoped to that identity.</p>
        {providers.map((provider) =>
          provider.enabled ? (
            <button
              key={provider.id}
              type="button"
              className={`provider-button ${provider.id === "aad" ? "microsoft" : provider.id}`}
              onClick={() => continueWith(provider)}
            >
              {mark(provider.id)}
              Continue with {provider.label}
            </button>
          ) : (
            <button key={provider.id} className={`provider-button ${provider.id}`} disabled title={`${provider.label} OAuth registration is not configured in Azure yet`}>
              {mark(provider.id)}
              Continue with {provider.label}
              <small>Provider setup required</small>
            </button>
          ),
        )}
        <div className="auth-note">By continuing, you agree to use ApplyPilot for your own job search and to review information before submission.</div>
      </section>
    </div>
  );
}

function ProductTour({
  page,
  setPage,
}: {
  page: Page;
  setPage: (page: Page) => void;
}) {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem("applypilot.tour.done") !== "1"; } catch { return true; }
  });
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const start = () => { setIndex(0); setOpen(true); };
    window.addEventListener("applypilot:start-tour", start);
    return () => window.removeEventListener("applypilot:start-tour", start);
  }, []);
  useEffect(() => {
    if (open) setPage(productTourSteps[index].page);
  }, [open, index, setPage]);
  if (!open) return null;
  const step = productTourSteps[index];
  const finish = () => {
    try { localStorage.setItem("applypilot.tour.done", "1"); } catch { /* ignore */ }
    setOpen(false);
  };
  return (
    <div className="tour-overlay" role="dialog" aria-modal="true" aria-label="ApplyPilot walkthrough">
      <div className="tour-card">
        <small>Step {index + 1} of {productTourSteps.length}</small>
        <h2>{step.title}</h2>
        <p>{step.body}</p>
        <div className="tour-actions">
          <button className="not" onClick={finish}>Skip</button>
          {index > 0 && <button className="not" onClick={() => setIndex((value) => value - 1)}>Back</button>}
          {index < productTourSteps.length - 1 ? (
            <button className="apply" onClick={() => setIndex((value) => value + 1)}>Next</button>
          ) : (
            <button className="apply" onClick={finish}>Done</button>
          )}
        </div>
        <p className="tour-hint">You are on: <b>{page}</b>. Restart anytime with Tour in the top nav.</p>
      </div>
    </div>
  );
}

function AuthLoading() {
  return <main className="public-shell"><div className="public-brand"><Sparkle24Filled /><b>ApplyPilot</b></div><section className="public-centered"><div className="landing-orb"><Sparkle24Filled /></div><h1>Preparing your workspace…</h1><p>Checking your secure session.</p></section></main>;
}

function LandingPage({ signedIn }: { signedIn: boolean }) {
  return (
    <main className="public-shell">
      <header className="public-header">
        <div className="public-brand"><Sparkle24Filled /><b>ApplyPilot</b></div>
        <nav>
          <a href="#features">Features</a>
          {signedIn ? (
            <a href="/dashboard" className="orange-action">Dashboard</a>
          ) : (
            <>
              <a href="/login" className="public-link">Log in</a>
              <a href="/login" className="orange-action">Create account</a>
            </>
          )}
        </nav>
      </header>
      <section className="landing-hero">
        <div>
          <span className="landing-kicker">A focused job-search workspace</span>
          <h1>Find better roles.<br /><em>Apply with confidence.</em></h1>
          <p>Bring your profile, résumé, job matches, application queue, and recruiter messages into one secure place.</p>
          <p className="landing-tagline">End-to-end job apply in one click, from match to submission.</p>
          <div className="landing-actions">
            {signedIn ? (
              <a className="orange-action" href="/dashboard">Open dashboard</a>
            ) : (
              <>
                <a className="orange-action" href="/login">Create account</a>
                <a className="secondary-action" href="/login">Log in</a>
              </>
            )}
          </div>
          <small>Sign in with Microsoft, Google, or GitHub. No password stored by ApplyPilot.</small>
        </div>
        <div className="landing-preview">
          <div className="preview-top"><span /><span /><span /></div>
          <b>Your job search, organized</b>
          <div className="preview-metrics">
            <span><strong>10</strong> jobs per page</span>
            <span><strong>1</strong> private inbox</span>
            <span><strong>100%</strong> profile control</span>
          </div>
          <div className="preview-job"><Briefcase24Regular /><div><b>Senior Software Engineer</b><small>Matched to your profile</small></div><Checkmark24Regular /></div>
          <div className="preview-job"><Mail24Regular /><div><b>Recruiter replies</b><small>Delivered to your private alias</small></div><Checkmark24Regular /></div>
        </div>
      </section>
      <section className="landing-features" id="features">
        <article><Search24Regular /><h2>Live job discovery</h2><p>Search current roles with location, workplace and source filters.</p></article>
        <article><Document24Regular /><h2>Reusable profile</h2><p>Upload your résumé and review extracted details before applying.</p></article>
        <article><Mail24Regular /><h2>Application inbox</h2><p>Track application messages through your private inbound alias.</p></article>
      </section>
    </main>
  );
}

function LoggedOutPage({ signedIn }: { signedIn: boolean }) {
  const logoutHref = "/.auth/logout?post_logout_redirect_uri=/logged-out";
  const onDevLogout = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!import.meta.env.DEV) return;
    event.preventDefault();
    setDevSignedIn(false);
    window.location.assign("/logged-out");
  };
  return (
    <main className="public-shell"><header className="public-header"><a className="public-brand" href="/"><Sparkle24Filled /><b>ApplyPilot</b></a></header><section className="public-centered"><div className="logout-check"><Checkmark24Regular /></div><h1>{signedIn ? "You’re still signed in" : "You’re signed out"}</h1><p>{signedIn ? "Your session is still active. Return to your dashboard or sign out again." : "Your ApplyPilot session ended successfully. Your profile and applications remain safely stored."}</p><div className="landing-actions">{signedIn ? <><a className="orange-action" href={logoutHref} onClick={onDevLogout}>Sign out again</a><a className="secondary-action" href="/dashboard">Return to dashboard</a></> : <a className="orange-action" href="/login">Sign in again</a>}<a className="secondary-action" href="/">Go to home page</a></div></section></main>
  );
}

function InboxPage({ openApplication }: { openApplication: (applicationId: string) => void }) {
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [address, setAddress] = useState<string | null>(null);
  const [routingNote, setRoutingNote] = useState("");
  const [selected, setSelected] = useState<MailMessage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getMailbox().then((result) => {
      setAddress(result.address);
      setRoutingNote(result.routingNote || "");
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
      <div className="page-heading left"><h1><Mail24Regular /> Email Inbox</h1><p>Queued, submitted, failed, and recruiter follow-ups for your applications.</p></div>
      {address && <div className="info-banner">Your private application address: <strong>{address}</strong>{routingNote ? <span> — {routingNote}</span> : null}</div>}
      {loading ? <section className="simple-card empty-feature"><Mail24Regular /><h2>Loading mailbox…</h2></section> : error ? <section className="simple-card empty-feature"><Mail24Regular /><h2>Mailbox unavailable</h2><p>{error}</p></section> : messages.length === 0 ? <section className="simple-card empty-feature"><Mail24Regular /><h2>Your inbox is ready</h2><p>Simple Apply uses the address above on employer forms. Status emails are copied here automatically, and recruiter replies to that address appear in this inbox.</p></section> : (
        <section className="simple-card mailbox-layout">
          <div className="mail-list">{messages.map((message) => <button className={`${selected?.id === message.id ? "active" : ""} ${message.isRead ? "" : "unread"}`} key={message.id} onClick={() => void openMessage(message)}><b>{message.from.name || message.from.email}</b><span>{message.subject}</span><small>{new Date(message.receivedAt).toLocaleString()}</small></button>)}</div>
          <article className="mail-content">{selected && <><h2>{selected.subject}</h2><p className="mail-from">From {selected.from.name ? `${selected.from.name} <${selected.from.email}>` : selected.from.email}</p>{selected.applicationId && <button className="orange-action mail-application-link" onClick={() => openApplication(selected.applicationId!)}><Briefcase24Regular /> View application</button>}<pre>{selected.textBody}</pre>{selected.attachmentCount > 0 && <small>{selected.attachmentCount} attachment(s) recorded; downloads are disabled until malware scanning is configured.</small>}</>}</article>
        </section>
      )}
    </div>
  );
}

function CreditsPage({ queued }: { queued: number }) {
  return (
    <div className="simple-page narrow-page">
      <section className="simple-card credits-card"><Payment24Regular /><h1>Applications & usage</h1><strong>{queued}</strong><p>applications currently queued for review</p><hr /><h2>No artificial credit limit</h2><p>ApplyPilot does not sell or invent credits. Azure usage remains governed by your subscription budget.</p></section>
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
    <div className="simple-page narrow-page settings-page"><section className="simple-card"><h1><Settings24Regular /> Settings</h1><p>Manage local notification preferences.</p>{([
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
  hasResume,
  goResume,
}: {
  profile: Profile;
  setProfile: (p: Profile) => void;
  save: () => void;
  hasResume: boolean;
  goResume: () => void;
}) {
  const missing = missingProfileFields(profile);
  const required = new Set<string>(REQUIRED_PROFILE_FIELDS);
  const selectOptions: Partial<Record<keyof Profile, string[]>> = {
    workAuthorization: ["US Citizen", "Green Card", "Authorized to work", "Need visa sponsorship", "Other"],
    sponsorship: ["No", "Yes", "Not sure"],
    educationLevel: ["High school", "Associate's", "Bachelor's", "Master's", "PhD", "Other"],
    experienceLevel: ["0-1 years", "1-3 years", "3-5 years", "5-8 years", "8+ years"],
  };
  const fields = [
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
  ] as (keyof Profile)[];

  return (
    <div className="basic-page screenshot-profile">
      <h1>Profile Information</h1>
      <p>
        Required fields are collected once and reused by the browser worker on every Simple Apply.
        Uploading a résumé auto-fills blank contact and skills fields from extraction.
      </p>
      {(missing.length > 0 || !hasResume) && (
        <div className="onboarding-banner profile-setup">
          <div>
            <b>Required before Simple Apply</b>
            <p>
              {!hasResume ? "Upload a résumé. " : ""}
              {missing.length ? `Still needed: ${missing.map(fieldLabel).join(", ")}.` : "Required profile fields look complete."}
            </p>
          </div>
          {!hasResume && <button className="apply" onClick={goResume}>Upload résumé</button>}
        </div>
      )}
      <div className="settings-card profile-grid">
        {fields.map((k) => {
          const isRequired = required.has(k);
          const options = selectOptions[k];
          return (
            <label key={k} className={isRequired && !String(profile[k] || "").trim() ? "required-missing" : undefined}>
              {fieldLabel(k)}{isRequired ? " *" : ""}
              {options ? (
                <select
                  required={isRequired}
                  value={profile[k]}
                  onChange={(e) => setProfile({ ...profile, [k]: e.target.value })}
                >
                  <option value="">Select…</option>
                  {options.map((option) => <option key={option} value={option}>{option}</option>)}
                  {profile[k] && !options.includes(profile[k]) ? <option value={profile[k]}>{profile[k]}</option> : null}
                </select>
              ) : (
                <input
                  required={isRequired}
                  value={profile[k]}
                  onChange={(e) => setProfile({ ...profile, [k]: e.target.value })}
                />
              )}
            </label>
          );
        })}
        <button className="apply" onClick={save}>
          Save profile
        </button>
      </div>
    </div>
  );
}
