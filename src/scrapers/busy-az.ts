import type { RawVacancy, Scraper } from "./types";
import { dedupeVacanciesByUrl } from "./dedupe";
import { parseJsonBody } from "./json";
import { fetchListingPages, userAgent } from "./pages";
import { cleanText, optionalText } from "./text";

const SOURCE = "busy.az";
const SITE_URL = "https://busy.az";
const API_URL = "https://api.busy.az/api/vacancies";
const PAGE_SIZE = 100;
const PAGES = 2;
const HEADERS = {
  "User-Agent": userAgent(SITE_URL),
  Accept: "application/json",
};

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
  name: SOURCE,
  async fetch(): Promise<RawVacancy[]> {
    const urls = Array.from(
      { length: PAGES },
      (_, index) => `${API_URL}?page=${index + 1}&per_page=${PAGE_SIZE}`,
    );
    const bodies = await fetchListingPages(SOURCE, urls, HEADERS);

    return dedupeVacanciesByUrl(bodies.flatMap((body) => parseBusyAzVacancies(body)));
  },
};

export function parseBusyAzVacancies(body: string): RawVacancy[] {
  const payload = parseJsonBody<{ vacancies?: BusyVacancy[] }>(body);
  const vacancies: RawVacancy[] = [];

  for (const item of payload?.vacancies ?? []) {
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
      source: SOURCE,
      postedAt: optionalText(item.published),
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
