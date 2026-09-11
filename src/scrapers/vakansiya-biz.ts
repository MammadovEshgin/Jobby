import { parse } from "node-html-parser";

import type { RawVacancy, Scraper } from "./types";
import { dedupeVacanciesByUrl } from "./dedupe";
import { fetchListingPages, userAgent } from "./pages";
import { elementText, optionalText } from "./text";

const SOURCE = "vakansiya.biz";
const BASE_URL = "https://vakansiya.biz";
const LISTING_URLS = [
  `${BASE_URL}/az/jobs`,
  `${BASE_URL}/az/jobs?page=2`,
  `${BASE_URL}/az/jobs?page=3`,
  `${BASE_URL}/az/jobs?page=4`,
  `${BASE_URL}/az/jobs?page=5`,
];
const HEADERS = {
  "User-Agent": userAgent(BASE_URL),
  Accept: "text/html",
};
const JOB_HREF = /\/jobs\/\d+\//;

export const vakansiyaBizScraper: Scraper = {
  name: SOURCE,
  async fetch(): Promise<RawVacancy[]> {
    const pages = await fetchListingPages(SOURCE, LISTING_URLS, HEADERS);

    return dedupeVacanciesByUrl(pages.flatMap((html) => parseVakansiyaBizVacancies(html)));
  },
};

export function parseVakansiyaBizVacancies(html: string): RawVacancy[] {
  const vacancies: RawVacancy[] = [];

  for (const link of parse(html).querySelectorAll('a[href*="/jobs/"]')) {
    const href = link.getAttribute("href");

    if (href === undefined || !JOB_HREF.test(href)) {
      continue;
    }

    const title = elementText(link.querySelector("h2"));
    // The subtitle holds "Company · Location" for every card on the board.
    const [company, location] = splitSubtitle(elementText(link.querySelector("p")));

    if (title.length === 0 || company.length === 0) {
      continue;
    }

    vacancies.push({
      title,
      company,
      location,
      url: new URL(href, BASE_URL).toString(),
      source: SOURCE,
      postedAt: optionalText(link.querySelector("span")?.text),
    });
  }

  return vacancies;
}

function splitSubtitle(value: string): [string, string] {
  const separator = value.indexOf("·");

  if (separator === -1) {
    return [value, ""];
  }

  return [value.slice(0, separator).trim(), value.slice(separator + 1).trim()];
}
