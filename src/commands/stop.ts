import { withSender, type VakansiyaBot } from "../bot";
import { setActive } from "../db/users";

export function registerStopCommand(bot: VakansiyaBot): void {
  bot.command(
    "stop",
    withSender(async (ctx) => {
      await setActive(ctx.env.DB, ctx.from.id, false);
      await ctx.reply("Bildirişlər dayandırıldı. Yenidən aktiv etmək üçün /start yazın.");
    }),
  );
}
