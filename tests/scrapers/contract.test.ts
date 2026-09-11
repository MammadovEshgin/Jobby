import { describe, expect, it } from "vitest";

import { parseBusyAzVacancies } from "../../src/scrapers/busy-az";
import { parseGlorriAzVacancies } from "../../src/scrapers/glorri-az";
import { parseHelloJobAzVacancies } from "../../src/scrapers/hellojob-az";
import { parseJobSearchAzVacancies } from "../../src/scrapers/jobsearch-az";
import { parseSmartJobAzVacancies } from "../../src/scrapers/smartjob-az";
import { parseVakansiyaAzVacancies } from "../../src/scrapers/vakansiya-az";
import { parseVakansiyaBizVacancies } from "../../src/scrapers/vakansiya-biz";

const parsers = [
  ["busy.az", parseBusyAzVacancies],
  ["jobs.glorri.az", parseGlorriAzVacancies],
  ["hellojob.az", parseHelloJobAzVacancies],
  ["jobsearch.az", parseJobSearchAzVacancies],
  ["smartjob.az", parseSmartJobAzVacancies],
  ["vakansiya.az", parseVakansiyaAzVacancies],
  ["vakansiya.biz", parseVakansiyaBizVacancies],
] as const;

/** What a board serves when it is down, blocked, rate-limited or simply redesigned. */
const unusableBodies = [
  "",
  "   ",
  "null",
  "[]",
  "{}",
  "<html><body><h1>502 Bad Gateway</h1></body></html>",
  '<a class="vacancies__body"></a>',
  "Access denied",
];

describe("every scraper parser", () => {
  it.each(parsers)(
    "%s yields an empty list rather than throwing on an unusable body",
    (_, parseVacancies) => {
      for (const body of unusableBodies) {
        expect(parseVacancies(body), `body: ${JSON.stringify(body)}`).toEqual([]);
      }
    },
  );
});
