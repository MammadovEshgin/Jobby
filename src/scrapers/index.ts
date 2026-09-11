import { bossAzScraper } from "./boss-az";
import { glorriAzScraper } from "./glorri-az";
import { helloJobAzScraper } from "./hellojob-az";
import { jobSearchAzScraper } from "./jobsearch-az";
import { smartJobAzScraper } from "./smartjob-az";
import type { RawVacancy, Scraper } from "./types";
import { logError, logInfo } from "../utils/log";

export const scrapers: Scraper[] = [
  bossAzScraper,
  helloJobAzScraper,
  jobSearchAzScraper,
  smartJobAzScraper,
  glorriAzScraper,
];

export async function fetchAllVacancies(): Promise<RawVacancy[]> {
  const results = await Promise.allSettled(scrapers.map(fetchFromScraper));
  const vacancies: RawVacancy[] = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      vacancies.push(...result.value);
    }
  }

  return vacancies;
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
    throw error;
  }
}
