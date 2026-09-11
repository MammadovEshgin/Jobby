import type { RawVacancy } from "../scrapers/types";

const TELEGRAM_LIMIT = 4096;

export interface VacancyBatch {
  vacancies: RawVacancy[];
  /** How many matched in total; larger than `vacancies.length` when capped. */
  total?: number;
  date?: Date;
}

export function formatVacancyMessages(batch: VacancyBatch): string[] {
  if (batch.vacancies.length === 0) {
    return [];
  }

  const total = batch.total ?? batch.vacancies.length;
  const shown = batch.vacancies.length;
  const count = shown < total ? `${shown}/${total}` : `${total}`;
  const header = [
    `🔔 <b>Uyğun vakansiyalar</b> (${count})`,
    `<i>${escapeHtml(formatDate(batch.date ?? new Date()))}</i>`,
  ].join(" · ");

  const messages: string[] = [];
  let current = header;

  for (const vacancy of batch.vacancies) {
    const block = formatVacancy(vacancy);
    const next = `${current}\n\n${block}`;

    if (next.length > TELEGRAM_LIMIT) {
      messages.push(current);
      current = `${header}\n\n${block}`;
    } else {
      current = next;
    }
  }

  messages.push(current);

  return messages;
}

function formatVacancy(vacancy: RawVacancy): string {
  const title = escapeHtml(truncate(vacancy.title, 120));
  const company = escapeHtml(truncate(vacancy.company, 90));
  const location = vacancy.location.length > 0 ? ` · 📍 ${escapeHtml(truncate(vacancy.location, 90))}` : "";
  const url = escapeHtml(vacancy.url);

  return [`💼 <b>${title}</b>`, `🏢 ${company}${location}`, `🔗 <a href="${url}">Elana bax</a>`, "────────────"].join(
    "\n",
  );
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
