import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  listSnapshot,
  pruneSnapshotOlderThan,
  saveSnapshot,
  type SnapshotVacancy,
} from "../../src/db/snapshot";
import { createFakeDb, type SnapshotRow } from "./fake-d1";

const NOW = 1_700_000_000;
const DAY = 24 * 60 * 60;

function at(seconds: number): void {
  vi.setSystemTime(seconds * 1000);
}

function entry(fingerprint: string, overrides: Partial<SnapshotRow> = {}): SnapshotVacancy {
  return {
    fingerprint,
    vacancy: {
      title: overrides.title ?? `Title ${fingerprint}`,
      company: overrides.company ?? "Acme",
      location: overrides.location ?? "Bakı",
      url: overrides.url ?? `https://example.com/${fingerprint}`,
      source: overrides.source ?? "busy",
      postedAt: overrides.posted_at ?? undefined,
    },
  };
}

function storedRow(fingerprint: string, seenAt: number, overrides: Partial<SnapshotRow> = {}) {
  return {
    fingerprint,
    title: `Title ${fingerprint}`,
    company: "Acme",
    location: "Bakı",
    url: `https://example.com/${fingerprint}`,
    source: "busy",
    posted_at: null,
    seen_at: seenAt,
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  at(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("saveSnapshot", () => {
  it("stores every column and stamps the row with the current time", async () => {
    const { db, tables } = createFakeDb();

    await saveSnapshot(db, [entry("a", { posted_at: "2026-09-01" })]);

    expect(tables.vacancySnapshot).toEqual([storedRow("a", NOW, { posted_at: "2026-09-01" })]);
  });

  it("stores a null posted_at when the scraper reported no date", async () => {
    const { db, calls } = createFakeDb();

    await saveSnapshot(db, [entry("a")]);

    expect(calls[0]?.params).toEqual([
      "a",
      "Title a",
      "Acme",
      "Bakı",
      "https://example.com/a",
      "busy",
      null,
      NOW,
    ]);
  });

  it("touches the database for nothing when there is nothing to store", async () => {
    const { db, calls, batchSizes } = createFakeDb();

    await saveSnapshot(db, []);

    expect(calls).toEqual([]);
    expect(batchSizes).toEqual([]);
  });

  it("refreshes the listing details and the timestamp of a vacancy seen again", async () => {
    const { db, tables } = createFakeDb({
      vacancySnapshot: [storedRow("a", NOW - DAY)],
    });

    at(NOW + 60);
    await saveSnapshot(db, [
      entry("a", { url: "https://example.com/moved", location: "Gəncə", posted_at: "2026-09-02" }),
    ]);

    expect(tables.vacancySnapshot).toEqual([
      {
        ...storedRow("a", NOW + 60),
        url: "https://example.com/moved",
        location: "Gəncə",
        posted_at: "2026-09-02",
      },
    ]);
  });

  it("keeps the stored title, company and source of a vacancy seen again", async () => {
    const { db, tables } = createFakeDb({
      vacancySnapshot: [storedRow("a", NOW - DAY, { title: "First", source: "busy" })],
    });

    await saveSnapshot(db, [entry("a", { title: "Renamed", company: "Beta", source: "hellojob" })]);

    expect(tables.vacancySnapshot[0]).toMatchObject({
      title: "First",
      company: "Acme",
      source: "busy",
    });
  });

  it("splits a large scrape into batches of fifty", async () => {
    const { db, tables, batchSizes } = createFakeDb();
    const scrape = Array.from({ length: 120 }, (_, index) => entry(`f${index}`));

    await saveSnapshot(db, scrape);

    expect(batchSizes).toEqual([50, 50, 20]);
    expect(tables.vacancySnapshot).toHaveLength(120);
  });
});

describe("listSnapshot", () => {
  it("returns vacancies seen within the window, most recent first", async () => {
    const { db } = createFakeDb({
      vacancySnapshot: [
        storedRow("old", NOW - 3 * DAY),
        storedRow("fresh", NOW - 60),
        storedRow("stale", NOW - 30 * DAY),
      ],
    });

    const result = await listSnapshot(db, 7 * DAY);

    expect(result.map((item) => item.fingerprint)).toEqual(["fresh", "old"]);
  });

  it("keeps a row seen exactly at the cutoff", async () => {
    const { db, calls } = createFakeDb({
      vacancySnapshot: [storedRow("edge", NOW - 7 * DAY)],
    });

    await expect(listSnapshot(db, 7 * DAY)).resolves.toHaveLength(1);
    expect(calls[0]?.params).toEqual([NOW - 7 * DAY]);
  });

  it("maps a row back to the scraped shape", async () => {
    const { db } = createFakeDb({
      vacancySnapshot: [storedRow("a", NOW, { posted_at: "2026-09-01" })],
    });

    await expect(listSnapshot(db, DAY)).resolves.toEqual([
      {
        fingerprint: "a",
        vacancy: {
          title: "Title a",
          company: "Acme",
          location: "Bakı",
          url: "https://example.com/a",
          source: "busy",
          postedAt: "2026-09-01",
        },
      },
    ]);
  });

  it("turns a null posted_at into an absent date", async () => {
    const { db } = createFakeDb({ vacancySnapshot: [storedRow("a", NOW)] });

    const [item] = await listSnapshot(db, DAY);

    expect(item?.vacancy.postedAt).toBeUndefined();
  });

  it("returns nothing when the table is empty", async () => {
    const { db } = createFakeDb();

    await expect(listSnapshot(db, DAY)).resolves.toEqual([]);
  });
});

describe("pruneSnapshotOlderThan", () => {
  it("deletes rows last seen before the cutoff and reports how many", async () => {
    const { db, tables } = createFakeDb({
      vacancySnapshot: [
        storedRow("gone", NOW - 31 * DAY),
        storedRow("edge", NOW - 30 * DAY),
        storedRow("open", NOW - DAY),
      ],
    });

    await expect(pruneSnapshotOlderThan(db, 30)).resolves.toBe(1);
    expect(tables.vacancySnapshot.map((row) => row.fingerprint)).toEqual(["edge", "open"]);
  });

  it("binds the cutoff as a whole number of seconds", async () => {
    const { db, calls } = createFakeDb();

    await pruneSnapshotOlderThan(db, 1.5);

    expect(calls[0]?.params).toEqual([NOW - Math.floor(1.5 * DAY)]);
  });

  /**
   * Unlike `pruneOlderThan` in `vacancies.ts`, this one has no guard: a negative
   * window puts the cutoff in the future and empties the table. Both call sites
   * pass literals today, so the behaviour is locked rather than fixed here.
   */
  it("empties the table when the window is negative", async () => {
    const { db, tables } = createFakeDb({ vacancySnapshot: [storedRow("open", NOW)] });

    await expect(pruneSnapshotOlderThan(db, -1)).resolves.toBe(1);
    expect(tables.vacancySnapshot).toEqual([]);
  });
});
