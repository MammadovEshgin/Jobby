import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MANUAL_SEARCH_LIMIT, runPipeline, runPipelineForUser } from "../src/pipeline/run";
import type { RawVacancy } from "../src/scrapers/types";

const { vacancies } = vi.hoisted(() => ({ vacancies: { current: [] as RawVacancy[] } }));

vi.mock("../src/scrapers", () => ({
  fetchAllVacancies: async () => vacancies.current,
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

/** Just enough of D1 for the pipeline: users, their fields and what was sent. */
function fakeDb(fields: string[], sent: string[] = []): D1Database {
  const sentFingerprints = new Set(sent);

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
          return { results: [...sentFingerprints].map((fingerprint) => ({ fingerprint })) };
        }

        return { results: [] };
      },
      async first() {
        return null;
      },
      async run() {
        if (sql.includes("INSERT INTO sent_vacancies")) {
          sentFingerprints.add(String(values[0]));
        }

        return { meta: { changes: 0 } };
      },
      raw: () => [],
    }) as unknown as D1PreparedStatement;

  return {
    prepare: (sql: string) => statement(sql),
    async batch(statements: D1PreparedStatement[]) {
      return await Promise.all(statements.map(async (item) => await (item as unknown as { run: () => Promise<unknown> }).run()));
    },
    sentFingerprints,
  } as unknown as D1Database & { sentFingerprints: Set<string> };
}

function sentMessages(): string[] {
  return vi.mocked(globalThis.fetch).mock.calls.map((call) => {
    const body = JSON.parse(String((call[1] as RequestInit).body)) as { text: string };
    return body.text;
  });
}

beforeEach(() => {
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
});

describe("runPipelineForUser", () => {
  it("returns every open match, including ones already delivered", async () => {
    vacancies.current = [vacancy("Musiqi müəllimi"), vacancy("Music Teacher", "Other")];

    const db = fakeDb(["musiqi muellimi"]);
    await runPipeline({ DB: db, BOT_TOKEN: "token" });
    const manual = await runPipelineForUser({ DB: db, BOT_TOKEN: "token" }, 1);

    expect(manual.vacanciesSent).toBe(2);
    expect(manual.truncated).toBe(false);
  });

  it("caps a very large result set and reports it", async () => {
    vacancies.current = Array.from({ length: MANUAL_SEARCH_LIMIT + 10 }, (_, index) =>
      vacancy(`Musiqi müəllimi ${index}`, `Company ${index}`),
    );

    const manual = await runPipelineForUser({ DB: fakeDb(["musiqi muellimi"]), BOT_TOKEN: "token" }, 1);

    expect(manual.vacanciesSent).toBe(MANUAL_SEARCH_LIMIT);
    expect(manual.truncated).toBe(true);
  });
});
