import { busyAzScraper } from "./busy-az";
import { glorriAzScraper } from "./glorri-az";
import { helloJobAzScraper } from "./hellojob-az";
import { jobSearchAzScraper } from "./jobsearch-az";
import { smartJobAzScraper } from "./smartjob-az";
import { vakansiyaAzScraper } from "./vakansiya-az";
import { vakansiyaBizScraper } from "./vakansiya-biz";
import type { RawVacancy, Scraper } from "./types";
import { logError, logInfo } from "../utils/log";

const scrapers: Scraper[] = [
  helloJobAzScraper,
  jobSearchAzScraper,
  busyAzScraper,
  smartJobAzScraper,
  glorriAzScraper,
  vakansiyaBizScraper,
  vakansiyaAzScraper,
];

/** A board that fails contributes nothing; the hourly run goes out with whatever the rest found. */
export async function fetchAllVacancies(): Promise<RawVacancy[]> {
  const found = await Promise.all(scrapers.map(fetchFromScraper));

  return found.flat();
}

async function fetchFromScraper(scraper: Scraper): Promise<RawVacancy[]> {
  const startedAt = Date.now();

  try {
    const vacancies = await scraper.fetch();
    logInfo("scraper_complete", {
      site: scraper.name,
      found: vacancies.length,
      ms: Date.now() - startedAt,
    });
    return vacancies;
  } catch (error) {
    logError("scraper_failed", error, {
      site: scraper.name,
      found: 0,
      ms: Date.now() - startedAt,
    });
    return [];
  }
}
