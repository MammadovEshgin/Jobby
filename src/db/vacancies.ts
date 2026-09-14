import { cutoffDaysAgo, unixSeconds } from "./time";

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

/**
 * Forgets deliveries of vacancies no board has listed within the window. The
 * window runs from the latest sighting, not from the delivery: the snapshot
 * forgets a vacancy soon after it stops being listed, so each prune first
 * carries the sighting into `first_seen`. A vacancy still listed, or listed
 * again after a scraper outage, is therefore never sent to the same user twice,
 * and the table stays bounded by what boards listed within the window.
 */
export async function pruneOlderThan(db: D1Database, days: number): Promise<number> {
  const cutoff = cutoffDaysAgo(days);
  // One transaction, so a sighting saved between the two cannot be missed.
  const [, deleted] = await db.batch([
    db
      .prepare(
        `
        UPDATE sent_vacancies
        SET first_seen = vacancy_snapshot.seen_at
        FROM vacancy_snapshot
        WHERE vacancy_snapshot.fingerprint = sent_vacancies.fingerprint
          AND sent_vacancies.first_seen < ?
          AND sent_vacancies.first_seen < vacancy_snapshot.seen_at
        `,
      )
      .bind(cutoff),
    db
      .prepare(
        `
        DELETE FROM sent_vacancies
        WHERE first_seen < ?
        `,
      )
      .bind(cutoff),
  ]);

  return deleted?.meta.changes ?? 0;
}
