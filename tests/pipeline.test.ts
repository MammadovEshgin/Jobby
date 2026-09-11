import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MANUAL_SEARCH_LIMIT, runManualSearch, runPipeline } from "../src/pipeline/run";
import type { RawVacancy } from "../src/scrapers/types";

const { vacancies, scrapeCalls } = vi.hoisted(() => ({
  vacancies: { current: [] as RawVacancy[] },
  scrapeCalls: { count: 0 },
}));

vi.mock("../src/scrapers", () => ({
  fetchAllVacancies: async () => {
    scrapeCalls.count += 1;
    return vacancies.current;
  },
}));

function vacancy(title: string, company = "Acme"): RawVacancy {
  return {
    title,
    company,
    location: "Bakı",
    url: `https://example.com/${encodeURIComponent(title)}`,
    source: "test",
  };
}

interface SnapshotRow {
  fingerprint: string;
  title: string;
  company: string;
  location: string;
  url: string;
  source: string;
  posted_at: string | null;
  seen_at: number;
}

/** Just enough of D1 for the pipeline: users, their fields, sent ids and the snapshot. */
function fakeDb(fields: string[], options: { failOn?: string } = {}): D1Database {
  const sent = new Set<string>();
  const snapshot = new Map<string, SnapshotRow>();

  const statement = (sql: string, values: unknown[] = []): D1PreparedStatement =>
    ({
      bind: (...args: unknown[]) => statement(sql, args),
      async all() {
        if (sql.includes("FROM users u")) {
          return {
            results: fields.map((field) => ({
              telegram_id: 1,
              username: "tester",
              field,
              raw_field: field,
              created_at: 0,
            })),
          };
        }

        if (sql.includes("FROM sent_vacancies")) {
          return { results: [...sent].map((fingerprint) => ({ fingerprint })) };
        }

        if (sql.includes("FROM vacancy_snapshot")) {
          return { results: [...snapshot.values()] };
        }

        return { results: [] };
      },
      async first() {
        return null;
      },
      async run() {
        if (options.failOn !== undefined && sql.includes(options.failOn)) {
          throw new Error(`D1 rejected: ${options.failOn}`);
        }

        if (sql.includes("INSERT INTO sent_vacancies")) {
          sent.add(String(values[0]));
        }

        if (sql.includes("INSERT INTO vacancy_snapshot")) {
          const [fingerprint, title, company, location, url, source, postedAt, seenAt] = values;
          snapshot.set(String(fingerprint), {
            fingerprint: String(fingerprint),
            title: String(title),
            company: String(company),
            location: String(location),
            url: String(url),
            source: String(source),
            posted_at: postedAt === null ? null : String(postedAt),
            seen_at: Number(seenAt),
          });
        }

        return { meta: { changes: 0 } };
      },
      raw: () => [],
    }) as unknown as D1PreparedStatement;

  return {
    prepare: (sql: string) => statement(sql),
    async batch(statements: D1PreparedStatement[]) {
      return await Promise.all(
        statements.map(
          async (item) => await (item as unknown as { run: () => Promise<unknown> }).run(),
        ),
      );
    },
  } as unknown as D1Database;
}

/** Telegram's 429 body; `retry_after: 0` keeps the retry wait out of the test's runtime. */
function rateLimited(): Response {
  return new Response(JSON.stringify({ parameters: { retry_after: 0 } }), { status: 429 });
}

/** The vacancy titles a rendered message actually carries. */
function titlesIn(message: string): string[] {
  return [...message.matchAll(/<b>(Musiqi müəllimi \d+)<\/b>/gu)].map(([, title]) => title ?? "");
}

function sentMessages(): string[] {
  return vi.mocked(globalThis.fetch).mock.calls.map((call) => {
    const body = JSON.parse(String((call[1] as RequestInit).body)) as { text: string };
    return body.text;
  });
}

