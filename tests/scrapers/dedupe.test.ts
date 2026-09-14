import { describe, expect, it } from "vitest";

import { dedupeVacanciesByUrl } from "../../src/scrapers/dedupe";
import type { RawVacancy } from "../../src/scrapers/types";

function vacancy(url: string, title = "Job"): RawVacancy {
  return { title, company: "Acme", location: "Bakı", url, source: "test" };
}

describe("dedupeVacanciesByUrl", () => {
  it("keeps the first vacancy for each URL and drops later repeats", () => {
    const deduped = dedupeVacanciesByUrl([
      vacancy("https://example.com/1", "First"),
      vacancy("https://example.com/2"),
      vacancy("https://example.com/1", "Second"),
    ]);

    expect(deduped.map((item) => item.url)).toEqual([
      "https://example.com/1",
      "https://example.com/2",
    ]);
    expect(deduped[0].title).toBe("First");
  });

  it("preserves input order and returns an empty list for no input", () => {
    const urls = ["https://example.com/c", "https://example.com/a", "https://example.com/b"];

    expect(dedupeVacanciesByUrl(urls.map((url) => vacancy(url))).map((item) => item.url)).toEqual(
      urls,
    );
    expect(dedupeVacanciesByUrl([])).toEqual([]);
  });
});
