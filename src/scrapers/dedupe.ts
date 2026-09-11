import type { RawVacancy } from "./types";

export function dedupeVacanciesByUrl(vacancies: readonly RawVacancy[]): RawVacancy[] {
  const seenUrls = new Set<string>();
  const deduped: RawVacancy[] = [];

  for (const vacancy of vacancies) {
    if (seenUrls.has(vacancy.url)) {
      continue;
    }

    seenUrls.add(vacancy.url);
    deduped.push(vacancy);
  }

  return deduped;
}
