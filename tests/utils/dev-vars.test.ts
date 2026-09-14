import { describe, expect, it } from "vitest";

import { parseDevVars } from "../../scripts/dev-vars";

// Literal fixture text only: the real .dev.vars holds live secrets and is never read by a test.
describe("parseDevVars", () => {
  it("reads KEY=value lines, unquotes double-quoted values, and skips comments and blank lines", () => {
    expect(
      parseDevVars('# local only\r\nBOT_TOKEN=fake-token\n\nWEBHOOK_SECRET = "fake=secret"\n'),
    ).toEqual({ BOT_TOKEN: "fake-token", WEBHOOK_SECRET: "fake=secret" });
  });

  it("skips a line without = instead of reading it as a key missing its last character", () => {
    expect(parseDevVars("WEBHOOK_SECRET=fake-secret\nWEBHOOK_SECRETX\n")).toEqual({
      WEBHOOK_SECRET: "fake-secret",
    });
  });
});
