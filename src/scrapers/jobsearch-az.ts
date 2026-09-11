import { parse } from "node-html-parser";

import type { RawVacancy, Scraper } from "./types";
import { fetchText } from "../utils/fetch";

const BASE_URL = "https://jobsearch.az";
const LISTING_URL = `${BASE_URL}/vacancies`;
const USER_AGENT = "Mozilla/5.0 (compatible; VakansiyaBot/0.1; +https://jobsearch.az)";

export const jobSearchAzScraper: Scraper = {
  name: "jobsearch.az",
  async fetch(): Promise<RawVacancy[]> {
    const html = await fetchText(LISTING_URL, {
      timeoutMs: 10_000,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html",
      },
    });

    return parseJobSearchAzVacancies(html);
  },
};

export function parseJobSearchAzVacancies(html: string): RawVacancy[] {
  const root = parse(html);
  const vacancies: RawVacancy[] = [];
  const seenUrls = new Set<string>();

  for (const link of root.querySelectorAll("a.list__item__text")) {
    const href = link.getAttribute("href");

    if (href === undefined || !href.startsWith("/vacancies/")) {
      continue;
    }

    const title = cleanText(link.querySelector(".list__item__title")?.text);
    const company = cleanText(cleanText(link.text).replace(title, ""));
    const item = link.closest(".list__item");
    const postedAt = cleanText(item?.querySelector(".list__item__end .text-transform-none")?.text);
    const url = new URL(href, BASE_URL).toString();

    if (title.length === 0 || company.length === 0 || seenUrls.has(url)) {
      continue;
    }

    seenUrls.add(url);
    vacancies.push({
      title,
      company,
      location: "",
      url,
      source: "jobsearch.az",
      postedAt: postedAt.length === 0 ? undefined : postedAt,
    });
  }

  return vacancies;
}

function cleanText(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}
