import type { RawVacancy } from "../scrapers/types";
import { normalize } from "../matching/normalize";

export async function fingerprint(title: string, company: string): Promise<string> {
  const input = `${normalize(title)}|${normalize(company)}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));

  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function dedupeVacanciesByFingerprint(vacancies: readonly RawVacancy[]): Promise<RawVacancy[]> {
  const seen = new Set<string>();
  const deduped: RawVacancy[] = [];

  for (const vacancy of vacancies) {
    const key = await fingerprint(vacancy.title, vacancy.company);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(vacancy);
  }

  return deduped;
}
