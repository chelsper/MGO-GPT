import { afterEach, expect, it, vi } from "vitest";
import { requestListMembership, LIST_MEMBERSHIP_TIMEOUT_MS } from "./listMembershipRequest";

const body = { action: "add", constituentId: "123", value: "The Center", revision: "1" };
const result = { status: "added", message: "Verified in NXT" };
const response = (data = result, status = 200) => ({ ok: status < 400, status, json: async () => data });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it("posts once with no caching and retains the server's verified result", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response()));
  expect(await requestListMembership("/membership", body)).toEqual(result);
  expect(fetch).toHaveBeenCalledExactlyOnceWith("/membership", expect.objectContaining({ method: "POST", body: JSON.stringify(body), cache: "no-store" }));
});
it.each(["response", "body"])("bounds a stalled %s without retrying the write", async phase => {
  vi.useFakeTimers();
  const pending = new Promise(() => {});
  vi.stubGlobal("fetch", vi.fn().mockReturnValue(phase === "response" ? pending : Promise.resolve({ ok: true, json: () => pending })));
  const promise = requestListMembership("/membership", body);
  const rejected = expect(promise).rejects.toThrow(/may have finished/);
  await vi.advanceTimersByTimeAsync(LIST_MEMBERSHIP_TIMEOUT_MS);
  await rejected;
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
it("allows correction only for explicit pre-write validation errors, not ambiguous gateway responses", async () => {
  vi.stubGlobal("fetch", vi.fn()
    .mockResolvedValueOnce(response({ error: "Invalid configured value" }, 422))
    .mockResolvedValueOnce({ ok: false, status: 422, json: async () => { throw new Error("HTML"); } })
    .mockResolvedValueOnce(response({ error: "Unavailable" }, 503)));
  await expect(requestListMembership("/membership", body)).rejects.toMatchObject({ safeToCorrect: true });
  await expect(requestListMembership("/membership", body)).rejects.toMatchObject({ safeToCorrect: false });
  await expect(requestListMembership("/membership", body)).rejects.toMatchObject({ safeToCorrect: false });
});
it("does not convert a failed verification into a new addition", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ error: "Invalid" }, 400)));
  await expect(requestListMembership("/membership", { ...body, action: "verify" })).rejects.toMatchObject({ safeToCorrect: false });
});
it.each([null, {}, { status: "added" }, { status: "unknown", message: "Wrong" }])("rejects incomplete confirmations: %j", async payload => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(payload)));
  await expect(requestListMembership("/membership", body)).rejects.toThrow(/complete confirmation/);
});
it("cancels on unmount and removes its deadline without retry", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
  const controller = new AbortController();
  const promise = requestListMembership("/membership", body, controller.signal);
  const rejected = expect(promise).rejects.toMatchObject({ name: "AbortError" });
  controller.abort();
  await rejected;
  expect(vi.getTimerCount()).toBe(0);
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
  await expect(requestListMembership("/membership", body, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  expect(fetch).toHaveBeenCalledTimes(1);
});
