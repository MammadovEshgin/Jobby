import type { RawVacancy } from "../scrapers/types";
import { normalize, tokenize } from "./normalize";
import { getSynonyms } from "./synonyms";

export type MatchClass = "exact" | "related" | "none";
export type SearchMode = "strict" | "normal" | "broad";

export interface ClassifyOptions {
  mode?: SearchMode;
}

type SearchableVacancy = Pick<RawVacancy, "title"> & Partial<Pick<RawVacancy, "company" | "location" | "description">>;

export function classify(
  vacancy: SearchableVacancy,
  userFields: readonly string[],
  options: ClassifyOptions = {},
): MatchClass {
  const title = normalize(vacancy.title);
  const mode = options.mode ?? "normal";

  if (title.length === 0 || userFields.length === 0) {
    return "none";
  }

  for (const field of userFields) {
    const fieldTokens = tokenize(field);

    if (fieldTokens.length > 0 && fieldTokens.every((token) => containsToken(title, token))) {
      return "exact";
    }
  }

  if (mode === "strict") {
    return "none";
  }

  const relatedText = mode === "broad" ? normalizeSearchableVacancy(vacancy) : title;

  for (const field of userFields) {
    const fieldTokens = tokenize(field);
    const fieldPhraseMatches = mode === "broad" && containsPhrase(relatedText, field);
    const synonymMatches = getSynonyms(field).some((synonym) => containsPhrase(relatedText, synonym));
    const tokenMatches = fieldTokens.some((token) => containsToken(relatedText, token));

    if (fieldPhraseMatches || synonymMatches || tokenMatches) {
      return "related";
    }
  }

  return "none";
}

function containsPhrase(text: string, phrase: string): boolean {
  const tokens = tokenize(phrase);

  if (tokens.length === 0) {
    return false;
  }

  return tokens.every((token) => containsToken(text, token));
}

function containsToken(text: string, token: string): boolean {
  return ` ${text} `.includes(` ${token} `);
}

function normalizeSearchableVacancy(vacancy: SearchableVacancy): string {
  return normalize([vacancy.title, vacancy.company, vacancy.location, vacancy.description].filter(Boolean).join(" "));
}
