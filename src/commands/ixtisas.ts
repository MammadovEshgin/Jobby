import { withSender, type VakansiyaBot } from "../bot";
import { MAX_FIELDS_PER_USER, addField, listActiveUsersWithFields, upsertUser } from "../db/users";
import { normalize } from "../matching/normalize";
import { commandArgument } from "./argument";

/** Long enough for any real job title, short enough that the list of fields stays readable. */
const MAX_FIELD_LENGTH = 100;

export function registerIxtisasCommand(bot: VakansiyaBot): void {
  bot.command(
    "ixtisas",
    withSender(async (ctx) => {
      const rawField = commandArgument(ctx.message?.text ?? "", "ixtisas");

      if (rawField.length === 0) {
        await ctx.reply("İxtisas əlavə etmək üçün belə yazın:\n/ixtisas backend developer");
        return;
      }

      if (rawField.length > MAX_FIELD_LENGTH) {
        await ctx.reply(`İxtisas ${MAX_FIELD_LENGTH} simvoldan uzun ola bilməz.`);
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
      const added = await addField(ctx.env.DB, {
        telegramId: ctx.from.id,
        field,
        rawField,
      });

      if (!added) {
        await ctx.reply(
          `Ən çox ${MAX_FIELDS_PER_USER} ixtisas izləyə bilərsiniz. Yenisini əlavə etmək üçün birini /sil ilə silin.`,
        );
        return;
      }

      // Adding a field does not turn notifications back on; a stopped user is told how to.
      const active = await listActiveUsersWithFields(ctx.env.DB, ctx.from.id);
      const stoppedNote =
        active.length === 0
          ? "\nBildirişlər dayandırılıb. Yenidən aktiv etmək üçün /start yazın."
          : "";

      await ctx.reply(
        `İxtisas əlavə edildi: ${rawField}\nSiyahını görmək üçün /ixtisaslar yazın.${stoppedNote}`,
      );
    }),
  );
}
