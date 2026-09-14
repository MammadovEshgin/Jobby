import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerIxtisasCommand } from "../../src/commands/ixtisas";
import type { ActiveUserWithFields } from "../../src/db/users";
import { FAKE_DB, UNKNOWN_USER_REPLY, commandHandler, fakeContext } from "./harness";

const { addField, upsertUser, listActiveUsersWithFields } = vi.hoisted(() => ({
  addField: vi.fn(async (): Promise<boolean> => true),
  upsertUser: vi.fn(async (): Promise<void> => undefined),
  listActiveUsersWithFields: vi.fn(async (): Promise<ActiveUserWithFields[]> => []),
}));

vi.mock("../../src/db/users", () => ({
  addField,
  upsertUser,
  listActiveUsersWithFields,
  MAX_FIELDS_PER_USER: 20,
}));

const USAGE = "İxtisas əlavə etmək üçün belə yazın:\n/ixtisas backend developer";
const ADDED = "İxtisas əlavə edildi: Backend Developer\nSiyahını görmək üçün /ixtisaslar yazın.";
const ACTIVE: ActiveUserWithFields[] = [{ telegramId: 42, username: null, fields: [] }];

describe("/ixtisas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    addField.mockResolvedValue(true);
    listActiveUsersWithFields.mockResolvedValue(ACTIVE);
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
    expect(reply).toHaveBeenCalledWith(ADDED);
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

  it("refuses a field longer than 100 characters and writes nothing", async () => {
    const handler = commandHandler(registerIxtisasCommand, "ixtisas");
    const { ctx, reply } = fakeContext({ from: { id: 42 }, text: `/ixtisas ${"a".repeat(101)}` });

    await handler(ctx);

    expect(reply).toHaveBeenCalledWith("İxtisas 100 simvoldan uzun ola bilməz.");
    expect(upsertUser).not.toHaveBeenCalled();
    expect(addField).not.toHaveBeenCalled();
  });

  it("accepts a field of exactly 100 characters", async () => {
    const handler = commandHandler(registerIxtisasCommand, "ixtisas");
    const { ctx } = fakeContext({ from: { id: 42 }, text: `/ixtisas ${"a".repeat(100)}` });

    await handler(ctx);

    expect(addField).toHaveBeenCalledTimes(1);
  });

  it("names the limit when the user already follows 20 fields", async () => {
    addField.mockResolvedValue(false);
    const handler = commandHandler(registerIxtisasCommand, "ixtisas");
    const { ctx, reply } = fakeContext({ from: { id: 42 }, text: "/ixtisas Backend Developer" });

    await handler(ctx);

    expect(reply).toHaveBeenCalledWith(
      "Ən çox 20 ixtisas izləyə bilərsiniz. Yenisini əlavə etmək üçün birini /sil ilə silin.",
    );
    expect(reply).not.toHaveBeenCalledWith(ADDED);
  });

  // Adding a field used to switch notifications back on without saying so, although /stop tells the
  // user only /start does that.
  it("adds the field for a stopped user and reminds them notifications are off", async () => {
    listActiveUsersWithFields.mockResolvedValue([]);
    const handler = commandHandler(registerIxtisasCommand, "ixtisas");
    const { ctx, reply } = fakeContext({ from: { id: 42 }, text: "/ixtisas Backend Developer" });

    await handler(ctx);

    expect(listActiveUsersWithFields).toHaveBeenCalledWith(FAKE_DB, 42);
    expect(reply).toHaveBeenCalledWith(
      `${ADDED}\nBildirişlər dayandırılıb. Yenidən aktiv etmək üçün /start yazın.`,
    );
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
