import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { parseVakansiyaBizVacancies } from "../../src/scrapers/vakansiya-biz";

describe("parseVakansiyaBizVacancies", () => {
  it("parses job cards from the vakansiya.biz fixture", async () => {
    const html = await readFile(new URL("../fixtures/vakansiya-biz.html", import.meta.url), "utf8");
    const vacancies = parseVakansiyaBizVacancies(html);

    expect(vacancies.length).toBeGreaterThan(0);
    expect(vacancies[0]).toMatchObject({
      company: expect.any(String),
      title: expect.any(String),
      source: "vakansiya.biz",
      url: expect.stringMatching(/^https:\/\/vakansiya\.biz\/az\/jobs\/\d+\/.+/),
    });
  });

  it("splits the company from the location", async () => {
    const html = await readFile(new URL("../fixtures/vakansiya-biz.html", import.meta.url), "utf8");
    const vacancies = parseVakansiyaBizVacancies(html);

    expect(vacancies.every((vacancy) => !vacancy.company.includes("·"))).toBe(true);
    expect(vacancies.some((vacancy) => vacancy.location.length > 0)).toBe(true);
  });
});
