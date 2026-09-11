import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { parseBusyAzVacancies } from "../../src/scrapers/busy-az";

async function fixture(): Promise<string> {
  return await readFile(new URL("../fixtures/busy-az.json", import.meta.url), "utf8");
}

describe("parseBusyAzVacancies", () => {
  it("parses vacancies from the busy.az API response", async () => {
    const vacancies = parseBusyAzVacancies(await fixture());

    expect(vacancies.length).toBeGreaterThan(0);
    expect(vacancies[0]).toMatchObject({
      title: expect.any(String),
      company: expect.any(String),
      source: "busy.az",
      url: expect.stringMatching(/^https:\/\/busy\.az\/vacancy\/\d+\//),
    });
  });

  it("reads the city name out of the localised city relation", async () => {
    const vacancies = parseBusyAzVacancies(await fixture());

    expect(vacancies.some((vacancy) => vacancy.location === "Bakı")).toBe(true);
  });

  it("skips entries without a usable title or company", async () => {
    const vacancies = parseBusyAzVacancies(await fixture());

    expect(
      vacancies.every((vacancy) => vacancy.title.length > 0 && vacancy.company.length > 0),
    ).toBe(true);
  });

  it("returns nothing when the response is not JSON", () => {
    expect(parseBusyAzVacancies("<html>maintenance</html>")).toEqual([]);
  });
});
