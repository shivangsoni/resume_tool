export type FilterableJob = {
  title: string;
  company: string;
  location: string;
  summary: string;
  skills: string[];
  source?: string;
  remote: boolean;
  status: "ready" | "queued" | "applied" | "failed";
};

export function matchesJob(job: FilterableJob, query: string, status: string, source: string, workplace: string, location = "") {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = [job.title, job.company, job.location, job.summary, job.source || "", ...job.skills].join(" ").toLowerCase();
  return (status === "all" || job.status === status)
    && (source === "all" || job.source === source)
    && (workplace === "all" || (workplace === "remote" ? job.remote : !job.remote))
    && (!location.trim() || job.location.toLowerCase().includes(location.trim().toLowerCase()))
    && terms.every((term) => haystack.includes(term));
}

export function paginateJobs<T>(jobs: T[], page: number, pageSize = 10) {
  const pageCount = Math.max(1, Math.ceil(jobs.length / pageSize));
  const currentPage = Math.max(1, Math.min(page, pageCount));
  return { page: currentPage, pageCount, jobs: jobs.slice((currentPage - 1) * pageSize, currentPage * pageSize) };
}
