import { listActiveUsersWithFields, type ActiveUserWithFields } from "../db/users";
import { listSentFingerprints, markManySent, pruneOlderThan } from "../db/vacancies";
import { compile, compileAll, matchCompiled, type CompiledText } from "../matching/match";
import { fetchAllVacancies } from "../scrapers";
import type { RawVacancy } from "../scrapers/types";
import { dedupeVacanciesByFingerprint, fingerprint } from "../utils/fingerprint";
import { formatVacancyMessages } from "./format";

/** Upper bound on a single manual search so one reply never runs to dozens of messages. */
export const MANUAL_SEARCH_LIMIT = 60;

export interface PipelineEnv {
  DB: D1Database;
  BOT_TOKEN: string;
}

export interface PipelineOptions {
  telegramId?: number;
  pruneOld?: boolean;
  /**
   * Manual searches answer with everything that matches right now, including
   * vacancies already delivered earlier. The hourly run only sends new ones.
   */
  includeAlreadySent?: boolean;
}

export interface PipelineResult {
  scraped: number;
  deduped: number;
  usersChecked: number;
  messagesSent: number;
  vacanciesSent: number;
  truncated: boolean;
}

interface MatchedVacancy {
  vacancy: RawVacancy;
  score: number;
  fingerprint: string;
  alreadySent: boolean;
}

export async function runPipeline(env: PipelineEnv, options: PipelineOptions = {}): Promise<PipelineResult> {
  if (options.pruneOld === true) {
    await pruneOlderThan(env.DB, 60);
  }

  const scrapedVacancies = await fetchAllVacancies();
  const dedupedVacancies = await dedupeVacanciesByFingerprint(scrapedVacancies);
  // Titles are analysed once per run and reused for every user.
  const titles = dedupedVacancies.map((vacancy) => compile(vacancy.title));
  const users = await listActiveUsersWithFields(env.DB, options.telegramId);
  const manual = options.includeAlreadySent === true;
  let messagesSent = 0;
  let vacanciesSent = 0;
  let truncated = false;

  for (const user of users) {
    const sent = await listSentFingerprints(env.DB, user.telegramId);
    const matched = await matchForUser(dedupedVacancies, titles, user, sent);
    const selected = manual ? matched : matched.filter((item) => !item.alreadySent);

    if (selected.length === 0) {
      continue;
    }

    const visible = selected.slice(0, manual ? MANUAL_SEARCH_LIMIT : selected.length);
    truncated = truncated || visible.length < selected.length;

    const messages = formatVacancyMessages({
      vacancies: visible.map((item) => item.vacancy),
      total: selected.length,
    });

    for (const message of messages) {
      await sendTelegramMessage(env.BOT_TOKEN, user.telegramId, message);
      messagesSent += 1;
    }

    await markManySent(
      env.DB,
      selected
        .filter((item) => !item.alreadySent)
        .map((item) => ({
          fingerprint: item.fingerprint,
          telegramId: user.telegramId,
          source: item.vacancy.source,
        })),
    );
    vacanciesSent += visible.length;
  }

  return {
    scraped: scrapedVacancies.length,
    deduped: dedupedVacancies.length,
    usersChecked: users.length,
    messagesSent,
    vacanciesSent,
    truncated,
  };
}

export async function runPipelineForUser(env: PipelineEnv, telegramId: number): Promise<PipelineResult> {
  return await runPipeline(env, { telegramId, includeAlreadySent: true });
}

async function matchForUser(
  vacancies: readonly RawVacancy[],
  titles: readonly CompiledText[],
  user: ActiveUserWithFields,
  sent: ReadonlySet<string>,
): Promise<MatchedVacancy[]> {
  const fields = compileAll(user.fields.map((field) => field.field));
  const matched: MatchedVacancy[] = [];

  for (const [index, vacancy] of vacancies.entries()) {
    const result = matchCompiled(titles[index], fields);

    if (!result.matched) {
      continue;
    }

    const key = await fingerprint(vacancy.title, vacancy.company);

    matched.push({
      vacancy,
      score: result.score,
      fingerprint: key,
      alreadySent: sent.has(key),
    });
  }

  // Tightest match first, so the most relevant vacancy heads the message.
  return matched.sort((left, right) => right.score - left.score || left.vacancy.title.localeCompare(right.vacancy.title));
}

async function sendTelegramMessage(token: string, chatId: number, text: string): Promise<void> {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Telegram sendMessage failed with HTTP ${response.status}.`);
  }
}
