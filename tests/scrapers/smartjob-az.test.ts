import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { parseSmartJobAzVacancies } from "../../src/scrapers/smartjob-az";

describe("parseSmartJobAzVacancies", () => {
  it("parses vacancy cards from the smartjob.az fixture", async () => {
    const html = await readFile(new URL("../fixtures/smartjob-az.html", import.meta.url), "utf8");
    const vacancies = parseSmartJobAzVacancies(html);

    expect(vacancies.length).toBeGreaterThan(0);
    expect(vacancies[0]).toMatchObject({
      company: expect.any(String),
      title: expect.any(String),
      url: expect.stringMatching(/^https:\/\/smartjob\.az\/vacancy\/.+/),
    });
  });
});
