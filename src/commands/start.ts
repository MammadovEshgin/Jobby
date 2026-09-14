import { withSender, type VakansiyaBot } from "../bot";
import { setActive, upsertUser } from "../db/users";

export function registerStartCommand(bot: VakansiyaBot): void {
  bot.command(
    "start",
    withSender(async (ctx) => {
      await upsertUser(ctx.env.DB, {
        telegramId: ctx.from.id,
        username: ctx.from.username ?? null,
      });
      // The only command that turns notifications back on after /stop.
      await setActive(ctx.env.DB, ctx.from.id, true);

      await ctx.reply(
        [
          "Salam! Mən sizə ixtisasınıza uyğun yeni vakansiyaları göndərəcəyəm.",
          "",
          "Başlamaq üçün belə yazın:",
          "/ixtisas backend developer",
          "",
          "İxtisası nə qədər dəqiq yazsanız, nəticələr bir o qədər dəqiq olur:",
          '"musiqi müəllimi" yazsanız, fizika müəllimi vakansiyaları göndərilməyəcək.',
          "",
          "Komandalar üçün /komek yazın.",
        ].join("\n"),
      );
    }),
  );
}
