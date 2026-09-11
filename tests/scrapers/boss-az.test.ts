import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { parseBossAzVacancies } from "../../src/scrapers/boss-az";

describe("parseBossAzVacancies", () => {
  it("parses vacancy cards from the boss.az fixture", async () => {
    const html = await readFile(new URL("../fixtures/boss-az.html", import.meta.url), "utf8");
    const vacancies = parseBossAzVacancies(html);

    expect(vacancies.length).toBeGreaterThan(0);
    expect(vacancies[0]).toMatchObject({
      company: expect.any(String),
      title: expect.any(String),
      location: expect.any(String),
      url: expect.stringMatching(/^https:\/\/boss\.az\/vacancies\/\d+$/),
    });
    expect(vacancies[0]?.company.length).toBeGreaterThan(0);
    expect(vacancies[0]?.title.length).toBeGreaterThan(0);
  });

  it("does not emit duplicate vacancy URLs", async () => {
    const html = await readFile(new URL("../fixtures/boss-az.html", import.meta.url), "utf8");
    const vacancies = parseBossAzVacancies(html);
    const urls = vacancies.map((vacancy) => vacancy.url);

    expect(new Set(urls).size).toBe(urls.length);
  });
});
