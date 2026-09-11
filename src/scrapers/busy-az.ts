import type { RawVacancy, Scraper } from "./types";
import { dedupeVacanciesByUrl } from "./dedupe";
import { fetchText } from "../utils/fetch";
import { logInfo } from "../utils/log";

const SITE_URL = "https://busy.az";
const API_URL = "https://api.busy.az/api/vacancies";
const PAGE_SIZE = 100;
const PAGES = 2;
const USER_AGENT = "Mozilla/5.0 (compatible; VakansiyaBot/0.1; +https://busy.az)";

interface BusyCity {
  city?: { title?: { az?: string; en?: string; ru?: string } | string };
}

interface BusyVacancy {
  id?: number;
  job_title?: string;
  slug?: string;
  published?: string;
  company?: { title?: string } | null;
  city_rels?: BusyCity[];
}

/** busy.az renders its board in the browser; this is the API that board calls. */
export const busyAzScraper: Scraper = {
  name: "busy.az",
  async fetch(): Promise<RawVacancy[]> {
    const urls = Array.from(
      { length: PAGES },
      (_, index) => `${API_URL}?page=${index + 1}&per_page=${PAGE_SIZE}`,
    );
    const results = await Promise.allSettled(
      urls.map((url) =>
        fetchText(url, {
          timeoutMs: 10_000,
          headers: {
            "User-Agent": USER_AGENT,
            Accept: "application/json",
          },
        }),
      ),
    );
    const bodies: string[] = [];

    for (const [index, result] of results.entries()) {
      if (result.status === "fulfilled") {
        bodies.push(result.value);
        continue;
      }

      logInfo("scraper_page_skipped", {
        site: "busy.az",
        url: urls[index],
        reason: result.reason instanceof Error ? result.reason.message : "Unknown error",
      });
    }

    if (bodies.length === 0) {
      throw (
        results.find((result) => result.status === "rejected")?.reason ??
        new Error("No busy.az pages fetched.")
      );
    }

    return dedupeVacanciesByUrl(bodies.flatMap((body) => parseBusyAzVacancies(body)));
  },
};

export function parseBusyAzVacancies(body: string): RawVacancy[] {
  let payload: { vacancies?: BusyVacancy[] };

  try {
    payload = JSON.parse(body) as { vacancies?: BusyVacancy[] };
  } catch {
    return [];
  }

  const vacancies: RawVacancy[] = [];

  for (const item of payload.vacancies ?? []) {
    const title = cleanText(item.job_title);
    const company = cleanText(item.company?.title);

    if (item.id === undefined || title.length === 0 || company.length === 0) {
      continue;
    }

    vacancies.push({
      title,
      company,
      location: cityName(item.city_rels),
      url: `${SITE_URL}/vacancy/${item.id}/${item.slug ?? ""}`,
      source: "busy.az",
      postedAt: cleanText(item.published) || undefined,
    });
  }

  return vacancies;
}

function cityName(cities: BusyCity[] | undefined): string {
  const title = cities?.[0]?.city?.title;

  if (typeof title === "string") {
    return cleanText(title);
  }

  return cleanText(title?.az ?? title?.en ?? title?.ru);
}

function cleanText(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}
