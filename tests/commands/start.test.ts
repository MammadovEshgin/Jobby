import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerStartCommand } from "../../src/commands/start";
import { FAKE_DB, UNKNOWN_USER_REPLY, commandHandler, fakeContext } from "./harness";

const { upsertUser } = vi.hoisted(() => ({
  upsertUser: vi.fn(async (): Promise<void> => undefined),
}));

vi.mock("../../src/db/users", () => ({ upsertUser }));

const WELCOME = `Salam! Mən sizə ixtisasınıza uyğun yeni vakansiyaları göndərəcəyəm.

Başlamaq üçün belə yazın:
/ixtisas backend developer

İxtisası nə qədər dəqiq yazsanız, nəticələr bir o qədər dəqiq olur:
"musiqi müəllimi" yazsanız, fizika müəllimi vakansiyaları göndərilməyəcək.

Komandalar üçün /komek yazın.`;

describe("/start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers the user and replies with the welcome text", async () => {
    const handler = commandHandler(registerStartCommand, "start");
    const { ctx, reply } = fakeContext({ from: { id: 42, username: "eshgin" }, text: "/start" });

    await handler(ctx);

    expect(upsertUser).toHaveBeenCalledWith(FAKE_DB, { telegramId: 42, username: "eshgin" });
    expect(reply).toHaveBeenCalledWith(WELCOME);
  });

  it("stores a missing username as null", async () => {
    const handler = commandHandler(registerStartCommand, "start");
    const { ctx } = fakeContext({ from: { id: 42 }, text: "/start" });

    await handler(ctx);

    expect(upsertUser).toHaveBeenCalledWith(FAKE_DB, { telegramId: 42, username: null });
  });

  it("refuses an update with no sender and writes nothing", async () => {
    const handler = commandHandler(registerStartCommand, "start");
    const { ctx, reply } = fakeContext({ text: "/start" });

    await handler(ctx);

    expect(reply).toHaveBeenCalledWith(UNKNOWN_USER_REPLY);
    expect(upsertUser).not.toHaveBeenCalled();
  });
});
