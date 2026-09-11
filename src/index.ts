import { webhookCallback } from "grammy/web";

import { createBot } from "./bot";
import { runPipeline } from "./pipeline/run";
import { logError, logInfo } from "./utils/log";

export interface Env {
  DB: D1Database;
  BOT_TOKEN: string;
  WEBHOOK_SECRET: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("vakansiya-bot is alive", { status: 200 });
    }

    const bot = createBot(env);
    const handleUpdate = webhookCallback(bot, "cloudflare-mod", {
      secretToken: env.WEBHOOK_SECRET,
      onTimeout: "return",
    });

    return await handleUpdate(request);
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runPipeline(env, { pruneOld: shouldPruneOldFingerprints(event.scheduledTime) })
        .then((result) => {
          logInfo("pipeline_complete", result);
        })
        .catch((error: unknown) => {
          logError("pipeline_failed", error);
        }),
    );
  },
};

function shouldPruneOldFingerprints(scheduledTime: number): boolean {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Baku",
      hour: "2-digit",
      hour12: false,
    }).format(new Date(scheduledTime)),
  );

  return hour === 3;
}
