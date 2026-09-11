import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { listSnapshot, saveSnapshot } from "../../src/db/snapshot";
import { listSentFingerprints, markManySent, pruneOlderThan } from "../../src/db/vacancies";
import { createFakeDb } from "./fake-d1";

const NOW = 1_700_000_000;
const DAY = 24 * 60 * 60;

function at(seconds: number): void {
  vi.setSystemTime(seconds * 1000);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  at(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("listSentFingerprints", () => {
  it("returns only the fingerprints delivered to that user", async () => {
    const { db } = createFakeDb({
      sentVacancies: [
        { fingerprint: "a", telegram_id: 7, first_seen: 1, source: "test" },
        { fingerprint: "b", telegram_id: 7, first_seen: 1, source: "test" },
        { fingerprint: "c", telegram_id: 8, first_seen: 1, source: "test" },
      ],
    });

    await expect(listSentFingerprints(db, 7)).resolves.toEqual(new Set(["a", "b"]));
  });

  it("returns an empty set for a user who has received nothing", async () => {
    const { db } = createFakeDb();

    await expect(listSentFingerprints(db, 7)).resolves.toEqual(new Set());
  });
});

describe("markManySent", () => {
  it("writes one row per input in a single batch", async () => {
    const { db, tables, batchSizes } = createFakeDb();

    await markManySent(db, [
      { fingerprint: "a", telegramId: 7, source: "busy" },
      { fingerprint: "b", telegramId: 7, source: "hellojob" },
    ]);

    expect(batchSizes).toEqual([2]);
    expect(tables.sentVacancies).toEqual([
      { fingerprint: "a", telegram_id: 7, first_seen: NOW, source: "busy" },
      { fingerprint: "b", telegram_id: 7, first_seen: NOW, source: "hellojob" },
    ]);
  });

  it("touches the database for nothing when the batch is empty", async () => {
    const { db, calls, batchSizes } = createFakeDb();

    await markManySent(db, []);

    expect(calls).toEqual([]);
    expect(batchSizes).toEqual([]);
  });

  it("keeps the original first_seen and source when the same pair arrives again", async () => {
    const { db, tables } = createFakeDb({
      sentVacancies: [{ fingerprint: "a", telegram_id: 7, first_seen: 100, source: "busy" }],
    });

    await markManySent(db, [{ fingerprint: "a", telegramId: 7, source: "hellojob" }]);

    expect(tables.sentVacancies).toEqual([
      { fingerprint: "a", telegram_id: 7, first_seen: 100, source: "busy" },
    ]);
  });

  it("records the same fingerprint separately for each user", async () => {
    const { db, tables } = createFakeDb();

    await markManySent(db, [
      { fingerprint: "a", telegramId: 7, source: "busy" },
      { fingerprint: "a", telegramId: 8, source: "busy" },
    ]);

    expect(tables.sentVacancies).toHaveLength(2);
  });

  it("stamps every row of one batch with the same timestamp", async () => {
    const { db, calls } = createFakeDb();

    await markManySent(db, [
      { fingerprint: "a", telegramId: 7, source: "busy" },
      { fingerprint: "b", telegramId: 7, source: "busy" },
    ]);

    expect(calls.map((call) => call.params)).toEqual([
      ["a", 7, NOW, "busy"],
      ["b", 7, NOW, "busy"],
    ]);
  });
});

describe("pruneOlderThan", () => {
  it("deletes rows first seen before the cutoff and reports how many", async () => {
    const { db, tables } = createFakeDb({
      sentVacancies: [
        { fingerprint: "old", telegram_id: 7, first_seen: NOW - 61 * DAY, source: "busy" },
        { fingerprint: "edge", telegram_id: 7, first_seen: NOW - 60 * DAY, source: "busy" },
        { fingerprint: "new", telegram_id: 7, first_seen: NOW - DAY, source: "busy" },
      ],
    });

    await expect(pruneOlderThan(db, 60)).resolves.toBe(1);
    expect(tables.sentVacancies.map((row) => row.fingerprint)).toEqual(["edge", "new"]);
  });

  it("binds the cutoff as a whole number of seconds", async () => {
    const { db, calls } = createFakeDb();

    await pruneOlderThan(db, 1.5);

    expect(calls[0]?.params).toEqual([NOW - Math.floor(1.5 * DAY)]);
  });

  it("clears everything already stored when the window is zero", async () => {
    const { db, tables } = createFakeDb({
      sentVacancies: [{ fingerprint: "a", telegram_id: 7, first_seen: NOW - 1, source: "busy" }],
    });

    await expect(pruneOlderThan(db, 0)).resolves.toBe(1);
    expect(tables.sentVacancies).toEqual([]);
  });

  it("refuses a negative window", async () => {
    const { db, calls } = createFakeDb();

    await expect(pruneOlderThan(db, -1)).rejects.toThrow("Days must be a non-negative number.");
    expect(calls).toEqual([]);
  });

  it("refuses a window that is not a finite number", async () => {
    const { db } = createFakeDb();

    await expect(pruneOlderThan(db, Number.NaN)).rejects.toThrow(
      "Days must be a non-negative number.",
    );
    await expect(pruneOlderThan(db, Number.POSITIVE_INFINITY)).rejects.toThrow(
      "Days must be a non-negative number.",
    );
  });

  /**
   * Known defect, locked here so a fix has to change this test on purpose:
   * `first_seen` is the delivery date and never moves, while the snapshot's
   * `seen_at` is refreshed every hour. A vacancy a board keeps listing past the
   * window therefore loses its delivery record while still being open, and the
   * next run sends it to the same user again.
   */
  it("forgets a delivery for a vacancy the board is still listing", async () => {
    const { db, tables } = createFakeDb();

    await markManySent(db, [{ fingerprint: "a", telegramId: 7, source: "busy" }]);

    at(NOW + 61 * DAY);
    await saveSnapshot(db, [
      {
        fingerprint: "a",
        vacancy: {
          title: "Aşpaz",
          company: "Acme",
          location: "Bakı",
          url: "https://example.com/a",
          source: "busy",
        },
      },
    ]);
    await pruneOlderThan(db, 60);

    expect(tables.sentVacancies).toEqual([]);
    await expect(listSentFingerprints(db, 7)).resolves.toEqual(new Set());
    await expect(listSnapshot(db, 7 * DAY)).resolves.toHaveLength(1);
  });
});
