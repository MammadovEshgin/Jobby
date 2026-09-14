import { Bot } from "grammy/web";

import { removeField } from "./db/users";
import { registerAxtarCommand } from "./commands/axtar";
import type { BotContext, BotEnv, JobbyBot } from "./commands/context";
import { DELETE_FIELD_DATA } from "./commands/field-buttons";
import { registerIxtisasCommand } from "./commands/ixtisas";
import { registerIxtisaslarCommand } from "./commands/ixtisaslar";
import { registerKomekCommand } from "./commands/komek";
import { registerSilCommand } from "./commands/sil";
import { registerStartCommand } from "./commands/start";
import { registerStopCommand } from "./commands/stop";

export function createBot(env: BotEnv): JobbyBot {
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

  bot.callbackQuery(DELETE_FIELD_DATA, async (ctx) => {
    // In a group every member sees a list's buttons, so a press counts only from the list's owner.
    if (ctx.from.id !== Number(ctx.match[1])) {
      await ctx.answerCallbackQuery();
      return;
    }

    const field = decodeURIComponent(ctx.match[2]);
    const removed = await removeField(ctx.env.DB, ctx.from.id, field);
    await ctx.answerCallbackQuery({ text: removed ? "İxtisas silindi." : "İxtisas tapılmadı." });
    await ctx.editMessageText(
      removed ? "İxtisas silindi. Yenilənmiş siyahı üçün /ixtisaslar yazın." : "İxtisas tapılmadı.",
    );
  });

  bot.on("message", async (ctx) => {
    await ctx.reply("Bu əmri tanımadım. Komandaların siyahısı üçün /komek yazın.");
  });

  return bot;
}
