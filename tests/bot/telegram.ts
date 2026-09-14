import { vi } from "vitest";
import type { Update, User } from "grammy/types";

/** Shaped like a token, valid nowhere: every Bot API call is answered by `fakeTelegram`. */
export const BOT_TOKEN = "123456:TEST-TOKEN-NOT-REAL";

const API_ROOT = `https://api.telegram.org/bot${BOT_TOKEN}/`;

const BOT_USER: User = { id: 123456, is_bot: true, first_name: "Jobby", username: "JobbyTestBot" };

export const SENDER: User = { id: 42, is_bot: false, first_name: "Eshgin", username: "eshgin" };

export const CHANNEL_ID = -1001;

export const GROUP_CHAT = { id: -100200, type: "supergroup", title: "Backend jobs" } as const;

export interface BotApiCall {
  method: string;
  payload: Record<string, unknown>;
}

/**
 * Replaces global fetch with a stand-in for api.telegram.org that records every Bot API call.
 * A request to any other address throws, so no test can reach the network.
 */
export function fakeTelegram() {
  const calls: BotApiCall[] = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: { body?: unknown }): Promise<Response> => {
      const url = String(input);

      if (!url.startsWith(API_ROOT)) {
        throw new Error(`Unexpected network call: ${url}`);
      }

      const method = url.slice(API_ROOT.length);
      const payload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      calls.push({ method, payload });

      return Response.json({ ok: true, result: method === "getMe" ? BOT_USER : true });
    }),
  );

  return {
    calls,
    /** What the bot sent, in order, without the getMe handshake grammY makes before the first update. */
    sent: (): BotApiCall[] => calls.filter((call) => call.method !== "getMe"),
  };
}

interface Statement {
  sql: string;
  values: unknown[];
}

interface FakeD1Options {
  /** Rows every SELECT returns. */
  rows?: readonly object[];
  /** `meta.changes` every write reports. */
  changes?: number;
  /** Every query rejects with this. */
  failWith?: Error;
}

/** Just enough of D1 to record each executed query with its bound values. */
export function fakeD1(options: FakeD1Options = {}) {
  const executed: Statement[] = [];

  const statement = (sql: string, values: unknown[]) => {
    const execute = async <T>(result: T): Promise<T> => {
      executed.push({ sql: sql.replace(/\s+/g, " ").trim(), values });

      if (options.failWith !== undefined) {
        throw options.failWith;
      }

      return result;
    };

    return {
      bind: (...args: unknown[]) => statement(sql, args),
      run: () => execute({ meta: { changes: options.changes ?? 0 } }),
      all: () => execute({ results: options.rows ?? [] }),
      first: () => execute(null),
    };
  };

  return {
    db: { prepare: (sql: string) => statement(sql, []) } as unknown as D1Database,
    executed,
  };
}

function withCommandEntity(text: string) {
  if (!text.startsWith("/")) {
    return { text };
  }

  return {
    text,
    entities: [{ type: "bot_command" as const, offset: 0, length: text.search(/\s|$/) }],
  };
}

export function privateMessage(text: string): Update {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      date: 0,
      chat: { id: SENDER.id, type: "private", first_name: SENDER.first_name },
      from: SENDER,
      ...withCommandEntity(text),
    },
  };
}

/** A post in a channel: Telegram sends it with no `from`. */
export function channelPost(text: string): Update {
  return {
    update_id: 1,
    channel_post: {
      message_id: 1,
      date: 0,
      chat: { id: CHANNEL_ID, type: "channel", title: "Jobs" },
      ...withCommandEntity(text),
    },
  };
}

/**
 * A private message with no `from`. The Bot API type promises a sender on every message, but the
 * webhook body is untrusted JSON that need not keep the promise, so this is a plain object.
 */
export function senderlessMessage(text: string): object {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      date: 0,
      chat: { id: SENDER.id, type: "private", first_name: SENDER.first_name },
      ...withCommandEntity(text),
    },
  };
}

interface ButtonPressOptions {
  from?: User;
  chat?: typeof GROUP_CHAT;
}

/** A press on an inline button of message 77, the list message the bot sent. */
export function buttonPress(data: string, options: ButtonPressOptions = {}): Update {
  const from = options.from ?? SENDER;

  return {
    update_id: 1,
    callback_query: {
      id: "query-1",
      from,
      chat_instance: "instance-1",
      data,
      message: {
        message_id: 77,
        date: 0,
        chat: options.chat ?? { id: from.id, type: "private", first_name: from.first_name },
        from: BOT_USER,
        text: "İxtisaslarınız:",
      },
    },
  };
}
