export interface SentVacancyRecord {
  fingerprint: string;
  telegramId: number;
  firstSeen: number;
  source: string;
}

export interface MarkSentInput {
  fingerprint: string;
  telegramId: number;
  source: string;
}

export async function wasSent(db: D1Database, fingerprint: string, telegramId: number): Promise<boolean> {
  const row = await db
    .prepare(
      `
      SELECT fingerprint
      FROM sent_vacancies
      WHERE fingerprint = ? AND telegram_id = ?
      `,
    )
    .bind(fingerprint, telegramId)
    .first<{ fingerprint: string }>();

  return row !== null;
}

export async function markSent(db: D1Database, input: MarkSentInput): Promise<void> {
  await db
    .prepare(
      `
      INSERT INTO sent_vacancies (fingerprint, telegram_id, first_seen, source)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(fingerprint, telegram_id) DO NOTHING
      `,
    )
    .bind(input.fingerprint, input.telegramId, unixSeconds(), input.source)
    .run();
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

function unixSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
