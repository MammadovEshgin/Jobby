import { listActiveUsersWithFields, type ActiveUserWithFields } from "../db/users";
import {
  listSnapshot,
  pruneSnapshotOlderThan,
  saveSnapshot,
  type SnapshotVacancy,
} from "../db/snapshot";
import { listSentFingerprints, markManySent, pruneOlderThan } from "../db/vacancies";
import { compile, compileAll, matchCompiled, type CompiledText } from "../matching/match";
import { fetchAllVacancies } from "../scrapers";
import type { RawVacancy } from "../scrapers/types";
import { fingerprint } from "../utils/fingerprint";
import { logError, logInfo } from "../utils/log";
import { formatVacancyMessages, type VacancyMessage } from "./format";

/** Upper bound on a single manual search so one reply never runs to dozens of messages. */
export const MANUAL_SEARCH_LIMIT = 60;

/** How long a vacancy counts as open after the last time a source listed it. */
const SNAPSHOT_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

interface PipelineEnv {
  DB: D1Database;
  BOT_TOKEN: string;
}

interface PipelineResult {
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
export async function runPipeline(
  env: PipelineEnv,
  options: { pruneOld?: boolean } = {},
): Promise<PipelineResult> {
  if (options.pruneOld === true) {
    await pruneOldRows(env.DB);
  }

  const fetched = await fetchAllVacancies();
  const candidates = await toCandidates(fetched);

  await rememberSnapshot(env.DB, candidates);

  const users = await listActiveUsersWithFields(env.DB);
  const delivered = await deliver(env, candidates, users, {
    includeAlreadySent: false,
    limit: Number.POSITIVE_INFINITY,
  });

  return {
    scraped: fetched.length,
    deduped: candidates.length,
    usersChecked: users.length,
    ...delivered,
  };
}

/**
 * `/axtar`: answers from the last scrape so the search finishes in a second or
 * two. Unlike the hourly run it also returns matches the user already received,
 * at most `MANUAL_SEARCH_LIMIT` of them.
 */
export async function runManualSearch(
  env: PipelineEnv,
  telegramId: number,
): Promise<PipelineResult> {
  const users = await listActiveUsersWithFields(env.DB, telegramId);
  const stored = await listSnapshot(env.DB, SNAPSHOT_MAX_AGE_SECONDS);
  let candidates: Candidate[];
  let scraped = stored.length;

  if (stored.length === 0) {
    // No hourly run has landed yet (fresh deploy, or the table was pruned).
    const live = await fetchAllVacancies();
    scraped = live.length;
    candidates = await toCandidates(live);
    await rememberSnapshot(env.DB, candidates);
  } else {
    candidates = stored.map(({ vacancy, fingerprint: key }) => ({
      vacancy,
      fingerprint: key,
      title: compile(vacancy.title),
    }));
  }

  const delivered = await deliver(env, candidates, users, {
    includeAlreadySent: true,
    limit: MANUAL_SEARCH_LIMIT,
  });

  return { scraped, deduped: candidates.length, usersChecked: users.length, ...delivered };
}

/** The snapshot only answers `/axtar`; a failed write costs that, never this run's delivery. */
async function rememberSnapshot(db: D1Database, candidates: readonly Candidate[]): Promise<void> {
  try {
    await saveSnapshot(db, candidates);
  } catch (error) {
    logError("snapshot_save_failed", error);
  }
}

/** Housekeeping: a failed prune costs the table its trim, never the run its delivery. */
async function pruneOldRows(db: D1Database): Promise<void> {
  try {
    await pruneOlderThan(db, 60);
    await pruneSnapshotOlderThan(db, 14);
  } catch (error) {
    logError("prune_failed", error);
  }
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
  options: { includeAlreadySent: boolean; limit: number },
): Promise<Pick<PipelineResult, "messagesSent" | "vacanciesSent" | "truncated">> {
  let messagesSent = 0;
  let vacanciesSent = 0;
  let truncated = false;

  for (const user of users) {
    try {
      const result = await deliverToUser(env, candidates, user, options);
      messagesSent += result.messagesSent;
      vacanciesSent += result.vacanciesSent;
      truncated = truncated || result.truncated;
    } catch (error) {
      // One unreachable chat or failed write must not stop the rest of the run.
      logError("delivery_failed", error, { telegramId: user.telegramId });
    }
  }

  return { messagesSent, vacanciesSent, truncated };
}

async function deliverToUser(
  env: PipelineEnv,
  candidates: readonly Candidate[],
  user: ActiveUserWithFields,
  options: { includeAlreadySent: boolean; limit: number },
): Promise<Pick<PipelineResult, "messagesSent" | "vacanciesSent" | "truncated">> {
  const sent = await listSentFingerprints(env.DB, user.telegramId);
  const matched = matchForUser(candidates, user, sent);
  const selected = options.includeAlreadySent
    ? matched
    : matched.filter((match) => !match.alreadySent);
  const visible = selected.slice(0, options.limit);

  if (visible.length === 0) {
    return { messagesSent: 0, vacanciesSent: 0, truncated: false };
  }

  const counts = await sendMessages(
    env.BOT_TOKEN,
    user.telegramId,
    formatVacancyMessages({
      vacancies: visible.map((match) => match.vacancy),
      total: selected.length,
    }),
  );

  // Only what landed is recorded, so a half-delivered batch neither repeats the
  // messages that arrived nor loses the ones that did not.
  await markManySent(
    env.DB,
    visible
      .slice(0, counts.vacanciesSent)
      .filter((match) => !match.alreadySent)
      .map((match) => ({
        fingerprint: match.fingerprint,
        telegramId: user.telegramId,
        source: match.vacancy.source,
      })),
  );

  return { ...counts, truncated: visible.length < selected.length };
}

/** Sends in order and stops at the first failure; the caller records what landed. */
async function sendMessages(
  token: string,
  telegramId: number,
  messages: readonly VacancyMessage[],
): Promise<Pick<PipelineResult, "messagesSent" | "vacanciesSent">> {
  let messagesSent = 0;
  let vacanciesSent = 0;

  for (const message of messages) {
    try {
      await sendTelegramMessage(token, telegramId, message.text);
    } catch (error) {
      // One blocked or rate-limited chat must not stop the rest of the run.
      logError("delivery_failed", error, { telegramId });
      break;
    }

    messagesSent += 1;
    vacanciesSent += message.vacancyCount;
  }

  return { messagesSent, vacanciesSent };
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
  return matched.sort(
    (left, right) =>
      right.score - left.score || left.vacancy.title.localeCompare(right.vacancy.title),
  );
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
    const body = await response.json<{ parameters?: { retry_after?: number } }>();
    return body.parameters?.retry_after ?? 1;
  } catch {
    return 1;
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
