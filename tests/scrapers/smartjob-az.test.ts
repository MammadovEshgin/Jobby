import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { parseSmartJobAzVacancies } from "../../src/scrapers/smartjob-az";

async function fixture(): Promise<string> {
  return await readFile(new URL("../fixtures/smartjob-az.html", import.meta.url), "utf8");
}

describe("parseSmartJobAzVacancies", () => {
  it("parses vacancy cards from the smartjob.az fixture", async () => {
    const vacancies = parseSmartJobAzVacancies(await fixture());

    expect(vacancies.length).toBeGreaterThan(0);
    expect(vacancies[0]).toMatchObject({
      company: expect.any(String),
      title: expect.any(String),
      source: "smartjob.az",
      url: expect.stringMatching(/^https:\/\/smartjob\.az\/vacancy\/.+/),
    });
  });

  it("keeps only cards that carry a title, a company and a link", async () => {
    const vacancies = parseSmartJobAzVacancies(await fixture());

    for (const vacancy of vacancies) {
      expect(vacancy.title.length).toBeGreaterThan(0);
      expect(vacancy.company.length).toBeGreaterThan(0);
      expect(vacancy.url.startsWith("https://smartjob.az/")).toBe(true);
      expect(vacancy.postedAt ?? "a").not.toBe("");
    }
  });

  it("reads the city off the card", async () => {
    const vacancies = parseSmartJobAzVacancies(await fixture());

    expect(vacancies.some((vacancy) => vacancy.location.length > 0)).toBe(true);
  });
});
