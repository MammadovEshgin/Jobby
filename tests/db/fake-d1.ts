/**
 * A D1 double with real table semantics: conflict clauses, cutoffs and ordering
 * behave as SQLite would, so a test asserts on the rows that end up stored and
 * on the bound parameters rather than on the wording of a statement.
 *
 * Statements are routed by verb plus table, the pair being unique across
 * `src/db`. An unrecognised pair throws instead of silently doing nothing.
 */

interface UserRow {
  telegram_id: number;
  username: string | null;
  created_at: number;
  is_active: number;
}

interface UserFieldRow {
  telegram_id: number;
  field: string;
  raw_field: string;
  created_at: number;
}

interface SentVacancyRow {
  fingerprint: string;
  telegram_id: number;
  first_seen: number;
  source: string;
}

interface ManualSearchRow {
  telegram_id: number;
  last_run_at: number;
}

export interface SnapshotRow {
  fingerprint: string;
  title: string;
  company: string;
  location: string;
  url: string;
  source: string;
  posted_at: string | null;
  seen_at: number;
}

export interface Tables {
  users: UserRow[];
  userFields: UserFieldRow[];
  sentVacancies: SentVacancyRow[];
  manualSearchLog: ManualSearchRow[];
  vacancySnapshot: SnapshotRow[];
}

interface Call {
  route: string;
  params: unknown[];
}

export interface FakeDb {
  db: D1Database;
  tables: Tables;
  calls: Call[];
  batchSizes: number[];
}

interface Outcome {
  results: object[];
  changes: number;
}

type Handler = (params: readonly unknown[], tables: Tables) => Outcome;

export function createFakeDb(seed: Partial<Tables> = {}): FakeDb {
  const tables: Tables = {
    users: seed.users ?? [],
    userFields: seed.userFields ?? [],
    sentVacancies: seed.sentVacancies ?? [],
    manualSearchLog: seed.manualSearchLog ?? [],
    vacancySnapshot: seed.vacancySnapshot ?? [],
  };
  const calls: Call[] = [];
  const batchSizes: number[] = [];

  function execute(sql: string, params: unknown[]): Outcome {
    const route = routeOf(sql);
    const handler = handlers.get(route);

    if (handler === undefined) {
      throw new Error(`fake D1 has no handler for "${route}": ${sql.trim()}`);
    }

    calls.push({ route, params });
    return handler(params, tables);
  }

  function statement(sql: string, params: unknown[]): D1PreparedStatement {
    return {
      bind: (...args: unknown[]) => statement(sql, args),
      async all() {
        return { results: execute(sql, params).results, success: true };
      },
      async first() {
        const [row] = execute(sql, params).results;
        return row ?? null;
      },
      async run() {
        return { meta: { changes: execute(sql, params).changes }, success: true };
      },
      raw: () => [],
    } as unknown as D1PreparedStatement;
  }

  const db = {
    prepare: (sql: string) => statement(sql, []),
    async batch(statements: D1PreparedStatement[]) {
      batchSizes.push(statements.length);
      const runnable = statements as unknown as { run: () => Promise<unknown> }[];
      return await Promise.all(runnable.map(async (item) => await item.run()));
    },
  } as unknown as D1Database;

  return { db, tables, calls, batchSizes };
}

function routeOf(sql: string): string {
  const text = sql.replace(/\s+/gu, " ").trim();
  const verb = /^(SELECT|INSERT|UPDATE|DELETE)\b/iu.exec(text)?.[1] ?? "?";
  const table = /\b(?:FROM|INTO|UPDATE)\s+([a-z_]+)/iu.exec(text)?.[1] ?? "?";

  return `${verb.toUpperCase()} ${table}`;
}

function text(value: unknown): string {
  return String(value);
}

