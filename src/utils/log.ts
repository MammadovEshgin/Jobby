export function logInfo(event: string, data: object = {}): void {
  console.log(JSON.stringify({ event, ...data }));
}

export function logError(event: string, error: unknown, data: object = {}): void {
  console.error(
    JSON.stringify({
      event,
      ...data,
      message: error instanceof Error ? error.message : "Unknown error",
    }),
  );
}
