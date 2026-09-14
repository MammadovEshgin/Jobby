import { fetchText } from "../utils/fetch";
import { logInfo } from "../utils/log";

const TIMEOUT_MS = 10_000;

/** Boards that throttle or block crawlers should see one identity for the whole bot. */
export function userAgent(siteUrl: string): string {
  return `Mozilla/5.0 (compatible; VakansiyaBot/0.1; +${siteUrl})`;
}

type PageOutcome =
  { ok: true; url: string; body: string } | { ok: false; url: string; error: Error };

/**
 * Fetches a board's listing pages at once and keeps the ones that answered. A board that drops
 * a page still contributes the rest; only a board that answers nothing at all is a failure, and
 * it fails with the first page's error so the caller sees why.
 */
export async function fetchListingPages(
  site: string,
  urls: readonly string[],
  headers: Record<string, string>,
): Promise<string[]> {
  const outcomes = await Promise.all(urls.map((url) => fetchPage(url, headers)));
  const bodies: string[] = [];
  let firstError: Error | undefined;

  for (const outcome of outcomes) {
    if (outcome.ok) {
      bodies.push(outcome.body);
      continue;
    }

    firstError ??= outcome.error;
    logInfo("scraper_page_skipped", { site, url: outcome.url, reason: outcome.error.message });
  }

  if (bodies.length === 0) {
    throw firstError ?? new Error(`No ${site} pages fetched.`);
  }

  return bodies;
}

async function fetchPage(url: string, headers: Record<string, string>): Promise<PageOutcome> {
  try {
    return { ok: true, url, body: await fetchText(url, { timeoutMs: TIMEOUT_MS, headers }) };
  } catch (error) {
    return {
      ok: false,
      url,
      error: error instanceof Error ? error : new Error("Unknown error"),
    };
  }
}
