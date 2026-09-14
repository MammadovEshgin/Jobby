import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import worker, { type Env } from "../../src/index";
import { UNKNOWN_USER_REPLY } from "../commands/harness";
import {
  BOT_TOKEN,
  SENDER,
  fakeD1,
  fakeTelegram,
  privateMessage,
  senderlessMessage,
} from "./telegram";

interface RunResult {
  scraped: number;
  deduped: number;
  usersChecked: number;
  messagesSent: number;
  vacanciesSent: number;
  truncated: boolean;
}

const RESULT: RunResult = {
  scraped: 5,
  deduped: 4,
  usersChecked: 2,
  messagesSent: 1,
  vacanciesSent: 3,
  truncated: false,
};

const { runPipeline, runManualSearch } = vi.hoisted(() => ({
  runPipeline: vi.fn(async (): Promise<RunResult> => RESULT),
  runManualSearch: vi.fn(async (): Promise<RunResult> => RESULT),
}));

vi.mock("../../src/pipeline/run", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/pipeline/run")>()),
  runPipeline,
  runManualSearch,
}));

const SECRET = "webhook-secret-for-tests";

/** Like the Workers runtime, `waitUntil` only works when called on the context itself. */
class FakeExecutionContext implements ExecutionContext {
  readonly props = {};
  readonly #background: Promise<unknown>[] = [];

  waitUntil(promise: Promise<unknown>): void {
    this.#background.push(promise);
  }

  passThroughOnException(): void {
    throw new Error("Jobby never passes through on exception.");
  }

  get backgroundCount(): number {
    return this.#background.length;
  }

  async settle(): Promise<unknown[]> {
    return await Promise.all(this.#background);
  }
}

function workerEnv(db: D1Database = fakeD1().db): Env {
  return { DB: db, BOT_TOKEN, WEBHOOK_SECRET: SECRET };
}

const WITH_SECRET = { "X-Telegram-Bot-Api-Secret-Token": SECRET };
const WRONG_SECRET = { "X-Telegram-Bot-Api-Secret-Token": "not-the-secret" };

function webhook(update: object, secretHeader: Record<string, string> = WITH_SECRET): Request {
  return new Request("https://jobby.test/", {
    method: "POST",
    headers: { "content-type": "application/json", ...secretHeader },
    body: JSON.stringify(update),
  });
}

function scheduledEvent(scheduledTime: number): ScheduledEvent {
  return {
    scheduledTime,
    cron: "0 * * * *",
    noRetry: () => undefined,
  } as unknown as ScheduledEvent;
}

let telegram: ReturnType<typeof fakeTelegram>;

beforeEach(() => {
  telegram = fakeTelegram();
  runPipeline.mockResolvedValue(RESULT);
  runManualSearch.mockResolvedValue(RESULT);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fetch", () => {
  it.each(["GET", "PUT"])(
    "answers a %s request with a liveness message without calling Telegram",
    async (method) => {
      const response = await worker.fetch(
        new Request("https://jobby.test/", { method }),
        workerEnv(),
        new FakeExecutionContext(),
      );

      expect(response.status).toBe(200);
      expect(await response.text()).toBe("jobby is alive");
      expect(telegram.calls).toEqual([]);
    },
  );

  it.each([
    ["no secret", {}],
    ["a wrong secret", WRONG_SECRET],
  ])("refuses a webhook with %s and runs no handler", async (_label, secretHeader) => {
    const { db, executed } = fakeD1();

    const response = await worker.fetch(
      webhook(privateMessage("/stop"), secretHeader),
      workerEnv(db),
      new FakeExecutionContext(),
    );

    expect(response.status).toBe(401);
    expect(telegram.sent()).toEqual([]);
    expect(executed).toEqual([]);
  });

  // Current behaviour: the bot is built per request with no botInfo, and grammY initialises it
  // before it compares the secret.
  it("asks Telegram who the bot is on every request, before checking the secret", async () => {
    await worker.fetch(
      webhook(privateMessage("/komek"), WRONG_SECRET),
      workerEnv(),
      new FakeExecutionContext(),
    );
    await worker.fetch(webhook(privateMessage("/komek")), workerEnv(), new FakeExecutionContext());

    expect(telegram.calls.map((call) => call.method)).toEqual(["getMe", "getMe", "sendMessage"]);
  });

  it("hands an authenticated update to the bot and answers Telegram with an empty 200", async () => {
    const response = await worker.fetch(
      webhook(privateMessage("/komek")),
      workerEnv(),
      new FakeExecutionContext(),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
    expect(telegram.sent()).toEqual([
      {
        method: "sendMessage",
        payload: { chat_id: SENDER.id, text: expect.stringMatching(/^Komandalar:\n/) },
      },
    ]);
  });

  it.each(["ixtisas backend developer", "stop"])(
    "answers /%s in a message with no sender without touching data",
    async (command) => {
      const { db, executed } = fakeD1({ changes: 1 });

      const response = await worker.fetch(
        webhook(senderlessMessage(`/${command}`)),
        workerEnv(db),
        new FakeExecutionContext(),
      );

      expect(response.status).toBe(200);
      expect(telegram.sent()).toEqual([
        { method: "sendMessage", payload: { chat_id: SENDER.id, text: UNKNOWN_USER_REPLY } },
      ]);
      expect(executed).toEqual([]);
    },
  );

  it("answers /komek in a message with no sender", async () => {
    await worker.fetch(
      webhook(senderlessMessage("/komek")),
      workerEnv(),
      new FakeExecutionContext(),
    );

    expect(telegram.sent()).toEqual([
      {
        method: "sendMessage",
        payload: { chat_id: SENDER.id, text: expect.stringMatching(/^Komandalar:\n/) },
      },
    ]);
  });

  it("gives the bot the execution context's waitUntil for work that outlives the response", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { db } = fakeD1({ rows: [{ field: "backend developer" }], changes: 1 });
    const env = workerEnv(db);
    const ctx = new FakeExecutionContext();

    const response = await worker.fetch(webhook(privateMessage("/axtar")), env, ctx);

    expect(response.status).toBe(200);
    expect(ctx.backgroundCount).toBe(1);
    await ctx.settle();
    expect(runManualSearch).toHaveBeenCalledWith(expect.objectContaining({ DB: db }), SENDER.id);
  });

  // webhookCallback never routes a handler failure to bot.catch. Left to reject, the Worker answered
  // 500 and Telegram redelivered an update that fails the same way every time.
  it("logs a failed handler and still answers Telegram 200, so the update is not redelivered", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = new Error("D1 is down");

    const response = await worker.fetch(
      webhook(privateMessage("/stop")),
      workerEnv(fakeD1({ failWith: failure }).db),
      new FakeExecutionContext(),
    );

    expect(response.status).toBe(200);
    expect(consoleError).toHaveBeenCalledWith(
      JSON.stringify({ event: "bot_error", message: "D1 is down" }),
    );
  });
});

