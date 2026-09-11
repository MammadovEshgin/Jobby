export interface FetchTextOptions {
  headers?: HeadersInit;
  retries?: number;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRIES = 2;

export async function fetchText(url: string, options: FetchTextOptions = {}): Promise<string> {
  const retries = options.retries ?? DEFAULT_RETRIES;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fetchTextOnce(url, options);
    } catch (error) {
      lastError = error;
      if (attempt === retries) {
        break;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Fetch failed.");
}

async function fetchTextOnce(url: string, options: FetchTextOptions): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: options.headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Fetch failed with HTTP ${response.status} for ${url}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}
