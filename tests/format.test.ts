import { describe, expect, it } from "vitest";

import { formatVacancyMessages } from "../src/pipeline/format";
import type { RawVacancy } from "../src/scrapers/types";

const vacancy: RawVacancy = {
  title: "Backend Developer",
  company: "Acme <MMC>",
  location: "Bakı",
  url: "https://example.com/vacancy/1",
  source: "test",
};

describe("formatVacancyMessages", () => {
  it("returns no messages when there are no matches", () => {
    expect(formatVacancyMessages({ exact: [], related: [] })).toEqual([]);
  });

  it("formats exact and related vacancies as Telegram HTML", () => {
    const [message] = formatVacancyMessages({
      exact: [vacancy],
      related: [{ ...vacancy, title: "Frontend Developer", url: "https://example.com/vacancy/2" }],
      date: new Date("2026-05-19T10:00:00Z"),
    });

    expect(message).toContain("<b>Yeni vakansiyalar</b>");
    expect(message).toContain("Dəqiq uyğunluqlar");
    expect(message).toContain("Əlaqəli vakansiyalar");
    expect(message).toContain("Acme &lt;MMC&gt;");
    expect(message).toContain('<a href="https://example.com/vacancy/1">Elana bax</a>');
  });

  it("splits long batches below Telegram's message limit", () => {
    const exact = Array.from({ length: 120 }, (_, index) => ({
      ...vacancy,
      title: `Backend Developer ${index}`,
      url: `https://example.com/vacancy/${index}`,
    }));
    const messages = formatVacancyMessages({ exact, related: [] });

    expect(messages.length).toBeGreaterThan(1);
    expect(messages.every((message) => message.length <= 4096)).toBe(true);
  });
});
