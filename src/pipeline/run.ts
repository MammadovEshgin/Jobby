import { listActiveUsersWithFields, type ActiveUserWithFields } from "../db/users";
import { listSnapshot, pruneSnapshotOlderThan, saveSnapshot, type SnapshotVacancy } from "../db/snapshot";
import { listSentFingerprints, markManySent, pruneOlderThan } from "../db/vacancies";
import { compile, compileAll, matchCompiled, type CompiledText } from "../matching/match";
import { fetchAllVacancies } from "../scrapers";
import type { RawVacancy } from "../scrapers/types";
import { fingerprint } from "../utils/fingerprint";
import { logError, logInfo } from "../utils/log";
import { formatVacancyMessages } from "./format";

/** Upper bound on a single manual search so one reply never runs to dozens of messages. */
export const MANUAL_SEARCH_LIMIT = 60;

/** How long a vacancy counts as open after the last time a source listed it. */
export const SNAPSHOT_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export interface PipelineEnv {
  DB: D1Database;
  BOT_TOKEN: string;
}

export interface PipelineResult {
  scraped: number;
  deduped: number;
  usersChecked: number;
  messagesSent: number;
  vacanciesSent: number;
  truncated: boolean;
}

interface Candidate extends SnapshotVacancy {
  title: CompiledText;
}

interface MatchedVacancy extends SnapshotVacancy {
  score: number;
  alreadySent: boolean;
}

/**
 * Hourly run: scrape every source, remember what is open, and send each user
 * the matches they have not received yet.
 */
export async function runPipeline(env: PipelineEnv, options: { pruneOld?: boolean } = {}): Promise<PipelineResult> {
  if (options.pruneOld === true) {
    await pruneOlderThan(env.DB, 60);
    await pruneSnapshotOlderThan(env.DB, 14);
  }

  const scraped = await fetchAllVacancies();
  const candidates = await toCandidates(scraped);

  await saveSnapshot(
    env.DB,
    candidates.map(({ vacancy, fingerprint: key }) => ({ vacancy, fingerprint: key })),
  );

  const users = await listActiveUsersWithFields(env.DB);
  const delivered = await deliver(env, candidates, users, { includeAlreadySent: false });

  return { scraped: scraped.length, deduped: candidates.length, usersChecked: users.length, ...delivered };
}

/**
 * `/axtar`: answer from the last scrape so the search finishes in a second or
 * two, and return every open match — including ones already delivered.
 */
export async function runManualSearch(env: PipelineEnv, telegramId: number): Promise<PipelineResult> {
  const users = await listActiveUsersWithFields(env.DB, telegramId);
  const stored = await listSnapshot(env.DB, SNAPSHOT_MAX_AGE_SECONDS);
  let candidates: Candidate[];
  let scraped = stored.length;

  if (stored.length === 0) {
    // No hourly run has landed yet (fresh deploy, or the table was pruned).
    const live = await fetchAllVacancies();
    scraped = live.length;
    candidates = await toCandidates(live);
    await saveSnapshot(
      env.DB,
      candidates.map(({ vacancy, fingerprint: key }) => ({ vacancy, fingerprint: key })),
    );
  } else {
    candidates = stored.map((item) => ({ ...item, title: compile(item.vacancy.title) }));
  }

  const delivered = await deliver(env, candidates, users, { includeAlreadySent: true });

  return { scraped, deduped: candidates.length, usersChecked: users.length, ...delivered };
}

async function toCandidates(vacancies: readonly RawVacancy[]): Promise<Candidate[]> {
  const seen = new Set<string>();
  const candidates: Candidate[] = [];

  for (const vacancy of vacancies) {
    const key = await fingerprint(vacancy.title, vacancy.company);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    // Titles are analysed once per run and reused for every user.
    candidates.push({ vacancy, fingerprint: key, title: compile(vacancy.title) });
  }

  return candidates;
}

async function deliver(
  env: PipelineEnv,
  candidates: readonly Candidate[],
  users: readonly ActiveUserWithFields[],
  options: { includeAlreadySent: boolean },
): Promise<Pick<PipelineResult, "messagesSent" | "vacanciesSent" | "truncated">> {
  let messagesSent = 0;
  let vacanciesSent = 0;
  let truncated = false;

  for (const user of users) {
    const sent = await listSentFingerprints(env.DB, user.telegramId);
    const matched = matchForUser(candidates, user, sent);
    const selected = options.includeAlreadySent ? matched : matched.filter((item) => !item.alreadySent);

    if (selected.length === 0) {
      continue;
    }

    const visible = options.includeAlreadySent ? selected.slice(0, MANUAL_SEARCH_LIMIT) : selected;
    truncated = truncated || visible.length < selected.length;

    const messages = formatVacancyMessages({
      vacancies: visible.map((item) => item.vacancy),
      total: selected.length,
    });

    try {
      for (const message of messages) {
        await sendTelegramMessage(env.BOT_TOKEN, user.telegramId, message);
        messagesSent += 1;
      }
    } catch (error) {
      // One blocked or rate-limited chat must not stop the rest of the run.
      logError("delivery_failed", error, { telegramId: user.telegramId });
      continue;
    }

    await markManySent(
      env.DB,
      visible
        .filter((item) => !item.alreadySent)
        .map((item) => ({
          fingerprint: item.fingerprint,
          telegramId: user.telegramId,
          source: item.vacancy.source,
        })),
    );
    vacanciesSent += visible.length;
  }

  return { messagesSent, vacanciesSent, truncated };
}

function matchForUser(
  candidates: readonly Candidate[],
  user: ActiveUserWithFields,
  sent: ReadonlySet<string>,
): MatchedVacancy[] {
  const fields = compileAll(user.fields.map((field) => field.field));
  const matched: MatchedVacancy[] = [];

  for (const candidate of candidates) {
    const result = matchCompiled(candidate.title, fields);

    if (!result.matched) {
      continue;
    }

    matched.push({
      vacancy: candidate.vacancy,
      fingerprint: candidate.fingerprint,
      score: result.score,
      alreadySent: sent.has(candidate.fingerprint),
    });
  }

  // Tightest match first, so the most relevant vacancy heads the message.
  return matched.sort((left, right) => right.score - left.score || left.vacancy.title.localeCompare(right.vacancy.title));
}

async function sendTelegramMessage(token: string, chatId: number, text: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    if (response.ok) {
      return;
    }

    if (response.status !== 429) {
      throw new Error(`Telegram sendMessage failed with HTTP ${response.status}.`);
    }

    const retryAfter = await retryAfterSeconds(response);
    logInfo("telegram_rate_limited", { chatId, retryAfter });
    await sleep(Math.min(retryAfter, 5) * 1000);
  }

  throw new Error("Telegram sendMessage failed after 3 attempts.");
}

async function retryAfterSeconds(response: Response): Promise<number> {
  try {
    const body = (await response.json()) as { parameters?: { retry_after?: number } };
    return body.parameters?.retry_after ?? 1;
  } catch {
    return 1;
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
