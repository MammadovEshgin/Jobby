import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerSilCommand } from "../../src/commands/sil";
import { FAKE_DB, UNKNOWN_USER_REPLY, commandHandler, fakeContext } from "./harness";

const { removeField } = vi.hoisted(() => ({
  removeField: vi.fn(async (): Promise<boolean> => true),
}));

vi.mock("../../src/db/users", () => ({ removeField }));

describe("/sil", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    removeField.mockResolvedValue(true);
  });

  it("removes the normalized field and confirms", async () => {
    const handler = commandHandler(registerSilCommand, "sil");
    const { ctx, reply } = fakeContext({ from: { id: 42 }, text: "/sil Backend Developer" });

    await handler(ctx);

    expect(removeField).toHaveBeenCalledWith(FAKE_DB, 42, "backend developer");
    expect(reply).toHaveBeenCalledWith("İxtisas silindi.");
  });

  it("says so when the field was not on the list", async () => {
    removeField.mockResolvedValue(false);
    const handler = commandHandler(registerSilCommand, "sil");
    const { ctx, reply } = fakeContext({ from: { id: 42 }, text: "/sil mühasib" });

    await handler(ctx);

    expect(removeField).toHaveBeenCalledWith(FAKE_DB, 42, "muhasib");
    expect(reply).toHaveBeenCalledWith("Bu ixtisas siyahınızda tapılmadı.");
  });

  it("strips the @botname suffix from the command before the argument", async () => {
    const handler = commandHandler(registerSilCommand, "sil");
    const { ctx } = fakeContext({ from: { id: 42 }, text: "/sil@JobbyBot musiqi müəllimi" });

    await handler(ctx);

    expect(removeField).toHaveBeenCalledWith(FAKE_DB, 42, "musiqi muellimi");
  });

  it("explains the usage when the argument is missing", async () => {
    const handler = commandHandler(registerSilCommand, "sil");
    const { ctx, reply } = fakeContext({ from: { id: 42 }, text: "/sil   " });

    await handler(ctx);

    expect(reply).toHaveBeenCalledWith("Silmək üçün belə yazın:\n/sil backend developer");
    expect(removeField).not.toHaveBeenCalled();
  });

  it("explains the usage when the update carries no message text", async () => {
    const handler = commandHandler(registerSilCommand, "sil");
    const { ctx, reply } = fakeContext({ from: { id: 42 } });

    await handler(ctx);

    expect(reply).toHaveBeenCalledWith("Silmək üçün belə yazın:\n/sil backend developer");
    expect(removeField).not.toHaveBeenCalled();
  });

  it("still queries for an argument that normalizes to nothing", async () => {
    removeField.mockResolvedValue(false);
    const handler = commandHandler(registerSilCommand, "sil");
    const { ctx, reply } = fakeContext({ from: { id: 42 }, text: "/sil ***" });

    await handler(ctx);

    expect(removeField).toHaveBeenCalledWith(FAKE_DB, 42, "");
    expect(reply).toHaveBeenCalledWith("Bu ixtisas siyahınızda tapılmadı.");
  });

  it("refuses an update with no sender and writes nothing", async () => {
    const handler = commandHandler(registerSilCommand, "sil");
    const { ctx, reply } = fakeContext({ text: "/sil backend developer" });

    await handler(ctx);

    expect(reply).toHaveBeenCalledWith(UNKNOWN_USER_REPLY);
    expect(removeField).not.toHaveBeenCalled();
  });
});
