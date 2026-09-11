import { parse } from "node-html-parser";

import type { RawVacancy, Scraper } from "./types";
import { dedupeVacanciesByUrl } from "./dedupe";
import { fetchText } from "../utils/fetch";
import { logInfo } from "../utils/log";

const BASE_URL = "https://vakansiya.biz";
const LISTING_URLS = [
  `${BASE_URL}/az/jobs`,
  `${BASE_URL}/az/jobs?page=2`,
  `${BASE_URL}/az/jobs?page=3`,
  `${BASE_URL}/az/jobs?page=4`,
  `${BASE_URL}/az/jobs?page=5`,
];
const USER_AGENT = "Mozilla/5.0 (compatible; VakansiyaBot/0.1; +https://vakansiya.biz)";

export const vakansiyaBizScraper: Scraper = {
  name: "vakansiya.biz",
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
        site: "vakansiya.biz",
        url: LISTING_URLS[index],
        reason: result.reason instanceof Error ? result.reason.message : "Unknown error",
      });
    }

    if (pages.length === 0) {
      throw (
        results.find((result) => result.status === "rejected")?.reason ??
        new Error("No vakansiya.biz pages fetched.")
      );
    }

    return dedupeVacanciesByUrl(pages.flatMap((html) => parseVakansiyaBizVacancies(html)));
  },
};

export function parseVakansiyaBizVacancies(html: string): RawVacancy[] {
  const root = parse(html);
  const vacancies: RawVacancy[] = [];

  for (const link of root.querySelectorAll('a[href*="/jobs/"]')) {
    const href = link.getAttribute("href");

    if (href === undefined || !/\/jobs\/\d+\//.test(href)) {
      continue;
    }

    const title = cleanText(link.querySelector("h2")?.text);
    // The subtitle holds "Company · Location" for every card on the board.
    const [company, location] = splitSubtitle(cleanText(link.querySelector("p")?.text));
    const postedAt = cleanText(link.querySelector("span")?.text);

    if (title.length === 0 || company.length === 0) {
      continue;
    }

    vacancies.push({
      title,
      company,
      location,
      url: new URL(href, BASE_URL).toString(),
      source: "vakansiya.biz",
      postedAt: postedAt.length === 0 ? undefined : postedAt,
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

function cleanText(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}
