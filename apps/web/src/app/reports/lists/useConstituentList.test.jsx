import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import useConstituentList from "./useConstituentList";
const response = (payload, ok = true, status = ok ? 200 : 503) => ({ ok, status, json: async () => payload });
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
it("stops at restart-required without a silent new query and sends restart only after an explicit request", async () => {
  fetch
    .mockResolvedValueOnce(response({ snapshot: { total: 2 } }))
    .mockResolvedValueOnce(
      response({
        snapshot: { total: 2 },
        refresh: { id: "old", status: "needs_restart", stage: "query" },
      }),
    )
    .mockResolvedValueOnce(
      response({
        snapshot: { total: 2 },
        refresh: { id: "new", status: "needs_configuration", stage: "mapping" },
      }),
    );
  const { result } = renderHook(() => useConstituentList("list-demo"));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => result.current.refresh());
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(result.current.data.refresh.status).toBe("needs_restart");
  expect(result.current.refreshing).toBe(false);
  await act(async () => result.current.refresh(true));
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual({
    action: "restart",
  });
  expect(result.current.data.refresh.id).toBe("new");
});

it.each([401, 403, 404, 503])("keeps HTTP %s distinct from a network failure without retrying", async status => {
  fetch.mockResolvedValue(response({ error: "Request rejected" }, false, status));
  const { result } = renderHook(() => useConstituentList("list-demo"));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.errorStatus).toBe(status);
  expect(result.current.data).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it.each([401, 403])("removes previously loaded private results when a reload returns %s", async status => {
  fetch.mockResolvedValueOnce(response({ report: { title: "Private list" }, snapshot: { total: 2 } }))
    .mockResolvedValueOnce(response({ error: "Request rejected" }, false, status))
    .mockResolvedValueOnce(response({ snapshot: { total: 3 } }));
  const { result } = renderHook(() => useConstituentList("list-demo"));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => result.current.reload());
  expect(result.current.data).toBeNull();
  expect(result.current.errorStatus).toBe(status);
  await act(async () => result.current.reload());
  expect(result.current.errorStatus).toBeNull();
  expect(result.current.error).toBe("");
  expect(result.current.data.snapshot.total).toBe(3);
  expect(fetch.mock.calls.every(([, options]) => !options.method)).toBe(true);
});

it.each([401, 403])("stops a refresh on %s without replaying its continuation", async status => {
  fetch.mockResolvedValueOnce(response({ snapshot: { total: 2 } }))
    .mockResolvedValueOnce(response({ error: "Request rejected" }, false, status));
  const { result } = renderHook(() => useConstituentList("list-demo"));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => result.current.refresh());
  expect(result.current.errorStatus).toBe(status);
  expect(result.current.data).toBeNull();
  expect(result.current.refreshing).toBe(false);
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("ignores a late unauthorized reply from a list the user already left", async () => {
  let finish;
  fetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
    .mockResolvedValueOnce(response({ report: { title: "Current list" } }));
  const { result, rerender } = renderHook(({ key }) => useConstituentList(key), { initialProps: { key: "list-first" } });
  rerender({ key: "list-next" });
  await waitFor(() => expect(result.current.data?.report.title).toBe("Current list"));
  await act(async () => finish(response({ error: "Unauthorized" }, false, 401)));
  expect(result.current.errorStatus).toBeNull();
  expect(result.current.data.report.title).toBe("Current list");
});
