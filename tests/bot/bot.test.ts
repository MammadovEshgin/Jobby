import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Update } from "grammy/types";

import { createBot } from "../../src/bot";
import { UNKNOWN_USER_REPLY } from "../commands/harness";
import {
  BOT_TOKEN,
  CHANNEL_ID,
  GROUP_CHAT,
  SENDER,
  buttonPress,
  channelPost,
  fakeD1,
  fakeTelegram,
  privateMessage,
  type BotApiCall,
} from "./telegram";

const HELP = `Komandalar:
/start - botu başladır və bildirişləri aktiv edir
/ixtisas <mətn> - ixtisas əlavə edir (məs: /ixtisas musiqi müəllimi)
/ixtisaslar - ixtisaslarınızı göstərir
/sil <mətn> - ixtisas silir
/axtar - indi axtarır və uyğun bütün vakansiyaları göndərir
/stop - bildirişləri dayandırır`;

const REMOVED = "İxtisas silindi. Yenilənmiş siyahı üçün /ixtisaslar yazın.";

/** Every command that acts on the sender's own data, with an argument where it takes one. */
const SENDER_COMMANDS = [
  "start",
  "ixtisas backend developer",
  "ixtisaslar",
  "sil backend developer",
  "axtar",
  "stop",
];

let telegram: ReturnType<typeof fakeTelegram>;

