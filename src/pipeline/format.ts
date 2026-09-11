import type { RawVacancy } from "../scrapers/types";

const TELEGRAM_LIMIT = 4096;

export interface VacancyBatch {
  exact: RawVacancy[];
  related: RawVacancy[];
  date?: Date;
}

export function formatVacancyMessages(batch: VacancyBatch): string[] {
  if (batch.exact.length === 0 && batch.related.length === 0) {
    return [];
  }

  const header = `🔔 <b>Yeni vakansiyalar</b> · <i>${escapeHtml(formatDate(batch.date ?? new Date()))}</i>`;
  const blocks = [
    formatSection("Dəqiq uyğunluqlar", batch.exact),
    formatSection("Əlaqəli vakansiyalar", batch.related),
  ].flat();

  const messages: string[] = [];
  let current = header;

  for (const block of blocks) {
    const next = `${current}\n\n${block}`;

    if (next.length > TELEGRAM_LIMIT) {
      messages.push(current);
      current = `${header}\n\n${block}`;
    } else {
      current = next;
    }
  }

  if (current.length > 0) {
    messages.push(current);
  }

  return messages;
}

function formatSection(title: string, vacancies: RawVacancy[]): string[] {
  if (vacancies.length === 0) {
    return [];
  }

  return [`━━━ <b>${escapeHtml(title)}</b> (${vacancies.length}) ━━━`, ...vacancies.map(formatVacancy)];
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
