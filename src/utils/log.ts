export function logInfo(event: string, data: object = {}): void {
  console.log(JSON.stringify(withEvent(event, data)));
}

export function logError(event: string, error: unknown, data: object = {}): void {
  console.error(
    JSON.stringify({
      ...withEvent(event, data),
      message: error instanceof Error ? error.message : "Unknown error",
    }),
  );
}

/** The event leads the line, and a field that happens to be called `event` cannot rename it. */
function withEvent(event: string, data: object): Record<string, unknown> {
  const line: Record<string, unknown> = { event, ...data };
  line.event = event;
  return line;
}
