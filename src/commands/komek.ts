import type { JobbyBot } from "./context";

export function registerKomekCommand(bot: JobbyBot): void {
  bot.command("komek", async (ctx) => {
    await ctx.reply(
      [
        "Komandalar:",
        "/start - botu başladır və bildirişləri aktiv edir",
        "/ixtisas <mətn> - ixtisas əlavə edir (məs: /ixtisas musiqi müəllimi)",
        "/ixtisaslar - ixtisaslarınızı göstərir",
        "/sil <mətn> - ixtisas silir",
        "/axtar - indi axtarır və uyğun bütün vakansiyaları göndərir",
        "/stop - bildirişləri dayandırır",
      ].join("\n"),
    );
  });
}
