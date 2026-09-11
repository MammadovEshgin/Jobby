import { Bot, Context, InlineKeyboard } from "grammy/web";

import { removeField } from "./db/users";
import { registerAxtarCommand } from "./commands/axtar";
import { registerIxtisasCommand } from "./commands/ixtisas";
import { registerIxtisaslarCommand } from "./commands/ixtisaslar";
import { registerKomekCommand } from "./commands/komek";
import { registerSilCommand } from "./commands/sil";
import { registerStartCommand } from "./commands/start";
import { registerStopCommand } from "./commands/stop";

export interface BotEnv {
  DB: D1Database;
  BOT_TOKEN: string;
  /** Keeps work alive after the webhook response (Cloudflare ExecutionContext). */
  waitUntil(promise: Promise<unknown>): void;
}

export interface BotContext extends Context {
  env: BotEnv;
}

export type VakansiyaBot = Bot<BotContext>;

export function createBot(env: BotEnv): VakansiyaBot {
  const bot = new Bot<BotContext>(env.BOT_TOKEN);

  bot.use(async (ctx, next) => {
    ctx.env = env;
    await next();
  });

  registerStartCommand(bot);
  registerIxtisasCommand(bot);
  registerIxtisaslarCommand(bot);
  registerSilCommand(bot);
  registerAxtarCommand(bot);
  registerKomekCommand(bot);
  registerStopCommand(bot);

  bot.callbackQuery(/^delete_field:(.+)$/, async (ctx) => {
    const telegramId = ctx.from.id;
    const field = decodeURIComponent(ctx.match[1] ?? "");

    if (field.length === 0) {
      await ctx.answerCallbackQuery({ text: "Silinəcək ixtisas tapılmadı." });
      return;
    }

    const removed = await removeField(ctx.env.DB, telegramId, field);
    await ctx.answerCallbackQuery({ text: removed ? "İxtisas silindi." : "İxtisas tapılmadı." });
    await ctx.editMessageText(
      removed ? "İxtisas silindi. Yenilənmiş siyahı üçün /ixtisaslar yazın." : "İxtisas tapılmadı.",
    );
  });

  bot.on("message", async (ctx) => {
    await ctx.reply("Bu əmri tanımadım. Komandaların siyahısı üçün /komek yazın.");
  });

  bot.catch((err) => {
    console.error(
      JSON.stringify({
        event: "bot_error",
        message: err.message,
        stack: err.stack,
      }),
    );
  });

  return bot;
}

export function fieldListKeyboard(
  fields: readonly { field: string; rawField: string }[],
): InlineKeyboard | undefined {
  const keyboard = new InlineKeyboard();
  let added = false;

  for (const field of fields) {
    const data = `delete_field:${encodeURIComponent(field.field)}`;

    if (data.length > 64) {
      continue;
    }

    keyboard.text(`Sil: ${field.rawField}`, data).row();
    added = true;
  }

  return added ? keyboard : undefined;
}
