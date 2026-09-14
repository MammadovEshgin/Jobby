import { unixSeconds } from "./time";

export interface UserFieldRecord {
  telegramId: number;
  field: string;
  rawField: string;
  createdAt: number;
}

export interface ActiveUserWithFields {
  telegramId: number;
  username: string | null;
  fields: UserFieldRecord[];
}

interface UserFieldRow {
  telegram_id: number;
  field: string;
  raw_field: string;
  created_at: number;
}

interface ActiveUserFieldRow extends UserFieldRow {
  username: string | null;
}

export interface UpsertUserInput {
  telegramId: number;
  username?: string | null;
}

/** Each followed field is matched against every vacancy on every hourly run, so the list is bounded. */
export const MAX_FIELDS_PER_USER = 20;

export interface AddFieldInput {
  telegramId: number;
  field: string;
  rawField: string;
}

export async function upsertUser(db: D1Database, input: UpsertUserInput): Promise<void> {
  await db
    .prepare(
      `
      INSERT INTO users (telegram_id, username, created_at, is_active)
      VALUES (?, ?, ?, 1)
      ON CONFLICT(telegram_id) DO UPDATE SET
        username = excluded.username
      `,
    )
    .bind(input.telegramId, input.username ?? null, unixSeconds())
    .run();
}

/**
 * Stores a field, or refreshes the text of one the user already follows. A new field is refused once
 * the user follows `MAX_FIELDS_PER_USER`; the count is checked inside the same write, so two
 * overlapping additions cannot both slip past the limit. Resolves to whether the field was stored.
 */
export async function addField(db: D1Database, input: AddFieldInput): Promise<boolean> {
  const field = input.field.trim();
  const rawField = input.rawField.trim();

  if (field.length === 0 || rawField.length === 0) {
    throw new Error("Field must not be empty.");
  }

  const result = await db
    .prepare(
      `
      INSERT INTO user_fields (telegram_id, field, raw_field, created_at)
      SELECT ?, ?, ?, ?
      WHERE (SELECT COUNT(*) FROM user_fields WHERE telegram_id = ?) < ?
        OR EXISTS (SELECT 1 FROM user_fields WHERE telegram_id = ? AND field = ?)
      ON CONFLICT(telegram_id, field) DO UPDATE SET
        raw_field = excluded.raw_field
      `,
    )
    .bind(
      input.telegramId,
      field,
      rawField,
      unixSeconds(),
      input.telegramId,
      MAX_FIELDS_PER_USER,
      input.telegramId,
      field,
    )
    .run();

  return result.meta.changes > 0;
}

export async function removeField(
  db: D1Database,
  telegramId: number,
  field: string,
): Promise<boolean> {
  const result = await db
    .prepare(
      `
      DELETE FROM user_fields
      WHERE telegram_id = ? AND field = ?
      `,
    )
    .bind(telegramId, field.trim())
    .run();

  return result.meta.changes > 0;
}

export async function listFields(db: D1Database, telegramId: number): Promise<UserFieldRecord[]> {
  const result = await db
    .prepare(
      `
      SELECT telegram_id, field, raw_field, created_at
      FROM user_fields
      WHERE telegram_id = ?
      ORDER BY created_at ASC, raw_field ASC
      `,
    )
    .bind(telegramId)
    .all<UserFieldRow>();

  return result.results.map(mapUserFieldRow);
}

export async function setActive(
  db: D1Database,
  telegramId: number,
  isActive: boolean,
): Promise<void> {
  await db
    .prepare(
      `
      UPDATE users
      SET is_active = ?
      WHERE telegram_id = ?
      `,
    )
    .bind(isActive ? 1 : 0, telegramId)
    .run();
}

export async function listActiveUsersWithFields(
  db: D1Database,
  telegramId?: number,
): Promise<ActiveUserWithFields[]> {
  const result = await db
    .prepare(
      `
      SELECT u.telegram_id, u.username, f.field, f.raw_field, f.created_at
      FROM users u
      INNER JOIN user_fields f ON f.telegram_id = u.telegram_id
      WHERE u.is_active = 1 AND (? IS NULL OR u.telegram_id = ?)
      ORDER BY u.telegram_id ASC, f.created_at ASC
      `,
    )
    .bind(telegramId ?? null, telegramId ?? null)
    .all<ActiveUserFieldRow>();

  const users = new Map<number, ActiveUserWithFields>();

  for (const row of result.results) {
    const existing = users.get(row.telegram_id) ?? {
      telegramId: row.telegram_id,
      username: row.username,
      fields: [],
    };

    existing.fields.push(mapUserFieldRow(row));
    users.set(row.telegram_id, existing);
  }

  return [...users.values()];
}

function mapUserFieldRow(row: UserFieldRow): UserFieldRecord {
  return {
    telegramId: row.telegram_id,
    field: row.field,
    rawField: row.raw_field,
    createdAt: row.created_at,
  };
}
