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
  // Well-formed JSON whose listing field is not a list of jobs.
  '{"vacancies":5,"entities":5}',
  '{"vacancies":{"0":{}},"entities":{"0":{}}}',
  '{"vacancies":"none","entities":"none"}',
  '{"vacancies":[null],"entities":[null]}',
  '{"vacancies":[7],"entities":[7]}',
  // A listing field of the right shape whose entries hold numbers where strings belong.
  '{"vacancies":[{"id":1,"job_title":7,"company":{"title":"Acme"},"published":17}]}',
  '{"entities":[{"title":7,"slug":"s","location":3,"company":{"name":"Acme","slug":"acme"}}]}',
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

describe("one unusable entry", () => {
  it("busy.az keeps the vacancies beside a null entry and a numeric title", () => {
    const body = JSON.stringify({
      vacancies: [
        null,
        { id: 1, job_title: 7, company: { title: "Acme" } },
        { id: 2, job_title: "Baş mühasib", company: { title: "Acme" }, slug: "bas-muhasib" },
      ],
    });

    expect(parseBusyAzVacancies(body).map((vacancy) => vacancy.url)).toEqual([
      "https://busy.az/vacancy/2/bas-muhasib",
    ]);
  });

  it("jobs.glorri.az keeps the jobs beside a null entry and a numeric title", () => {
    const body = JSON.stringify({
      entities: [
        null,
        { title: 7, slug: "bad", company: { name: "Acme", slug: "acme" } },
        { title: "Baş mühasib", slug: "good", company: { name: "Acme", slug: "acme" } },
      ],
    });

    expect(parseGlorriAzVacancies(body).map((vacancy) => vacancy.url)).toEqual([
      "https://jobs.glorri.az/vacancies/acme/good?isLocal=true",
    ]);
  });

  it("hellojob.az keeps the cards beside one whose href is not a URL", () => {
    const html = `
      <a class="vacancies__body" href="http://hello job.az/vakansiya/1">
        <div class="vacancies__title">Bad</div><div class="vacancies__company">Acme</div>
      </a>
      <a class="vacancies__body" href="/vakansiya/9">
        <div class="vacancies__title">Good</div><div class="vacancies__company">Acme</div>
      </a>`;

    expect(parseHelloJobAzVacancies(html).map((vacancy) => vacancy.url)).toEqual([
      "https://www.hellojob.az/vakansiya/9",
    ]);
  });

  it("smartjob.az keeps the cards beside one whose href is not a URL", () => {
    const card = (href: string, title: string): string =>
      `<div class="brows-job-list">
        <div class="brows-job-position"><h3><a href="${href}">${title}</a></h3></div>
        <div class="company-title"><a>Acme</a></div>
      </div>`;
    const html = card("//", "Bad") + card("/vacancies/9", "Good");

    expect(parseSmartJobAzVacancies(html).map((vacancy) => vacancy.url)).toEqual([
      "https://smartjob.az/vacancies/9",
    ]);
  });

  it("vakansiya.az keeps the rows beside one whose href is not a URL", () => {
    const row = (href: string, title: string): string =>
      `<div class="js-bottomrow">
        <a class="jobtitle" href="${href}">${title}</a>
        <span class="js-fields">1</span><span class="js-fields">Acme</span>
      </div>`;
    const html = row("http://", "Bad") + row("/az/vakansiya/9", "Good");

    expect(parseVakansiyaAzVacancies(html).map((vacancy) => vacancy.url)).toEqual([
      "https://vakansiya.az/az/vakansiya/9",
    ]);
  });

  it("vakansiya.biz keeps the cards beside one whose href is not a URL", () => {
    const html = `
      <a href="http://vakansiya biz/az/jobs/1/bad"><h2>Bad</h2><p>Acme · Bakı</p></a>
      <a href="/az/jobs/9/good"><h2>Good</h2><p>Acme · Bakı</p></a>`;

    expect(parseVakansiyaBizVacancies(html).map((vacancy) => vacancy.url)).toEqual([
      "https://vakansiya.biz/az/jobs/9/good",
    ]);
  });
});
