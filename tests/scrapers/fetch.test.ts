import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetchTextMock } = vi.hoisted(() => ({
  fetchTextMock: vi.fn<(url: string, options?: unknown) => unknown>(),
}));

vi.mock("../../src/utils/fetch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/utils/fetch")>()),
  fetchText: fetchTextMock,
}));

const { FetchHttpError } = await import("../../src/utils/fetch");
const { fetchAllVacancies } = await import("../../src/scrapers");
const { busyAzScraper } = await import("../../src/scrapers/busy-az");
const { glorriAzScraper } = await import("../../src/scrapers/glorri-az");
const { helloJobAzScraper } = await import("../../src/scrapers/hellojob-az");
const { jobSearchAzScraper } = await import("../../src/scrapers/jobsearch-az");
const { smartJobAzScraper } = await import("../../src/scrapers/smartjob-az");
const { vakansiyaAzScraper } = await import("../../src/scrapers/vakansiya-az");
const { vakansiyaBizScraper } = await import("../../src/scrapers/vakansiya-biz");

function busyBody(...ids: number[]): string {
  return JSON.stringify({
    vacancies: ids.map((id) => ({
      id,
      job_title: `Job ${id}`,
      slug: `job-${id}`,
      company: { title: "Acme" },
    })),
  });
}

function glorriBody(...slugs: string[]): string {
  return JSON.stringify({
    entities: slugs.map((slug) => ({
      title: `Job ${slug}`,
      slug,
      location: "Bakı",
      company: { name: "Acme", slug: "acme" },
    })),
  });
}

function helloJobPage(id: number): string {
  return `<a class="vacancies__body" href="/vakansiya/${id}">
    <div class="vacancies__title">Job ${id}</div>
    <div class="vacancies__company">Acme</div>
    <div class="vacancies__info__item">1 gün əvvəl</div>
  </a>`;
}

function vakansiyaBizPage(id: number): string {
  return `<a href="/az/jobs/${id}/job-${id}"><h2>Job ${id}</h2><p>Acme · Bakı</p><span>1 gün</span></a>`;
}

/** Answers the given URL substrings and rejects every other page. */
function respondTo(pages: Record<string, string>): void {
  fetchTextMock.mockImplementation((url: string) => {
    for (const [marker, body] of Object.entries(pages)) {
      if (url.includes(marker)) {
        return Promise.resolve(body);
      }
    }

    return Promise.reject(new Error(`No stub for ${url}`));
  });
}

let logged: string[];

