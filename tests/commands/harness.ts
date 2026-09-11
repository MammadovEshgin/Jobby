import { vi } from "vitest";

import type { BotContext, VakansiyaBot } from "../../src/bot";

type CommandHandler = (ctx: BotContext) => Promise<void>;

/** The handle the commands pass straight through to the stubbed db layer. */
export const FAKE_DB = { label: "fake-d1" } as unknown as D1Database;

/**
 * Runs a register*Command function against a bot that only records what it registers, and
 * returns the handler for one command name. The seam is the handler, not grammY's dispatch.
 */
export function commandHandler(
  register: (bot: VakansiyaBot) => void,
  name: string,
): CommandHandler {
  const handlers = new Map<string, CommandHandler>();

  register({
    command(command: string, handler: CommandHandler) {
      handlers.set(command, handler);
    },
  } as unknown as VakansiyaBot);

  const handler = handlers.get(name);

  if (handler === undefined) {
    throw new Error(`Nothing registered for /${name}.`);
  }

  return handler;
}

export interface FakeContextOptions {
  from?: { id: number; username?: string };
  /** Omitted means the update carried no message at all, as a channel post does. */
  text?: string;
}

export function fakeContext(options: FakeContextOptions = {}) {
  const reply = vi.fn(async (_text: string, _extra?: object): Promise<void> => undefined);
  const sendMessage = vi.fn(async (_chatId: number, _text: string): Promise<void> => undefined);
  const pending: Promise<unknown>[] = [];
  const waitUntil = vi.fn((promise: Promise<unknown>): void => {
    pending.push(promise);
  });

  const ctx = {
    from: options.from,
    message: options.text === undefined ? undefined : { text: options.text },
    env: { DB: FAKE_DB, BOT_TOKEN: "test-token", waitUntil },
    api: { sendMessage },
    reply,
  } as unknown as BotContext;

  return {
    ctx,
    reply,
    sendMessage,
    waitUntil,
    /** Awaits whatever the handler handed to waitUntil. */
    settleBackgroundWork: async (): Promise<void> => {
      await Promise.all(pending);
    },
  };
}

export const UNKNOWN_USER_REPLY = "İstifadəçi məlumatı oxunmadı. Zəhmət olmasa yenidən yoxlayın.";
