/** Every timestamp column in `schema.sql` holds unix seconds, never milliseconds. */
export function unixSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

const SECONDS_PER_DAY = 24 * 60 * 60;

/**
 * The instant `days` before now, for a prune. A negative or non-finite window
 * would put the cutoff in the future and empty the table, so it is refused.
 */
export function cutoffDaysAgo(days: number): number {
  if (!Number.isFinite(days) || days < 0) {
    throw new Error("Days must be a non-negative number.");
  }

  return unixSeconds() - Math.floor(days * SECONDS_PER_DAY);
}
