import { InlineKeyboard } from "grammy/web";

import type { BotContext, VakansiyaBot } from "../bot";
import { getSearchMode, setSearchMode, upsertUser, type SearchMode } from "../db/users";

const MODE_LABELS: Record<SearchMode, string> = {
  strict: "Dar",
  normal: "Normal",
  broad: "Geniş",
};

export function registerGenislikCommand(bot: VakansiyaBot): void {
  bot.command("genislik", async (ctx: BotContext) => {
    if (ctx.from === undefined) {
      await ctx.reply("İstifadəçi məlumatı oxunmadı. Zəhmət olmasa yenidən yoxlayın.");
      return;
    }

    await upsertUser(ctx.env.DB, {
      telegramId: ctx.from.id,
      username: ctx.from.username ?? null,
    });

    const requestedMode = parseSearchMode(typeof ctx.match === "string" ? ctx.match : undefined);

    if (requestedMode !== undefined) {
      await setSearchMode(ctx.env.DB, ctx.from.id, requestedMode);
      await ctx.reply(`Axtarış genişliyi yeniləndi: ${MODE_LABELS[requestedMode]}.`);
      return;
    }

    const currentMode = await getSearchMode(ctx.env.DB, ctx.from.id);

    await ctx.reply(
      [
        `Cari axtarış genişliyi: ${MODE_LABELS[currentMode]}.`,
        "",
        "Dar: yalnız dəqiq başlıq uyğunluğu.",
        "Normal: başlıq + sinonimlər.",
        "Geniş: başlıq, şirkət, məkan və əlavə mətnlər üzrə daha geniş uyğunluq.",
      ].join("\n"),
      {
        reply_markup: searchModeKeyboard(),
      },
    );
  });
}

export function parseSearchMode(value: string | undefined): SearchMode | undefined {
  const mode = (value ?? "").trim().toLowerCase();

  if (mode === "dar" || mode === "strict") {
    return "strict";
  }

  if (mode === "normal") {
    return "normal";
  }

  if (mode === "genis" || mode === "geniş" || mode === "broad") {
    return "broad";
  }

  return undefined;
}

export function searchModeKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("Dar", "search_mode:strict")
    .text("Normal", "search_mode:normal")
    .text("Geniş", "search_mode:broad");
}

export function searchModeLabel(mode: SearchMode): string {
  return MODE_LABELS[mode];
}
