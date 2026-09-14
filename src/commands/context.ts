import type { Bot, Context } from "grammy/web";

export interface BotEnv {
  DB: D1Database;
  BOT_TOKEN: string;
  /** Keeps work alive after the webhook response (Cloudflare ExecutionContext). */
  waitUntil(promise: Promise<unknown>): void;
}

export interface BotContext extends Context {
  env: BotEnv;
}

export type JobbyBot = Bot<BotContext>;

type SenderContext = BotContext & { from: NonNullable<BotContext["from"]> };

/** For a command that acts on the sender's own data. A channel post has no sender and is told so. */
export function withSender(
  handler: (ctx: SenderContext) => Promise<void>,
): (ctx: BotContext) => Promise<void> {
  return async (ctx) => {
    if (!hasSender(ctx)) {
      await ctx.reply("İstifadəçi məlumatı oxunmadı. Zəhmət olmasa yenidən yoxlayın.");
      return;
    }

    await handler(ctx);
  };
}

function hasSender(ctx: BotContext): ctx is SenderContext {
  return ctx.from !== undefined;
}
