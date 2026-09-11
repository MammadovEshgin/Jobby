import { parse } from "node-html-parser";

import type { RawVacancy, Scraper } from "./types";
import { dedupeVacanciesByUrl } from "./dedupe";
import { userAgent } from "./pages";
import { FetchHttpError, fetchText } from "../utils/fetch";
import { logInfo } from "../utils/log";
import { elementText, optionalText } from "./text";

const SOURCE = "smartjob.az";
const BASE_URL = "https://smartjob.az";
const LISTING_URL = `${BASE_URL}/vacancies`;
const HEADERS = {
  "User-Agent": userAgent(BASE_URL),
  Accept: "text/html",
};

export const smartJobAzScraper: Scraper = {
  name: SOURCE,
  async fetch(): Promise<RawVacancy[]> {
    let html: string;

    try {
      html = await fetchText(LISTING_URL, { timeoutMs: 10_000, headers: HEADERS });
    } catch (error) {
      // smartjob.az serves a 403 to anything it takes for a bot; that is an empty board, not an
      // outage, so the run carries on without it.
      if (error instanceof FetchHttpError && error.status === 403) {
        logInfo("scraper_blocked", { site: SOURCE, url: LISTING_URL, status: error.status });
        return [];
      }

      throw error;
    }

    return dedupeVacanciesByUrl(parseSmartJobAzVacancies(html));
  },
};

export function parseSmartJobAzVacancies(html: string): RawVacancy[] {
  const vacancies: RawVacancy[] = [];

  for (const card of parse(html).querySelectorAll(".brows-job-list")) {
    const titleLink = card.querySelector(".brows-job-position h3 a");
    const href = titleLink?.getAttribute("href");
    const title = elementText(titleLink);
    const company = elementText(card.querySelector(".company-title a"));

    if (href === undefined || title.length === 0 || company.length === 0) {
      continue;
    }

    vacancies.push({
      title,
      company,
      location: elementText(card.querySelector(".location-pin")),
      url: new URL(href, BASE_URL).toString(),
      source: SOURCE,
      postedAt: optionalText(card.querySelector(".brows-job-type, .job-post-day")?.text),
    });
  }

  return vacancies;
}
