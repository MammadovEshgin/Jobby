import { BotError, webhookCallback } from "grammy/web";

import { createBot } from "./bot";
import { runPipeline } from "./pipeline/run";
import { logError, logInfo } from "./utils/log";

export interface Env {
  DB: D1Database;
  BOT_TOKEN: string;
  WEBHOOK_SECRET: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("jobby is alive", { status: 200 });
    }

    const bot = createBot({
      DB: env.DB,
      BOT_TOKEN: env.BOT_TOKEN,
      waitUntil: (promise) => {
        ctx.waitUntil(promise);
      },
    });
    const handleUpdate = webhookCallback(bot, "cloudflare-mod", {
      secretToken: env.WEBHOOK_SECRET,
      onTimeout: "return",
    });

    try {
      return await handleUpdate(request);
    } catch (error) {
      // webhookCallback never routes a handler failure to bot.catch. A rejected fetch answers 500,
      // and Telegram redelivers an update that fails the same way every time.
      logError("bot_error", error instanceof BotError ? error.error : error);
      return new Response(null, { status: 200 });
    }
  },

  scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): void {
    ctx.waitUntil(
      runPipeline(env, { pruneOld: shouldPruneOldRows(event.scheduledTime) })
        .then((result) => {
          logInfo("pipeline_complete", result);
        })
        .catch((error: unknown) => {
          logError("pipeline_failed", error);
        }),
    );
  },
};

function shouldPruneOldRows(scheduledTime: number): boolean {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Baku",
      hour: "2-digit",
      hour12: false,
    }).format(new Date(scheduledTime)),
  );

  return hour === 3;
}
