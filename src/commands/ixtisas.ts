import type { BotContext, VakansiyaBot } from "../bot";
import { addField, upsertUser } from "../db/users";
import { normalize } from "../matching/normalize";

export function registerIxtisasCommand(bot: VakansiyaBot): void {
  bot.command("ixtisas", async (ctx: BotContext) => {
    if (ctx.from === undefined) {
      await ctx.reply("İstifadəçi məlumatı oxunmadı. Zəhmət olmasa yenidən yoxlayın.");
      return;
    }

    const rawField = commandArgument(ctx.message?.text ?? "", "ixtisas");

    if (rawField.length === 0) {
      await ctx.reply("İxtisas əlavə etmək üçün belə yazın:\n/ixtisas backend developer");
      return;
    }

    const field = normalize(rawField);

    if (field.length === 0) {
      await ctx.reply("İxtisas boş ola bilməz. Məsələn: /ixtisas mühasib");
      return;
    }

    await upsertUser(ctx.env.DB, {
      telegramId: ctx.from.id,
      username: ctx.from.username ?? null,
    });
    await addField(ctx.env.DB, {
      telegramId: ctx.from.id,
      field,
      rawField,
    });

    await ctx.reply(`İxtisas əlavə edildi: ${rawField}\nSiyahını görmək üçün /ixtisaslar yazın.`);
  });
}

function commandArgument(text: string, command: string): string {
  return text.replace(new RegExp(`^/${command}(?:@\\w+)?\\s*`, "i"), "").trim();
}
