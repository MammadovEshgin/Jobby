import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { parseHelloJobAzVacancies } from "../../src/scrapers/hellojob-az";

async function fixture(): Promise<string> {
  return await readFile(new URL("../fixtures/hellojob-az.html", import.meta.url), "utf8");
}

describe("parseHelloJobAzVacancies", () => {
  it("parses vacancy cards from the hellojob.az fixture", async () => {
    const vacancies = parseHelloJobAzVacancies(await fixture());

    expect(vacancies.length).toBeGreaterThan(0);
    expect(vacancies[0]).toMatchObject({
      company: expect.any(String),
      title: expect.any(String),
      source: "hellojob.az",
      url: expect.stringMatching(/^https:\/\/www\.hellojob\.az\/vakansiya\/.+/),
    });
  });

  it("keeps only cards that carry a title, a company and a link", async () => {
    const vacancies = parseHelloJobAzVacancies(await fixture());

    for (const vacancy of vacancies) {
      expect(vacancy.title.length).toBeGreaterThan(0);
      expect(vacancy.company.length).toBeGreaterThan(0);
      expect(vacancy.url.startsWith("https://www.hellojob.az/")).toBe(true);
    }
  });

  it("keeps the first card when a page repeats the same vacancy", () => {
    const card = `<a class="vacancies__body" href="/vakansiya/1">
      <div class="vacancies__title">Developer</div>
      <div class="vacancies__company">Acme</div>
      <div class="vacancies__info__item">1 gün əvvəl</div>
    </a>`;

    expect(parseHelloJobAzVacancies(card + card)).toEqual([
      {
        title: "Developer",
        company: "Acme",
        location: "",
        url: "https://www.hellojob.az/vakansiya/1",
        source: "hellojob.az",
        postedAt: "1 gün əvvəl",
      },
    ]);
  });

  it("collapses the markup's whitespace and leaves out an empty date", async () => {
    const vacancies = parseHelloJobAzVacancies(await fixture());

    for (const vacancy of vacancies) {
      expect(vacancy.title).not.toMatch(/\s{2}|[\n\t]|^\s|\s$/);
      expect(vacancy.company).not.toMatch(/\s{2}|[\n\t]|^\s|\s$/);
      expect(vacancy.postedAt ?? "a").not.toBe("");
    }
  });
});
