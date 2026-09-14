/** Parses `.dev.vars` text: one `KEY=value` per line; comments and lines without `=` skipped. */
export function parseDevVars(text: string): Record<string, string> {
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.includes("=") && !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        const key = line.slice(0, index).trim();
        const value = line
          .slice(index + 1)
          .trim()
          .replace(/^"(.*)"$/, "$1");
        return [key, value];
      }),
  );
}
