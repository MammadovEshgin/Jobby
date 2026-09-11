import type { BotContext, VakansiyaBot } from "../bot";
import { removeField } from "../db/users";
import { normalize } from "../matching/normalize";
import { commandArgument } from "./argument";

export function registerSilCommand(bot: VakansiyaBot): void {
  bot.command("sil", async (ctx: BotContext) => {
    if (ctx.from === undefined) {
      await ctx.reply("İstifadəçi məlumatı oxunmadı. Zəhmət olmasa yenidən yoxlayın.");
      return;
    }

    const rawField = commandArgument(ctx.message?.text ?? "", "sil");

    if (rawField.length === 0) {
      await ctx.reply("Silmək üçün belə yazın:\n/sil backend developer");
      return;
    }

    const removed = await removeField(ctx.env.DB, ctx.from.id, normalize(rawField));
    await ctx.reply(removed ? "İxtisas silindi." : "Bu ixtisas siyahınızda tapılmadı.");
  });
}
