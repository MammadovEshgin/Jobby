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