beforeEach(() => {
  telegram = fakeTelegram();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function deliver(update: Update, db: D1Database = fakeD1().db): Promise<void> {
  const bot = createBot({ DB: db, BOT_TOKEN, waitUntil: () => undefined });
  await bot.init();
  await bot.handleUpdate(update);
}

function fieldRow(field: string, rawField = field) {
  return { telegram_id: SENDER.id, field, raw_field: rawField, created_at: 0 };
}

type Button = { text: string; callback_data: string };

function buttonRows(call: BotApiCall | undefined): Button[][] | undefined {
  const markup = call?.payload.reply_markup as { inline_keyboard: Button[][] } | undefined;
  // grammY's keyboard builder ends on an empty row, which Telegram ignores.
  return markup?.inline_keyboard.filter((row) => row.length > 0);
}

describe("commands", () => {
  it.each(SENDER_COMMANDS)(
    "/%s in a channel post, which has no sender, says the user was not recognised and touches no data",
    async (command) => {
      const { db, executed } = fakeD1({ rows: [fieldRow("backend developer")], changes: 1 });

      await deliver(channelPost(`/${command}`), db);

      expect(telegram.sent()).toEqual([
        { method: "sendMessage", payload: { chat_id: CHANNEL_ID, text: UNKNOWN_USER_REPLY } },
      ]);
      expect(executed).toEqual([]);
    },
  );

  it("/komek answers a channel post, which has no sender", async () => {
    await deliver(channelPost("/komek"));

    expect(telegram.sent()).toEqual([
      { method: "sendMessage", payload: { chat_id: CHANNEL_ID, text: HELP } },
    ]);
  });

  it.each(SENDER_COMMANDS)("/%s acts on the data of the user who sent it", async (command) => {
    const { db, executed } = fakeD1();

    await deliver(privateMessage(`/${command}`), db);

    expect(executed[0]?.values).toContain(SENDER.id);
    expect(telegram.sent()).not.toContainEqual(
      expect.objectContaining({ payload: expect.objectContaining({ text: UNKNOWN_USER_REPLY }) }),
    );
  });

  it("points any other message at /komek", async () => {
    await deliver(privateMessage("salam"));

    expect(telegram.sent()).toEqual([
      {
        method: "sendMessage",
        payload: {
          chat_id: SENDER.id,
          text: "Bu əmri tanımadım. Komandaların siyahısı üçün /komek yazın.",
        },
      },
    ]);
  });
});

describe("delete buttons", () => {
  it("/ixtisaslar offers a delete button for each followed field", async () => {
    const { db } = fakeD1({
      rows: [
        fieldRow("backend developer", "Backend Developer"),
        fieldRow("musiqi muellimi", "musiqi müəllimi"),
      ],
    });

    await deliver(privateMessage("/ixtisaslar"), db);

    expect(buttonRows(telegram.sent()[0])).toEqual([
      [
        {
          text: "Sil: Backend Developer",
          callback_data: `delete_field:${SENDER.id}:backend%20developer`,
        },
      ],
      [
        {
          text: "Sil: musiqi müəllimi",
          callback_data: `delete_field:${SENDER.id}:musiqi%20muellimi`,
        },
      ],
    ]);
  });

  it("leaves out a button whose percent-encoded callback data passes Telegram's 64-byte limit", async () => {
    // "delete_field:42:" is 16 bytes, so a 48-character ASCII field fills the limit exactly.
    const fits = "a".repeat(48);
    const tooLong = "a".repeat(49);
    // 9 characters, but 54 bytes once percent-encoded.
    const tooLongEncoded = "ə".repeat(9);
    const { db } = fakeD1({ rows: [fieldRow(fits), fieldRow(tooLong), fieldRow(tooLongEncoded)] });

    await deliver(privateMessage("/ixtisaslar"), db);

    expect(buttonRows(telegram.sent()[0])).toEqual([
      [{ text: `Sil: ${fits}`, callback_data: `delete_field:${SENDER.id}:${fits}` }],
    ]);
  });

  it("sends the list without a keyboard when no field fits a button", async () => {
    const tooLong = "a".repeat(52);
    const { db } = fakeD1({ rows: [fieldRow(tooLong)] });

    await deliver(privateMessage("/ixtisaslar"), db);

    expect(telegram.sent()).toEqual([
      {
        method: "sendMessage",
        payload: { chat_id: SENDER.id, text: `İxtisaslarınız:\n• ${tooLong}` },
      },
    ]);
  });

  it("deletes the pressed field, answers the press and rewrites the list message", async () => {
    const { db, executed } = fakeD1({ changes: 1 });

    await deliver(buttonPress(`delete_field:${SENDER.id}:backend%20developer`), db);

    expect(executed).toEqual([
      {
        sql: expect.stringContaining("DELETE FROM user_fields"),
        values: [SENDER.id, "backend developer"],
      },
    ]);
    expect(telegram.sent()).toEqual([
      {
        method: "answerCallbackQuery",
        payload: { callback_query_id: "query-1", text: "İxtisas silindi." },
      },
      {
        method: "editMessageText",
        payload: { chat_id: SENDER.id, message_id: 77, text: REMOVED },
      },
    ]);
  });

  it("says the field was not found when the press deleted nothing", async () => {
    const { db } = fakeD1({ changes: 0 });

    await deliver(buttonPress(`delete_field:${SENDER.id}:backend%20developer`), db);

    expect(telegram.sent()).toEqual([
      {
        method: "answerCallbackQuery",
        payload: { callback_query_id: "query-1", text: "İxtisas tapılmadı." },
      },
      {
        method: "editMessageText",
        payload: { chat_id: SENDER.id, message_id: 77, text: "İxtisas tapılmadı." },
      },
    ]);
  });

  it("deletes exactly the field a listed button was built for", async () => {
    const field = "c++ / c# developer";
    const listed = fakeD1({ rows: [fieldRow(field)] });
    await deliver(privateMessage("/ixtisaslar"), listed.db);
    const data = buttonRows(telegram.sent()[0])?.[0]?.[0]?.callback_data ?? "";
    const pressed = fakeD1({ changes: 1 });

    await deliver(buttonPress(data), pressed.db);

    expect(pressed.executed.map((statement) => statement.values)).toEqual([[SENDER.id, field]]);
  });

  it("ignores a button with no field after the owner", async () => {
    const { db, executed } = fakeD1({ changes: 1 });

    await deliver(buttonPress(`delete_field:${SENDER.id}:`), db);

    expect(telegram.sent()).toEqual([]);
    expect(executed).toEqual([]);
  });

  it("rejects a button whose field is malformed percent-encoding, answering nothing", async () => {
    const { db, executed } = fakeD1({ changes: 1 });

    await expect(
      deliver(buttonPress(`delete_field:${SENDER.id}:%E0%A4%A`), db),
    ).rejects.toMatchObject({
      error: expect.any(URIError),
    });
    expect(telegram.sent()).toEqual([]);
    expect(executed).toEqual([]);
  });

  // In a group, the list's buttons are visible to everyone. Only the user whose list it is may
  // press them; anyone else's press deletes nothing and leaves the list message alone.
  it("refuses a press from anyone but the list's owner, deleting nothing and editing nothing", async () => {
    const stranger = { id: 999, is_bot: false, first_name: "Stranger" };
    const { db, executed } = fakeD1({ changes: 1 });

    await deliver(
      buttonPress(`delete_field:${SENDER.id}:backend%20developer`, {
        from: stranger,
        chat: GROUP_CHAT,
      }),
      db,
    );

    expect(executed).toEqual([]);
    expect(telegram.sent()).toEqual([
      { method: "answerCallbackQuery", payload: { callback_query_id: "query-1" } },
    ]);
  });
});

describe("errors", () => {
  // handleUpdate still rejects; src/index.ts is the boundary that logs it and answers Telegram.
  it("rejects the update when a handler fails, leaving the webhook boundary to answer it", async () => {
    const failure = new Error("D1 is down");
    const { db } = fakeD1({ failWith: failure });

    await expect(deliver(privateMessage("/stop"), db)).rejects.toMatchObject({ error: failure });
  });
});
