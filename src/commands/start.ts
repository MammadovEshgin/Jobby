import type { BotContext, VakansiyaBot } from "../bot";
import { upsertUser } from "../db/users";

export function registerStartCommand(bot: VakansiyaBot): void {
  bot.command("start", async (ctx: BotContext) => {
    if (ctx.from === undefined) {
      await ctx.reply("İstifadəçi məlumatı oxunmadı. Zəhmət olmasa yenidən yoxlayın.");
      return;
    }

    await upsertUser(ctx.env.DB, {
      telegramId: ctx.from.id,
      username: ctx.from.username ?? null,
    });

    await ctx.reply(
      [
        "Salam! Mən sizə ixtisasınıza uyğun yeni vakansiyaları göndərəcəyəm.",
        "",
        "Başlamaq üçün belə yazın:",
        "/ixtisas backend developer",
        "",
        "Axtarışı daraltmaq və ya genişləndirmək üçün /genislik yazın.",
        "",
        "Komandalar üçün /komek yazın.",
      ].join("\n"),
    );
  });
}
