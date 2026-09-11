import { parse } from "node-html-parser";

import type { RawVacancy, Scraper } from "./types";
import { dedupeVacanciesByUrl } from "./dedupe";
import { fetchText } from "../utils/fetch";

const BASE_URL = "https://www.hellojob.az";
const LISTING_URLS = [
  `${BASE_URL}/vakansiyalar`,
  `${BASE_URL}/vakansiyalar?page=2`,
  `${BASE_URL}/vakansiyalar?page=3`,
];
const USER_AGENT = "Mozilla/5.0 (compatible; VakansiyaBot/0.1; +https://www.hellojob.az)";

export const helloJobAzScraper: Scraper = {
  name: "hellojob.az",
  async fetch(): Promise<RawVacancy[]> {
    const pages = await Promise.all(
      LISTING_URLS.map((url) =>
        fetchText(url, {
          timeoutMs: 10_000,
          headers: {
            "User-Agent": USER_AGENT,
            Accept: "text/html",
          },
        }),
      ),
    );

    return dedupeVacanciesByUrl(pages.flatMap((html) => parseHelloJobAzVacancies(html)));
  },
};

export function parseHelloJobAzVacancies(html: string): RawVacancy[] {
  const root = parse(html);
  const vacancies: RawVacancy[] = [];
  const seenUrls = new Set<string>();

  for (const link of root.querySelectorAll("a.vacancies__body")) {
    const href = link.getAttribute("href");
    const title = cleanText(link.querySelector(".vacancies__title")?.text);
    const company = cleanText(link.querySelector(".vacancies__company")?.text);
    const infoItems = link.querySelectorAll(".vacancies__info__item").map((item) => cleanText(item.text));
    const postedAt = infoItems.at(-1);

    if (href === undefined || title.length === 0 || company.length === 0) {
      continue;
    }

    const url = new URL(href, BASE_URL).toString();

    if (seenUrls.has(url)) {
      continue;
    }

    seenUrls.add(url);
    vacancies.push({
      title,
      company,
      location: "",
      url,
      source: "hellojob.az",
      postedAt: postedAt?.length === 0 ? undefined : postedAt,
    });
  }

  return vacancies;
}

function cleanText(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}
