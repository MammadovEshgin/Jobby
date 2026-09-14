export interface FetchTextOptions {
  headers?: HeadersInit;
  /** Extra attempts after a failure a retry may fix: a network error, a timeout, HTTP 408, 429, 5xx. */
  retries?: number;
  /** Aborts one attempt. The whole call, retries and pauses included, ends `RETRY_WINDOW_MS` later. */
  timeoutMs?: number;
}

export class FetchHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
  ) {
    super(`Fetch failed with HTTP ${status} for ${url}`);
    this.name = "FetchHttpError";
  }
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRIES = 2;
/**
 * What the retries of one call may spend beyond its first attempt's timeout. Every board scrapes
 * inside one scheduled run, and `/axtar` scrapes inside `waitUntil`'s 30 s, so a host that never
 * answers holds its board for 10 s + 5 s, not for three full timeouts.
 */
const RETRY_WINDOW_MS = 5_000;
/** Retry n pauses between half and all of `BACKOFF_BASE_MS * 2 ** n`. */
const BACKOFF_BASE_MS = 1_000;

export async function fetchText(url: string, options: FetchTextOptions = {}): Promise<string> {
  const retries = options.retries ?? DEFAULT_RETRIES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const deadline = new AbortController();
  const deadlineTimer = setTimeout(() => deadline.abort(), timeoutMs + RETRY_WINDOW_MS);
  let lastError: unknown;

  try {
    for (let attempt = 0; attempt <= retries && !deadline.signal.aborted; attempt += 1) {
      try {
        return await fetchTextOnce(url, options.headers, timeoutMs, deadline.signal);
      } catch (error) {
        lastError = error;
      }

      if (!mayPassOnRetry(lastError)) {
        break;
      }

      if (attempt < retries) {
        await pauseBeforeRetry(lastError, attempt, deadline.signal);
      }
    }
  } finally {
    clearTimeout(deadlineTimer);
  }

  throw lastError instanceof Error ? lastError : new Error("Fetch failed.");
}

async function fetchTextOnce(
  url: string,
  headers: HeadersInit | undefined,
  timeoutMs: number,
  deadline: AbortSignal,
): Promise<string> {
  const controller = new AbortController();
  const abort = (): void => {
    controller.abort();
  };
  const timeout = setTimeout(abort, timeoutMs);
  deadline.addEventListener("abort", abort);

  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new FetchHttpError(response.status, url);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
    deadline.removeEventListener("abort", abort);
  }
}

/** A 4xx other than 408 and 429 answers the same way however often it is asked. */
function mayPassOnRetry(error: unknown): boolean {
  if (!(error instanceof FetchHttpError)) {
    return true;
  }

  return error.status === 408 || error.status === 429 || error.status >= 500;
}

/**
 * A board that answered 408, 429 or 5xx is overloaded, so an instant retry lands on the same state:
 * wait a growing, jittered pause, jittered so the pages of one board do not retry in step. A network
 * error or a timeout is retried at once: that attempt never reached the board, or already waited.
 */
async function pauseBeforeRetry(
  error: unknown,
  attempt: number,
  deadline: AbortSignal,
): Promise<void> {
  if (!(error instanceof FetchHttpError)) {
    return;
  }

  const ceiling = BACKOFF_BASE_MS * 2 ** attempt;
  await pause(ceiling / 2 + Math.random() * (ceiling / 2), deadline);
}

/** Resolves after `ms`, or as soon as the call's deadline passes. */
function pause(ms: number, deadline: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(finish, ms);
    deadline.addEventListener("abort", finish);

    function finish(): void {
      clearTimeout(timer);
      deadline.removeEventListener("abort", finish);
      resolve();
    }
  });
}
