import { fieldListKeyboard, withSender, type VakansiyaBot } from "../bot";
import { listFields } from "../db/users";

export function registerIxtisaslarCommand(bot: VakansiyaBot): void {
  bot.command(
    "ixtisaslar",
    withSender(async (ctx) => {
      const fields = await listFields(ctx.env.DB, ctx.from.id);

      if (fields.length === 0) {
        await ctx.reply("Hələ ixtisas əlavə etməmisiniz. Məsələn: /ixtisas backend developer");
        return;
      }

      await ctx.reply(
        `İxtisaslarınız:\n${fields.map((field) => `• ${field.rawField}`).join("\n")}`,
        {
          reply_markup: fieldListKeyboard(fields),
        },
      );
    }),
  );
}
