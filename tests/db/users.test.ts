import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  addField,
  listActiveUsersWithFields,
  listFields,
  removeField,
  setActive,
  upsertUser,
} from "../../src/db/users";
import { createFakeDb, type Tables } from "./fake-d1";

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

describe("upsertUser", () => {
  it("stores a new user as active with the current timestamp", async () => {
    const { db, tables } = createFakeDb();

    await upsertUser(db, { telegramId: 7, username: "tester" });

    expect(tables.users).toEqual([
      { telegram_id: 7, username: "tester", created_at: NOW, is_active: 1 },
    ]);
  });

  it("stores a null username when none is given", async () => {
    const { db, tables, calls } = createFakeDb();

    await upsertUser(db, { telegramId: 7 });

    expect(tables.users[0]?.username).toBeNull();
    expect(calls[0]?.params).toEqual([7, null, NOW]);
  });

  it("refreshes the username and reactivates without moving created_at", async () => {
    const { db, tables } = createFakeDb({
      users: [{ telegram_id: 7, username: "old", created_at: 1, is_active: 0 }],
    });

    at(NOW + 500);
    await upsertUser(db, { telegramId: 7, username: "new" });

    expect(tables.users).toEqual([
      { telegram_id: 7, username: "new", created_at: 1, is_active: 1 },
    ]);
  });

  it("overwrites a stored username with null when the caller passes null", async () => {
    const { db, tables } = createFakeDb({
      users: [{ telegram_id: 7, username: "old", created_at: 1, is_active: 1 }],
    });

    await upsertUser(db, { telegramId: 7, username: null });

    expect(tables.users[0]?.username).toBeNull();
  });
});

describe("addField", () => {
  it("trims both the normalized field and the raw text", async () => {
    const { db, tables } = createFakeDb();

    await addField(db, { telegramId: 7, field: "  musiqi muellimi  ", rawField: " Musiqi  " });

    expect(tables.userFields).toEqual([
      {
        telegram_id: 7,
        field: "musiqi muellimi",
        raw_field: "Musiqi",
        created_at: NOW,
      },
    ]);
  });

  it("rejects a field that is empty after trimming", async () => {
    const { db, calls } = createFakeDb();

    await expect(addField(db, { telegramId: 7, field: "   ", rawField: "x" })).rejects.toThrow(
      "Field must not be empty.",
    );
    expect(calls).toEqual([]);
  });

  it("rejects raw text that is empty after trimming", async () => {
    const { db } = createFakeDb();

    await expect(addField(db, { telegramId: 7, field: "x", rawField: "  " })).rejects.toThrow(
      "Field must not be empty.",
    );
  });

  it("updates only the raw text when the same field is added again", async () => {
    const { db, tables } = createFakeDb({
      userFields: [{ telegram_id: 7, field: "aspaz", raw_field: "aspaz", created_at: 10 }],
    });

    at(NOW + 900);
    await addField(db, { telegramId: 7, field: "aspaz", rawField: "Aşpaz" });

    expect(tables.userFields).toEqual([
      { telegram_id: 7, field: "aspaz", raw_field: "Aşpaz", created_at: 10 },
    ]);
  });

  it("keeps the same field for two different users apart", async () => {
    const { db, tables } = createFakeDb();

    await addField(db, { telegramId: 7, field: "aspaz", rawField: "Aşpaz" });
    await addField(db, { telegramId: 8, field: "aspaz", rawField: "Aşpaz" });

    expect(tables.userFields).toHaveLength(2);
  });
});

describe("removeField", () => {
  it("reports the deletion and drops the row", async () => {
    const { db, tables } = createFakeDb({
      userFields: [{ telegram_id: 7, field: "aspaz", raw_field: "Aşpaz", created_at: 1 }],
    });

    await expect(removeField(db, 7, "aspaz")).resolves.toBe(true);
    expect(tables.userFields).toEqual([]);
  });

  it("trims the field before matching", async () => {
    const { db, calls } = createFakeDb({
      userFields: [{ telegram_id: 7, field: "aspaz", raw_field: "Aşpaz", created_at: 1 }],
    });

    await expect(removeField(db, 7, "  aspaz ")).resolves.toBe(true);
    expect(calls[0]?.params).toEqual([7, "aspaz"]);
  });

  it("reports false when the user has no such field", async () => {
    const { db } = createFakeDb({
      userFields: [{ telegram_id: 7, field: "aspaz", raw_field: "Aşpaz", created_at: 1 }],
    });

    await expect(removeField(db, 8, "aspaz")).resolves.toBe(false);
  });
});

