import { listActiveUsersWithFields, type ActiveUserWithFields } from "../db/users";
import { markSent, pruneOlderThan, wasSent } from "../db/vacancies";
import { classify } from "../matching/score";
import { fetchAllVacancies } from "../scrapers";
import type { RawVacancy } from "../scrapers/types";
import { dedupeVacanciesByFingerprint, fingerprint } from "../utils/fingerprint";
import { formatVacancyMessages } from "./format";

export interface PipelineEnv {
  DB: D1Database;
  BOT_TOKEN: string;
}

export interface PipelineOptions {
  telegramId?: number;
  pruneOld?: boolean;
}

export interface PipelineResult {
  scraped: number;
  deduped: number;
  usersChecked: number;
  messagesSent: number;
  vacanciesSent: number;
}

interface ClassifiedVacancy {
  vacancy: RawVacancy;
  match: "exact" | "related";
  fingerprint: string;
}

export async function runPipeline(env: PipelineEnv, options: PipelineOptions = {}): Promise<PipelineResult> {
  if (options.pruneOld === true) {
    await pruneOlderThan(env.DB, 60);
  }

  const scrapedVacancies = await fetchAllVacancies();
  const dedupedVacancies = await dedupeVacanciesByFingerprint(scrapedVacancies);
  const users = await listActiveUsersWithFields(env.DB, options.telegramId);
  let messagesSent = 0;
  let vacanciesSent = 0;

  for (const user of users) {
    const classified = await classifyForUser(dedupedVacancies, user);
    const unsent = await filterUnsent(env.DB, user.telegramId, classified);

    if (unsent.length === 0) {
      continue;
    }

    const exact = unsent.filter((item) => item.match === "exact").map((item) => item.vacancy);
    const related = unsent.filter((item) => item.match === "related").map((item) => item.vacancy);
    const messages = formatVacancyMessages({ exact, related });

    for (const message of messages) {
      await sendTelegramMessage(env.BOT_TOKEN, user.telegramId, message);
      messagesSent += 1;
    }

    for (const item of unsent) {
      await markSent(env.DB, {
        fingerprint: item.fingerprint,
        telegramId: user.telegramId,
        source: item.vacancy.source,
      });
      vacanciesSent += 1;
    }
  }

  return {
    scraped: scrapedVacancies.length,
    deduped: dedupedVacancies.length,
    usersChecked: users.length,
    messagesSent,
    vacanciesSent,
  };
}

export async function runPipelineForUser(env: PipelineEnv, telegramId: number): Promise<PipelineResult> {
  return await runPipeline(env, { telegramId });
}

async function classifyForUser(vacancies: readonly RawVacancy[], user: ActiveUserWithFields): Promise<ClassifiedVacancy[]> {
  const fields = user.fields.map((field) => field.field);
  const matched: ClassifiedVacancy[] = [];

  for (const vacancy of vacancies) {
    const match = classify(vacancy, fields, { mode: user.searchMode });

    if (match === "none") {
      continue;
    }

    matched.push({
      vacancy,
      match,
      fingerprint: await fingerprint(vacancy.title, vacancy.company),
    });
  }

  return matched;
}

async function filterUnsent(
  db: D1Database,
  telegramId: number,
  vacancies: readonly ClassifiedVacancy[],
): Promise<ClassifiedVacancy[]> {
  const unsent: ClassifiedVacancy[] = [];

  for (const vacancy of vacancies) {
    if (!(await wasSent(db, vacancy.fingerprint, telegramId))) {
      unsent.push(vacancy);
    }
  }

  return unsent;
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
