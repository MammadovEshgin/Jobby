import type { RawVacancy, Scraper } from "./types";
import { fetchText } from "../utils/fetch";

const BASE_URL = "https://jobs.glorri.az";
const LISTING_URL = `${BASE_URL}/`;
const USER_AGENT = "Mozilla/5.0 (compatible; VakansiyaBot/0.1; +https://jobs.glorri.az)";

interface GlorriVacancy {
  title?: string;
  slug?: string;
  postedDate?: string;
  location?: string;
  company?: {
    slug?: string;
    name?: string;
  };
}

export const glorriAzScraper: Scraper = {
  name: "jobs.glorri.az",
  async fetch(): Promise<RawVacancy[]> {
    const html = await fetchText(LISTING_URL, {
      timeoutMs: 10_000,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html",
      },
    });

    return parseGlorriAzVacancies(html);
  },
};

export function parseGlorriAzVacancies(html: string): RawVacancy[] {
  const vacancies = extractVacancyEntities(html);
  const seenUrls = new Set<string>();
  const parsed: RawVacancy[] = [];

  for (const vacancy of vacancies) {
    const title = cleanText(vacancy.title);
    const company = cleanText(vacancy.company?.name);
    const companySlug = vacancy.company?.slug;
    const vacancySlug = vacancy.slug;

    if (title.length === 0 || company.length === 0 || companySlug === undefined || vacancySlug === undefined) {
      continue;
    }

    const url = new URL(`/vacancies/${companySlug}/${vacancySlug}?isLocal=true`, BASE_URL).toString();

    if (seenUrls.has(url)) {
      continue;
    }

    seenUrls.add(url);
    parsed.push({
      title,
      company,
      location: cleanText(vacancy.location),
      url,
      source: "jobs.glorri.az",
      postedAt: vacancy.postedDate,
    });
  }

  return parsed;
}

function extractVacancyEntities(html: string): GlorriVacancy[] {
  const decoded = html.replace(/\\"/g, '"').replace(/\\u0026/g, "&");
  const marker = '"vacancies":{"entities":';
  const markerIndex = decoded.indexOf(marker);

  if (markerIndex === -1) {
    return extractEscapedVacancyEntities(html);
  }

  const arrayStart = decoded.indexOf("[", markerIndex + marker.length);

  if (arrayStart === -1) {
    return extractEscapedVacancyEntities(html);
  }

  const arrayText = extractJsonArray(decoded, arrayStart);

  if (arrayText === undefined) {
    return extractEscapedVacancyEntities(html);
  }

  try {
    return JSON.parse(arrayText) as GlorriVacancy[];
  } catch {
    return extractEscapedVacancyEntities(html);
  }
}

function extractEscapedVacancyEntities(html: string): GlorriVacancy[] {
  const vacancyPattern =
    /\\"title\\":\\"((?:\\\\.|[^"\\])*)\\",\\"slug\\":\\"((?:\\\\.|[^"\\])*)\\"[\s\S]*?\\"postedDate\\":\\"((?:\\\\.|[^"\\])*)\\"[\s\S]*?\\"location\\":\\"((?:\\\\.|[^"\\])*)\\"[\s\S]*?\\"company\\":{\\"slug\\":\\"((?:\\\\.|[^"\\])*)\\",\\"name\\":\\"((?:\\\\.|[^"\\])*)\\"/g;
  const vacancies: GlorriVacancy[] = [];

  for (const match of html.matchAll(vacancyPattern)) {
    const [, title, slug, postedDate, location, companySlug, companyName] = match;

    vacancies.push({
      title: decodeEscapedValue(title),
      slug: decodeEscapedValue(slug),
      postedDate: decodeEscapedValue(postedDate),
      location: decodeEscapedValue(location),
      company: {
        slug: decodeEscapedValue(companySlug),
        name: decodeEscapedValue(companyName),
      },
    });
  }

  return vacancies;
}

function decodeEscapedValue(value: string | undefined): string {
  if (value === undefined) {
    return "";
  }

  try {
    return JSON.parse(`"${value.replace(/"/g, '\\"')}"`) as string;
  } catch {
    return value.replace(/\\u0026/g, "&").replace(/\\"/g, '"');
  }
}

function extractJsonArray(value: string, startIndex: number): string | undefined {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < value.length; index += 1) {
    const char = value[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "[") {
      depth += 1;
    } else if (char === "]") {
      depth -= 1;

      if (depth === 0) {
        return value.slice(startIndex, index + 1);
      }
    }
  }

  return undefined;
}

function cleanText(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}
