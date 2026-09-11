import { parse } from "node-html-parser";

import type { RawVacancy, Scraper } from "./types";
import { dedupeVacanciesByUrl } from "./dedupe";
import { userAgent } from "./pages";
import { fetchText } from "../utils/fetch";
import { elementText, optionalText } from "./text";

const SOURCE = "vakansiya.az";
const BASE_URL = "https://vakansiya.az";
const LISTING_URL = `${BASE_URL}/az/`;
const HEADERS = {
  "User-Agent": userAgent(BASE_URL),
  Accept: "text/html",
};

export const vakansiyaAzScraper: Scraper = {
  name: SOURCE,
  async fetch(): Promise<RawVacancy[]> {
    const html = await fetchText(LISTING_URL, { timeoutMs: 10_000, headers: HEADERS });

    return dedupeVacanciesByUrl(parseVakansiyaAzVacancies(html));
  },
};

export function parseVakansiyaAzVacancies(html: string): RawVacancy[] {
  const vacancies: RawVacancy[] = [];

  // Each listing row is a table-like strip: title, company, city, salary, date.
  for (const row of parse(html).querySelectorAll(".js-bottomrow")) {
    const titleLink = row.querySelector("a.jobtitle");
    const href = titleLink?.getAttribute("href");
    const title = elementText(titleLink);
    const cells = row.querySelectorAll(".js-fields");
    const company = elementText(cells[1]);

    if (href === undefined || title.length === 0 || company.length === 0) {
      continue;
    }

    vacancies.push({
      title,
      company,
      location: elementText(cells[2]),
      url: new URL(href, BASE_URL).toString(),
      source: SOURCE,
      postedAt: optionalText(cells[4]?.text),
    });
  }

  return vacancies;
}
