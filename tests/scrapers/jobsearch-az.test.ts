import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { parseJobSearchAzVacancies } from "../../src/scrapers/jobsearch-az";

async function fixture(): Promise<string> {
  return await readFile(new URL("../fixtures/jobsearch-az.html", import.meta.url), "utf8");
}

describe("parseJobSearchAzVacancies", () => {
  it("parses vacancy cards from the jobsearch.az fixture", async () => {
    const vacancies = parseJobSearchAzVacancies(await fixture());

    expect(vacancies.length).toBeGreaterThan(0);
    expect(vacancies[0]).toMatchObject({
      company: expect.any(String),
      title: expect.any(String),
      source: "jobsearch.az",
      url: expect.stringMatching(/^https:\/\/jobsearch\.az\/vacancies\/.+/),
    });
  });

  it("emits each vacancy URL once", async () => {
    const urls = parseJobSearchAzVacancies(await fixture()).map((vacancy) => vacancy.url);

    expect(new Set(urls).size).toBe(urls.length);
  });

  it("keeps the first card when the listing links the same vacancy twice", () => {
    const card = `<div class="list__item">
      <a class="list__item__text" href="/vacancies/acme-developer-1">
        <div class="list__item__title">Developer</div>Acme
      </a>
    </div>`;

    expect(parseJobSearchAzVacancies(card + card)).toEqual([
      {
        title: "Developer",
        company: "Acme",
        location: "",
        url: "https://jobsearch.az/vacancies/acme-developer-1",
        source: "jobsearch.az",
        postedAt: undefined,
      },
    ]);
  });

  it("keeps the company out of the title and drops cards missing either", async () => {
    const vacancies = parseJobSearchAzVacancies(await fixture());

    for (const vacancy of vacancies) {
      expect(vacancy.title.length).toBeGreaterThan(0);
      expect(vacancy.company.length).toBeGreaterThan(0);
      expect(vacancy.company).not.toContain(vacancy.title);
      expect(vacancy.postedAt ?? "a").not.toBe("");
    }
  });
});
