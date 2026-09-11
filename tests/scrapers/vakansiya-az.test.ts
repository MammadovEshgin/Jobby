import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { parseVakansiyaAzVacancies } from "../../src/scrapers/vakansiya-az";

async function fixture(): Promise<string> {
  return await readFile(new URL("../fixtures/vakansiya-az.html", import.meta.url), "utf8");
}

describe("parseVakansiyaAzVacancies", () => {
  it("parses listing rows from the vakansiya.az fixture", async () => {
    const vacancies = parseVakansiyaAzVacancies(await fixture());

    expect(vacancies.length).toBeGreaterThan(0);
    expect(vacancies[0]).toMatchObject({
      title: expect.any(String),
      company: expect.any(String),
      source: "vakansiya.az",
      url: expect.stringContaining("https://vakansiya.az/az/job/"),
    });
  });

  it("keeps the company out of the title cell", async () => {
    const vacancies = parseVakansiyaAzVacancies(await fixture());

    expect(vacancies.every((vacancy) => vacancy.title !== vacancy.company)).toBe(true);
    expect(vacancies.some((vacancy) => vacancy.location.length > 0)).toBe(true);
  });
});
