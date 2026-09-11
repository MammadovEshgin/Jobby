import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerIxtisasCommand } from "../../src/commands/ixtisas";
import { FAKE_DB, UNKNOWN_USER_REPLY, commandHandler, fakeContext } from "./harness";

const { addField, upsertUser } = vi.hoisted(() => ({
  addField: vi.fn(async (): Promise<void> => undefined),
  upsertUser: vi.fn(async (): Promise<void> => undefined),
}));

vi.mock("../../src/db/users", () => ({ addField, upsertUser }));

const USAGE = "İxtisas əlavə etmək üçün belə yazın:\n/ixtisas backend developer";

describe("/ixtisas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores the normalized field beside the text the user typed", async () => {
    const handler = commandHandler(registerIxtisasCommand, "ixtisas");
    const { ctx, reply } = fakeContext({
      from: { id: 42, username: "eshgin" },
      text: "/ixtisas Backend Developer",
    });

    await handler(ctx);

    expect(upsertUser).toHaveBeenCalledWith(FAKE_DB, { telegramId: 42, username: "eshgin" });
    expect(addField).toHaveBeenCalledWith(FAKE_DB, {
      telegramId: 42,
      field: "backend developer",
      rawField: "Backend Developer",
    });
    expect(reply).toHaveBeenCalledWith(
      "İxtisas əlavə edildi: Backend Developer\nSiyahını görmək üçün /ixtisaslar yazın.",
    );
  });

  it("strips the @botname suffix from the command before the argument", async () => {
    const handler = commandHandler(registerIxtisasCommand, "ixtisas");
    const { ctx } = fakeContext({
      from: { id: 42 },
      text: "/ixtisas@JobbyBot musiqi müəllimi",
    });

    await handler(ctx);

    expect(addField).toHaveBeenCalledWith(FAKE_DB, {
      telegramId: 42,
      field: "musiqi muellimi",
      rawField: "musiqi müəllimi",
    });
    expect(upsertUser).toHaveBeenCalledWith(FAKE_DB, { telegramId: 42, username: null });
  });

  it("explains the usage when the argument is missing", async () => {
    const handler = commandHandler(registerIxtisasCommand, "ixtisas");
    const { ctx, reply } = fakeContext({ from: { id: 42 }, text: "/ixtisas   " });

    await handler(ctx);

    expect(reply).toHaveBeenCalledWith(USAGE);
    expect(upsertUser).not.toHaveBeenCalled();
    expect(addField).not.toHaveBeenCalled();
  });

  it("explains the usage when the update carries no message text", async () => {
    const handler = commandHandler(registerIxtisasCommand, "ixtisas");
    const { ctx, reply } = fakeContext({ from: { id: 42 } });

    await handler(ctx);

    expect(reply).toHaveBeenCalledWith(USAGE);
    expect(addField).not.toHaveBeenCalled();
  });

  it("rejects an argument that normalizes to nothing", async () => {
    const handler = commandHandler(registerIxtisasCommand, "ixtisas");
    const { ctx, reply } = fakeContext({ from: { id: 42 }, text: "/ixtisas ***" });

    await handler(ctx);

    expect(reply).toHaveBeenCalledWith("İxtisas boş ola bilməz. Məsələn: /ixtisas mühasib");
    expect(upsertUser).not.toHaveBeenCalled();
    expect(addField).not.toHaveBeenCalled();
  });

  it("refuses an update with no sender and writes nothing", async () => {
    const handler = commandHandler(registerIxtisasCommand, "ixtisas");
    const { ctx, reply } = fakeContext({ text: "/ixtisas backend developer" });

    await handler(ctx);

    expect(reply).toHaveBeenCalledWith(UNKNOWN_USER_REPLY);
    expect(upsertUser).not.toHaveBeenCalled();
    expect(addField).not.toHaveBeenCalled();
  });
});
