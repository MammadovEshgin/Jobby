/**
 * A board that answers with an error page instead of JSON yields nothing rather than throwing,
 * so one broken source cannot take the hourly run down with it.
 */
export function parseJsonBody<T>(body: string): T | undefined {
  try {
    return JSON.parse(body) as T;
  } catch {
    return undefined;
  }
}

/**
 * The field a board is meant to answer its jobs in can hold any JSON value at all, and its entries
 * can be `null` or a bare number. Only real entries are walked; anything else is no entries.
 */
export function jsonList<T>(value: T[] | undefined): T[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item) => typeof item === "object" && item !== null);
}