beforeEach(() => {
  logged = [];
  fetchTextMock.mockReset();
  vi.spyOn(console, "log").mockImplementation((line: string) => {
    logged.push(line);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("multi-page scrapers", () => {
  it("busy.az merges every page and drops URLs seen twice", async () => {
    respondTo({ "?page=1": busyBody(1, 2), "?page=2": busyBody(2, 3) });

    const vacancies = await busyAzScraper.fetch();

    expect(fetchTextMock).toHaveBeenCalledTimes(2);
    expect(vacancies.map((vacancy) => vacancy.url)).toEqual([
      "https://busy.az/vacancy/1/job-1",
      "https://busy.az/vacancy/2/job-2",
      "https://busy.az/vacancy/3/job-3",
    ]);
  });

  it("busy.az keeps the pages that answered and logs the one that did not", async () => {
    respondTo({ "?page=1": busyBody(1) });

    const vacancies = await busyAzScraper.fetch();

    expect(vacancies).toHaveLength(1);
    expect(logged.map((line) => JSON.parse(line) as unknown)).toContainEqual(
      expect.objectContaining({
        event: "scraper_page_skipped",
        site: "busy.az",
        url: expect.stringContaining("?page=2"),
      }),
    );
  });

  it("busy.az rejects with the first page's failure when no page answers", async () => {
    fetchTextMock.mockImplementation((url: string) => Promise.reject(new Error(`down: ${url}`)));

    await expect(busyAzScraper.fetch()).rejects.toThrow("down: https://api.busy.az");
  });

  it("hellojob.az keeps the pages that answered and logs the rest", async () => {
    respondTo({ "vakansiyalar?page=2": helloJobPage(2) });

    const vacancies = await helloJobAzScraper.fetch();

    expect(fetchTextMock).toHaveBeenCalledTimes(4);
    expect(vacancies).toEqual([
      expect.objectContaining({
        title: "Job 2",
        company: "Acme",
        location: "",
        url: "https://www.hellojob.az/vakansiya/2",
        source: "hellojob.az",
        postedAt: "1 gün əvvəl",
      }),
    ]);
    expect(logged.filter((line) => line.includes("scraper_page_skipped"))).toHaveLength(3);
  });

  it("hellojob.az rejects when every page fails", async () => {
    fetchTextMock.mockImplementation(() => Promise.reject(new Error("blocked")));

    await expect(helloJobAzScraper.fetch()).rejects.toThrow("blocked");
  });

  it("vakansiya.biz keeps the pages that answered and dedupes across them", async () => {
    respondTo({ "jobs?page=2": vakansiyaBizPage(7), "jobs?page=3": vakansiyaBizPage(7) });

    const vacancies = await vakansiyaBizScraper.fetch();

    expect(fetchTextMock).toHaveBeenCalledTimes(5);
    expect(vacancies).toEqual([
      expect.objectContaining({
        title: "Job 7",
        company: "Acme",
        location: "Bakı",
        url: "https://vakansiya.biz/az/jobs/7/job-7",
        source: "vakansiya.biz",
      }),
    ]);
  });

  it("vakansiya.biz rejects when every page fails", async () => {
    fetchTextMock.mockImplementation(() => Promise.reject(new Error("gateway")));

    await expect(vakansiyaBizScraper.fetch()).rejects.toThrow("gateway");
  });

  it("jobs.glorri.az merges its pages and reports how many were skipped", async () => {
    respondTo({ "offset=0": glorriBody("a", "b") });

    const vacancies = await glorriAzScraper.fetch();

    expect(fetchTextMock).toHaveBeenCalledTimes(6);
    expect(vacancies.map((vacancy) => vacancy.url)).toEqual([
      "https://jobs.glorri.az/vacancies/acme/a?isLocal=true",
      "https://jobs.glorri.az/vacancies/acme/b?isLocal=true",
    ]);
    expect(logged.map((line) => JSON.parse(line) as unknown)).toContainEqual(
      expect.objectContaining({
        event: "scraper_page_skipped",
        site: "jobs.glorri.az",
        skipped: 5,
      }),
    );
  });

  it("jobs.glorri.az rejects when every page fails", async () => {
    fetchTextMock.mockImplementation(() => Promise.reject(new Error("offline")));

    await expect(glorriAzScraper.fetch()).rejects.toThrow("offline");
  });
});

describe("fetchAllVacancies", () => {
  it("returns what the boards that answered gave and logs the ones that did not", async () => {
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((line: string) => {
      errors.push(line);
    });
    respondTo({ "?page=1": busyBody(1) });

    const vacancies = await fetchAllVacancies();

    expect(vacancies.map((vacancy) => vacancy.source)).toEqual(["busy.az"]);
    expect(logged.map((line) => JSON.parse(line) as unknown)).toContainEqual(
      expect.objectContaining({ event: "scraper_complete", site: "busy.az", found: 1 }),
    );
    expect(errors.map((line) => JSON.parse(line) as unknown)).toContainEqual(
      expect.objectContaining({ event: "scraper_failed", site: "jobsearch.az", found: 0 }),
    );
  });

  it("is empty, not a failure, when no board answers", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    fetchTextMock.mockImplementation(() => Promise.reject(new Error("offline")));

    await expect(fetchAllVacancies()).resolves.toEqual([]);
  });
});

describe("request headers", () => {
  it("names the bot and the board it came for on every request", async () => {
    respondTo({ "?page=1": busyBody(1) });

    await busyAzScraper.fetch();

    expect(fetchTextMock).toHaveBeenCalledWith(
      expect.stringContaining("?page=1"),
      expect.objectContaining({
        timeoutMs: 10_000,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; VakansiyaBot/0.1; +https://busy.az)",
          Accept: "application/json",
        },
      }),
    );
  });

  it("asks vakansiya.biz for HTML under the same identity", async () => {
    respondTo({ "jobs?page=2": vakansiyaBizPage(1) });

    await vakansiyaBizScraper.fetch();

    expect(fetchTextMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; VakansiyaBot/0.1; +https://vakansiya.biz)",
          Accept: "text/html",
        },
      }),
    );
  });
});

describe("single-page scrapers", () => {
  it("smartjob.az treats a 403 as an empty board rather than a failure", async () => {
    fetchTextMock.mockRejectedValue(new FetchHttpError(403, "https://smartjob.az/vacancies"));

    await expect(smartJobAzScraper.fetch()).resolves.toEqual([]);
    expect(logged.map((line) => JSON.parse(line) as unknown)).toContainEqual(
      expect.objectContaining({ event: "scraper_blocked", site: "smartjob.az", status: 403 }),
    );
  });

  it("smartjob.az still propagates any other failure", async () => {
    fetchTextMock.mockRejectedValue(new FetchHttpError(500, "https://smartjob.az/vacancies"));

    await expect(smartJobAzScraper.fetch()).rejects.toThrow("HTTP 500");
  });

  it("jobsearch.az and vakansiya.az propagate a failed listing fetch", async () => {
    fetchTextMock.mockRejectedValue(new Error("timeout"));

    await expect(jobSearchAzScraper.fetch()).rejects.toThrow("timeout");
    await expect(vakansiyaAzScraper.fetch()).rejects.toThrow("timeout");
  });
});