function nullableText(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function replaceAll<T>(rows: T[], kept: T[]): number {
  const removed = rows.length - kept.length;
  rows.splice(0, rows.length, ...kept);

  return removed;
}

function insertUser(params: readonly unknown[], tables: Tables): Outcome {
  const [telegramId, username, createdAt] = params;
  const id = Number(telegramId);
  const existing = tables.users.find((row) => row.telegram_id === id);

  if (existing === undefined) {
    tables.users.push({
      telegram_id: id,
      username: nullableText(username),
      created_at: Number(createdAt),
      is_active: 1,
    });
  } else {
    existing.username = nullableText(username);
    existing.is_active = 1;
  }

  return { results: [], changes: 1 };
}

function updateUser(params: readonly unknown[], tables: Tables): Outcome {
  const [isActive, telegramId] = params;
  const existing = tables.users.find((row) => row.telegram_id === Number(telegramId));

  if (existing === undefined) {
    return { results: [], changes: 0 };
  }

  existing.is_active = Number(isActive);

  return { results: [], changes: 1 };
}

function selectActiveUsersWithFields(params: readonly unknown[], tables: Tables): Outcome {
  const [filter] = params;
  const wanted = filter === null || filter === undefined ? null : Number(filter);
  const active = tables.users.filter(
    (user) => user.is_active === 1 && (wanted === null || user.telegram_id === wanted),
  );
  const joined = active.flatMap((user) =>
    tables.userFields
      .filter((row) => row.telegram_id === user.telegram_id)
      .map((row) => ({
        telegram_id: user.telegram_id,
        username: user.username,
        field: row.field,
        raw_field: row.raw_field,
        created_at: row.created_at,
      })),
  );

  joined.sort((a, b) => a.telegram_id - b.telegram_id || a.created_at - b.created_at);

  return { results: joined, changes: 0 };
}

function insertUserField(params: readonly unknown[], tables: Tables): Outcome {
  const [telegramId, field, rawField, createdAt] = params;
  const id = Number(telegramId);
  const name = text(field);
  const existing = tables.userFields.find((row) => row.telegram_id === id && row.field === name);

  if (existing === undefined) {
    tables.userFields.push({
      telegram_id: id,
      field: name,
      raw_field: text(rawField),
      created_at: Number(createdAt),
    });
  } else {
    existing.raw_field = text(rawField);
  }

  return { results: [], changes: 1 };
}

function deleteUserField(params: readonly unknown[], tables: Tables): Outcome {
  const [telegramId, field] = params;
  const id = Number(telegramId);
  const name = text(field);
  const changes = replaceAll(
    tables.userFields,
    tables.userFields.filter((row) => row.telegram_id !== id || row.field !== name),
  );

  return { results: [], changes };
}

function selectUserFields(params: readonly unknown[], tables: Tables): Outcome {
  const [telegramId] = params;
  const results = tables.userFields
    .filter((row) => row.telegram_id === Number(telegramId))
    .sort((a, b) => a.created_at - b.created_at || compareText(a.raw_field, b.raw_field));

  return { results, changes: 0 };
}

function selectSentFingerprints(params: readonly unknown[], tables: Tables): Outcome {
  const [telegramId] = params;
  const results = tables.sentVacancies
    .filter((row) => row.telegram_id === Number(telegramId))
    .map((row) => ({ fingerprint: row.fingerprint }));

  return { results, changes: 0 };
}

function insertSentVacancy(params: readonly unknown[], tables: Tables): Outcome {
  const [fingerprint, telegramId, firstSeen, source] = params;
  const key = text(fingerprint);
  const id = Number(telegramId);
  const clash = tables.sentVacancies.some(
    (row) => row.fingerprint === key && row.telegram_id === id,
  );

  if (clash) {
    return { results: [], changes: 0 };
  }

  tables.sentVacancies.push({
    fingerprint: key,
    telegram_id: id,
    first_seen: Number(firstSeen),
    source: text(source),
  });

  return { results: [], changes: 1 };
}

function deleteSentVacancies(params: readonly unknown[], tables: Tables): Outcome {
  const [cutoff] = params;
  const changes = replaceAll(
    tables.sentVacancies,
    tables.sentVacancies.filter((row) => row.first_seen >= Number(cutoff)),
  );

  return { results: [], changes };
}

function insertSnapshot(params: readonly unknown[], tables: Tables): Outcome {
  const [fingerprint, title, company, location, url, source, postedAt, seenAt] = params;
  const key = text(fingerprint);
  const existing = tables.vacancySnapshot.find((row) => row.fingerprint === key);

  if (existing === undefined) {
    tables.vacancySnapshot.push({
      fingerprint: key,
      title: text(title),
      company: text(company),
      location: text(location),
      url: text(url),
      source: text(source),
      posted_at: nullableText(postedAt),
      seen_at: Number(seenAt),
    });

    return { results: [], changes: 1 };
  }

  existing.url = text(url);
  existing.location = text(location);
  existing.posted_at = nullableText(postedAt);
  existing.seen_at = Number(seenAt);

  return { results: [], changes: 1 };
}

function selectSnapshot(params: readonly unknown[], tables: Tables): Outcome {
  const [cutoff] = params;
  const results = tables.vacancySnapshot
    .filter((row) => row.seen_at >= Number(cutoff))
    .sort((a, b) => b.seen_at - a.seen_at);

  return { results, changes: 0 };
}

function deleteSnapshot(params: readonly unknown[], tables: Tables): Outcome {
  const [cutoff] = params;
  const changes = replaceAll(
    tables.vacancySnapshot,
    tables.vacancySnapshot.filter((row) => row.seen_at >= Number(cutoff)),
  );

  return { results: [], changes };
}

function selectManualSearchLog(params: readonly unknown[], tables: Tables): Outcome {
  const [telegramId] = params;
  const results = tables.manualSearchLog
    .filter((row) => row.telegram_id === Number(telegramId))
    .map((row) => ({ last_run_at: row.last_run_at }));

  return { results, changes: 0 };
}

function insertManualSearchLog(params: readonly unknown[], tables: Tables): Outcome {
  const [telegramId, lastRunAt] = params;
  const id = Number(telegramId);
  const existing = tables.manualSearchLog.find((row) => row.telegram_id === id);

  if (existing === undefined) {
    tables.manualSearchLog.push({ telegram_id: id, last_run_at: Number(lastRunAt) });
  } else {
    existing.last_run_at = Number(lastRunAt);
  }

  return { results: [], changes: 1 };
}

function compareText(a: string, b: string): number {
  if (a === b) {
    return 0;
  }

  return a < b ? -1 : 1;
}

const handlers = new Map<string, Handler>([
  ["INSERT users", insertUser],
  ["UPDATE users", updateUser],
  ["SELECT users", selectActiveUsersWithFields],
  ["INSERT user_fields", insertUserField],
  ["DELETE user_fields", deleteUserField],
  ["SELECT user_fields", selectUserFields],
  ["SELECT sent_vacancies", selectSentFingerprints],
  ["INSERT sent_vacancies", insertSentVacancy],
  ["DELETE sent_vacancies", deleteSentVacancies],
  ["INSERT vacancy_snapshot", insertSnapshot],
  ["SELECT vacancy_snapshot", selectSnapshot],
  ["DELETE vacancy_snapshot", deleteSnapshot],
  ["SELECT manual_search_log", selectManualSearchLog],
  ["INSERT manual_search_log", insertManualSearchLog],
]);
