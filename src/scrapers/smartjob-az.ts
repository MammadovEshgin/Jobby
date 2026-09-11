import { parse } from "node-html-parser";

import type { RawVacancy, Scraper } from "./types";
import { dedupeVacanciesByUrl } from "./dedupe";
import { FetchHttpError, fetchText } from "../utils/fetch";
import { logInfo } from "../utils/log";

const BASE_URL = "https://smartjob.az";
const LISTING_URL = `${BASE_URL}/vacancies`;
const USER_AGENT = "Mozilla/5.0 (compatible; VakansiyaBot/0.1; +https://smartjob.az)";

export const smartJobAzScraper: Scraper = {
  name: "smartjob.az",
  async fetch(): Promise<RawVacancy[]> {
    let html: string;

    try {
      html = await fetchText(LISTING_URL, {
        timeoutMs: 10_000,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html",
        },
      });
    } catch (error) {
      if (error instanceof FetchHttpError && error.status === 403) {
        logInfo("scraper_blocked", {
          site: "smartjob.az",
          url: LISTING_URL,
          status: error.status,
        });
        return [];
      }

      throw error;
    }

    return dedupeVacanciesByUrl(parseSmartJobAzVacancies(html));
  },
};

export function parseSmartJobAzVacancies(html: string): RawVacancy[] {
  const root = parse(html);
  const vacancies: RawVacancy[] = [];

  for (const card of root.querySelectorAll(".brows-job-list")) {
    const titleLink = card.querySelector(".brows-job-position h3 a");
    const href = titleLink?.getAttribute("href");
    const title = cleanText(titleLink?.text);
    const company = cleanText(card.querySelector(".company-title a")?.text);
    const location = cleanText(card.querySelector(".location-pin")?.text);
    const postedAt = cleanText(card.querySelector(".brows-job-type, .job-post-day")?.text);

    if (href === undefined || title.length === 0 || company.length === 0) {
      continue;
    }

    vacancies.push({
      title,
      company,
      location,
      url: new URL(href, BASE_URL).toString(),
      source: "smartjob.az",
      postedAt: postedAt.length === 0 ? undefined : postedAt,
    });
  }

  return vacancies;
}

function cleanText(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}