beforeEach(() => {
  scrapeCalls.count = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 200 })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("runPipeline", () => {
  it("sends only the vacancies that match a saved field", async () => {
    vacancies.current = [
      vacancy("Musiqi müəllimi"),
      vacancy("Fizika müəllimi"),
      vacancy("Backend Developer"),
      vacancy("Aşpaz"),
    ];

    const result = await runPipeline({ DB: fakeDb(["musiqi muellimi"]), BOT_TOKEN: "token" });
    const [message] = sentMessages();

    expect(result.vacanciesSent).toBe(1);
    expect(message).toContain("Musiqi müəllimi");
    expect(message).not.toContain("Fizika müəllimi");
    expect(message).not.toContain("Backend Developer");
  });

  it("puts the tightest match first in the message", async () => {
    vacancies.current = [
      vacancy("Musiqi müəllimi Bakı filialı", "Beta"),
      vacancy("Musiqi müəllimi"),
    ];

    await runPipeline({ DB: fakeDb(["musiqi muellimi"]), BOT_TOKEN: "token" });
    const [message = ""] = sentMessages();

    expect(message).toContain("<b>Musiqi müəllimi</b>");
    expect(message).toContain("<b>Musiqi müəllimi Bakı filialı</b>");
    expect(message.indexOf("<b>Musiqi müəllimi</b>")).toBeLessThan(
      message.indexOf("<b>Musiqi müəllimi Bakı filialı</b>"),
    );
  });

  it("sends nothing when no vacancy matches", async () => {
    vacancies.current = [vacancy("Fizika müəllimi"), vacancy("Ofisiant")];

    const result = await runPipeline({ DB: fakeDb(["music teacher"]), BOT_TOKEN: "token" });

    expect(result.vacanciesSent).toBe(0);
    expect(sentMessages()).toEqual([]);
  });

  it("matches across languages and across several saved fields", async () => {
    vacancies.current = [vacancy("Music Teacher"), vacancy("Java Developer"), vacancy("Sürücü")];

    const result = await runPipeline({
      DB: fakeDb(["musiqi muellimi", "backend developer"]),
      BOT_TOKEN: "token",
    });

    expect(result.vacanciesSent).toBe(2);
    expect(sentMessages().join("\n")).toContain("Music Teacher");
    expect(sentMessages().join("\n")).toContain("Java Developer");
  });

  it("does not resend a vacancy on the next hourly run", async () => {
    vacancies.current = [vacancy("Musiqi müəllimi")];

    const db = fakeDb(["musiqi muellimi"]);
    const first = await runPipeline({ DB: db, BOT_TOKEN: "token" });
    const second = await runPipeline({ DB: db, BOT_TOKEN: "token" });

    expect(first.vacanciesSent).toBe(1);
    expect(second.vacanciesSent).toBe(0);
  });

  it("sends a vacancy once when two sources list it", async () => {
    vacancies.current = [
      vacancy("Musiqi müəllimi"),
      { ...vacancy("Musiqi müəllimi"), source: "other", url: "https://other.example/1" },
    ];

    const result = await runPipeline({ DB: fakeDb(["musiqi muellimi"]), BOT_TOKEN: "token" });

    expect(result.scraped).toBe(2);
    expect(result.deduped).toBe(1);
    expect(result.vacanciesSent).toBe(1);
  });

  it("retries a rate-limited send and delivers on the next attempt", async () => {
    vacancies.current = [vacancy("Musiqi müəllimi")];
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(rateLimited());

    const result = await runPipeline({ DB: fakeDb(["musiqi muellimi"]), BOT_TOKEN: "token" });

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(result.vacanciesSent).toBe(1);
  });

  it("caps the wait between rate-limited attempts at five seconds", async () => {
    vacancies.current = [vacancy("Musiqi müəllimi")];
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ parameters: { retry_after: 600 } }), { status: 429 }),
    );

    const waits: number[] = [];
    const schedule = globalThis.setTimeout;
    vi.stubGlobal("setTimeout", (handler: () => void, ms: number) => {
      waits.push(ms);
      return schedule(handler, 0);
    });

    const result = await runPipeline({ DB: fakeDb(["musiqi muellimi"]), BOT_TOKEN: "token" });

    expect(waits).toEqual([5000]);
    expect(result.vacanciesSent).toBe(1);
  });

  it("gives up on a chat that stays rate limited", async () => {
    vacancies.current = [vacancy("Musiqi müəllimi")];
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(rateLimited())
      .mockResolvedValueOnce(rateLimited())
      .mockResolvedValueOnce(rateLimited());

    const result = await runPipeline({ DB: fakeDb(["musiqi muellimi"]), BOT_TOKEN: "token" });

    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    expect(result.vacanciesSent).toBe(0);
  });

  it("keeps delivering to other users when one chat rejects the message", async () => {
    vacancies.current = [vacancy("Musiqi müəllimi")];
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response("{}", { status: 403 }));

    const result = await runPipeline({ DB: fakeDb(["musiqi muellimi"]), BOT_TOKEN: "token" });

    expect(result.vacanciesSent).toBe(0);
  });

  it("does not resend the vacancies of a message that already landed", async () => {
    vacancies.current = Array.from({ length: 60 }, (_, index) =>
      vacancy(`Musiqi müəllimi ${index}`, `Company ${index}`),
    );
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 403 }));

    const db = fakeDb(["musiqi muellimi"]);
    await runPipeline({ DB: db, BOT_TOKEN: "token" });
    const landed = titlesIn(sentMessages()[0] ?? "");
    vi.mocked(globalThis.fetch).mockClear();

    await runPipeline({ DB: db, BOT_TOKEN: "token" });
    const resent = sentMessages().join("\n");

    expect(landed.length).toBeGreaterThan(0);
    expect(landed.some((title) => resent.includes(`<b>${title}</b>`))).toBe(false);
  });

  it("keeps the run alive when the sent-vacancy write fails", async () => {
    vacancies.current = [vacancy("Musiqi müəllimi")];

    const result = await runPipeline({
      DB: fakeDb(["musiqi muellimi"], { failOn: "INSERT INTO sent_vacancies" }),
      BOT_TOKEN: "token",
    });

    expect(result.usersChecked).toBe(1);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("still delivers when the snapshot write fails", async () => {
    vacancies.current = [vacancy("Musiqi müəllimi")];

    const result = await runPipeline({
      DB: fakeDb(["musiqi muellimi"], { failOn: "INSERT INTO vacancy_snapshot" }),
      BOT_TOKEN: "token",
    });

    expect(result.vacanciesSent).toBe(1);
  });

  it("still delivers when the nightly prune fails", async () => {
    vacancies.current = [vacancy("Musiqi müəllimi")];

    const result = await runPipeline(
      { DB: fakeDb(["musiqi muellimi"], { failOn: "DELETE FROM" }), BOT_TOKEN: "token" },
      { pruneOld: true },
    );

    expect(result.vacanciesSent).toBe(1);
  });
});

