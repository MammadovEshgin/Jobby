import { parse } from "node-html-parser";

import type { RawVacancy, Scraper } from "./types";
import { dedupeVacanciesByUrl } from "./dedupe";
import { fetchListingPages, userAgent } from "./pages";
import { elementText, optionalText } from "./text";

const SOURCE = "hellojob.az";
const BASE_URL = "https://www.hellojob.az";
const LISTING_URLS = [
  `${BASE_URL}/vakansiyalar`,
  `${BASE_URL}/vakansiyalar?page=2`,
  `${BASE_URL}/vakansiyalar?page=3`,
  `${BASE_URL}/vakansiyalar?page=4`,
];
const HEADERS = {
  "User-Agent": userAgent(BASE_URL),
  Accept: "text/html",
};

export const helloJobAzScraper: Scraper = {
  name: SOURCE,
  async fetch(): Promise<RawVacancy[]> {
    const pages = await fetchListingPages(SOURCE, LISTING_URLS, HEADERS);

    return dedupeVacanciesByUrl(pages.flatMap((html) => parseHelloJobAzVacancies(html)));
  },
};

export function parseHelloJobAzVacancies(html: string): RawVacancy[] {
  const vacancies: RawVacancy[] = [];

  for (const link of parse(html).querySelectorAll("a.vacancies__body")) {
    const href = link.getAttribute("href");
    const title = elementText(link.querySelector(".vacancies__title"));
    const company = elementText(link.querySelector(".vacancies__company"));
    const infoItems = link.querySelectorAll(".vacancies__info__item");

    if (href === undefined || title.length === 0 || company.length === 0) {
      continue;
    }

    vacancies.push({
      title,
      company,
      location: "",
      url: new URL(href, BASE_URL).toString(),
      source: SOURCE,
      postedAt: optionalText(infoItems.at(-1)?.text),
    });
  }

  return dedupeVacanciesByUrl(vacancies);
}
