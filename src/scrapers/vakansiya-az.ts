import { parse } from "node-html-parser";

import type { RawVacancy, Scraper } from "./types";
import { dedupeVacanciesByUrl } from "./dedupe";
import { fetchText } from "../utils/fetch";

const BASE_URL = "https://vakansiya.az";
const LISTING_URL = `${BASE_URL}/az/`;
const USER_AGENT = "Mozilla/5.0 (compatible; VakansiyaBot/0.1; +https://vakansiya.az)";

export const vakansiyaAzScraper: Scraper = {
  name: "vakansiya.az",
  async fetch(): Promise<RawVacancy[]> {
    const html = await fetchText(LISTING_URL, {
      timeoutMs: 10_000,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html",
      },
    });

    return dedupeVacanciesByUrl(parseVakansiyaAzVacancies(html));
  },
};

export function parseVakansiyaAzVacancies(html: string): RawVacancy[] {
  const root = parse(html);
  const vacancies: RawVacancy[] = [];

  // Each listing row is a table-like strip: title, company, city, salary, date.
  for (const row of root.querySelectorAll(".js-bottomrow")) {
    const titleLink = row.querySelector("a.jobtitle");
    const href = titleLink?.getAttribute("href");
    const title = cleanText(titleLink?.text);
    const cells = row.querySelectorAll(".js-fields");
    const company = cleanText(cells[1]?.text);
    const location = cleanText(cells[2]?.text);
    const postedAt = cleanText(cells[4]?.text);

    if (href === undefined || title.length === 0 || company.length === 0) {
      continue;
    }

    vacancies.push({
      title,
      company,
      location,
      url: new URL(href, BASE_URL).toString(),
      source: "vakansiya.az",
      postedAt: postedAt.length === 0 ? undefined : postedAt,
    });
  }

  return vacancies;
}

function cleanText(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}
