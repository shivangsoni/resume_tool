import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Avatar,
  Button,
  CounterBadge,
  DrawerBody,
  DrawerHeader,
  DrawerHeaderTitle,
  NavDrawer,
  NavDrawerBody,
  NavDrawerFooter,
  NavItem,
  NavSectionHeader,
  OverlayDrawer,
  SearchBox,
  Tab,
  TabList,
  Toolbar,
  ToolbarButton,
  Tooltip,
  type OnNavItemSelectData,
} from "@fluentui/react-components";
import {
  Add24Regular,
  Alert24Regular,
  ArrowClockwise24Regular,
  ArrowDownload24Regular,
  ArrowUpload24Regular,
  Board24Regular,
  Briefcase24Regular,
  Checkmark24Regular,
  CheckmarkCircle24Regular,
  ChevronDown24Regular,
  ChevronLeft24Regular,
  ChevronRight24Regular,
  CalendarLtr24Regular,
  Building24Regular,
  Clock24Regular,
  DataBarVertical24Regular,
  Delete24Regular,
  Dismiss24Regular,
  Document24Regular,
  Edit24Regular,
  ErrorCircle24Regular,
  FullScreenMaximize24Regular,
  FullScreenMinimize24Regular,
  Home24Regular,
  Location24Regular,
  Mail24Regular,
  Navigation24Regular,
  Options24Regular,
  Payment24Regular,
  Person24Regular,
  Camera24Regular,
  QuestionCircle24Regular,
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
import { readImageAsAvatarDataUrl } from "./avatar-image";
import { fieldLabel, missingProfileFields, profileReadyForApply, REQUIRED_PROFILE_FIELDS } from "./profileCompleteness";
import {
  EMPLOYMENT_TYPE_OPTIONS,
  EXPERIENCE_YEARS_OPTIONS,
  emptyWorkLocation,
  flattenWorkLocationsForWorker,
  isUnitedStates,
  listFieldHas,
  parseListField,
  parseWorkLocations,
  PROFILE_COUNTRIES,
  residenceLocationString,
  serializeListField,
  serializeWorkLocations,
  summarizeWorkLocation,
  toggleListItem,
  US_STATES,
  WORKPLACE_TYPES,
  type WorkLocationCard,
} from "./profile-form";
import {
  answerApplicationQuestions,
  createApplication,
  deleteApplication,
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
  beginSignOut,
  ensureSignedOut,
  loginWithPassword,
  registerWithPassword,
  setDevSignedIn,
} from "./api";
import type { Application, MailMessage, Profile, ResumeDocument } from "./types";
import { matchesJob, paginateJobs } from "./job-filter";
import { resolveEmployerApplicationUrl } from "./employer-application-url";
import { CompanyLogo } from "./company-logo";
import {
  coerceQuestionAnswer,
  dedupeEmployerQuestions,
  formatLocationAnswer,
  isQuestionAnswered,
  isUselessQuestionLabel as isUselessQuestionLabelHelper,
  lookupStoredAnswer,
  matchPhoneDialCountry,
  matchSelectOption,
  PHONE_DIAL_OPTIONS,
  priorAnswerKeys,
  resolveQuestionInputType,
} from "./question-answers";

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
const pageSubtitles: Record<Page, string> = {
  dashboard: "AI-matched opportunities based on your résumé and preferences.",
  applications: "Track every submission, answer follow-ups, and retry failed applies.",
  resume: "Upload a PDF or DOCX. Extracted details help fill employer forms.",
  preferences: "Set target titles, locations, and workplace types to improve match quality.",
  profile: "Keep contact details and work history current for Simple Apply.",
  inbox: "Status emails and recruiter replies for your applications.",
  search: "Search current opportunities using the same live feed as Job Matches.",
  credits: "Review queued volume and Azure-backed usage for your account.",
  settings: "Manage notification preferences for this workspace.",
  auth: "Sign in to your ApplyPilot account.",
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
  sourceBoard?: string;
  postedAt?: string;
  applicationId?: string;
  jobExternalId?: string;
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
  const [navOpen, setNavOpen] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 1051px)").matches);
  const [compactShell, setCompactShell] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 1050px)").matches);
  const [profileOpen, setProfileOpen] = useState(false);
  const [headerQuery, setHeaderQuery] = useState("");
  const [unreadMailCount, setUnreadMailCount] = useState(0);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1050px)");
    const sync = () => {
      setCompactShell(mq.matches);
      if (mq.matches) setNavOpen(false);
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
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
      notify("Moved to queued. Waiting for a browser worker.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not re-queue application");
    }
  };
  const dismissJob = async (job: Job) => {
    const removableStatuses = ["draft", "review", "queued", "processing", "needs_action", "failed", "rejected"];
    if (job.applicationId && removableStatuses.includes(String(job.applicationStatus || ""))) {
      try {
        await deleteApplication(job.applicationId);
        setApplications((items) => items.filter((item) => item.id !== job.applicationId));
      } catch (error) {
        notify(error instanceof Error ? error.message : "Could not remove application");
        return;
      }
    }
    setDismissed((items) => (items.includes(job.id) ? items : [...items, job.id]));
    notify(job.applicationId ? "Application removed" : "Removed from your matches");
  };
  useEffect(() => {
    getCurrentUser()
      .then(async (user) => {
        if (!user) {
          setCurrentUser(null);
          return;
        }
        try {
          const [remoteProfile, remoteApplications, remoteResumes] = await Promise.all([
            getRemoteProfile(),
            getApplications(),
            getResumes(),
          ]);
          setCurrentUser(user);
          if (remoteProfile.profile) {
            const normalized = { ...emptyProfile, ...remoteProfile.profile };
            setProfile(normalized);
            saveProfile(normalized);
          }
          setApplications(remoteApplications.applications);
          setResumeDocuments(remoteResumes.documents);
        } catch (error) {
          if (error instanceof Error && error.message === "AUTH_REQUIRED") {
            setCurrentUser(null);
            beginSignOut();
            return;
          }
          setCurrentUser(user);
          notify("Account data could not be loaded");
        }
      })
      .catch(() => {
        setCurrentUser(null);
        notify("Account data could not be loaded");
      })
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
          (entry) => Number(entry.jobId) === Number(item.id),
        );
        return {
          ...item,
          applicationId: application?.id,
          jobExternalId: application?.jobExternalId || String(item.id),
          applicationStatus: application?.status,
          applicationError: application?.lastSubmissionError,
          applicationUpdatedAt: application?.updatedAt,
          submissionQueuedAt: application?.submissionQueuedAt,
          requiredQuestions: application?.requiredQuestions,
          applicationAnswers: application?.answers,
          sourceUrl: application?.sourceUrl || item.sourceUrl,
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
  if (routePath === "/login") return <AuthPage signedIn={Boolean(currentUser)} />;
  if (!currentUser) return <LandingPage signedIn={false} />;

  const displayName = [profile.firstName, profile.lastName].filter(Boolean).join(" ") || currentUser.userDetails || "Signed in";
  const avatarInitials = (
    `${profile.firstName?.[0] || ""}${profile.lastName?.[0] || ""}`
    || (currentUser.userDetails?.includes("@") ? currentUser.userDetails[0] : currentUser.userDetails?.[0])
    || "U"
  ).toUpperCase();
  const avatarImage = profile.photoUrl ? { src: profile.photoUrl } : undefined;
  const persistPhoto = async (photoUrl: string) => {
    const next = { ...profile, photoUrl };
    setProfile(next);
    saveProfile(next);
    setPhotoBusy(true);
    try {
      const result = await putRemoteProfile(next);
      const normalized = { ...emptyProfile, ...result.profile };
      setProfile(normalized);
      saveProfile(normalized);
      notify(photoUrl ? "Profile photo updated" : "Profile photo removed");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not save photo");
    } finally {
      setPhotoBusy(false);
    }
  };
  const onPickPhoto = async (file: File | null | undefined) => {
    if (!file) return;
    setPhotoBusy(true);
    try {
      const dataUrl = await readImageAsAvatarDataUrl(file);
      await persistPhoto(dataUrl);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not read photo");
      setPhotoBusy(false);
    }
  };
  const onNavSelect = (_event: Event | React.SyntheticEvent, data: OnNavItemSelectData) => {
    if (data.value) setPage(String(data.value) as Page);
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1050px)").matches) {
      setNavOpen(false);
    }
  };

  return (
    <div className={`sa-shell ${navOpen ? "nav-expanded" : "nav-collapsed"}`}>
      <header className="sa-header">
        <Button
          appearance="transparent"
          className="sa-nav-toggle"
          icon={<Navigation24Regular />}
          aria-label={navOpen ? "Collapse navigation" : "Expand navigation"}
          onClick={() => setNavOpen((value) => !value)}
        />
        <div className="sa-logo" aria-label="ApplyPilot">
          <span><Sparkle24Filled /></span>
          <b>ApplyPilot</b>
        </div>
        <SearchBox
          className="sa-header-search"
          placeholder="Search jobs, companies, applications"
          value={headerQuery}
          onChange={(_e, data) => setHeaderQuery(data.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            setQuery(headerQuery);
            setJobPage(1);
            setPage("dashboard");
          }}
        />
        <div className="sa-header-actions">
          <Tooltip
            content="Email notifications"
            relationship="description"
            withArrow
            positioning="below"
            mountNode={typeof document !== "undefined" ? document.body : undefined}
          >
            <button
              type="button"
              className="header-icon-btn sa-header-icon"
              aria-label="Email notifications"
              onClick={() => setPage("inbox")}
            >
              <span className="header-bell">
                <Alert24Regular />
                {unreadMailCount > 0 ? <CounterBadge count={unreadMailCount} size="small" appearance="filled" color="danger" /> : null}
              </span>
            </button>
          </Tooltip>
          <Tooltip
            content="Product tour"
            relationship="description"
            withArrow
            positioning="below"
            mountNode={typeof document !== "undefined" ? document.body : undefined}
          >
            <button
              type="button"
              className="header-icon-btn sa-header-icon"
              aria-label="Product tour"
              onClick={() => window.dispatchEvent(new Event("applypilot:start-tour"))}
            >
              <QuestionCircle24Regular />
            </button>
          </Tooltip>
          <button
            type="button"
            className="header-profile-btn sa-header-icon"
            aria-label="Open profile"
            onClick={() => setProfileOpen(true)}
          >
            <Avatar name={displayName} initials={avatarInitials} image={avatarImage} color="colorful" size={32} />
          </button>
        </div>
      </header>

      <div className="sa-body">
        {navOpen && compactShell ? (
          <button
            type="button"
            className="sa-nav-backdrop"
            aria-label="Close navigation"
            onClick={() => setNavOpen(false)}
          />
        ) : null}
        <NavDrawer
          open
          type="inline"
          selectedValue={page}
          onNavItemSelect={onNavSelect}
          className="sa-nav"
        >
          <NavDrawerBody>
            <NavSectionHeader>OPERATIONS</NavSectionHeader>
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
            <NavSectionHeader>CANDIDATE</NavSectionHeader>
            <NavItem value="resume" icon={<Document24Regular />}>Résumé</NavItem>
            <NavItem value="profile" icon={<Person24Regular />}>Profile</NavItem>
            <NavItem value="preferences" icon={<Options24Regular />}>Preferences</NavItem>
            <NavSectionHeader>ACCOUNT</NavSectionHeader>
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
          <ProductTour page={page} setPage={setPage} />
          <main className="sa-main">
            <div className="page-chrome">
              <div className="page-chrome-heading">
                <h1>{pageTitles[page]}</h1>
                <p>{pageSubtitles[page]}</p>
              </div>
            </div>
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
            mobileDetailOpen={mobileDetailOpen}
            setMobileDetailOpen={setMobileDetailOpen}
            openApplications={(applicationId) => {
              setMobileDetailOpen(false);
              if (applicationId) setFocusedApplicationId(applicationId);
              setPage("applications");
            }}
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
            dismiss={(job) => {
              void dismissJob(job);
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
            save={async (nextProfile) => {
              try {
                const result = await putRemoteProfile(nextProfile ?? profile);
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
        {page === "auth" && <AuthPage signedIn />}
        </main>
        {toast && (
          <div className="toast">
            <CheckmarkCircle24Regular />
            {toast}
          </div>
        )}
        </div>
      </div>

      <OverlayDrawer
        position="end"
        size="medium"
        modalType="non-modal"
        open={profileOpen}
        onOpenChange={(_e, data) => setProfileOpen(data.open)}
        className="sa-profile-drawer"
      >
        <DrawerHeader>
          <DrawerHeaderTitle
            action={
              <Button
                appearance="subtle"
                aria-label="Close"
                icon={<Dismiss24Regular />}
                onClick={() => setProfileOpen(false)}
              />
            }
          >
            Profile
          </DrawerHeaderTitle>
        </DrawerHeader>
        <DrawerBody>
          <div className="sa-profile-drawer-body">
            <div className="sa-profile-drawer-user">
              <div className="sa-profile-photo">
                <Avatar name={displayName} initials={avatarInitials} image={avatarImage} color="colorful" size={72} />
                <label className="sa-profile-photo-btn">
                  <Camera24Regular />
                  <span>{photoBusy ? "Saving…" : profile.photoUrl ? "Change photo" : "Upload photo"}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={photoBusy}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      void onPickPhoto(file);
                    }}
                  />
                </label>
                {profile.photoUrl ? (
                  <button
                    type="button"
                    className="sa-profile-photo-remove"
                    disabled={photoBusy}
                    onClick={() => void persistPhoto("")}
                  >
                    Remove photo
                  </button>
                ) : null}
              </div>
              <div>
                <b>{displayName}</b>
                <span>{currentUser.userDetails || currentUser.userId}</span>
              </div>
            </div>
            <div className="sa-profile-drawer-actions">
              <Button appearance="subtle" icon={<Person24Regular />} onClick={() => { setProfileOpen(false); setPage("profile"); }}>
                Edit profile
              </Button>
              <Button appearance="subtle" icon={<Settings24Regular />} onClick={() => { setProfileOpen(false); setPage("settings"); }}>
                Settings
              </Button>
              <Button appearance="subtle" icon={<SignOut24Regular />} onClick={() => { void beginSignOut(); }}>
                Sign out
              </Button>
            </div>
          </div>
        </DrawerBody>
      </OverlayDrawer>
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
  mobileDetailOpen: boolean;
  setMobileDetailOpen: (open: boolean) => void;
  openApplications: (applicationId?: string) => void;
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
  dismiss: (job: Job) => void;
  apply: (j: Job) => Promise<void>;
  resolve: (id: string, answers: Record<string, string>) => Promise<void>;
  requeue: (id: string) => Promise<void>;
  profile: Profile;
}) {
  return (
    <div className="dash">
      <Toolbar className="page-command-bar">
        <ToolbarButton
          appearance="primary"
          className="sa-cmd-primary"
          icon={<ArrowClockwise24Regular />}
          onClick={p.retry}
        >
          Refresh
        </ToolbarButton>
        <span className={`feed toolbar-feed ${p.feedState}`}>
          {p.feedState === "live"
            ? "Live API data"
            : p.feedState === "loading"
              ? "Loading current jobs…"
              : "API unavailable"}
        </span>
      </Toolbar>
      <div className="metric-row">
        <Metric
          n={String(p.allJobs.filter((job) => job.status === "queued").length)}
          label="Queued"
          color="brand"
          active={p.status === "queued"}
          onClick={() => p.setStatus(p.status === "queued" ? "all" : "queued")}
        />
        <Metric
          n={String(p.allJobs.filter((job) => job.status === "ready").length)}
          label="Not applied"
          color="brand"
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
          {p.visible.map((j, index) => (
            <JobRow
              key={j.id}
              j={j}
              index={(p.page - 1) * 10 + index + 1}
              active={p.selected === j.id}
              click={() => {
                p.setSelected(j.id);
                p.setMobileDetailOpen(true);
              }}
              dismiss={p.dismiss}
              apply={p.apply}
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
        {p.job && (
          <JobDetail
            job={p.job}
            dismiss={p.dismiss}
            apply={p.apply}
            resolve={p.resolve}
            requeue={p.requeue}
            profile={p.profile}
            mobileOpen={p.mobileDetailOpen}
            onMobileClose={() => p.setMobileDetailOpen(false)}
            onOpenApplications={() => p.openApplications(p.job?.applicationId)}
          />
        )}
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
function failureHint(job: Job) {
  const questions = job.requiredQuestions || [];
  const answers = job.applicationAnswers || {};
  if (questions.length) {
    const ready = questions.every((question) => {
      const key = String(question.key || "");
      if (String(answers[key] || "").trim()) return true;
      const base = key.replace(/__(?:g)?\d+(?:_\d+)?$/i, "");
      if (base && String(answers[base] || "").trim()) return true;
      const label = String(question.label || "").toLowerCase();
      if ((/\bphone\b|\bmobile\b|\btel\b/.test(label)) && String(answers.phone || "").trim()) return true;
      if (/\bcity\b/.test(label) && String(answers.city || "").trim()) return true;
      if (/\bcountry\b/.test(label) && String(answers.country || "").trim()) return true;
      if (/\blocation\b/.test(label) && (String(answers.location || "").trim() || String(answers.city || "").trim())) return true;
      return false;
    });
    if (ready) return "Answers ready — open to save and retry.";
    return job.applicationError || "Open to answer employer questions and retry.";
  }
  return job.applicationError || "Submission failed. Tap to answer questions and retry.";
}

function JobRow({
  j,
  index,
  active,
  click,
  dismiss,
  apply,
}: {
  j: Job;
  index: number;
  active: boolean;
  click: () => void;
  dismiss: (job: Job) => void;
  apply: (job: Job) => Promise<void>;
}) {
  const [applying, setApplying] = useState(false);
  const statusLabel = j.status === "applied"
    ? "Applied"
    : j.status === "queued"
      ? (j.applicationStatus === "processing" ? "Submitting" : "Queued")
      : j.status === "failed"
        ? "Needs attention"
        : "Auto-Apply Ready";
  const workplaceLabel = j.remote ? "Remote" : "On-site";
  return (
    <article className={`job-card ${active ? "active" : ""} ${j.status}`}>
      <button type="button" className="job-card-main" onClick={click}>
        <div className="job-card-top">
          <span className="job-card-index">#{index} · Job Match</span>
          <span className={`job-card-match ${j.match > 88 ? "great" : ""}`}>{j.match}% Match</span>
        </div>
        <div className="job-card-company">
          <CompanyLogo job={j} />
          <div className="job-card-heading">
            <strong>{j.company}</strong>
            <b>{j.title}</b>
            <em className={`job-card-status ${j.status}`}>
              {j.status === "ready" && <Sparkle24Filled />}
              {j.status === "applied" && <Checkmark24Regular />}
              {j.status === "queued" && <Clock24Regular />}
              {j.status === "failed" && <ErrorCircle24Regular />}
              {statusLabel}
            </em>
          </div>
        </div>
        <div className="job-card-tags">
          <i className={j.remote ? "tag-remote" : "tag-onsite"}>
            {j.remote ? <Home24Regular /> : <Building24Regular />}
            {workplaceLabel}
          </i>
          {j.posted && (
            <i className="tag-date">
              <CalendarLtr24Regular />
              {j.posted}
            </i>
          )}
          {j.level && (
            <i className="tag-level">
              <DataBarVertical24Regular />
              {j.level}
            </i>
          )}
          {j.salary && (
            <i className="tag-salary">{j.salary}</i>
          )}
          {j.source && <i className="tag-source">{j.source}</i>}
        </div>
        <p className="job-card-location">
          <Location24Regular />
          {j.location || "Location not listed"}
        </p>
        {j.status === "failed" && (
          <p className="job-error">
            <ErrorCircle24Regular />
            {failureHint(j)}
          </p>
        )}
      </button>
      <div className="job-card-actions">
        <button type="button" onClick={click}>
          <Document24Regular />
          Job details
        </button>
        <button
          type="button"
          className="job-card-apply"
          disabled={applying}
          onClick={async (event) => {
            event.stopPropagation();
            if (j.status !== "ready") {
              click();
              return;
            }
            setApplying(true);
            try {
              await apply(j);
            } finally {
              setApplying(false);
            }
          }}
        >
          <CheckmarkCircle24Regular />
          {j.status === "ready"
            ? (applying ? "Applying…" : "Apply")
            : j.status === "failed"
              ? "Fix & retry"
              : j.status === "queued"
                ? "View queue"
                : "View"}
        </button>
        <button
          type="button"
          className="job-card-dismiss"
          onClick={(event) => {
            event.stopPropagation();
            dismiss(j);
          }}
        >
          <Dismiss24Regular />
          Not interested
        </button>
      </div>
    </article>
  );
}
function JobDetail({
  job,
  dismiss,
  apply,
  resolve,
  requeue,
  profile,
  mobileOpen = false,
  onMobileClose,
  onOpenApplications,
}: {
  job: Job;
  dismiss: (job: Job) => void;
  apply: (j: Job) => Promise<void>;
  resolve: (id: string, answers: Record<string, string>) => Promise<void>;
  requeue: (id: string) => Promise<void>;
  profile: Profile;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  onOpenApplications?: () => void;
}) {
  const [applying, setApplying] = useState(false);
  const [requeuing, setRequeuing] = useState(false);
  const failedApplication = job.status === "failed" && job.applicationId
    ? {
        id: job.applicationId,
        jobId: job.id,
        jobExternalId: job.jobExternalId,
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
    <section className={`job-detail ${mobileOpen ? "mobile-open" : ""}`}>
      <div className="mobile-detail-bar">
        <button type="button" className="mobile-detail-back" onClick={onMobileClose}>
          <ChevronLeft24Regular /> Back to matches
        </button>
        {job.applicationId && onOpenApplications ? (
          <button type="button" className="mobile-detail-apps" onClick={onOpenApplications}>
            Applications
          </button>
        ) : null}
      </div>
      <div className="detail-top">
        <CompanyLogo job={job} className="big-logo" />
        <div>
          <h2>{job.title}</h2>
          <p>
            {job.company} · {job.location}
          </p>
        </div>
        <button className="icon-btn" type="button" aria-label="Close detail" onClick={onMobileClose || (() => dismiss(job))}>
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
              <>
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
                <EmployerApplicationChrome
                  sourceUrl={job.sourceUrl}
                  company={job.company}
                  source={job.source}
                  jobExternalId={job.jobExternalId}
                  applicationId={job.applicationId}
                />
              </>
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
            {job.applicationId && (
              <>
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
                <EmployerApplicationChrome
                  sourceUrl={job.sourceUrl}
                  company={job.company}
                  source={job.source}
                  jobExternalId={job.jobExternalId}
                  applicationId={job.applicationId}
                />
              </>
            )}
          </div>
        </div>
      )}
      {failedApplication && (
        <div className="submission-banner failed">
          <ErrorCircle24Regular />
          <div>
            <b>Action needed</b>
            <p>{job.applicationError || "Answer the questions below, or retry the queue to try again."}</p>
            {job.applicationId && (
              <>
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
                <EmployerApplicationChrome
                  sourceUrl={job.sourceUrl}
                  company={job.company}
                  source={job.source}
                  jobExternalId={job.jobExternalId}
                  applicationId={job.applicationId}
                />
              </>
            )}
          </div>
        </div>
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
        <button className="not" onClick={() => dismiss(job)}>
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
      {failedApplication && (
        <ApplicationQuestions application={failedApplication} resolve={resolve} profile={profile} />
      )}
      <div className="detail-footer">
        <EmployerApplicationChrome
          sourceUrl={job.sourceUrl}
          company={job.company}
          source={job.source}
          jobExternalId={job.jobExternalId}
          applicationId={job.applicationId}
        />
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
        <p className="safe-note">
          <Checkmark24Regular /> One click queues the application; a background worker fills and submits the employer form
        </p>
      </div>
    </section>
  );
}

function EmployerApplicationChrome({
  sourceUrl,
  company,
  source,
  jobExternalId,
  applicationId,
}: {
  sourceUrl?: string;
  company?: string;
  source?: string;
  jobExternalId?: string;
  applicationId?: string;
}) {
  const employerUrl = resolveEmployerApplicationUrl({ sourceUrl, company, source, jobExternalId });
  if (!employerUrl && !jobExternalId && !applicationId) return null;
  return (
    <div className="employer-app-chrome">
      {employerUrl && (
        <a className="source-link" href={employerUrl} target="_blank" rel="noreferrer">
          View employer application
        </a>
      )}
      <div className="employer-app-ids">
        {jobExternalId && <span>Employer job ID: {jobExternalId}</span>}
        {applicationId && <span>Application ID: {applicationId}</span>}
      </div>
    </div>
  );
}

function parseStoredMultiselect(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return [] as string[];
  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((item) => String(item || "").trim()).filter(Boolean);
    } catch { /* ignore */ }
  }
  return raw.split(/[,;\n|]+/).map((item) => item.trim()).filter(Boolean);
}

function serializeMultiselect(values: string[]) {
  return values.join(", ");
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
  const [appTab, setAppTab] = useState<"all" | "action">("all");
  useEffect(() => {
    if (!focusedApplicationId) return;
    document.getElementById(`application-${focusedApplicationId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusedApplicationId]);

  const visibleApps = appTab === "action"
    ? applications.filter((item) => ["failed", "needs_action", "review"].includes(item.status))
    : applications;

  return (
    <div className="basic-page">
      <TabList
        className="page-tabs"
        selectedValue={appTab}
        onTabSelect={(_e, data) => setAppTab(String(data.value) as "all" | "action")}
      >
        <Tab value="all">All applications</Tab>
        <Tab value="action">Needs action</Tab>
      </TabList>
      <Toolbar className="page-command-bar">
        <ToolbarButton appearance="primary" className="sa-cmd-primary" icon={<Briefcase24Regular />} onClick={() => setAppTab("action")}>
          Needs action
        </ToolbarButton>
        <ToolbarButton icon={<ArrowClockwise24Regular />} onClick={() => window.location.reload()}>
          Refresh
        </ToolbarButton>
      </Toolbar>
      <div className="table-card">
        <div className="table-head">
          <span>ROLE</span>
          <span>STATUS</span>
          <span>DATE</span>
        </div>
        {visibleApps.length === 0 && (
          <div className="no-results">
            <Briefcase24Regular />
            <b>{appTab === "action" ? "No applications need action" : "No applications in progress"}</b>
            <span>Choose Simple Apply on a job match to queue submission.</span>
          </div>
        )}
        {visibleApps.map((application) => (
          <div id={`application-${application.id}`} className={`table-row application-row ${focusedApplicationId === application.id ? "focused" : ""}`} key={application.id}>
            <div>
              <CompanyLogo job={{ company: application.company, sourceUrl: application.sourceUrl }} />
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
                    <>
                      <button onClick={() => void requeue(application.id)}>Retry queue</button>
                      <EmployerApplicationChrome
                        sourceUrl={application.sourceUrl}
                        company={application.company}
                        source={application.source}
                        jobExternalId={application.jobExternalId}
                        applicationId={application.id}
                      />
                    </>
                  )}
                </div>
              )}
              {(application.status === "needs_action" || application.status === "failed") && (
                <div className="queued-message">
                  <span>{application.lastSubmissionError || "Submission needs attention."}</span>
                  <button onClick={() => void requeue(application.id)}>Retry queue</button>
                  <EmployerApplicationChrome
                    sourceUrl={application.sourceUrl}
                    company={application.company}
                    source={application.source}
                    jobExternalId={application.jobExternalId}
                    applicationId={application.id}
                  />
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

function profileAnswerForLabel(label: string, profile: Profile, options?: string[]) {
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
  if (/\bcity\b/.test(text)) {
    if (/\blocation\b/.test(text)) {
      return formatLocationAnswer("", profile);
    }
    return profile.city;
  }
  if (/\bstate\b|\bprovince\b/.test(text)) return profile.state;
  if (/\bpostal\b|\bzip\b/.test(text)) return profile.postalCode;
  if (/\baddress\b/.test(text)) return profile.address || [profile.city, profile.state, profile.postalCode].filter(Boolean).join(", ");
  // Authorization/sponsorship before location: Stripe asks about work rights
  // "in the location(s) you selected", which must not match as a city/location field.
  if (/\bwork authorization\b|\bauthorized to work\b|\blegally authorized\b|\beligible to work\b/.test(text)) return profile.workAuthorization;
  if (/\bsponsor|\bvisa\b|\bwork permit\b/.test(text)) return profile.sponsorship;
  // Remote-intent before location: do not fill city for "work remotely" / hybrid questions.
  if (/\bwork remotely\b|\bplan to work remotely\b|\bremote (work|role|option)\b|\bhybrid\b/.test(text)) {
    const prefs = [profile.preferredLocations, profile.location, profile.employmentTypes]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (/\bremote\b/.test(prefs)) return "Yes";
    if (/\bon.?site\b|\bin.?office\b/.test(prefs)) return "No";
    return "";
  }
  if (/\blocation\b|\bwork from\b/.test(text) && !/\bremot(e|ely)\b|\bhybrid\b/.test(text)) {
    return formatLocationAnswer("", profile);
  }
  if (/\bschool\b|\buniversity\b|\bcollege\b|\balma mater\b/.test(text)) return profile.school;
  if (/\b(current |most recent |previous |last )?(employer|company name)\b|\bcompany\b/.test(text) && !/\bcompanies to exclude\b/.test(text)) {
    return profile.currentEmployer;
  }
  if (/\b(current |most recent |previous |last )?(job )?title\b|\bposition title\b/.test(text)) return profile.currentJobTitle;
  if (/\beducation\b|\bdegree\b|\bhighest (level|education)\b/.test(text)) return profile.educationLevel;
  if (/\bskills?\b|\btechnologies\b|\btech stack\b/.test(text)) return profile.skills;
  if (/\byears? of experience\b|\bexperience level\b/.test(text)) return profile.experienceLevel;
  if (/\bsalary\b|\bcompensation\b|\bexpected pay\b/.test(text)) return profile.minSalary;
  if (/\bemployment type\b|\bfull.?time|part.?time|contract\b/.test(text)) return profile.employmentTypes;
  if (/\blanguage\b/.test(text)) return profile.preferredLanguages;
  if (/\bcover letter\b|\bwhy (do you want|are you interested)|about yourself\b|\bsummary\b|\badditional (information|info)\b/.test(text)) {
    return profile.additionalInfo || profile.summary || profile.headline || "";
  }
  if (options?.length) {
    const tokens = [profile.country, profile.location, profile.preferredLocations, profile.city]
      .flatMap((value) => String(value || "").split(/[,;|/]+/))
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    const selected = options.filter((option) => {
      const optionText = option.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      const compact = optionText.replace(/\s+/g, "");
      return tokens.some((token) => {
        const needle = token.replace(/[^a-z0-9]+/g, " ").trim();
        const needleCompact = needle.replace(/\s+/g, "");
        if (!needle) return false;
        if (optionText === needle || compact === needleCompact) return true;
        if (needle.length >= 4 && (optionText.includes(needle) || needle.includes(optionText))) return true;
        if (needle === "us" || needle === "usa") return /\bunited states\b|\busa\b/.test(optionText);
        return false;
      });
    });
    if (selected.length) return serializeMultiselect(selected);
  }
  return "";
}

function isUselessQuestionLabel(label: string) {
  return isUselessQuestionLabelHelper(label);
}

function displayQuestionLabel(question: { key: string; label: string }, index: number) {
  const raw = String(question.label || "").replace(/\s+/g, " ").trim();
  const cleaned = raw
    .replace(/^\*+\s*/, "")
    .replace(/\s*\*+$/, "")
    .replace(/\(\s*required\s*\)/gi, "")
    .replace(/\brequired\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned && !isUselessQuestionLabel(cleaned)) return cleaned;
  const key = String(question.key || "");
  const leaf = key.includes("[")
    ? (key.match(/\[([^\]]+)\]/g) || []).map((part) => part.slice(1, -1)).filter(Boolean).pop() || key
    : key.replace(/__(?:g)?\d+(?:_\d+)?$/i, "").split(/[./#]/).pop() || key;
  const humanized = leaf
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (humanized && !isUselessQuestionLabel(humanized)) {
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
  const questions = useMemo(() => {
    const list = dedupeEmployerQuestions(application.requiredQuestions || []);
    const used = new Set<string>();
    return list.map((question, index) => {
      let key = String(question.key || `question_${index + 1}`);
      if (!key.includes("__")) key = `${key}__${index}`;
      if (used.has(key)) key = `${key.replace(/__\d+$/, "")}__${index}_${used.size}`;
      used.add(key);
      const prior = String(question.key || "");
      return {
        ...question,
        key,
        priorKeys: priorAnswerKeys(prior, key),
        label: displayQuestionLabel(question, index),
      };
    });
  }, [application.requiredQuestions]);
  const answersSignature = JSON.stringify(application.answers || {});
  const questionsSignature = JSON.stringify(
    questions.map((question) => [question.key, question.label, question.type, question.options || []]),
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
    school: profile.school,
    currentEmployer: profile.currentEmployer,
    currentJobTitle: profile.currentJobTitle,
    educationLevel: profile.educationLevel,
    location: profile.location,
    preferredLocations: profile.preferredLocations,
    employmentTypes: profile.employmentTypes,
  });
  const seedAnswers = useMemo(() => {
    const next: Record<string, string> = {};
    const stored = application.answers || {};
    for (const question of questions) {
      const fromStored = lookupStoredAnswer(stored, question.priorKeys);
      const raw = fromStored || profileAnswerForLabel(question.label, profile, question.options) || "";
      if (!raw) continue;
      next[question.key] = coerceQuestionAnswer(question, raw, profile);
    }
    return next;
    // Signatures keep seed stable across poll-driven object identity churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [application.id, answersSignature, questionsSignature, profileSignature]);
  const seedDialCountries = useMemo(() => {
    const next: Record<string, string> = {};
    const storedCountry = String(application.answers?.country || profile.country || "").trim();
    for (const question of questions) {
      if (resolveQuestionInputType(question) !== "phone") continue;
      next[question.key] = matchPhoneDialCountry(storedCountry);
    }
    return next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [application.id, answersSignature, questionsSignature, profileSignature]);
  const seedKey = `${application.id}|${answersSignature}|${questionsSignature}|${profileSignature}`;
  const [answers, setAnswers] = useState(seedAnswers);
  const [phoneDialCountries, setPhoneDialCountries] = useState(seedDialCountries);
  const [appliedSeedKey, setAppliedSeedKey] = useState(seedKey);
  const [saving, setSaving] = useState(false);
  // Reseed when the worker/profile signatures change (React: adjust state during render).
  if (appliedSeedKey !== seedKey) {
    setAppliedSeedKey(seedKey);
    setAnswers(seedAnswers);
    setPhoneDialCountries(seedDialCountries);
  }

  if (!questions.length) {
    return (
      <div className="action-required">
        <b>Action required</b>
        <p>{application.lastSubmissionError || "The employer application needs manual review."}</p>
        <div className="action-required-buttons">
          <button className="apply" onClick={() => void resolve(application.id, {})}>Retry with browser worker</button>
          <EmployerApplicationChrome
            sourceUrl={application.sourceUrl}
            company={application.company}
            source={application.source}
            jobExternalId={application.jobExternalId}
            applicationId={application.id}
          />
        </div>
      </div>
    );
  }

  const blocking = questions.some((question) => question.type === "blocking");
  const answeredCount = questions.filter((question) => isQuestionAnswered(question, answers)).length;
  const setAnswer = (key: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  };
  const toggleMultiselect = (key: string, option: string, checked: boolean) => {
    const current = parseStoredMultiselect(answers[key] || "");
    const next = checked
      ? [...new Set([...current, option])]
      : current.filter((item) => item !== option);
    setAnswer(key, serializeMultiselect(next));
  };

  return (
    <form
      className="action-required"
      onSubmit={async (event) => {
        event.preventDefault();
        if (blocking) return;
        setSaving(true);
        try {
          const coerced: Record<string, string> = {};
          for (const question of questions) {
            const value = coerceQuestionAnswer(question, answers[question.key] || "", profile);
            if (value) coerced[question.key] = value;
            // Also persist under the original worker key base so index shifts still resolve.
            const original = String(question.priorKeys[0] || question.key);
            if (original && original !== question.key && value) coerced[original] = value;
            const base = original.replace(/__(?:g)?\d+(?:_\d+)?$/i, "");
            if (base && value) coerced[base] = value;
            if (resolveQuestionInputType(question) === "phone" && phoneDialCountries[question.key]) {
              coerced.country = phoneDialCountries[question.key];
            }
            if (resolveQuestionInputType(question) === "autocomplete" && value) {
              coerced.city = value.split(",")[0]?.trim() || value;
              coerced.location = value;
            }
          }
          await resolve(application.id, coerced);
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className="action-required-head">
        <b>Employer questions ({questions.length})</b>
        <small>{answeredCount} of {questions.length} filled · Profile values prefilled where possible</small>
      </div>
      <EmployerApplicationChrome
        sourceUrl={application.sourceUrl}
        company={application.company}
        source={application.source}
        jobExternalId={application.jobExternalId}
        applicationId={application.id}
      />
      <p>
        {answeredCount >= questions.length
          ? "Answers look complete. Click Save answers and retry to re-queue submission."
          : (application.lastSubmissionError || "Fill the required fields below, then save to retry.")}
      </p>
      <div className="action-required-fields">
        {questions.map((question, index) => {
          const inputType = resolveQuestionInputType(question);
          const selectOptions = (question.options || []).filter((option) => String(option).trim().length > 0);
          const selectedOptions = parseStoredMultiselect(answers[question.key] || "");
          const selectValue = inputType === "select"
            ? (matchSelectOption(selectOptions, answers[question.key] || "") || "")
            : (answers[question.key] || "");
          const locationSuggestion = formatLocationAnswer("", profile);
          const locationOptions = [...new Set([
            answers[question.key] || "",
            locationSuggestion,
            formatLocationAnswer(profile.city || "", profile),
          ].filter(Boolean))];
          return (
          <div
            key={question.key}
            className={
              inputType === "multiselect"
                ? "action-field multiselect-field"
                : inputType === "phone"
                  ? "action-field phone-field"
                  : inputType === "autocomplete"
                    ? "action-field autocomplete-field"
                    : "action-field"
            }
          >
            <span className="action-field-label">{question.label || `Question ${index + 1}`}</span>
            {inputType === "blocking" ? (
              <a href={resolveEmployerApplicationUrl({
                sourceUrl: application.sourceUrl,
                company: application.company,
                source: application.source,
                jobExternalId: application.jobExternalId,
              }) || application.sourceUrl} target="_blank" rel="noreferrer">Open employer application</a>
            ) : inputType === "multiselect" ? (
              <div className="multiselect-options">
                {selectOptions.map((option, optionIndex) => (
                  <label key={`${question.key}::${optionIndex}::${option}`} className="multiselect-option">
                    <input
                      type="checkbox"
                      checked={selectedOptions.includes(option)}
                      onChange={(event) => toggleMultiselect(question.key, option, event.target.checked)}
                    />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
            ) : inputType === "select" ? (
              <select
                required={question.required !== false}
                value={selectValue}
                onChange={(event) => setAnswer(question.key, event.target.value)}
              >
                <option value="">Select an answer</option>
                {selectOptions.map((option, optionIndex) => (
                  <option key={`${question.key}::${optionIndex}::${option}`} value={option}>{option}</option>
                ))}
              </select>
            ) : inputType === "checkbox" ? (
              <select
                required={question.required !== false}
                value={matchSelectOption(["yes", "no"], answers[question.key] || "") || answers[question.key] || ""}
                onChange={(event) => setAnswer(question.key, event.target.value)}
              >
                <option value="">Select an answer</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            ) : inputType === "textarea" ? (
              <textarea
                required={question.required !== false}
                value={answers[question.key] || ""}
                onChange={(event) => setAnswer(question.key, event.target.value)}
              />
            ) : inputType === "autocomplete" ? (
              <>
                <input
                  list={`location-options-${index}`}
                  required={question.required !== false}
                  value={answers[question.key] || ""}
                  onChange={(event) => setAnswer(question.key, event.target.value)}
                  placeholder={(question as { placeholder?: string }).placeholder || "e.g. Redmond, Washington, United States"}
                  autoComplete="off"
                />
                <datalist id={`location-options-${index}`}>
                  {locationOptions.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
                <small className="field-hint">Pick a full city match like the employer form (City, Region, Country).</small>
              </>
            ) : inputType === "phone" ? (
              <>
                <div className="phone-field-row">
                  <select
                    aria-label="Phone country"
                    value={phoneDialCountries[question.key] || matchPhoneDialCountry(profile.country)}
                    onChange={(event) => {
                      setPhoneDialCountries((prev) => ({ ...prev, [question.key]: event.target.value }));
                    }}
                  >
                    {PHONE_DIAL_OPTIONS.map((item) => (
                      <option key={`${item.country}-${item.dial}`} value={item.country}>
                        {item.country} {item.dial}
                      </option>
                    ))}
                  </select>
                  <input
                    type="tel"
                    required={question.required !== false}
                    value={answers[question.key] || ""}
                    onChange={(event) => setAnswer(question.key, event.target.value)}
                    placeholder="Phone number"
                  />
                </div>
                <small className="field-hint">Country dial code + phone, same layout as the employer application.</small>
              </>
            ) : (
              <input
                required={question.required !== false}
                value={answers[question.key] || ""}
                onChange={(event) => setAnswer(question.key, event.target.value)}
                placeholder={/\bcountry\b/i.test(question.label || "") ? "e.g. United States" : undefined}
              />
            )}
          </div>
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
      <Toolbar className="page-command-bar">
        <ToolbarButton appearance="primary" className="sa-cmd-primary" icon={<ArrowUpload24Regular />} onClick={() => document.getElementById("resume-file-input")?.click()}>
          Upload résumé
        </ToolbarButton>
      </Toolbar>
      <p>Upload, select, rename, download, and review résumé versions. Uploading never changes your profile automatically.</p>
      <div className="resume-library">
        <section className="resume-left">
          <div className="upload-card simple-card">
            <span><ArrowUpload24Regular /></span>
            <h2>Upload another résumé</h2>
            <p>PDF or DOCX, up to 4 MB · Stored privately in Azure</p>
            <label className="apply">
              {uploading ? "Uploading…" : "Choose résumé"}
              <input id="resume-file-input" type="file" accept=".pdf,.docx" hidden disabled={uploading} onChange={async (event) => {
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
      <div className="page-heading"><p>Search current opportunities using the same live feed as your dashboard.</p></div>
      <section className="simple-card search-panel">
        <h2><Search24Regular /> Search Jobs</h2>
        <label>Job title, company, or skill<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Software Engineer, React, Azure…" /></label>
        <label>Location<input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Remote, Seattle, United States…" /></label>
        <button className="orange-action" onClick={search}><Search24Regular /> Search jobs</button>
      </section>
    </div>
  );
}

function AuthPage({ signedIn }: { signedIn: boolean }) {
  const [mode, setMode] = useState<"create" | "login">("create");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
  const submitPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "create") {
        await registerWithPassword({ username, email, password });
      } else {
        await loginWithPassword({ username, password });
      }
      window.location.assign("/dashboard");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="auth-page">
      <section className="auth-card">
        <div className="auth-brand"><Sparkle24Filled /></div>
        <h1>{signedIn ? "You’re signed in" : mode === "create" ? "Create your ApplyPilot account" : "Log in to ApplyPilot"}</h1>
        <p>
          {signedIn
            ? "Continue to your dashboard, sign out, or switch accounts."
            : "Create an account with a username and password, or continue with a social provider."}
        </p>
        {signedIn && (
          <div className="landing-actions auth-session-actions">
            <a className="orange-action" href="/dashboard">Continue to dashboard</a>
            <button type="button" className="secondary-action" onClick={() => { void beginSignOut(); }}>Sign out</button>
          </div>
        )}
        {!signedIn && (
          <form className="auth-password-form" onSubmit={submitPassword}>
            <div className="auth-mode-toggle" role="tablist" aria-label="Account mode">
              <button type="button" className={mode === "create" ? "active" : ""} onClick={() => { setMode("create"); setError(""); }}>Create account</button>
              <button type="button" className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setError(""); }}>Log in</button>
            </div>
            <label>Username
              <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required minLength={3} maxLength={64} placeholder="your_name" />
            </label>
            {mode === "create" && (
              <label>Email
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required placeholder="you@example.com" />
              </label>
            )}
            <label>Password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "create" ? "new-password" : "current-password"} required minLength={8} placeholder="At least 8 characters" />
            </label>
            {error ? <p className="auth-error">{error}</p> : null}
            <button className="orange-action" type="submit" disabled={busy}>
              {busy ? "Please wait…" : mode === "create" ? "Create account" : "Log in"}
            </button>
          </form>
        )}
        <div className="auth-divider"><span>Or continue with</span></div>
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
  const step = productTourSteps[index] || productTourSteps[0];
  const finish = () => {
    try { localStorage.setItem("applypilot.tour.done", "1"); } catch { /* ignore */ }
    setOpen(false);
  };
  return createPortal(
    <div className="tour-overlay" role="dialog" aria-modal="true" aria-label="ApplyPilot walkthrough">
      <div className="tour-card">
        <small>Step {index + 1} of {productTourSteps.length}</small>
        <h2>{step.title}</h2>
        <p>{step.body}</p>
        <div className="tour-actions">
          <button type="button" className="not" onClick={finish}>Skip</button>
          {index > 0 && <button type="button" className="not" onClick={() => setIndex((value) => value - 1)}>Back</button>}
          {index < productTourSteps.length - 1 ? (
            <button type="button" className="apply" onClick={() => setIndex((value) => value + 1)}>Next</button>
          ) : (
            <button type="button" className="apply" onClick={finish}>Done</button>
          )}
        </div>
        <p className="tour-hint">You are on: <b>{pageTitles[page] || page}</b>. Restart anytime from the help icon in the top bar.</p>
      </div>
    </div>,
    document.body,
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
          {signedIn ? <a href="/dashboard" className="public-link">Dashboard</a> : null}
          <a href="/login" className="public-link">Log in</a>
          <a href="/login" className="orange-action">Create account</a>
        </nav>
      </header>
      <section className="landing-hero">
        <div>
          <span className="landing-kicker">A focused job-search workspace</span>
          <h1>Find better roles.<br /><em>Apply with confidence.</em></h1>
          <p>Bring your profile, résumé, job matches, application queue, and recruiter messages into one secure place.</p>
          <p className="landing-tagline">End-to-end job apply in one click, from match to submission.</p>
          <div className="landing-actions">
            <a className="orange-action" href="/login">Create account</a>
            <a className="secondary-action" href="/login">Log in</a>
            {signedIn ? <a className="secondary-action" href="/dashboard">Open dashboard</a> : null}
          </div>
          <small>Create an account with username and password, or sign in with Microsoft, Google, or GitHub.</small>
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
  const [stillSignedIn, setStillSignedIn] = useState(signedIn);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    ensureSignedOut()
      .then((cleared) => {
        if (!active) return;
        setStillSignedIn(!cleared);
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => { active = false; };
  }, []);

  return (
    <main className="public-shell">
      <header className="public-header">
        <a className="public-brand" href="/"><Sparkle24Filled /><b>ApplyPilot</b></a>
      </header>
      <section className="public-centered">
        <div className="logout-check"><Checkmark24Regular /></div>
        <h1>{checking ? "Signing you out…" : stillSignedIn ? "You’re still signed in" : "You’re signed out"}</h1>
        <p>
          {checking
            ? "Clearing your ApplyPilot session."
            : stillSignedIn
              ? "Your browser still has an active identity-provider session. Sign out again to finish clearing it."
              : "Your ApplyPilot session ended successfully. Your profile and applications remain safely stored."}
        </p>
        <div className="landing-actions">
          {stillSignedIn && !checking ? (
            <button type="button" className="orange-action" onClick={() => { void beginSignOut(); }}>Sign out again</button>
          ) : (
            <a className="orange-action" href="/login">Sign in again</a>
          )}
          <a className="secondary-action" href="/">Go to home page</a>
        </div>
      </section>
    </main>
  );
}

function InboxPage({ openApplication }: { openApplication: (applicationId: string) => void }) {
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [selected, setSelected] = useState<MailMessage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getMailbox().then((result) => {
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
      <div className="page-heading left"><p>Queued, submitted, failed, and recruiter follow-ups for your applications.</p></div>
      {loading ? <section className="simple-card empty-feature"><Mail24Regular /><h2>Loading mailbox…</h2></section> : error ? <section className="simple-card empty-feature"><Mail24Regular /><h2>Mailbox unavailable</h2><p>{error}</p></section> : messages.length === 0 ? <section className="simple-card empty-feature"><Mail24Regular /><h2>Your inbox is ready</h2><p>Application status updates and recruiter replies will appear here.</p></section> : (
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
    <div className="simple-page narrow-page settings-page"><section className="simple-card"><p>Manage local notification preferences.</p>{([
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
  save: (next?: Profile) => void | Promise<void>;
  hasResume: boolean;
  goResume: () => void;
}) {
  const [photoBusy, setPhotoBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedLocation, setExpandedLocation] = useState(0);
  const [titleDraft, setTitleDraft] = useState("");
  const missing = missingProfileFields(profile);
  const required = new Set<string>(REQUIRED_PROFILE_FIELDS);
  const workLocations = parseWorkLocations(profile.preferredLocations);
  const titles = parseListField(profile.targetRoles);
  const displayName = [profile.firstName, profile.lastName].filter(Boolean).join(" ") || profile.email || "You";
  const initials = (`${profile.firstName?.[0] || ""}${profile.lastName?.[0] || ""}` || displayName[0] || "U").toUpperCase();
  const canSave = missing.length === 0 && hasResume;

  useEffect(() => {
    if (String(profile.preferredLocations || "").trim()) return;
    setProfile({
      ...profile,
      preferredLocations: serializeWorkLocations([emptyWorkLocation(profile.country || "United States")]),
    });
    // Seed once when the page opens with empty work locations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patch = (partial: Partial<Profile>) => {
    const next = { ...profile, ...partial };
    if (partial.city !== undefined || partial.state !== undefined || partial.country !== undefined) {
      next.location = residenceLocationString(next);
    }
    setProfile(next);
  };

  const setWorkLocations = (cards: WorkLocationCard[]) => {
    patch({
      preferredLocations: serializeWorkLocations(cards),
    });
  };

  const updateWorkLocation = (index: number, partial: Partial<WorkLocationCard>) => {
    const cards = workLocations.length ? [...workLocations] : [emptyWorkLocation(profile.country || "United States")];
    cards[index] = { ...cards[index], ...partial };
    setWorkLocations(cards);
  };

  const addTitle = () => {
    const next = titleDraft.trim();
    if (!next) return;
    patch({ targetRoles: serializeListField([...titles, next]) });
    setTitleDraft("");
  };

  const persist = async () => {
    setSaving(true);
    try {
      const cards = workLocations.length
        ? workLocations
        : [emptyWorkLocation(profile.country || "United States")];
      const next = {
        ...profile,
        preferredLocations: serializeWorkLocations(cards),
        location: residenceLocationString(profile),
      };
      setProfile(next);
      await save(next);
    } finally {
      setSaving(false);
    }
  };

  const fieldClass = (key: keyof Profile) =>
    required.has(key) && !String(profile[key] || "").trim() ? "required-missing" : undefined;

  return (
    <div className="basic-page screenshot-profile profile-form-page">
      <div className="profile-form-intro">
        <div>
          <h2>Profile information</h2>
          <p>Update your details once — Simple Apply reuses them on every employer form.</p>
        </div>
        <button className="apply" disabled={saving || !canSave} onClick={() => void persist()}>
          {saving ? "Saving…" : "Save profile"}
        </button>
      </div>

      <div className="sa-profile-photo profile-page-photo">
        <Avatar
          name={displayName}
          initials={initials}
          image={profile.photoUrl ? { src: profile.photoUrl } : undefined}
          color="colorful"
          size={96}
        />
        <div className="sa-profile-photo-actions">
          <label className="sa-profile-photo-btn">
            <Camera24Regular />
            <span>{photoBusy ? "Processing…" : profile.photoUrl ? "Change photo" : "Upload photo"}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={photoBusy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                setPhotoBusy(true);
                void readImageAsAvatarDataUrl(file)
                  .then(async (photoUrl) => {
                    const next = { ...profile, photoUrl };
                    setProfile(next);
                    saveProfile(next);
                    try {
                      const result = await putRemoteProfile(next);
                      const normalized = { ...emptyProfile, ...result.profile };
                      setProfile(normalized);
                      saveProfile(normalized);
                    } catch {
                      /* keep local photo */
                    }
                  })
                  .catch(() => { /* ignore */ })
                  .finally(() => setPhotoBusy(false));
              }}
            />
          </label>
          {profile.photoUrl ? (
            <button
              type="button"
              className="sa-profile-photo-remove"
              disabled={photoBusy}
              onClick={() => {
                const next = { ...profile, photoUrl: "" };
                setProfile(next);
                saveProfile(next);
                void putRemoteProfile(next)
                  .then((result) => {
                    const normalized = { ...emptyProfile, ...result.profile };
                    setProfile(normalized);
                    saveProfile(normalized);
                  })
                  .catch(() => { /* ignore */ });
              }}
            >
              Remove photo
            </button>
          ) : null}
        </div>
      </div>

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

      <section className="profile-section">
        <h3>Basics</h3>
        <div className="profile-section-grid">
          <label className={fieldClass("firstName")}>
            First name *
            <input required value={profile.firstName} onChange={(e) => patch({ firstName: e.target.value })} />
          </label>
          <label className={fieldClass("lastName")}>
            Last name *
            <input required value={profile.lastName} onChange={(e) => patch({ lastName: e.target.value })} />
          </label>
          <label className={fieldClass("email")}>
            Email *
            <input required type="email" value={profile.email} readOnly={Boolean(profile.email)} onChange={(e) => patch({ email: e.target.value })} />
            {profile.email ? <small className="field-hint">Email comes from your sign-in account.</small> : null}
          </label>
          <label className={fieldClass("phone")}>
            Phone *
            <input required type="tel" value={profile.phone} onChange={(e) => patch({ phone: e.target.value })} />
          </label>
        </div>
      </section>

      <section className="profile-section">
        <h3>Current residence</h3>
        <p className="profile-section-copy">Used for Greenhouse location and phone country fields.</p>
        <div className="profile-section-grid">
          <label className={fieldClass("country")}>
            Country of residence *
            <select required value={profile.country} onChange={(e) => patch({ country: e.target.value })}>
              <option value="">Select…</option>
              {PROFILE_COUNTRIES.map((country) => <option key={country} value={country}>{country}</option>)}
              {profile.country && !(PROFILE_COUNTRIES as readonly string[]).includes(profile.country) ? (
                <option value={profile.country}>{profile.country}</option>
              ) : null}
            </select>
            <small className="field-hint">Select the country where you currently live.</small>
          </label>
          <label className={fieldClass("state")}>
            State *
            {isUnitedStates(profile.country) ? (
              <select required value={profile.state} onChange={(e) => patch({ state: e.target.value })}>
                <option value="">Select…</option>
                {US_STATES.map((state) => <option key={state} value={state}>{state}</option>)}
                {profile.state && !(US_STATES as readonly string[]).includes(profile.state) ? (
                  <option value={profile.state}>{profile.state}</option>
                ) : null}
              </select>
            ) : (
              <input required value={profile.state} onChange={(e) => patch({ state: e.target.value })} />
            )}
          </label>
          <label className={fieldClass("city")}>
            City *
            <input required value={profile.city} onChange={(e) => patch({ city: e.target.value })} />
          </label>
          <label className={fieldClass("postalCode")}>
            Postal code *
            <input required value={profile.postalCode} onChange={(e) => patch({ postalCode: e.target.value })} />
          </label>
          <label className={`span-2 ${fieldClass("address") || ""}`.trim()}>
            Address *
            <input required value={profile.address} onChange={(e) => patch({ address: e.target.value })} />
          </label>
        </div>
      </section>

      <section className="profile-section">
        <h3>Work locations *</h3>
        <p className="profile-section-copy">
          Tell us where you want to work. These preferences filter matches and answer relocation / remote questions.
        </p>
        <div className="work-location-list">
          {(workLocations.length ? workLocations : [emptyWorkLocation(profile.country || "United States")]).map((card, index) => {
            const cards = workLocations.length ? workLocations : [card];
            const open = expandedLocation === index;
            return (
              <div className={`work-location-card ${open ? "open" : ""}`} key={`wl-${index}`}>
                <div className="work-location-card-head">
                  <button type="button" className="work-location-toggle" onClick={() => setExpandedLocation(open ? -1 : index)}>
                    <span>{summarizeWorkLocation(card)}</span>
                    <ChevronDown24Regular />
                  </button>
                  {cards.length > 1 ? (
                    <button
                      type="button"
                      className="work-location-remove"
                      aria-label="Remove work location"
                      onClick={() => {
                        const next = cards.filter((_, i) => i !== index);
                        setWorkLocations(next);
                        setExpandedLocation(Math.max(0, index - 1));
                      }}
                    >
                      <Delete24Regular />
                    </button>
                  ) : null}
                </div>
                {open ? (
                  <div className="work-location-card-body">
                    <fieldset>
                      <legend>Workplace type *</legend>
                      <div className="chip-row">
                        {WORKPLACE_TYPES.map((type) => (
                          <label key={type} className={`chip ${card.workplaceTypes.includes(type) ? "on" : ""}`}>
                            <input
                              type="checkbox"
                              checked={card.workplaceTypes.includes(type)}
                              onChange={(event) => {
                                const workplaceTypes = event.target.checked
                                  ? [...new Set([...card.workplaceTypes, type])]
                                  : card.workplaceTypes.filter((item) => item !== type);
                                updateWorkLocation(index, { workplaceTypes: workplaceTypes.length ? workplaceTypes : ["Remote"] });
                              }}
                            />
                            {type}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <div className="profile-section-grid">
                      <label>
                        Country *
                        <select
                          required
                          value={card.country}
                          onChange={(e) => updateWorkLocation(index, { country: e.target.value })}
                        >
                          <option value="">Select…</option>
                          {PROFILE_COUNTRIES.map((country) => <option key={country} value={country}>{country}</option>)}
                        </select>
                      </label>
                      <label>
                        State
                        {isUnitedStates(card.country) ? (
                          <select value={card.state || ""} onChange={(e) => updateWorkLocation(index, { state: e.target.value })}>
                            <option value="">Select…</option>
                            {US_STATES.map((state) => <option key={state} value={state}>{state}</option>)}
                          </select>
                        ) : (
                          <input value={card.state || ""} onChange={(e) => updateWorkLocation(index, { state: e.target.value })} />
                        )}
                      </label>
                      <label>
                        City
                        <input value={card.city || ""} onChange={(e) => updateWorkLocation(index, { city: e.target.value })} />
                      </label>
                      <label>
                        Max search distance (miles)
                        <input
                          type="number"
                          min={0}
                          max={500}
                          value={card.radiusMiles ?? ""}
                          onChange={(e) => updateWorkLocation(index, {
                            radiusMiles: e.target.value ? Number(e.target.value) : undefined,
                          })}
                        />
                      </label>
                    </div>
                    <small className="field-hint">
                      {card.workplaceTypes.includes("Remote")
                        ? `Will look for Remote jobs anywhere in ${card.country || "selected country"}.`
                        : null}
                      {" "}
                      {(card.workplaceTypes.includes("Hybrid") || card.workplaceTypes.includes("On-site")) && card.city
                        ? `Will look for Hybrid/On-site near ${[card.city, card.state, card.country].filter(Boolean).join(", ")}.`
                        : null}
                    </small>
                  </div>
                ) : (
                  <p className="work-location-summary">{flattenWorkLocationsForWorker([card])}</p>
                )}
              </div>
            );
          })}
        </div>
        {(workLocations.length || 1) < 5 ? (
          <button
            type="button"
            className="work-location-add"
            onClick={() => {
              const base = workLocations.length ? workLocations : [emptyWorkLocation(profile.country || "United States")];
              const next = [...base, emptyWorkLocation(profile.country || "United States")];
              setWorkLocations(next);
              setExpandedLocation(next.length - 1);
            }}
          >
            <Add24Regular /> Add work location ({Math.max(workLocations.length, 1)}/5)
          </button>
        ) : null}
      </section>

      <section className="profile-section">
        <h3>Work authorization</h3>
        <p className="profile-section-copy">
          Used to answer “Are you legally authorized to work…” and sponsorship questions automatically.
        </p>
        <div className="profile-section-grid">
          <label className={fieldClass("workAuthorization")}>
            Legal to work *
            <select required value={profile.workAuthorization} onChange={(e) => patch({ workAuthorization: e.target.value })}>
              <option value="">Select…</option>
              {["Yes", "No", "US Citizen", "Green Card", "Authorized to work", "Need visa sponsorship", "Other"].map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <label className={fieldClass("sponsorship")}>
            Require sponsorship *
            <select required value={profile.sponsorship} onChange={(e) => patch({ sponsorship: e.target.value })}>
              <option value="">Select…</option>
              {["No", "Yes", "Not sure"].map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="profile-section">
        <h3>Job preferences</h3>
        <div className="profile-section-stack">
          <label className={fieldClass("targetRoles")}>
            Desired job title *
            <div className="tag-input">
              <div className="tag-list">
                {titles.map((title) => (
                  <button
                    type="button"
                    className="tag-chip"
                    key={title}
                    onClick={() => patch({ targetRoles: serializeListField(titles.filter((item) => item !== title)) })}
                  >
                    {title} ×
                  </button>
                ))}
              </div>
              <input
                value={titleDraft}
                placeholder="Enter job title(s)"
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTitle();
                  }
                }}
              />
              <button type="button" className="tag-add" onClick={addTitle}>Add</button>
            </div>
          </label>

          <fieldset className={required.has("employmentTypes") && !profile.employmentTypes.trim() ? "required-missing" : undefined}>
            <legend>Employment type preferences *</legend>
            <div className="chip-row vertical">
              {EMPLOYMENT_TYPE_OPTIONS.map((type) => (
                <label key={type} className={`chip ${listFieldHas(profile.employmentTypes, type) ? "on" : ""}`}>
                  <input
                    type="checkbox"
                    checked={listFieldHas(profile.employmentTypes, type)}
                    onChange={(e) => patch({ employmentTypes: toggleListItem(profile.employmentTypes, type, e.target.checked) })}
                  />
                  {type}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="profile-section-grid">
            <label className={fieldClass("experienceLevel")}>
              Years of experience *
              <select required value={profile.experienceLevel} onChange={(e) => patch({ experienceLevel: e.target.value })}>
                <option value="">Select…</option>
                {EXPERIENCE_YEARS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                {profile.experienceLevel && !(EXPERIENCE_YEARS_OPTIONS as readonly string[]).includes(profile.experienceLevel) ? (
                  <option value={profile.experienceLevel}>{profile.experienceLevel}</option>
                ) : null}
              </select>
            </label>
            <label className={fieldClass("minSalary")}>
              Minimum salary *
              <input required value={profile.minSalary} placeholder="e.g. 150000" onChange={(e) => patch({ minSalary: e.target.value })} />
            </label>
            <label className={fieldClass("educationLevel")}>
              Education level *
              <select required value={profile.educationLevel} onChange={(e) => patch({ educationLevel: e.target.value })}>
                <option value="">Select…</option>
                {["High school", "Associate's", "Bachelor's", "Master's", "PhD", "Other"].map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
            <label>
              School
              <input value={profile.school} onChange={(e) => patch({ school: e.target.value })} />
            </label>
          </div>
        </div>
      </section>

      <section className="profile-section">
        <h3>Additional information</h3>
        <p className="profile-section-copy">This helps match opportunities and answer employer questions.</p>
        <div className="profile-section-grid">
          <label className={fieldClass("linkedin")}>
            LinkedIn URL *
            <input required value={profile.linkedin} placeholder="https://www.linkedin.com/in/…" onChange={(e) => patch({ linkedin: e.target.value })} />
            <small className="field-hint">Required for auto-apply.</small>
          </label>
          <label>
            Companies to exclude
            <input value={profile.companiesToExclude} placeholder="Enter company names, separated by commas" onChange={(e) => patch({ companiesToExclude: e.target.value })} />
          </label>
          <label>
            Preferred languages
            <input value={profile.preferredLanguages} placeholder="e.g. English, Spanish" onChange={(e) => patch({ preferredLanguages: e.target.value })} />
          </label>
          <label>
            Skills
            <input value={profile.skills} placeholder="e.g. TypeScript, React, Azure" onChange={(e) => patch({ skills: e.target.value })} />
          </label>
          <label>
            GitHub URL
            <input value={profile.github} placeholder="https://github.com/username" onChange={(e) => patch({ github: e.target.value })} />
          </label>
          <label>
            Portfolio URL
            <input value={profile.portfolio} placeholder="https://yourportfolio.com" onChange={(e) => patch({ portfolio: e.target.value })} />
          </label>
          <label>
            Current employer
            <input value={profile.currentEmployer} onChange={(e) => patch({ currentEmployer: e.target.value })} />
          </label>
          <label>
            Current job title
            <input value={profile.currentJobTitle} onChange={(e) => patch({ currentJobTitle: e.target.value })} />
          </label>
          <label className="span-2">
            Additional information
            <textarea
              value={profile.additionalInfo}
              placeholder="Share any additional information that might help with job matches"
              onChange={(e) => patch({ additionalInfo: e.target.value })}
            />
            <small className="field-hint">Suggested cover-letter style notes for matching and application answers.</small>
          </label>
        </div>
      </section>

      <button className="apply profile-save-bottom" disabled={saving || !canSave} onClick={() => void persist()}>
        {saving ? "Saving…" : "Save profile"}
      </button>
    </div>
  );
}
