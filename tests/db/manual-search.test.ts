import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { checkManualSearchLimit, recordManualSearch } from "../../src/db/manual-search";
import { createFakeDb } from "./fake-d1";

const NOW = 1_700_000_000;

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

describe("checkManualSearchLimit", () => {
  it("allows a user who has never searched", async () => {
    const { db, calls } = createFakeDb();

    await expect(checkManualSearchLimit(db, 7)).resolves.toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
    expect(calls[0]?.params).toEqual([7]);
  });

  it("refuses a search inside the ten second cooldown and reports the wait", async () => {
    const { db } = createFakeDb({
      manualSearchLog: [{ telegram_id: 7, last_run_at: NOW - 4 }],
    });

    await expect(checkManualSearchLimit(db, 7)).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 6,
    });
  });

  it("allows the search again exactly at the end of the cooldown", async () => {
    const { db } = createFakeDb({
      manualSearchLog: [{ telegram_id: 7, last_run_at: NOW - 10 }],
    });

    await expect(checkManualSearchLimit(db, 7)).resolves.toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
  });

  it("never reports a negative wait once the cooldown has passed", async () => {
    const { db } = createFakeDb({
      manualSearchLog: [{ telegram_id: 7, last_run_at: NOW - 900 }],
    });

    await expect(checkManualSearchLimit(db, 7)).resolves.toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
  });

  it("honours a caller-supplied cooldown", async () => {
    const { db } = createFakeDb({
      manualSearchLog: [{ telegram_id: 7, last_run_at: NOW - 4 }],
    });

    await expect(checkManualSearchLimit(db, 7, 60)).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 56,
    });
  });

  it("reads only the calling user's last run", async () => {
    const { db } = createFakeDb({
      manualSearchLog: [{ telegram_id: 8, last_run_at: NOW }],
    });

    await expect(checkManualSearchLimit(db, 7)).resolves.toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
  });
});

describe("recordManualSearch", () => {
  it("stores the current time for a first search", async () => {
    const { db, tables, calls } = createFakeDb();

    await recordManualSearch(db, 7);

    expect(tables.manualSearchLog).toEqual([{ telegram_id: 7, last_run_at: NOW }]);
    expect(calls[0]?.params).toEqual([7, NOW]);
  });

  it("moves the stored time forward on a later search", async () => {
    const { db, tables } = createFakeDb({
      manualSearchLog: [{ telegram_id: 7, last_run_at: NOW - 100 }],
    });

    at(NOW + 30);
    await recordManualSearch(db, 7);

    expect(tables.manualSearchLog).toEqual([{ telegram_id: 7, last_run_at: NOW + 30 }]);
  });

  it("keeps a row per user", async () => {
    const { db, tables } = createFakeDb();

    await recordManualSearch(db, 7);
    await recordManualSearch(db, 8);

    expect(tables.manualSearchLog).toHaveLength(2);
  });
});

describe("the cooldown as a whole", () => {
  it("refuses the next search right after one is recorded", async () => {
    const { db } = createFakeDb();

    await recordManualSearch(db, 7);

    await expect(checkManualSearchLimit(db, 7)).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 10,
    });
  });

  /**
   * Known defect, locked here so a fix has to change this test on purpose: the
   * check and the record are two round trips with nothing between them, so two
   * `/axtar` that overlap both read the same stored time and both pass.
   */
  it("lets two overlapping searches through", async () => {
    const { db } = createFakeDb();

    const [first, second] = await Promise.all([
      checkManualSearchLimit(db, 7),
      checkManualSearchLimit(db, 7),
    ]);
    await recordManualSearch(db, 7);

    expect(first?.allowed).toBe(true);
    expect(second?.allowed).toBe(true);
  });
});
