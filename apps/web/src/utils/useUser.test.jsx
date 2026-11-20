import { act, StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useUser, { SESSION_CHECK_TIMEOUT_MS } from "./useUser";

describe("useUser", () => {
  let container;
  let root;
  let latest;

  function Probe() {
    latest = useUser();
    return <span>{latest.loading ? 'Checking' : latest.user ? 'Open form' : 'Signed out'}</span>;
  }

  async function renderProbe() {
    await act(async () => root.render(<Probe />));
  }

  const signedIn = () => ({ ok: true, json: async () => ({ user: { id: '1' } }) });

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal("fetch", vi.fn());
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  });

  it.each([{}, null])('finishes an unauthenticated session response: %s', async session => {
    fetch.mockResolvedValue({ ok: true, json: async () => session });
    await renderProbe();
    expect(latest).toMatchObject({ user: null, loading: false, error: null });
  });

  it.each(['fetch', 'body'])('times out a stalled %s and supports a fresh retry', async stage => {
    vi.useFakeTimers();
    let resolveOld;
    const pending = new Promise(resolve => { resolveOld = resolve; });
    fetch.mockReturnValueOnce(stage === 'fetch' ? pending : Promise.resolve({ ok: true, json: () => pending }));
    await renderProbe();
    const firstSignal = fetch.mock.calls[0][1].signal;
    await act(async () => vi.advanceTimersByTimeAsync(SESSION_CHECK_TIMEOUT_MS - 1));
    expect(latest.loading).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(latest.loading).toBe(false);
    expect(latest.user).toBeNull();
    expect(latest.error).toContain('could not check');
    expect(firstSignal.aborted).toBe(true);
    fetch.mockResolvedValueOnce(signedIn());
    await act(async () => latest.refetch());
    expect(latest).toMatchObject({ user: { id: '1' }, loading: false, error: null });
    await act(async () => resolveOld(stage === 'fetch' ? { ok: true, json: async () => ({}) } : {}));
    expect(latest.user).toEqual({ id: '1' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['network', 'server', 'invalid-json', 'timeout'])('preserves the open form on a background %s failure', async failure => {
    vi.useFakeTimers();
    fetch.mockResolvedValueOnce(signedIn());
    await renderProbe();
    const form = container.firstChild;
    if (failure === 'network') fetch.mockRejectedValueOnce(new Error('private provider detail'));
    if (failure === 'server') fetch.mockResolvedValueOnce({ ok: false, status: 503 });
    if (failure === 'invalid-json') fetch.mockResolvedValueOnce({ ok: true, json: async () => { throw new Error('invalid'); } });
    if (failure === 'timeout') fetch.mockReturnValueOnce(new Promise(() => {}));
    await act(async () => window.dispatchEvent(new Event('focus')));
    if (failure === 'timeout') await act(async () => vi.advanceTimersByTimeAsync(SESSION_CHECK_TIMEOUT_MS));
    expect(latest.user).toEqual({ id: '1' });
    expect(latest.loading).toBe(false);
    expect(latest.error).toContain('could not check');
    expect(latest.error).not.toContain('private provider');
    expect(container.firstChild).toBe(form);
    expect(container.textContent).toBe('Open form');
  });

  it.each([200, 401])('clears an expired session when the server confirms it with %s', async status => {
    fetch.mockResolvedValueOnce(signedIn()).mockResolvedValueOnce({ ok: status === 200, status, json: async () => ({}) });
    await renderProbe();
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(latest).toMatchObject({ user: null, loading: false, error: null });
  });

  it('deduplicates focus checks and cancels pending work on clear', async () => {
    vi.useFakeTimers();
    let resolveOld;
    fetch.mockImplementation(() => new Promise(resolve => { resolveOld = resolve; }));
    await renderProbe();
    act(() => {
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('focus'));
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => latest.clear());
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => resolveOld(signedIn()));
    expect(latest).toMatchObject({ user: null, loading: false, error: null });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts and removes its timer and focus listener on unmount', async () => {
    vi.useFakeTimers();
    fetch.mockReturnValue(new Promise(() => {}));
    await renderProbe();
    await act(async () => root.render(null));
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    window.dispatchEvent(new Event('focus'));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('ignores the canceled StrictMode check while the new mount completes', async () => {
    vi.useFakeTimers();
    let resolveOld;
    fetch.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; })).mockResolvedValueOnce(signedIn());
    await act(async () => root.render(<StrictMode><Probe /></StrictMode>));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => resolveOld({ ok: true, json: async () => ({}) }));
    expect(latest).toMatchObject({ user: { id: '1' }, loading: false, error: null });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("refreshes on focus without returning an already loaded page to loading", async () => {
    let resolveFocusRequest;
    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user: { id: "1", email: "mgo@example.edu" } }),
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFocusRequest = resolve;
          }),
      );

    let latestUserState;
    function UserStateProbe() {
      const userState = useUser();
      useEffect(() => {
        latestUserState = userState;
      }, [userState]);
      return null;
    }

    await act(async () => {
      root.render(<UserStateProbe />);
      await Promise.resolve();
    });

    expect(latestUserState.loading).toBe(false);

    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    expect(latestUserState.loading).toBe(false);

    await act(async () => {
      resolveFocusRequest({
        ok: true,
        json: async () => ({ user: { id: "1", email: "mgo@example.edu" } }),
      });
    });
  });
});
