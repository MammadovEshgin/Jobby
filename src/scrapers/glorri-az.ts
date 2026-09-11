import type { RawVacancy, Scraper } from "./types";
import { dedupeVacanciesByUrl } from "./dedupe";
import { fetchText } from "../utils/fetch";
import { logInfo } from "../utils/log";

const SITE_URL = "https://jobs.glorri.az";
const API_URL = "https://api.glorri.az/job-service-v2/jobs/public";
const USER_AGENT = "Mozilla/5.0 (compatible; VakansiyaBot/0.1; +https://jobs.glorri.az)";
/** The public endpoint rejects anything larger. */
const PAGE_SIZE = 18;
const PAGES = 6;

interface GlorriJob {
  title?: string;
  slug?: string;
  postedDate?: string;
  location?: string;
  company?: {
    slug?: string;
    name?: string;
  };
}

interface GlorriResponse {
  entities?: GlorriJob[];
  totalCount?: number;
}

export const glorriAzScraper: Scraper = {
  name: "jobs.glorri.az",
  async fetch(): Promise<RawVacancy[]> {
    const pages = await Promise.allSettled(
      Array.from({ length: PAGES }, (_, page) => fetchPage(page * PAGE_SIZE)),
    );
    const vacancies: RawVacancy[] = [];
    let failures = 0;

    for (const page of pages) {
      if (page.status === "fulfilled") {
        vacancies.push(...page.value);
      } else {
        failures += 1;
      }
    }

    if (failures === pages.length) {
      throw pages[0].status === "rejected" ? pages[0].reason : new Error("No jobs.glorri.az pages fetched.");
    }

    if (failures > 0) {
      logInfo("scraper_page_skipped", { site: "jobs.glorri.az", skipped: failures });
    }

    return dedupeVacanciesByUrl(vacancies);
  },
};

async function fetchPage(offset: number): Promise<RawVacancy[]> {
  const body = await fetchText(`${API_URL}?offset=${offset}&limit=${PAGE_SIZE}`, {
    timeoutMs: 10_000,
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
      "Accept-Language": "az",
    },
  });

  return parseGlorriAzVacancies(body);
}

export function parseGlorriAzVacancies(body: string): RawVacancy[] {
  let response: GlorriResponse;

  try {
    response = JSON.parse(body) as GlorriResponse;
  } catch {
    return [];
  }

  const vacancies: RawVacancy[] = [];

  for (const job of response.entities ?? []) {
    const title = cleanText(job.title);
    const company = cleanText(job.company?.name);
    const companySlug = job.company?.slug;

    if (title.length === 0 || company.length === 0 || companySlug === undefined || job.slug === undefined) {
      continue;
    }

    vacancies.push({
      title,
      company,
      location: cleanText(job.location),
      url: new URL(`/vacancies/${companySlug}/${job.slug}?isLocal=true`, SITE_URL).toString(),
      source: "jobs.glorri.az",
      postedAt: job.postedDate,
    });
  }

  return vacancies;
}

function cleanText(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}
