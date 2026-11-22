import { afterEach, describe, it, expect, vi } from "vitest";
import { requestProjectOutreach } from "./projectOutreachRequest";
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("bounded outreach requests", () => {
  it("reads JSON with cache disabled and rejects malformed status", async () => {
    const fetch = vi.fn(async () => Response.json({ tasks: [] }));
    vi.stubGlobal("fetch", fetch);
    expect(await requestProjectOutreach("/fixture")).toEqual({ tasks: [] });
    expect(fetch.mock.calls[0][1].cache).toBe("no-store");
    fetch.mockResolvedValueOnce(Response.json([]));
    await expect(requestProjectOutreach("/fixture")).rejects.toThrow(
      /incomplete/,
    );
  });
  it("bounds a stalled body without resending a POST", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(async () => ({
      ok: true,
      json: () => new Promise(() => {}),
    }));
    vi.stubGlobal("fetch", fetch);
    const pending = expect(
      requestProjectOutreach("/fixture", { method: "POST" }),
    ).rejects.toThrow(/may still be finishing/);
    await vi.advanceTimersByTimeAsync(60000);
    await pending;
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("cancels without retrying and displays safe server refusals", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      requestProjectOutreach("/fixture", { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: "Reload saved status" }, { status: 409 }),
      ),
    );
    await expect(requestProjectOutreach("/fixture")).rejects.toThrow(
      /Reload saved status/,
    );
    await expect(requestProjectOutreach("/fixture")).rejects.toMatchObject({
      status: 409,
    });
  });
});
