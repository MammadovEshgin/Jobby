import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { logError, logInfo } from "../../src/utils/log";

let stdout: unknown[][];
let stderr: unknown[][];

beforeEach(() => {
  stdout = [];
  stderr = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    stdout.push(args);
  });
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    stderr.push(args);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("logInfo", () => {
  it("writes the event and its fields to stdout as one JSON line", () => {
    logInfo("scraper_complete", { site: "busy.az", found: 3 });

    expect(stdout).toEqual([['{"event":"scraper_complete","site":"busy.az","found":3}']]);
    expect(stderr).toEqual([]);
  });

  it("writes a bare event when there are no fields", () => {
    logInfo("run_started");

    expect(stdout).toEqual([['{"event":"run_started"}']]);
  });
});

describe("logError", () => {
  it("writes the event, its fields and the error message to stderr as one JSON line", () => {
    logError("scraper_failed", new Error("HTTP 500"), { site: "jobsearch.az", found: 0 });

    expect(stderr).toEqual([
      ['{"event":"scraper_failed","site":"jobsearch.az","found":0,"message":"HTTP 500"}'],
    ]);
    expect(stdout).toEqual([]);
  });

  it("keeps a multi-line error message on one line", () => {
    logError("delivery_failed", new Error("Bad Request\nchat not found"));

    expect(stderr).toEqual([
      ['{"event":"delivery_failed","message":"Bad Request\\nchat not found"}'],
    ]);
  });

  it("reports a thrown value that is not an Error as an unknown error", () => {
    logError("delivery_failed", "chat not found");

    expect(stderr).toEqual([['{"event":"delivery_failed","message":"Unknown error"}']]);
  });
});
