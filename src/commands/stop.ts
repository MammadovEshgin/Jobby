import type { BotContext, VakansiyaBot } from "../bot";
import { setActive } from "../db/users";

export function registerStopCommand(bot: VakansiyaBot): void {
  bot.command("stop", async (ctx: BotContext) => {
    if (ctx.from === undefined) {
      await ctx.reply("İstifadəçi məlumatı oxunmadı. Zəhmət olmasa yenidən yoxlayın.");
      return;
    }

    await setActive(ctx.env.DB, ctx.from.id, false);
    await ctx.reply("Bildirişlər dayandırıldı. Yenidən aktiv etmək üçün /start yazın.");
  });
}
