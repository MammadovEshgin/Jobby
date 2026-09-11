import type { VakansiyaBot } from "../bot";

export function registerKomekCommand(bot: VakansiyaBot): void {
  bot.command("komek", async (ctx) => {
    await ctx.reply(
      [
        "Komandalar:",
        "/start - botu başladır və bildirişləri aktiv edir",
        "/ixtisas <mətn> - ixtisas əlavə edir",
        "/ixtisaslar - ixtisaslarınızı göstərir",
        "/sil <mətn> - ixtisas silir",
        "/axtar - indi manual axtarış edir",
        "/genislik - axtarış genişliyini seçir",
        "/stop - bildirişləri dayandırır",
      ].join("\n"),
    );
  });
}
