import { parse } from "node-html-parser";

import type { RawVacancy, Scraper } from "./types";
import { dedupeVacanciesByUrl } from "./dedupe";
import { fetchText } from "../utils/fetch";
import { logInfo } from "../utils/log";

const BASE_URL = "https://boss.az";
const LISTING_URLS = [
  `${BASE_URL}/vacancies/new`,
  `${BASE_URL}/vacancies/new?page=2`,
  `${BASE_URL}/vacancies/new?page=3`,
];
const USER_AGENT = "Mozilla/5.0 (compatible; VakansiyaBot/0.1; +https://boss.az)";

export const bossAzScraper: Scraper = {
  name: "boss.az",
  async fetch(): Promise<RawVacancy[]> {
    const results = await Promise.allSettled(
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
    const pages: string[] = [];

    for (const [index, result] of results.entries()) {
      if (result.status === "fulfilled") {
        pages.push(result.value);
        continue;
      }

      logInfo("scraper_page_skipped", {
        site: "boss.az",
        url: LISTING_URLS[index],
        reason: result.reason instanceof Error ? result.reason.message : "Unknown error",
      });
    }

    if (pages.length === 0) {
      throw results.find((result) => result.status === "rejected")?.reason ?? new Error("No boss.az pages fetched.");
    }

    return dedupeVacanciesByUrl(pages.flatMap((html) => parseBossAzVacancies(html)));
  },
};

export function parseBossAzVacancies(html: string): RawVacancy[] {
  const root = parse(html);
  const seenUrls = new Set<string>();
  const vacancies: RawVacancy[] = [];

  for (const link of root.querySelectorAll('a[href^="/vacancies/"]')) {
    const card = link.querySelector('[data-cy="ad-card"]');

    if (card === null) {
      continue;
    }

    const href = link.getAttribute("href");
    const title = card.querySelector('[data-cy="ad-card-subtitle"]')?.text.trim() ?? "";
    const company = card.querySelector('[data-cy="ad-card-title"]')?.text.trim() ?? "";
    const location = card.querySelector('[data-cy="ad-card-location"]')?.text.trim() ?? "";
    const postedAt = card.querySelector('[data-cy="ad-card-date"]')?.text.trim() ?? undefined;

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
      location,
      url,
      source: "boss.az",
      postedAt,
    });
  }

  return vacancies;
}
