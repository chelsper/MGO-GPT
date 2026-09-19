import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useImportAccess from "./useImportAccess";

const email = "operator@example.test";
const props = { user: { email, role: "admin" }, loading: false };
const payload = (overrides = {}) => ({ user: { id: 7, email, active: true, role: "admin", ...overrides } });
const reply = (body = payload(), status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

beforeEach(() => { vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply())); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("verified import account access", () => {
  it("waits for the saved account, never a cached session role", async () => {
    const pending = deferred();
    fetch.mockReturnValueOnce(pending.promise);
    const { result } = renderHook(useImportAccess, { initialProps: props });
    expect(result.current.status).toBe("loading");
    await act(async () => { pending.resolve(reply(payload({ role: "mgo" }))); });
    expect(result.current.status).toBe("denied");
    expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/users/profile", expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }));
  });

  it.each([401, 403])("keeps HTTP %s separate from lookup failures", async (status) => {
    fetch.mockResolvedValueOnce(reply(null, status));
    const { result } = renderHook(useImportAccess, { initialProps: props });
    await waitFor(() => expect(result.current.status).toBe(status === 401 ? "signed_out" : "denied"));
  });

  it.each([
    null, {}, { workspaceUser: payload().user }, payload({ id: null }),
    payload({ email: "someone-else@example.test" }), payload({ active: undefined }),
    payload({ role: null }), payload({ role: { admin: true } }), payload({ role: ["admin", null] }),
  ])("rejects incomplete or mismatched account responses", async (body) => {
    fetch.mockResolvedValueOnce(reply(body));
    const { result } = renderHook(useImportAccess, { initialProps: props });
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.message).toContain("This check makes no changes to NXT");
  });

  it.each(["network", "json"])("fails closed on %s errors without leaking backend details", async (failure) => {
    if (failure === "network") fetch.mockRejectedValueOnce(new Error("private details"));
    else fetch.mockResolvedValueOnce({ ...reply(), json: async () => { throw new Error("private details"); } });
    const { result } = renderHook(useImportAccess, { initialProps: props });
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.message).not.toContain("private details");
  });

  it("normalizes email casing and accepts the existing multi-role representation", async () => {
    fetch.mockResolvedValueOnce(reply(payload({ email: "Operator@Example.Test", role: ["mgo", "advancement_services"] })));
    const { result } = renderHook(useImportAccess, { initialProps: props });
    await waitFor(() => expect(result.current.status).toBe("allowed"));
  });

  it("times out, ignores a late success, and requires an explicit fresh retry", async () => {
    vi.useFakeTimers();
    const pending = deferred();
    fetch.mockReturnValueOnce(pending.promise);
    const { result } = renderHook(useImportAccess, { initialProps: props });
    const oldSignal = fetch.mock.calls[0][1].signal;
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(result.current.status).toBe("error");
    expect(result.current.message).toContain("timed out");
    expect(oldSignal.aborted).toBe(true);
    await act(async () => { pending.resolve(reply()); });
    expect(result.current.status).toBe("error");
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => { result.current.retry(); });
    expect(result.current.status).toBe("allowed");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("cancels old-account reads and ignores their late results", async () => {
    const first = deferred();
    const second = deferred();
    fetch.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result, rerender } = renderHook(useImportAccess, { initialProps: props });
    const oldSignal = fetch.mock.calls[0][1].signal;
    rerender({ user: { email: "other@example.test", role: "admin" }, loading: false });
    expect(result.current.status).toBe("loading");
    expect(oldSignal.aborted).toBe(true);
    await act(async () => { first.resolve(reply()); });
    expect(result.current.status).toBe("loading");
    await act(async () => { second.resolve(reply(payload({ email: "other@example.test", role: "mgo" }))); });
    expect(result.current.status).toBe("denied");
  });

  it("does not reuse verified access across sign-out and sign-in", async () => {
    const { result, rerender } = renderHook(useImportAccess, { initialProps: props });
    await waitFor(() => expect(result.current.status).toBe("allowed"));
    rerender({ user: null, loading: false });
    expect(result.current.status).toBe("signed_out");
    const pending = deferred();
    fetch.mockReturnValueOnce(pending.promise);
    rerender(props);
    expect(result.current.status).toBe("loading");
    await act(async () => { pending.resolve(reply(payload({ active: false }))); });
    expect(result.current.status).toBe("denied");
  });

  it("makes no calls until a signed-in session is available and aborts on unmount", async () => {
    const { result, rerender, unmount } = renderHook(useImportAccess, { initialProps: { user: null, loading: true } });
    expect(result.current.status).toBe("loading");
    expect(fetch).not.toHaveBeenCalled();
    rerender({ user: null, loading: false });
    expect(result.current.status).toBe("signed_out");
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockReturnValueOnce(new Promise(() => {}));
    rerender(props);
    const signal = fetch.mock.calls[0][1].signal;
    unmount();
    expect(signal.aborted).toBe(true);
  });

  it("does not recheck access when ordinary renders or session object references change", async () => {
    const { result, rerender } = renderHook(useImportAccess, { initialProps: props });
    await waitFor(() => expect(result.current.status).toBe("allowed"));
    rerender({ user: { email, role: "mgo" }, loading: false });
    expect(result.current.status).toBe("allowed");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
