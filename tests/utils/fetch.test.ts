import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";

import { FetchHttpError, fetchText } from "../../src/utils/fetch";

const LISTING_URL = "https://jobs.example.az/vacancies";

const fetchMock = vi.fn<(input: string, init: RequestInit) => Promise<Response>>();

/** A host that accepts the connection and never answers: only the abort ends the request. */
function neverAnswers(_input: string, init: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => {
      reject(new DOMException("This operation was aborted", "AbortError"));
    });
  });
}

/** Starts a request and reports whether it has settled, without leaving a rejection unhandled. */
function track(request: Promise<string>): { outcome: Promise<unknown>; isSettled: () => boolean } {
  let settled = false;
  const outcome = request.then(
    (body) => {
      settled = true;
      return body;
    },
    (error: unknown) => {
      settled = true;
      return error;
    },
  );
  return { outcome, isSettled: () => settled };
}

/** Pins the jitter so every pause has one exact length; the spy is restored when the test ends. */
function pinRandom(value: number): void {
  const random = vi.spyOn(Math, "random").mockReturnValue(value);
  onTestFinished(() => {
    random.mockRestore();
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("fetchText", () => {
  it("returns the body, sending the caller's headers and an abort signal", async () => {
    fetchMock.mockResolvedValue(new Response("<ul>vacancies</ul>", { status: 200 }));
    const headers = { Accept: "text/html" };

    await expect(fetchText(LISTING_URL, { headers })).resolves.toBe("<ul>vacancies</ul>");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(LISTING_URL, {
      headers,
      signal: expect.any(AbortSignal),
    });
  });

  it("returns the first attempt that succeeds", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("connection reset"))
      .mockRejectedValueOnce(new TypeError("connection reset"))
      .mockResolvedValueOnce(new Response("third time", { status: 200 }));

    await expect(fetchText(LISTING_URL)).resolves.toBe("third time");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("makes three back-to-back attempts, then rethrows the last failure", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("first"))
      .mockRejectedValueOnce(new TypeError("second"))
      .mockRejectedValueOnce(new TypeError("third"));

    const request = track(fetchText(LISTING_URL));
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(request.isSettled()).toBe(true);
    await expect(request.outcome).resolves.toMatchObject({ name: "TypeError", message: "third" });
  });

  it.each([400, 403, 404])(
    "fails at once on HTTP %i, which no retry can fix, with FetchHttpError",
    async (status) => {
      fetchMock.mockImplementation(() => Promise.resolve(new Response(null, { status })));

      const error = await fetchText(LISTING_URL).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(FetchHttpError);
      expect(error).toMatchObject({
        name: "FetchHttpError",
        status,
        url: LISTING_URL,
        message: `Fetch failed with HTTP ${status} for ${LISTING_URL}`,
      });
      expect(fetchMock).toHaveBeenCalledOnce();
    },
  );

  it.each([408, 429, 500, 503])(
    "retries HTTP %i only after a pause, then rejects with FetchHttpError",
    async (status) => {
      fetchMock.mockImplementation(() => Promise.resolve(new Response(null, { status })));

      const request = track(fetchText(LISTING_URL));

      await vi.advanceTimersByTimeAsync(0);
      expect(fetchMock).toHaveBeenCalledOnce();
      // The two pauses are under 1 s and under 2 s whatever the jitter draws.
      await vi.advanceTimersByTimeAsync(3_000);
      expect(fetchMock).toHaveBeenCalledTimes(3);
      const error = await request.outcome;
      expect(error).toBeInstanceOf(FetchHttpError);
      expect(error).toMatchObject({
        name: "FetchHttpError",
        status,
        url: LISTING_URL,
        message: `Fetch failed with HTTP ${status} for ${LISTING_URL}`,
      });
    },
  );

  it.each([
    [0, 500, 1_000],
    [0.5, 750, 1_500],
  ])(
    "with the jitter drawing %s, pauses %i ms and then %i ms before retrying HTTP 503",
    async (random, firstPause, secondPause) => {
      pinRandom(random);
      fetchMock.mockImplementation(() => Promise.resolve(new Response(null, { status: 503 })));

      const request = track(fetchText(LISTING_URL));

      await vi.advanceTimersByTimeAsync(firstPause - 1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(secondPause - 1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetchMock).toHaveBeenCalledTimes(3);
      await expect(request.outcome).resolves.toBeInstanceOf(FetchHttpError);
    },
  );

  it("stops retrying at the first HTTP failure no retry can fix", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));

    const request = track(fetchText(LISTING_URL));
    await vi.advanceTimersByTimeAsync(1_000);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(request.isSettled()).toBe(true);
    await expect(request.outcome).resolves.toMatchObject({ name: "FetchHttpError", status: 404 });
  });

  it("aborts an attempt after 10 s and gives up 15 s after the call, so a host that never answers holds the caller 15 s", async () => {
    fetchMock.mockImplementation(neverAnswers);

    const request = track(fetchText(LISTING_URL));

    await vi.advanceTimersByTimeAsync(9_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(request.isSettled()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(request.isSettled()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await expect(request.outcome).resolves.toMatchObject({ name: "AbortError" });
  });

  it("gives up timeoutMs plus 5 s after the call, however many retries are left", async () => {
    fetchMock.mockImplementation(neverAnswers);

    const request = track(fetchText(LISTING_URL, { timeoutMs: 2_000, retries: 5 }));

    await vi.advanceTimersByTimeAsync(6_999);
    expect(request.isSettled()).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(1);
    expect(request.isSettled()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    await expect(request.outcome).resolves.toMatchObject({ name: "AbortError" });
  });

  it("cuts a pause short when the call's time runs out and rejects with the last HTTP failure", async () => {
    pinRandom(0);
    fetchMock.mockImplementation(() => Promise.resolve(new Response(null, { status: 503 })));

    const request = track(fetchText(LISTING_URL, { retries: 10 }));

    // Pauses of 0.5, 1, 2, 4 and 8 s would put a sixth attempt at 15.5 s, past the 15 s budget.
    await vi.advanceTimersByTimeAsync(14_999);
    expect(request.isSettled()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(request.isSettled()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    await expect(request.outcome).resolves.toMatchObject({ name: "FetchHttpError", status: 503 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("applies the caller's timeoutMs to each attempt", async () => {
    fetchMock.mockImplementation(neverAnswers);

    const request = track(fetchText(LISTING_URL, { timeoutMs: 500 }));

    await vi.advanceTimersByTimeAsync(1_499);
    expect(request.isSettled()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(request.isSettled()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([
    [0, 1],
    [4, 5],
  ])("with retries set to %i makes %i attempts", async (retries, attempts) => {
    fetchMock.mockRejectedValue(new TypeError("offline"));

    await expect(fetchText(LISTING_URL, { retries })).rejects.toThrow("offline");
    expect(fetchMock).toHaveBeenCalledTimes(attempts);
  });

  it("reports a rejection that is not an Error as a generic failure", async () => {
    fetchMock.mockRejectedValue("socket hang up");

    const error = await fetchText(LISTING_URL).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect(error).toHaveProperty("message", "Fetch failed.");
  });

  it("leaves no timer pending once it settles", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("connection reset"))
      .mockResolvedValueOnce(new Response("body", { status: 200 }));

    await fetchText(LISTING_URL);

    expect(vi.getTimerCount()).toBe(0);
  });
});
