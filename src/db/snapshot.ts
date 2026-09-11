import type { RawVacancy } from "../scrapers/types";

/** A scraped vacancy plus the fingerprint used to deduplicate and track it. */
export interface SnapshotVacancy {
  vacancy: RawVacancy;
  fingerprint: string;
}

interface SnapshotRow {
  fingerprint: string;
  title: string;
  company: string;
  location: string;
  url: string;
  source: string;
  posted_at: string | null;
  seen_at: number;
}

/** D1 rejects oversized batches, so writes go out in chunks. */
const BATCH_SIZE = 50;

/**
 * Stores the vacancies the hourly run just saw. `/axtar` answers from this
 * table instead of scraping, which keeps a manual search well inside the
 * webhook budget and spares the job boards a burst of traffic per user.
 */
export async function saveSnapshot(db: D1Database, vacancies: readonly SnapshotVacancy[]): Promise<void> {
  if (vacancies.length === 0) {
    return;
  }

  const now = unixSeconds();
  const statement = db.prepare(
    `
    INSERT INTO vacancy_snapshot (fingerprint, title, company, location, url, source, posted_at, seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(fingerprint) DO UPDATE SET
      url = excluded.url,
      location = excluded.location,
      posted_at = excluded.posted_at,
      seen_at = excluded.seen_at
    `,
  );

  for (let start = 0; start < vacancies.length; start += BATCH_SIZE) {
    await db.batch(
      vacancies.slice(start, start + BATCH_SIZE).map(({ vacancy, fingerprint }) =>
        statement.bind(
          fingerprint,
          vacancy.title,
          vacancy.company,
          vacancy.location,
          vacancy.url,
          vacancy.source,
          vacancy.postedAt ?? null,
          now,
        ),
      ),
    );
  }
}

/** Vacancies still listed by their source within the given window. */
export async function listSnapshot(db: D1Database, maxAgeSeconds: number): Promise<SnapshotVacancy[]> {
  const cutoff = unixSeconds() - Math.floor(maxAgeSeconds);
  const result = await db
    .prepare(
      `
      SELECT fingerprint, title, company, location, url, source, posted_at, seen_at
      FROM vacancy_snapshot
      WHERE seen_at >= ?
      ORDER BY seen_at DESC
      `,
    )
    .bind(cutoff)
    .all<SnapshotRow>();

  return result.results.map((row) => ({
    fingerprint: row.fingerprint,
    vacancy: {
      title: row.title,
      company: row.company,
      location: row.location,
      url: row.url,
      source: row.source,
      postedAt: row.posted_at ?? undefined,
    },
  }));
}

/** Drops vacancies no source has listed for a while; they are almost certainly filled. */
export async function pruneSnapshotOlderThan(db: D1Database, days: number): Promise<number> {
  const cutoff = unixSeconds() - Math.floor(days * 24 * 60 * 60);
  const result = await db
    .prepare(
      `
      DELETE FROM vacancy_snapshot
      WHERE seen_at < ?
      `,
    )
    .bind(cutoff)
    .run();

  return result.meta.changes;
}

function unixSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
