import { parse } from "node-html-parser";

import type { RawVacancy, Scraper } from "./types";
import { FetchHttpError, fetchText } from "../utils/fetch";
import { logInfo } from "../utils/log";

const BASE_URL = "https://smartjob.az";
const LISTING_URL = `${BASE_URL}/`;
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

    return parseSmartJobAzVacancies(html);
  },
};

export function parseSmartJobAzVacancies(html: string): RawVacancy[] {
  const root = parse(html);
  const vacancies: RawVacancy[] = [];
  const seenUrls = new Set<string>();

  for (const card of root.querySelectorAll(".candidate-list-layout")) {
    const titleLink = card
      .querySelectorAll("a")
      .find((link) => link.getAttribute("href")?.includes("/vacancy/") === true);
    const href = titleLink?.getAttribute("href");
    const title = cleanText(titleLink?.text);
    const company = cleanText(card.querySelector(".card-cmall-font a")?.text);
    const details = card.querySelectorAll(".card-cmall-font li").map((item) => cleanText(item.text));
    const postedAt = cleanText(details.find((detail) => detail.startsWith("Yerləşdirilib"))).replace(
      "Yerləşdirilib",
      "",
    );
    const location = details.find((detail) => detail.length > 0 && detail !== company && !detail.startsWith("Yerləşdirilib")) ?? "";

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
      source: "smartjob.az",
      postedAt: postedAt.length === 0 ? undefined : postedAt,
    });
  }

  return vacancies;
}

function cleanText(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}
