import type { RawVacancy } from "../scrapers/types";

const TELEGRAM_LIMIT = 4096;

/**
 * A `href` is whatever the board put in the listing. Past this length the
 * escaped anchor alone can push one vacancy over Telegram's limit, and a link
 * that long is not pointing at a real vacancy anyway.
 */
const MAX_URL_LENGTH = 300;

interface VacancyBatch {
  vacancies: RawVacancy[];
  /** How many matched in total; larger than `vacancies.length` when capped. */
  total?: number;
  date?: Date;
}

export interface VacancyMessage {
  text: string;
  /** How many of the batch's vacancies this message carries, in batch order. */
  vacancyCount: number;
}

export function formatVacancyMessages(batch: VacancyBatch): VacancyMessage[] {
  if (batch.vacancies.length === 0) {
    return [];
  }

  const header = formatHeader(batch);
  const messages: VacancyMessage[] = [];
  let current: VacancyMessage = { text: header, vacancyCount: 0 };

  for (const vacancy of batch.vacancies) {
    const block = formatVacancy(vacancy);
    const text = `${current.text}\n\n${block}`;

    if (text.length > TELEGRAM_LIMIT) {
      messages.push(current);
      current = { text: `${header}\n\n${block}`, vacancyCount: 1 };
    } else {
      current = { text, vacancyCount: current.vacancyCount + 1 };
    }
  }

  messages.push(current);

  return messages;
}

function formatHeader(batch: VacancyBatch): string {
  const total = batch.total ?? batch.vacancies.length;
  const shown = batch.vacancies.length;
  const count = shown < total ? `${shown}/${total}` : `${total}`;

  return [
    `🔔 <b>Uyğun vakansiyalar</b> (${count})`,
    `<i>${escapeHtml(formatDate(batch.date ?? new Date()))}</i>`,
  ].join(" · ");
}

function formatVacancy(vacancy: RawVacancy): string {
  const title = escapeHtml(truncate(vacancy.title, 120));
  const company = escapeHtml(truncate(vacancy.company, 90));
  const location =
    vacancy.location.length > 0 ? ` · 📍 ${escapeHtml(truncate(vacancy.location, 90))}` : "";
  const url = linkableUrl(vacancy.url);
  const link = url === undefined ? [] : [`🔗 <a href="${escapeHtml(url)}">Elana bax</a>`];

  return [`💼 <b>${title}</b>`, `🏢 ${company}${location}`, ...link, "────────────"].join("\n");
}

/**
 * Telegram turns the anchor into a live link whatever scheme it carries, so a
 * scraped `javascript:` or `data:` href would be one tap away from the reader.
 * Only an http(s) URL short enough to survive escaping gets a link; anything
 * else still reaches the reader as a vacancy, just without one.
 */
function linkableUrl(value: string): string | undefined {
  if (value.length > MAX_URL_LENGTH) {
    return undefined;
  }

  try {
    const { protocol } = new URL(value);

    return protocol === "http:" || protocol === "https:" ? value : undefined;
  } catch {
    return undefined;
  }
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("az-AZ", {
    timeZone: "Asia/Baku",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}
