import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { checkManualSearchLimit, claimManualSearch } from "../../src/db/manual-search";
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

describe("the cooldown as a whole", () => {
  it("refuses the next search right after one is claimed", async () => {
    const { db } = createFakeDb();

    await claimManualSearch(db, 7);

    await expect(claimManualSearch(db, 7)).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 10,
    });
  });

  it("lets only one of two overlapping searches through", async () => {
    const { db, tables } = createFakeDb();

    const outcomes = await Promise.all([claimManualSearch(db, 7), claimManualSearch(db, 7)]);

    expect(outcomes.filter((outcome) => outcome.allowed)).toHaveLength(1);
    expect(tables.manualSearchLog).toEqual([{ telegram_id: 7, last_run_at: NOW }]);
  });
});

describe("claimManualSearch", () => {
  it("claims the slot for a user who has never searched", async () => {
    const { db, tables } = createFakeDb();

    await expect(claimManualSearch(db, 7)).resolves.toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
    expect(tables.manualSearchLog).toEqual([{ telegram_id: 7, last_run_at: NOW }]);
  });

  it("refuses inside the cooldown, reports the wait and keeps the stored time", async () => {
    const { db, tables } = createFakeDb({
      manualSearchLog: [{ telegram_id: 7, last_run_at: NOW - 4 }],
    });

    await expect(claimManualSearch(db, 7)).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 6,
    });
    expect(tables.manualSearchLog).toEqual([{ telegram_id: 7, last_run_at: NOW - 4 }]);
  });

  it("claims the slot again exactly at the end of the cooldown", async () => {
    const { db, tables } = createFakeDb({
      manualSearchLog: [{ telegram_id: 7, last_run_at: NOW - 10 }],
    });

    await expect(claimManualSearch(db, 7)).resolves.toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
    expect(tables.manualSearchLog).toEqual([{ telegram_id: 7, last_run_at: NOW }]);
  });

  it("keeps a row per user", async () => {
    const { db, tables } = createFakeDb();

    await claimManualSearch(db, 7);
    await claimManualSearch(db, 8);

    expect(tables.manualSearchLog).toHaveLength(2);
  });

  it("binds the cooldown into the write itself", async () => {
    const { db, calls } = createFakeDb({
      manualSearchLog: [{ telegram_id: 7, last_run_at: NOW - 4 }],
    });

    await expect(claimManualSearch(db, 7, 60)).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 56,
    });
    expect(calls[0]).toEqual({ route: "INSERT manual_search_log", params: [7, NOW, 60] });
  });
});
