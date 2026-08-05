# Job-source research and production decision

## Selected now: employer ATS feeds

ApplyPilot reads published jobs from official employer-facing ATS endpoints and sends users back to the employer's application URL.

| Source | Freshness signal | Authentication | Current use |
| --- | --- | --- | --- |
| Greenhouse Job Board API | `updated_at` on published jobs | None for GET | Enabled for configured employer boards |
| Ashby Job Postings API | Published job metadata | None for public boards | Next adapter |
| Lever Postings API | Published postings | None for public postings | Next adapter |
| Remotive Public API | Delayed public remote-job feed | None | Enabled as remote-job fallback |
| Adzuna | Latest aggregated ads and standardized data | App ID and key | Recommended when broad-market credentials are available |

## Why Greenhouse is first

- The official GET endpoint is public and explicitly intended for rendering published jobs.
- Listings include employer URLs, location, description, and update timestamps.
- Data comes directly from the hiring company's ATS rather than page scraping.
- The configured Stripe, Cloudflare, Figma, and Airbnb boards were contract-tested on August 4, 2026.

## Production rules

1. Preserve `source`, `sourceUrl`, `externalId`, and `postedAt` for every record.
2. Link applications to the original employer/ATS listing.
3. Do not bypass access controls, CAPTCHAs, or application-site terms.
4. Cache feeds, use conditional requests when providers expose validators, and back off on errors.
5. Expire jobs not seen in subsequent successful syncs instead of presenting stale openings.
6. Add a provider only after documenting its display, attribution, and request-rate terms.

## Official documentation

- Greenhouse: https://developer.greenhouse.io/job-board.html
- Ashby: https://developers.ashbyhq.com/docs/public-job-posting-api
- Lever: https://github.com/lever/postings-api
- Adzuna: https://developer.adzuna.com/overview
- Remotive: https://github.com/remotive-io/remote-jobs-api
