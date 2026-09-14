import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

  it.each([400, 403, 404, 429, 500, 503])(
    "retries HTTP %i like any other failure and rejects with FetchHttpError",
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
      expect(fetchMock).toHaveBeenCalledTimes(3);
    },
  );

  it("aborts each attempt after 10 s, so a host that never answers holds the caller 30 s", async () => {
    fetchMock.mockImplementation(neverAnswers);

    const request = track(fetchText(LISTING_URL));

    await vi.advanceTimersByTimeAsync(9_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(request.isSettled()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(request.isSettled()).toBe(true);
    await expect(request.outcome).resolves.toMatchObject({ name: "AbortError" });
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
