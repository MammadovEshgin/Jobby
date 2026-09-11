import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { parseGlorriAzVacancies } from "../../src/scrapers/glorri-az";

async function fixture(): Promise<string> {
  return await readFile(new URL("../fixtures/glorri-az.json", import.meta.url), "utf8");
}

describe("parseGlorriAzVacancies", () => {
  it("parses jobs from the public API response", async () => {
    const vacancies = parseGlorriAzVacancies(await fixture());

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
    const urls = parseGlorriAzVacancies(await fixture()).map((vacancy) => vacancy.url);

    expect(new Set(urls).size).toBe(urls.length);
  });

  it("returns nothing for a malformed response", () => {
    expect(parseGlorriAzVacancies("not json")).toEqual([]);
    expect(parseGlorriAzVacancies("{}")).toEqual([]);
  });
});
