import type { BotContext, VakansiyaBot } from "../bot";
import { checkManualSearchLimit, recordManualSearch } from "../db/manual-search";
import { listFields } from "../db/users";
import { MANUAL_SEARCH_LIMIT, runPipelineForUser } from "../pipeline/run";

export function registerAxtarCommand(bot: VakansiyaBot): void {
  bot.command("axtar", async (ctx: BotContext) => {
    if (ctx.from === undefined) {
      await ctx.reply("İstifadəçi məlumatı oxunmadı. Zəhmət olmasa yenidən yoxlayın.");
      return;
    }

    const fields = await listFields(ctx.env.DB, ctx.from.id);

    if (fields.length === 0) {
      await ctx.reply("Axtarış üçün əvvəl ixtisas əlavə edin. Məsələn: /ixtisas musiqi müəllimi");
      return;
    }

    const limit = await checkManualSearchLimit(ctx.env.DB, ctx.from.id);

    if (!limit.allowed) {
      await ctx.reply(`Manual axtarışı ${limit.retryAfterSeconds} saniyədən sonra yenidən işə sala bilərsiniz.`);
      return;
    }

    await recordManualSearch(ctx.env.DB, ctx.from.id);
    await ctx.reply("Axtarış başladı, bir az gözləyin...");

    const result = await runPipelineForUser(ctx.env, ctx.from.id);

    if (result.vacanciesSent === 0) {
      await ctx.reply("Uyğun açıq vakansiya tapılmadı. İxtisaslarınızı /ixtisaslar ilə yoxlaya bilərsiniz.");
      return;
    }

    if (result.truncated) {
      await ctx.reply(
        `Ən uyğun ${MANUAL_SEARCH_LIMIT} vakansiya göndərildi. Nəticəni azaltmaq üçün ixtisası daha dəqiq yazın.`,
      );
    }
  });
}
