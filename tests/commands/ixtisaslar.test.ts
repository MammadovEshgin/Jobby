import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerIxtisaslarCommand } from "../../src/commands/ixtisaslar";
import type { UserFieldRecord } from "../../src/db/users";
import { FAKE_DB, UNKNOWN_USER_REPLY, commandHandler, fakeContext } from "./harness";

const KEYBOARD = { marker: "keyboard" };

const { listFields, fieldListKeyboard } = vi.hoisted(() => ({
  listFields: vi.fn(async (): Promise<UserFieldRecord[]> => []),
  fieldListKeyboard: vi.fn((): unknown => ({ marker: "keyboard" })),
}));

vi.mock("../../src/db/users", () => ({ listFields }));
vi.mock("../../src/bot", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/bot")>()),
  fieldListKeyboard,
}));

function record(rawField: string, field: string): UserFieldRecord {
  return { telegramId: 42, field, rawField, createdAt: 0 };
}

describe("/ixtisaslar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listFields.mockResolvedValue([]);
    fieldListKeyboard.mockReturnValue(KEYBOARD);
  });

  it("lists the followed fields with the delete keyboard", async () => {
    const fields = [record("Backend Developer", "backend developer"), record("Mühasib", "muhasib")];
    listFields.mockResolvedValue(fields);
    const handler = commandHandler(registerIxtisaslarCommand, "ixtisaslar");
    const { ctx, reply } = fakeContext({ from: { id: 42 }, text: "/ixtisaslar" });

    await handler(ctx);

    expect(listFields).toHaveBeenCalledWith(FAKE_DB, 42);
    expect(fieldListKeyboard).toHaveBeenCalledWith(fields);
    expect(reply).toHaveBeenCalledWith("İxtisaslarınız:\n• Backend Developer\n• Mühasib", {
      reply_markup: KEYBOARD,
    });
  });

  it("passes an absent keyboard through untouched", async () => {
    listFields.mockResolvedValue([record("Backend Developer", "backend developer")]);
    fieldListKeyboard.mockReturnValue(undefined);
    const handler = commandHandler(registerIxtisaslarCommand, "ixtisaslar");
    const { ctx, reply } = fakeContext({ from: { id: 42 }, text: "/ixtisaslar" });

    await handler(ctx);

    expect(reply).toHaveBeenCalledWith("İxtisaslarınız:\n• Backend Developer", {
      reply_markup: undefined,
    });
  });

  it("points at /ixtisas when nothing is followed yet", async () => {
    const handler = commandHandler(registerIxtisaslarCommand, "ixtisaslar");
    const { ctx, reply } = fakeContext({ from: { id: 42 }, text: "/ixtisaslar" });

    await handler(ctx);

    expect(reply).toHaveBeenCalledWith(
      "Hələ ixtisas əlavə etməmisiniz. Məsələn: /ixtisas backend developer",
    );
    expect(fieldListKeyboard).not.toHaveBeenCalled();
  });

  it("refuses an update with no sender and reads nothing", async () => {
    const handler = commandHandler(registerIxtisaslarCommand, "ixtisaslar");
    const { ctx, reply } = fakeContext({ text: "/ixtisaslar" });

    await handler(ctx);

    expect(reply).toHaveBeenCalledWith(UNKNOWN_USER_REPLY);
    expect(listFields).not.toHaveBeenCalled();
  });
});
