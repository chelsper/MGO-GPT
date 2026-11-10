import { afterEach, expect, it, vi } from "vitest";
import { requestProjectTags, PROJECT_TAG_REQUEST_TIMEOUT_MS } from "./projectTagRequest";

const endpoint = "/api/reports/lists/list-fictional/tags";
const response = (data, ok = true) => ({ ok, json: async () => data });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("returns successful local reads and clears the deadline", async () => {
  vi.useFakeTimers(); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ tags: [] })));
  await expect(requestProjectTags(endpoint)).resolves.toEqual({ tags: [] });
  expect(fetch).toHaveBeenCalledWith(endpoint, expect.objectContaining({ cache: "no-store", signal: expect.anything() }));
  expect(vi.getTimerCount()).toBe(0);
});

it.each(["response", "body"])("bounds a stalled save %s without replaying it", async stage => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn(() => stage === "body"
    ? Promise.resolve({ ok: true, json: () => new Promise(() => {}) }) : new Promise(() => {})));
  const pending = requestProjectTags(endpoint, { method: "POST", body: "{}" });
  const rejected = expect(pending).rejects.toThrow(/may have finished.*Reload/);
  await vi.advanceTimersByTimeAsync(PROJECT_TAG_REQUEST_TIMEOUT_MS);
  await rejected;
  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it("bounds a stalled read with a read-specific message", async () => {
  vi.useFakeTimers(); vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  const rejected = expect(requestProjectTags(endpoint)).rejects.toThrow("Loading project tags took too long.");
  await vi.advanceTimersByTimeAsync(PROJECT_TAG_REQUEST_TIMEOUT_MS); await rejected;
});

it("cancels on unmount even if the transport ignores abort and removes its deadline", async () => {
  vi.useFakeTimers(); vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  const controller = new AbortController();
  const rejected = expect(requestProjectTags(endpoint, { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  controller.abort(); await rejected;
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it("does not send a request that was already cancelled", async () => {
  vi.stubGlobal("fetch", vi.fn()); const controller = new AbortController(); controller.abort();
  await expect(requestProjectTags(endpoint, { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  expect(fetch).not.toHaveBeenCalled();
});

it("handles non-JSON infrastructure failures without showing parser details", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => { throw new Error("HTML gateway content"); } }));
  await expect(requestProjectTags(endpoint, { method: "POST" })).rejects.toThrow("Tag changes could not be confirmed.");
});

it("preserves an actionable server validation message", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ error: "Choose a tag name." }, false)));
  await expect(requestProjectTags(endpoint, { method: "POST" })).rejects.toThrow("Choose a tag name.");
});
