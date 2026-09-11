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
    expect(message).toContain("🏢 Acme &lt;MMC&gt; · 📍 Bakı");
    expect(message).toContain('<a href="https://example.com/vacancy/1">Elana bax</a>');
    expect(message).toContain("Java Developer");
  });

  it("stamps the header with Baku local time", () => {
    const [message] = formatVacancyMessages({
      vacancies: [vacancy],
      date: new Date("2026-05-19T10:00:00Z"),
    });

    expect(message).toContain("19.05.2026");
    expect(message).toContain("14:00");
  });

  it("escapes HTML in the vacancy link", () => {
    const [message] = formatVacancyMessages({
      vacancies: [{ ...vacancy, url: 'https://example.com/v?q=a&b="x"' }],
    });

    expect(message).toContain(
      '<a href="https://example.com/v?q=a&amp;b=&quot;x&quot;">Elana bax</a>',
    );
  });

  it("truncates an over-long title and company", () => {
    const [message] = formatVacancyMessages({
      vacancies: [{ ...vacancy, title: "a".repeat(200), company: "b".repeat(200) }],
    });

    expect(message).toContain(`${"a".repeat(119)}…`);
    expect(message).not.toContain("a".repeat(120));
    expect(message).toContain(`${"b".repeat(89)}…`);
    expect(message).not.toContain("b".repeat(90));
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
