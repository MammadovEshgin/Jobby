import { unixSeconds } from "./time";

export interface MarkSentInput {
  fingerprint: string;
  telegramId: number;
  source: string;
}

/** Every fingerprint already delivered to this user, as one round trip. */
export async function listSentFingerprints(
  db: D1Database,
  telegramId: number,
): Promise<Set<string>> {
  const result = await db
    .prepare(
      `
      SELECT fingerprint
      FROM sent_vacancies
      WHERE telegram_id = ?
      `,
    )
    .bind(telegramId)
    .all<{ fingerprint: string }>();

  return new Set(result.results.map((row) => row.fingerprint));
}

/** Records a whole batch in one D1 round trip instead of one per vacancy. */
export async function markManySent(
  db: D1Database,
  inputs: readonly MarkSentInput[],
): Promise<void> {
  if (inputs.length === 0) {
    return;
  }

  const now = unixSeconds();
  const statement = db.prepare(
    `
    INSERT INTO sent_vacancies (fingerprint, telegram_id, first_seen, source)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(fingerprint, telegram_id) DO NOTHING
    `,
  );

  await db.batch(
    inputs.map((input) => statement.bind(input.fingerprint, input.telegramId, now, input.source)),
  );
}

export async function pruneOlderThan(db: D1Database, days: number): Promise<number> {
  if (!Number.isFinite(days) || days < 0) {
    throw new Error("Days must be a non-negative number.");
  }

  const cutoff = unixSeconds() - Math.floor(days * 24 * 60 * 60);
  const result = await db
    .prepare(
      `
      DELETE FROM sent_vacancies
      WHERE first_seen < ?
      `,
    )
    .bind(cutoff)
    .run();

  return result.meta.changes;
}
