import { withSender, type BotContext, type VakansiyaBot } from "../bot";
import { claimManualSearch } from "../db/manual-search";
import { listActiveUsersWithFields, listFields } from "../db/users";
import { MANUAL_SEARCH_LIMIT, runManualSearch } from "../pipeline/run";
import { logError, logInfo } from "../utils/log";

export function registerAxtarCommand(bot: VakansiyaBot): void {
  bot.command(
    "axtar",
    withSender(async (ctx) => {
      const telegramId = ctx.from.id;
      const fields = await listFields(ctx.env.DB, telegramId);

      if (fields.length === 0) {
        await ctx.reply("Axtarış üçün əvvəl ixtisas əlavə edin. Məsələn: /ixtisas musiqi müəllimi");
        return;
      }

      // A stopped user's search would run to nothing, and with no stored scrape it would scrape
      // every board live, so it is refused before the cooldown is claimed.
      const active = await listActiveUsersWithFields(ctx.env.DB, telegramId);

      if (active.length === 0) {
        await ctx.reply("Bildirişlər dayandırılıb. Axtarış etmək üçün əvvəlcə /start yazın.");
        return;
      }

      const limit = await claimManualSearch(ctx.env.DB, telegramId);

      if (!limit.allowed) {
        await ctx.reply(
          `Manual axtarışı ${limit.retryAfterSeconds} saniyədən sonra yenidən işə sala bilərsiniz.`,
        );
        return;
      }

      await ctx.reply("Axtarış başladı, bir az gözləyin...");

      // The webhook must answer Telegram within seconds, so the search runs on
      // after the response instead of inside it and reports its own result.
      ctx.env.waitUntil(search(ctx, telegramId));
    }),
  );
}

async function search(ctx: BotContext, telegramId: number): Promise<void> {
  try {
    const result = await runManualSearch(ctx.env, telegramId);
    logInfo("manual_search_complete", { telegramId, ...result });

    if (result.vacanciesSent === 0) {
      await ctx.api.sendMessage(
        telegramId,
        "Uyğun açıq vakansiya tapılmadı. İxtisaslarınızı /ixtisaslar ilə yoxlaya bilərsiniz.",
      );
      return;
    }

    if (result.truncated) {
      await ctx.api.sendMessage(
        telegramId,
        `Ən uyğun ${MANUAL_SEARCH_LIMIT} vakansiya göndərildi. Nəticəni azaltmaq üçün ixtisası daha dəqiq yazın.`,
      );
    }
  } catch (error) {
    logError("manual_search_failed", error, { telegramId });
    await ctx.api
      .sendMessage(telegramId, "Axtarış zamanı xəta baş verdi. Bir azdan yenidən cəhd edin.")
      .catch(() => undefined);
  }
}
