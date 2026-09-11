export interface UserFieldRecord {
  telegramId: number;
  field: string;
  rawField: string;
  createdAt: number;
}

export type SearchMode = "strict" | "normal" | "broad";

export interface ActiveUserWithFields {
  telegramId: number;
  username: string | null;
  searchMode: SearchMode;
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
  search_mode: string;
}

export interface UpsertUserInput {
  telegramId: number;
  username?: string | null;
}

export interface AddFieldInput {
  telegramId: number;
  field: string;
  rawField: string;
}

export async function upsertUser(db: D1Database, input: UpsertUserInput): Promise<void> {
  const now = unixSeconds();
  const username = input.username ?? null;

  await db
    .prepare(
      `
      INSERT INTO users (telegram_id, username, created_at, is_active, search_mode)
      VALUES (?, ?, ?, 1, 'normal')
      ON CONFLICT(telegram_id) DO UPDATE SET
        username = excluded.username,
        is_active = 1
      `,
    )
    .bind(input.telegramId, username, now)
    .run();
}

export async function addField(db: D1Database, input: AddFieldInput): Promise<void> {
  const field = input.field.trim();
  const rawField = input.rawField.trim();

  if (field.length === 0 || rawField.length === 0) {
    throw new Error("Field must not be empty.");
  }

  await db
    .prepare(
      `
      INSERT INTO user_fields (telegram_id, field, raw_field, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(telegram_id, field) DO UPDATE SET
        raw_field = excluded.raw_field
      `,
    )
    .bind(input.telegramId, field, rawField, unixSeconds())
    .run();
}

export async function removeField(db: D1Database, telegramId: number, field: string): Promise<boolean> {
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

export async function setActive(db: D1Database, telegramId: number, isActive: boolean): Promise<void> {
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

export async function getSearchMode(db: D1Database, telegramId: number): Promise<SearchMode> {
  const result = await db
    .prepare(
      `
      SELECT search_mode
      FROM users
      WHERE telegram_id = ?
      `,
    )
    .bind(telegramId)
    .first<{ search_mode: string }>();

  return normalizeSearchMode(result?.search_mode);
}

export async function setSearchMode(db: D1Database, telegramId: number, mode: SearchMode): Promise<void> {
  await db
    .prepare(
      `
      UPDATE users
      SET search_mode = ?
      WHERE telegram_id = ?
      `,
    )
    .bind(mode, telegramId)
    .run();
}

export async function listActiveUsersWithFields(
  db: D1Database,
  telegramId?: number,
): Promise<ActiveUserWithFields[]> {
  const result = await db
    .prepare(
      `
      SELECT u.telegram_id, u.username, u.search_mode, f.field, f.raw_field, f.created_at
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
    const existing =
      users.get(row.telegram_id) ??
      {
        telegramId: row.telegram_id,
        username: row.username,
        searchMode: normalizeSearchMode(row.search_mode),
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

export function normalizeSearchMode(value: string | null | undefined): SearchMode {
  if (value === "strict" || value === "normal" || value === "broad") {
    return value;
  }

  return "normal";
}

function unixSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
