export type FilterableJob = {
  title: string;
  company: string;
  location: string;
  summary: string;
  skills: string[];
  source?: string;
  remote: boolean;
  status: "ready" | "applied" | "failed";
};

export function matchesJob(job: FilterableJob, query: string, status: string, source: string, workplace: string) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = [job.title, job.company, job.location, job.summary, job.source || "", ...job.skills].join(" ").toLowerCase();
  return (status === "all" || job.status === status)
    && (source === "all" || job.source === source)
    && (workplace === "all" || (workplace === "remote" ? job.remote : !job.remote))
    && terms.every((term) => haystack.includes(term));
}
