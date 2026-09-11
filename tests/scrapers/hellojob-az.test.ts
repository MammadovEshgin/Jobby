import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { parseHelloJobAzVacancies } from "../../src/scrapers/hellojob-az";

describe("parseHelloJobAzVacancies", () => {
  it("parses vacancy cards from the hellojob.az fixture", async () => {
    const html = await readFile(new URL("../fixtures/hellojob-az.html", import.meta.url), "utf8");
    const vacancies = parseHelloJobAzVacancies(html);

    expect(vacancies.length).toBeGreaterThan(0);
    expect(vacancies[0]).toMatchObject({
      company: expect.any(String),
      title: expect.any(String),
      url: expect.stringMatching(/^https:\/\/www\.hellojob\.az\/vakansiya\/.+/),
    });
  });
});