describe("runManualSearch", () => {
  it("answers from the stored snapshot instead of scraping again", async () => {
    vacancies.current = [vacancy("Musiqi müəllimi")];

    const db = fakeDb(["musiqi muellimi"]);
    await runPipeline({ DB: db, BOT_TOKEN: "token" });
    scrapeCalls.count = 0;

    const manual = await runManualSearch({ DB: db, BOT_TOKEN: "token" }, 1);

    expect(scrapeCalls.count).toBe(0);
    expect(manual.vacanciesSent).toBe(1);
  });

  it("scrapes once when no snapshot exists yet", async () => {
    vacancies.current = [vacancy("Musiqi müəllimi")];

    const manual = await runManualSearch(
      { DB: fakeDb(["musiqi muellimi"]), BOT_TOKEN: "token" },
      1,
    );

    expect(scrapeCalls.count).toBe(1);
    expect(manual.vacanciesSent).toBe(1);
  });

  it("returns every open match, including ones already delivered", async () => {
    vacancies.current = [vacancy("Musiqi müəllimi"), vacancy("Music Teacher", "Other")];

    const db = fakeDb(["musiqi muellimi"]);
    await runPipeline({ DB: db, BOT_TOKEN: "token" });
    const manual = await runManualSearch({ DB: db, BOT_TOKEN: "token" }, 1);

    expect(manual.vacanciesSent).toBe(2);
    expect(manual.truncated).toBe(false);
  });

  it("caps a very large result set and reports it", async () => {
    vacancies.current = Array.from({ length: MANUAL_SEARCH_LIMIT + 10 }, (_, index) =>
      vacancy(`Musiqi müəllimi ${index}`, `Company ${index}`),
    );

    const manual = await runManualSearch(
      { DB: fakeDb(["musiqi muellimi"]), BOT_TOKEN: "token" },
      1,
    );

    expect(manual.vacanciesSent).toBe(MANUAL_SEARCH_LIMIT);
    expect(manual.truncated).toBe(true);
  });
});
