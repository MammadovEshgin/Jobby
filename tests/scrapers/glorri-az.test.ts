import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { parseGlorriAzVacancies } from "../../src/scrapers/glorri-az";

describe("parseGlorriAzVacancies", () => {
  it("parses vacancy entities from the jobs.glorri.az fixture", async () => {
    const html = await readFile(new URL("../fixtures/glorri-az.html", import.meta.url), "utf8");
    const vacancies = parseGlorriAzVacancies(html);

    expect(vacancies.length).toBeGreaterThan(0);
    expect(vacancies[0]).toMatchObject({
      company: expect.any(String),
      title: expect.any(String),
      location: expect.any(String),
      source: "jobs.glorri.az",
      url: expect.stringMatching(/^https:\/\/jobs\.glorri\.az\/vacancies\/.+\?isLocal=true$/),
    });
  });

  it("does not emit duplicate vacancy URLs", async () => {
    const html = await readFile(new URL("../fixtures/glorri-az.html", import.meta.url), "utf8");
    const vacancies = parseGlorriAzVacancies(html);
    const urls = vacancies.map((vacancy) => vacancy.url);

    expect(new Set(urls).size).toBe(urls.length);
  });
});