describe("listFields", () => {
  it("returns this user's fields oldest first, breaking ties on the raw text", async () => {
    const { db } = createFakeDb({
      userFields: [
        { telegram_id: 7, field: "b", raw_field: "B", created_at: 20 },
        { telegram_id: 7, field: "c", raw_field: "C", created_at: 10 },
        { telegram_id: 7, field: "a", raw_field: "A", created_at: 10 },
        { telegram_id: 8, field: "z", raw_field: "Z", created_at: 5 },
      ],
    });

    await expect(listFields(db, 7)).resolves.toEqual([
      { telegramId: 7, field: "a", rawField: "A", createdAt: 10 },
      { telegramId: 7, field: "c", rawField: "C", createdAt: 10 },
      { telegramId: 7, field: "b", rawField: "B", createdAt: 20 },
    ]);
  });

  it("returns an empty list for a user with no fields", async () => {
    const { db } = createFakeDb();

    await expect(listFields(db, 7)).resolves.toEqual([]);
  });
});

describe("setActive", () => {
  it("binds 1 when activating and 0 when deactivating", async () => {
    const { db, tables, calls } = createFakeDb({
      users: [{ telegram_id: 7, username: null, created_at: 1, is_active: 1 }],
    });

    await setActive(db, 7, false);
    expect(tables.users[0]?.is_active).toBe(0);

    await setActive(db, 7, true);
    expect(tables.users[0]?.is_active).toBe(1);
    expect(calls.map((call) => call.params)).toEqual([
      [0, 7],
      [1, 7],
    ]);
  });

  it("does not create a row for an unknown user", async () => {
    const { db, tables } = createFakeDb();

    await setActive(db, 7, false);

    expect(tables.users).toEqual([]);
  });
});

describe("listActiveUsersWithFields", () => {
  const population: Partial<Tables> = {
    users: [
      { telegram_id: 7, username: "seven", created_at: 1, is_active: 1 },
      { telegram_id: 8, username: null, created_at: 1, is_active: 0 },
      { telegram_id: 9, username: "nine", created_at: 1, is_active: 1 },
    ],
    userFields: [
      { telegram_id: 7, field: "b", raw_field: "B", created_at: 20 },
      { telegram_id: 7, field: "a", raw_field: "A", created_at: 10 },
      { telegram_id: 8, field: "x", raw_field: "X", created_at: 1 },
    ],
  };

  function fresh() {
    return createFakeDb({
      users: [...(population.users ?? [])],
      userFields: [...(population.userFields ?? [])],
    });
  }

  it("groups each active user's fields, oldest first", async () => {
    const { db } = fresh();

    await expect(listActiveUsersWithFields(db)).resolves.toEqual([
      {
        telegramId: 7,
        username: "seven",
        fields: [
          { telegramId: 7, field: "a", rawField: "A", createdAt: 10 },
          { telegramId: 7, field: "b", rawField: "B", createdAt: 20 },
        ],
      },
    ]);
  });

  it("leaves out inactive users and active users with no field", async () => {
    const { db } = fresh();

    const users = await listActiveUsersWithFields(db);

    expect(users.map((user) => user.telegramId)).toEqual([7]);
  });

  it("binds null twice when no user is named", async () => {
    const { db, calls } = fresh();

    await listActiveUsersWithFields(db);

    expect(calls[0]?.params).toEqual([null, null]);
  });

  it("binds the id twice and returns only that user when one is named", async () => {
    const { db, calls } = fresh();

    const users = await listActiveUsersWithFields(db, 7);

    expect(users.map((user) => user.telegramId)).toEqual([7]);
    expect(calls[0]?.params).toEqual([7, 7]);
  });

  it("returns nothing when the named user is inactive", async () => {
    const { db } = fresh();

    await expect(listActiveUsersWithFields(db, 8)).resolves.toEqual([]);
  });
});
