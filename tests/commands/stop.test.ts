import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerStopCommand } from "../../src/commands/stop";
import { FAKE_DB, UNKNOWN_USER_REPLY, commandHandler, fakeContext } from "./harness";

const { setActive } = vi.hoisted(() => ({
  setActive: vi.fn(async (): Promise<void> => undefined),
}));

vi.mock("../../src/db/users", () => ({ setActive }));

describe("/stop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deactivates the user and confirms", async () => {
    const handler = commandHandler(registerStopCommand, "stop");
    const { ctx, reply } = fakeContext({ from: { id: 7 }, text: "/stop" });

    await handler(ctx);

    expect(setActive).toHaveBeenCalledWith(FAKE_DB, 7, false);
    expect(reply).toHaveBeenCalledWith(
      "Bildirişlər dayandırıldı. Yenidən aktiv etmək üçün /start yazın.",
    );
  });

  it("refuses an update with no sender and writes nothing", async () => {
    const handler = commandHandler(registerStopCommand, "stop");
    const { ctx, reply } = fakeContext({ text: "/stop" });

    await handler(ctx);

    expect(reply).toHaveBeenCalledWith(UNKNOWN_USER_REPLY);
    expect(setActive).not.toHaveBeenCalled();
  });
});
