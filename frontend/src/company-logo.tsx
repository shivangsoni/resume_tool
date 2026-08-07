import { useState } from "react";
import { companyInitial, resolveCompanyLogoUrl } from "./company-logo-utils";

type LogoJob = {
  company: string;
  logo?: string;
  logoUrl?: string;
  sourceUrl?: string;
  sourceBoard?: string;
};

/** Company mark with image fallback to initials when the CDN/image fails. */
export function CompanyLogo({
  job,
  className = "job-logo",
}: {
  job: LogoJob;
  className?: string;
}) {
  const src = resolveCompanyLogoUrl(job);
  const initial = job.logo || companyInitial(job.company);
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return <span className={className} aria-hidden>{initial}</span>;
  }

  return (
    <span className={className} aria-hidden>
      <img
        src={src}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    </span>
  );
}
