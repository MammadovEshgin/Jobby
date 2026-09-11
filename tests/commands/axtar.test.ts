import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerAxtarCommand } from "../../src/commands/axtar";
import type { UserFieldRecord } from "../../src/db/users";
import { MANUAL_SEARCH_LIMIT } from "../../src/pipeline/run";
import { FAKE_DB, UNKNOWN_USER_REPLY, commandHandler, fakeContext } from "./harness";

interface SearchResult {
  scraped: number;
  deduped: number;
  usersChecked: number;
  messagesSent: number;
  vacanciesSent: number;
  truncated: boolean;
}

const { checkManualSearchLimit, recordManualSearch, listFields, runManualSearch, logError } =
  vi.hoisted(() => ({
    checkManualSearchLimit: vi.fn(
      async (): Promise<{ allowed: boolean; retryAfterSeconds: number }> => ({
        allowed: true,
        retryAfterSeconds: 0,
      }),
    ),
    recordManualSearch: vi.fn(async (): Promise<void> => undefined),
    listFields: vi.fn(async (): Promise<UserFieldRecord[]> => []),
    runManualSearch: vi.fn(async (): Promise<SearchResult> => ({
      scraped: 0,
      deduped: 0,
      usersChecked: 1,
      messagesSent: 0,
      vacanciesSent: 0,
      truncated: false,
    })),
    logError: vi.fn((): void => undefined),
    logInfo: vi.fn((): void => undefined),
  }));

vi.mock("../../src/db/manual-search", () => ({ checkManualSearchLimit, recordManualSearch }));
vi.mock("../../src/db/users", () => ({ listFields }));
vi.mock("../../src/utils/log", () => ({ logError, logInfo: vi.fn() }));
vi.mock("../../src/pipeline/run", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/pipeline/run")>();
  return { ...actual, runManualSearch };
});

function searchResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    scraped: 1,
    deduped: 1,
    usersChecked: 1,
    messagesSent: 0,
    vacanciesSent: 0,
    truncated: false,
    ...overrides,
  };
}

const FOLLOWED: UserFieldRecord[] = [
  { telegramId: 55, field: "backend developer", rawField: "Backend Developer", createdAt: 0 },
];

describe("/axtar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listFields.mockResolvedValue(FOLLOWED);
    checkManualSearchLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    runManualSearch.mockResolvedValue(searchResult());
  });

  it("refuses an update with no sender and reads nothing", async () => {
    const handler = commandHandler(registerAxtarCommand, "axtar");
    const { ctx, reply } = fakeContext({ text: "/axtar" });

    await handler(ctx);

    expect(reply).toHaveBeenCalledWith(UNKNOWN_USER_REPLY);
    expect(listFields).not.toHaveBeenCalled();
  });

  it("asks for a field before searching when none is followed", async () => {
    listFields.mockResolvedValue([]);
    const handler = commandHandler(registerAxtarCommand, "axtar");
    const { ctx, reply, waitUntil } = fakeContext({ from: { id: 55 }, text: "/axtar" });

    await handler(ctx);

    expect(reply).toHaveBeenCalledWith(
      "Axtarış üçün əvvəl ixtisas əlavə edin. Məsələn: /ixtisas musiqi müəllimi",
    );
    expect(checkManualSearchLimit).not.toHaveBeenCalled();
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it("reports the remaining cooldown and starts nothing", async () => {
    checkManualSearchLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 7 });
    const handler = commandHandler(registerAxtarCommand, "axtar");
    const { ctx, reply, waitUntil } = fakeContext({ from: { id: 55 }, text: "/axtar" });

    await handler(ctx);

    expect(checkManualSearchLimit).toHaveBeenCalledWith(FAKE_DB, 55);
    expect(reply).toHaveBeenCalledWith(
      "Manual axtarışı 7 saniyədən sonra yenidən işə sala bilərsiniz.",
    );
    expect(recordManualSearch).not.toHaveBeenCalled();
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it("records the run, answers at once and searches after the response", async () => {
    const handler = commandHandler(registerAxtarCommand, "axtar");
    const { ctx, reply, waitUntil, settleBackgroundWork } = fakeContext({
      from: { id: 55 },
      text: "/axtar",
    });

    await handler(ctx);

    expect(recordManualSearch).toHaveBeenCalledWith(FAKE_DB, 55);
    expect(reply).toHaveBeenCalledWith("Axtarış başladı, bir az gözləyin...");
    expect(waitUntil).toHaveBeenCalledTimes(1);

    await settleBackgroundWork();

    expect(runManualSearch).toHaveBeenCalledWith(ctx.env, 55);
  });

  it("says nothing matched when the search sent no vacancy", async () => {
    const handler = commandHandler(registerAxtarCommand, "axtar");
    const { ctx, sendMessage, settleBackgroundWork } = fakeContext({
      from: { id: 55 },
      text: "/axtar",
    });

    await handler(ctx);
    await settleBackgroundWork();

    expect(sendMessage).toHaveBeenCalledWith(
      55,
      "Uyğun açıq vakansiya tapılmadı. İxtisaslarınızı /ixtisaslar ilə yoxlaya bilərsiniz.",
    );
  });

  it("warns when the results were cut at the limit", async () => {
    runManualSearch.mockResolvedValue(searchResult({ vacanciesSent: 60, truncated: true }));
    const handler = commandHandler(registerAxtarCommand, "axtar");
    const { ctx, sendMessage, settleBackgroundWork } = fakeContext({
      from: { id: 55 },
      text: "/axtar",
    });

    await handler(ctx);
    await settleBackgroundWork();

    expect(sendMessage).toHaveBeenCalledWith(
      55,
      `Ən uyğun ${MANUAL_SEARCH_LIMIT} vakansiya göndərildi. Nəticəni azaltmaq üçün ixtisası daha dəqiq yazın.`,
    );
  });

  it("stays quiet when every match was delivered", async () => {
    runManualSearch.mockResolvedValue(searchResult({ vacanciesSent: 3, messagesSent: 1 }));
    const handler = commandHandler(registerAxtarCommand, "axtar");
    const { ctx, sendMessage, settleBackgroundWork } = fakeContext({
      from: { id: 55 },
      text: "/axtar",
    });

    await handler(ctx);
    await settleBackgroundWork();

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("logs and reports a failed search", async () => {
    runManualSearch.mockRejectedValue(new Error("D1 is down"));
    const handler = commandHandler(registerAxtarCommand, "axtar");
    const { ctx, sendMessage, settleBackgroundWork } = fakeContext({
      from: { id: 55 },
      text: "/axtar",
    });

    await handler(ctx);
    await settleBackgroundWork();

    expect(logError).toHaveBeenCalledWith("manual_search_failed", expect.any(Error), {
      telegramId: 55,
    });
    expect(sendMessage).toHaveBeenCalledWith(
      55,
      "Axtarış zamanı xəta baş verdi. Bir azdan yenidən cəhd edin.",
    );
  });

  it("swallows a failure to deliver the failure notice", async () => {
    runManualSearch.mockRejectedValue(new Error("D1 is down"));
    const handler = commandHandler(registerAxtarCommand, "axtar");
    const { ctx, sendMessage, settleBackgroundWork } = fakeContext({
      from: { id: 55 },
      text: "/axtar",
    });
    sendMessage.mockRejectedValue(new Error("user blocked the bot"));

    await handler(ctx);

    await expect(settleBackgroundWork()).resolves.toBeUndefined();
  });
});
