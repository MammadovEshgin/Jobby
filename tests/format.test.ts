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
    expect(formatVacancyMessages({ vacancies: [] })).toEqual([]);
  });

  it("formats matched vacancies as Telegram HTML", () => {
    const [message] = formatVacancyMessages({
      vacancies: [
        vacancy,
        { ...vacancy, title: "Java Developer", url: "https://example.com/vacancy/2" },
      ],
      date: new Date("2026-05-19T10:00:00Z"),
    });

    expect(message).toContain("<b>Uyğun vakansiyalar</b> (2)");
    expect(message).toContain("Acme &lt;MMC&gt;");
    expect(message).toContain('<a href="https://example.com/vacancy/1">Elana bax</a>');
    expect(message).toContain("Java Developer");
  });

  it("shows how many matched when the list was capped", () => {
    const [message] = formatVacancyMessages({ vacancies: [vacancy], total: 42 });

    expect(message).toContain("(1/42)");
  });

  it("splits long batches below Telegram's message limit", () => {
    const vacancies = Array.from({ length: 120 }, (_, index) => ({
      ...vacancy,
      title: `Backend Developer ${index}`,
      url: `https://example.com/vacancy/${index}`,
    }));
    const messages = formatVacancyMessages({ vacancies });

    expect(messages.length).toBeGreaterThan(1);
    expect(messages.every((message) => message.length <= 4096)).toBe(true);
  });
});
