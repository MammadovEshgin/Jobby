export interface ManualSearchLimit {
  allowed: boolean;
  retryAfterSeconds: number;
}

const DEFAULT_COOLDOWN_SECONDS = 10;

export async function checkManualSearchLimit(
  db: D1Database,
  telegramId: number,
  cooldownSeconds = DEFAULT_COOLDOWN_SECONDS,
): Promise<ManualSearchLimit> {
  const now = unixSeconds();
  const row = await db
    .prepare(
      `
      SELECT last_run_at
      FROM manual_search_log
      WHERE telegram_id = ?
      `,
    )
    .bind(telegramId)
    .first<{ last_run_at: number }>();

  if (row === null) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const retryAfterSeconds = cooldownSeconds - (now - row.last_run_at);

  return {
    allowed: retryAfterSeconds <= 0,
    retryAfterSeconds: Math.max(0, retryAfterSeconds),
  };
}

export async function recordManualSearch(db: D1Database, telegramId: number): Promise<void> {
  await db
    .prepare(
      `
      INSERT INTO manual_search_log (telegram_id, last_run_at)
      VALUES (?, ?)
      ON CONFLICT(telegram_id) DO UPDATE SET
        last_run_at = excluded.last_run_at
      `,
    )
    .bind(telegramId, unixSeconds())
    .run();
}

function unixSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