describe("scheduled", () => {
  const BAKU_NOON = Date.UTC(2026, 8, 14, 8, 0, 0);

  it("returns at once and hands the pipeline run to waitUntil, logging its result", async () => {
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const env = workerEnv();
    const ctx = new FakeExecutionContext();

    expect(worker.scheduled(scheduledEvent(BAKU_NOON), env, ctx)).toBeUndefined();
    expect(ctx.backgroundCount).toBe(1);
    await ctx.settle();

    expect(runPipeline).toHaveBeenCalledWith(env, { pruneOld: false });
    expect(consoleLog).toHaveBeenCalledWith(
      JSON.stringify({ event: "pipeline_complete", ...RESULT }),
    );
  });

  it("logs a failed run and still settles the background work", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    runPipeline.mockRejectedValue(new Error("every source is down"));
    const ctx = new FakeExecutionContext();

    worker.scheduled(scheduledEvent(BAKU_NOON), workerEnv(), ctx);

    await expect(ctx.settle()).resolves.toEqual([undefined]);
    expect(consoleError).toHaveBeenCalledWith(
      JSON.stringify({ event: "pipeline_failed", message: "every source is down" }),
    );
  });

  // Baku is UTC+4 all year.
  it.each([
    ["02:59:59 in Baku", Date.UTC(2026, 8, 13, 22, 59, 59), false],
    ["03:00:00 in Baku", Date.UTC(2026, 8, 13, 23, 0, 0), true],
    ["03:59:59 in Baku", Date.UTC(2026, 8, 13, 23, 59, 59), true],
    ["04:00:00 in Baku", Date.UTC(2026, 8, 14, 0, 0, 0), false],
    ["03:00:00 in UTC", Date.UTC(2026, 8, 14, 3, 0, 0), false],
  ])("prunes old rows only in the 03:00 hour in Baku: run at %s", async (_label, time, prune) => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const env = workerEnv();
    const ctx = new FakeExecutionContext();

    worker.scheduled(scheduledEvent(time), env, ctx);
    await ctx.settle();

    expect(runPipeline).toHaveBeenCalledWith(env, { pruneOld: prune });
  });
});
