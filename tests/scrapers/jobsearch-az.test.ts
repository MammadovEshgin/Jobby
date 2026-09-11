import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { parseJobSearchAzVacancies } from "../../src/scrapers/jobsearch-az";

describe("parseJobSearchAzVacancies", () => {
  it("parses vacancy cards from the jobsearch.az fixture", async () => {
    const html = await readFile(new URL("../fixtures/jobsearch-az.html", import.meta.url), "utf8");
    const vacancies = parseJobSearchAzVacancies(html);

    expect(vacancies.length).toBeGreaterThan(0);
    expect(vacancies[0]).toMatchObject({
      company: expect.any(String),
      title: expect.any(String),
      url: expect.stringMatching(/^https:\/\/jobsearch\.az\/vacancies\/.+/),
    });
  });
});
