import { parse } from "node-html-parser";

import type { RawVacancy, Scraper } from "./types";
import { dedupeVacanciesByUrl } from "./dedupe";
import { userAgent } from "./pages";
import { fetchText } from "../utils/fetch";
import { cleanText, elementText, optionalText } from "./text";

const SOURCE = "jobsearch.az";
const BASE_URL = "https://jobsearch.az";
const LISTING_URL = `${BASE_URL}/vacancies`;
const HEADERS = {
  "User-Agent": userAgent(BASE_URL),
  Accept: "text/html",
};

export const jobSearchAzScraper: Scraper = {
  name: SOURCE,
  async fetch(): Promise<RawVacancy[]> {
    const html = await fetchText(LISTING_URL, { timeoutMs: 10_000, headers: HEADERS });

    return parseJobSearchAzVacancies(html);
  },
};

export function parseJobSearchAzVacancies(html: string): RawVacancy[] {
  const vacancies: RawVacancy[] = [];

  for (const link of parse(html).querySelectorAll("a.list__item__text")) {
    const href = link.getAttribute("href");

    if (href === undefined || !href.startsWith("/vacancies/")) {
      continue;
    }

    const title = elementText(link.querySelector(".list__item__title"));
    // The anchor holds the title and the company with nothing between them to select on.
    const company = cleanText(cleanText(link.text).replace(title, ""));

    if (title.length === 0 || company.length === 0) {
      continue;
    }

    vacancies.push({
      title,
      company,
      location: "",
      url: new URL(href, BASE_URL).toString(),
      source: SOURCE,
      postedAt: optionalText(
        link.closest(".list__item")?.querySelector(".list__item__end .text-transform-none")?.text,
      ),
    });
  }

  return dedupeVacanciesByUrl(vacancies);
}
