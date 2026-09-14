import { unixSeconds } from "./time";

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

/**
 * Checks the cooldown and starts the next one in a single conditional write, so
 * two overlapping `/axtar` for one user cannot both pass. A separate read and
 * write would leave a gap between the two round trips that both requests could
 * slip through, which is why there is no standalone "record a search" call.
 */
export async function claimManualSearch(
  db: D1Database,
  telegramId: number,
  cooldownSeconds = DEFAULT_COOLDOWN_SECONDS,
): Promise<ManualSearchLimit> {
  const claim = await db
    .prepare(
      `
      INSERT INTO manual_search_log (telegram_id, last_run_at)
      VALUES (?, ?)
      ON CONFLICT(telegram_id) DO UPDATE SET
        last_run_at = excluded.last_run_at
      WHERE excluded.last_run_at - manual_search_log.last_run_at >= ?
      `,
    )
    .bind(telegramId, unixSeconds(), cooldownSeconds)
    .run();

  if (claim.meta.changes > 0) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const { retryAfterSeconds } = await checkManualSearchLimit(db, telegramId, cooldownSeconds);

  return { allowed: false, retryAfterSeconds };
}
