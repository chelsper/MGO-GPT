import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import useConstituentList from "./useConstituentList";
const response = (payload, ok = true) => ({ ok, json: async () => payload });
beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
afterEach(() => vi.unstubAllGlobals());
it("opens with only a saved-data GET and aborts when leaving", async () => {
  fetch.mockResolvedValue(response({ snapshot: null }));
  const { result, unmount } = renderHook(() => useConstituentList("list-demo"));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][1]).not.toHaveProperty("method");
  const signal = fetch.mock.calls[0][1].signal;
  unmount();
  expect(signal.aborted).toBe(true);
});
it("refreshes only on demand, follows bounded continuations and stops on pause", async () => {
  const snapshot = { total: 1, rows: [] };
  fetch
    .mockResolvedValueOnce(response({ snapshot }))
    .mockResolvedValueOnce(
      response({ snapshot, refresh: { id: "job", status: "running" } }),
    )
    .mockResolvedValueOnce(
      response({ snapshot, refresh: { id: "job", status: "paused" } }),
    );
  const { result } = renderHook(() => useConstituentList("list-demo"));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => result.current.refresh());
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ action: "start" });
  expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual({
    action: "continue",
    jobId: "job",
  });
  expect(result.current.data.snapshot).toEqual(snapshot);
  expect(result.current.refreshing).toBe(false);
});
it("preserves saved results on refresh failure and never auto-retries", async () => {
  fetch
    .mockResolvedValueOnce(response({ snapshot: { total: 2 } }))
    .mockRejectedValueOnce(new Error("Connection unavailable"));
  const { result } = renderHook(() => useConstituentList("list-demo"));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => result.current.refresh());
  expect(result.current.error).toBe("Connection unavailable");
  expect(result.current.data.snapshot.total).toBe(2);
  expect(fetch).toHaveBeenCalledTimes(2);
});
